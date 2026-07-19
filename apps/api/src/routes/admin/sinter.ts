import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'
import {
  extrairParcelasSinter,
  gerarXmlSinter,
  validarLote,
  uploadXmlStorage,
} from '../../services/sinter.service'

async function getUsuarioId(uid: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM sigweb.usuarios WHERE auth_uid = $1`,
    [uid]
  )
  return row?.id ?? null
}

export async function sinterRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Histórico de envios
  app.get('/admin/sinter/envios', async () => {
    return query(`
      SELECT e.id, e.numero_envio, e.tipo, e.status, e.qtd_parcelas,
             e.arquivo_storage, e.enviado_em, e.validado_em, e.created_at,
             jsonb_array_length(e.erros::jsonb) AS qtd_erros,
             u.nome AS criado_por_nome
      FROM sigweb.envios_sinter e
      LEFT JOIN sigweb.usuarios u ON u.id = e.criado_por
      ORDER BY e.created_at DESC
    `)
  })

  // Detalhe de um envio + suas parcelas
  app.get('/admin/sinter/envios/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

    const envio = await queryOne(`
      SELECT e.*, u.nome AS criado_por_nome
      FROM sigweb.envios_sinter e
      LEFT JOIN sigweb.usuarios u ON u.id = e.criado_por
      WHERE e.id = $1
    `, [id])
    if (!envio) return reply.code(404).send({ error: 'Não encontrado' })

    const parcelas = await query(`
      SELECT ps.status, ps.codigo_nitu, ps.erros,
             p.codigo, p.inscricao_imobiliaria, p.area_m2
      FROM sigweb.parcelas_sinter ps
      JOIN sigweb.parcelas p ON p.id = ps.parcela_id
      WHERE ps.envio_id = $1
      ORDER BY p.codigo
    `, [id])

    return { ...envio as object, parcelas }
  })

  // Status geral das parcelas no SINTER (com filtros)
  app.get('/admin/sinter/parcelas', async (request) => {
    const q = z.object({
      status: z.string().optional(),
      limit:  z.coerce.number().default(100),
      offset: z.coerce.number().default(0),
    }).parse(request.query)

    const where = q.status ? 'WHERE ps.status = $3' : ''
    const params: unknown[] = q.status ? [q.limit, q.offset, q.status] : [q.limit, q.offset]

    return query(`
      SELECT ps.status, ps.codigo_nitu, ps.erros, ps.updated_at,
             p.codigo, p.inscricao_imobiliaria, p.area_m2
      FROM sigweb.parcelas_sinter ps
      JOIN sigweb.parcelas p ON p.id = ps.parcela_id
      ${where}
      ORDER BY ps.updated_at DESC
      LIMIT $1 OFFSET $2
    `, params)
  })

  // Resumo estatístico
  app.get('/admin/sinter/stats', async () => {
    const [stats] = await query<{
      total: string; pendentes: string; incluidas: string; aceitas: string; rejeitadas: string; erros_count: string
    }>(`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE status = 'pendente')          AS pendentes,
        COUNT(*) FILTER (WHERE status = 'incluida')          AS incluidas,
        COUNT(*) FILTER (WHERE status = 'aceita')            AS aceitas,
        COUNT(*) FILTER (WHERE status = 'rejeitada')         AS rejeitadas,
        COUNT(*) FILTER (WHERE status = 'erro')              AS erros_count
      FROM sigweb.parcelas_sinter
    `)
    const totalParcelas = await queryOne<{ total: string }>(
      `SELECT COUNT(*) AS total FROM sigweb.parcelas WHERE geometry IS NOT NULL`
    )
    return { ...stats, total_cadastradas: totalParcelas?.total ?? '0' }
  })

  // Preparar novo lote: extrai → valida → gera XML → sobe no GCS
  app.post(
    '/admin/sinter/preparar',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { tipo } = z.object({
        tipo: z.enum(['teste', 'incremental', 'completo']),
      }).parse(request.body)

      const usuarioId = await getUsuarioId(request.user.uid)

      const [envio] = await query<{ id: string; numero_envio: number }>(`
        INSERT INTO sigweb.envios_sinter (tipo, status, criado_por)
        VALUES ($1, 'preparando', $2)
        RETURNING id, numero_envio
      `, [tipo, usuarioId])

      try {
        const todasParcelas = await extrairParcelasSinter(tipo)
        const { validas, erros } = validarLote(todasParcelas)

        const xml = gerarXmlSinter(validas, tipo, envio.numero_envio)
        const arquivoStorage = await uploadXmlStorage(xml, envio.id)

        // Registra cada parcela válida neste lote
        if (validas.length > 0) {
          const placeholders = validas
            .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
            .join(',')
          await query(
            `INSERT INTO sigweb.parcelas_sinter (parcela_id, envio_id, status)
             VALUES ${placeholders}
             ON CONFLICT (parcela_id) DO UPDATE
               SET envio_id = EXCLUDED.envio_id, status = 'incluida', updated_at = now()`,
            validas.flatMap(p => [p.id, envio.id, 'incluida'])
          )
        }

        await query(`
          UPDATE sigweb.envios_sinter
          SET status = 'validando', qtd_parcelas = $2, arquivo_storage = $3, erros = $4::jsonb
          WHERE id = $1
        `, [envio.id, validas.length, arquivoStorage, JSON.stringify(erros)])

        return {
          id: envio.id,
          numero_envio: envio.numero_envio,
          qtd_parcelas: validas.length,
          qtd_erros: erros.length,
          arquivo_storage: arquivoStorage,
        }
      } catch (err: any) {
        await query(`
          UPDATE sigweb.envios_sinter
          SET status = 'erro', erros = $2::jsonb
          WHERE id = $1
        `, [envio.id, JSON.stringify([{ erro: String(err.message) }])])
        return reply.code(500).send({ error: String(err.message) })
      }
    }
  )

  // Marcar envio como enviado (registro manual do envio ao portal RFB)
  app.post(
    '/admin/sinter/envios/:id/enviar',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params)

      const envio = await queryOne<{ status: string }>(
        `SELECT status FROM sigweb.envios_sinter WHERE id = $1`, [id]
      )
      if (!envio) return reply.code(404).send({ error: 'Não encontrado' })
      if (!['validando', 'rejeitado'].includes(envio.status)) {
        return reply.code(400).send({
          error: `Status '${envio.status}' não permite envio. Use um lote com status 'validando' ou 'rejeitado'.`,
        })
      }

      await query(`
        UPDATE sigweb.envios_sinter
        SET status = 'enviado', enviado_em = now()
        WHERE id = $1
      `, [id])

      return { ok: true, message: 'Envio registrado. Aguardando retorno da RFB.' }
    }
  )

  // Registrar resposta da RFB (aceito ou rejeitado)
  app.post(
    '/admin/sinter/envios/:id/resposta',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
      const { status, resposta_rfb } = z.object({
        status:      z.enum(['aceito', 'rejeitado']),
        resposta_rfb: z.string().optional(),
      }).parse(request.body)

      const envio = await queryOne<{ id: string }>(
        `SELECT id FROM sigweb.envios_sinter WHERE id = $1`, [id]
      )
      if (!envio) return reply.code(404).send({ error: 'Não encontrado' })

      await query(`
        UPDATE sigweb.envios_sinter
        SET status = $2, resposta_rfb = $3, validado_em = now()
        WHERE id = $1
      `, [id, status, resposta_rfb ?? null])

      if (status === 'aceito') {
        await query(`
          UPDATE sigweb.parcelas_sinter
          SET status = 'aceita', updated_at = now()
          WHERE envio_id = $1
        `, [id])
      }

      return { ok: true }
    }
  )
}
