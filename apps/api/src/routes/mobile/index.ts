import { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { z } from 'zod'
import { query } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'
import { sendExpoPushNotification } from '../../services/supabase.service'

// Configuração de categorias de chamado: boletim/questionário (req 132/150),
// hierarquia pai/filho (req 134) e cor/ícone (req 135)
export const MIGRATION_MOBILE_CATEGORIAS = `
  ALTER TABLE sigweb.categorias_chamado    ADD COLUMN IF NOT EXISTS boletim           JSONB NOT NULL DEFAULT '[]';
  ALTER TABLE sigweb.categorias_chamado    ADD COLUMN IF NOT EXISTS categoria_pai_id  UUID REFERENCES sigweb.categorias_chamado(id);
  ALTER TABLE sigweb.categorias_chamado    ADD COLUMN IF NOT EXISTS cor               VARCHAR(9);
  ALTER TABLE sigweb.categorias_chamado    ADD COLUMN IF NOT EXISTS icone_url         TEXT;
  ALTER TABLE sigweb.solicitacoes_chamado  ADD COLUMN IF NOT EXISTS respostas_boletim JSONB NOT NULL DEFAULT '{}';
  ALTER TABLE sigweb.usuarios              ADD COLUMN IF NOT EXISTS expo_push_token   TEXT;
  ALTER TABLE sigweb.usuarios              ADD COLUMN IF NOT EXISTS data_nascimento   DATE;
  ALTER TABLE sigweb.usuarios              ADD COLUMN IF NOT EXISTS celular           VARCHAR(20);
  ALTER TABLE sigweb.arvores               ADD COLUMN IF NOT EXISTS foto_urls         TEXT[] NOT NULL DEFAULT '{}';
  ALTER TABLE sigweb.arvores               ADD COLUMN IF NOT EXISTS coletado_por      UUID REFERENCES sigweb.usuarios(id);
  ALTER TABLE sigweb.arvores               ADD COLUMN IF NOT EXISTS coletado_em       TIMESTAMPTZ;
`

// Histórico de alterações de situação do chamado (req 152) — registrado a cada
// PATCH /mobile/chamados/:id/situacao e exibido na impressão da solicitação
export const MIGRATION_CHAMADOS_HISTORICO = `
  ALTER TABLE sigweb.solicitacoes_chamado ADD COLUMN IF NOT EXISTS historico JSONB NOT NULL DEFAULT '[]';
`

// Resolve o id em sigweb.usuarios do cidadão autenticado, criando o registro no primeiro acesso
// (solicitante_id referencia usuarios.id — um UUID — e não o auth_uid)
async function resolveUsuarioId(uid: string, email: string): Promise<string> {
  const [existente] = await query<{ id: string }>(
    `SELECT id FROM sigweb.usuarios WHERE auth_uid = $1`, [uid]
  )
  if (existente) return existente.id
  const [criado] = await query<{ id: string }>(
    `INSERT INTO sigweb.usuarios (auth_uid, email, perfil)
     VALUES ($1, $2, 'CIDADAO')
     ON CONFLICT (auth_uid) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [uid, email]
  )
  return criado.id
}

// Registra notificação interna (sino) e dispara push Expo ao cidadão — req 144/146/147
async function notificarCidadao(
  usuarioId: string,
  tipo: string,
  titulo: string,
  conteudo: string,
  referenciaId: string,
  criadoPor: string
) {
  await query(
    `INSERT INTO sigweb.notificacoes (usuario_id, tipo, titulo, conteudo, referencia_id, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [usuarioId, tipo, titulo, conteudo, referenciaId, criadoPor]
  )
  const [usuario] = await query<{ expo_push_token: string | null }>(
    `SELECT expo_push_token FROM sigweb.usuarios WHERE id = $1`,
    [usuarioId]
  )
  if (usuario?.expo_push_token) {
    const result = await sendExpoPushNotification(usuario.expo_push_token, titulo, conteudo, { tipo, referenciaId })
    if (result.isInvalidToken) {
      // Remove o token inválido para evitar envios futuros falhos
      await query(`UPDATE sigweb.usuarios SET expo_push_token = NULL WHERE id = $1`, [usuarioId])
    }
  }
}

// Entrada do histórico de mudanças de situação do chamado — req 152
type HistoricoEntry = { de: string; para: string; usuario: string; data: string }

const SITUACAO_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_analise: 'Em análise',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

const perguntaBoletimSchema = z.object({
  nome: z.string().min(1),
  rotulo: z.string().min(1),
  tipo: z.enum(['texto', 'checkbox', 'mapa', 'cpf_telefone']),
  obrigatorio: z.boolean().optional().default(false),
})

export async function mobileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Loteamentos e lotes para o app de recadastramento
  app.get('/mobile/loteamentos', async () =>
    query(`SELECT id, nome, decreto FROM sigweb.loteamentos ORDER BY nome`)
  )

  app.get('/mobile/loteamentos/:id/lotes', async (request) => {
    const { id } = request.params as { id: string }
    return query(
      `SELECT p.id, p.codigo, p.area_m2,
              COALESCE(b.situacao_recadastramento, 'pendente') AS situacao_recadastramento,
              ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
       FROM sigweb.parcelas p
       LEFT JOIN sigweb.bics b ON b.parcela_id = p.id
         AND b.id = (SELECT id FROM sigweb.bics WHERE parcela_id = p.id ORDER BY created_at DESC LIMIT 1)
       WHERE p.loteamento_id = $1`,
      [id]
    )
  })

  // BICs coletados offline (importação em lote)
  app.post(
    '/mobile/bics',
    { preHandler: requireRole('ADMIN', 'FISCAL_CAMPO', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const bicsSchema = z.array(z.object({
        parcelaId: z.string().uuid(),
        situacaoRecadastramento: z.enum(['visitado', 'recadastrado', 'impedido']),
        areaTerreno: z.number().optional(),
        areaEdificada: z.number().optional(),
        numeroPavimentos: z.number().int().optional(),
        tipologiaConstrutiva: z.string().optional(),
        estadoConservacao: z.string().optional(),
        numeroPredial: z.string().optional(),
        observacoes: z.string().optional(),
        fotoUrls: z.array(z.string()).default([]),
        latitudeColeta: z.number().optional(),
        longitudeColeta: z.number().optional(),
        coletadoEm: z.string().optional(),
      }))

      const bics = bicsSchema.parse(Array.isArray(request.body) ? request.body : [request.body])
      const coletorId = await resolveUsuarioId(request.user.uid, request.user.email)
      const ids: string[] = []

      for (const bic of bics) {
        const [row] = await query<{ id: string }>(
          `INSERT INTO sigweb.bics
             (parcela_id, situacao_recadastramento, area_terreno, area_edificada,
              numero_pavimentos, tipologia_construtiva, estado_conservacao,
              numero_predial, observacoes, foto_urls,
              latitude_coleta, longitude_coleta, coletado_por, coletado_em, sincronizado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
           RETURNING id`,
          [
            bic.parcelaId, bic.situacaoRecadastramento,
            bic.areaTerreno ?? null, bic.areaEdificada ?? null,
            bic.numeroPavimentos ?? null, bic.tipologiaConstrutiva ?? null,
            bic.estadoConservacao ?? null, bic.numeroPredial ?? null,
            bic.observacoes ?? null, bic.fotoUrls,
            bic.latitudeColeta ?? null, bic.longitudeColeta ?? null,
            coletorId, bic.coletadoEm ?? null,
          ]
        )
        ids.push(row.id)
      }

      reply.code(201)
      return { sincronizados: ids.length, ids }
    }
  )

  // Lista os BICs cadastrados pelo próprio fiscal — req 178
  app.get(
    '/mobile/bics',
    { preHandler: requireRole('ADMIN', 'FISCAL_CAMPO', 'FISCAL_TRIBUTARIO') },
    async (request) => {
      const coletorId = await resolveUsuarioId(request.user.uid, request.user.email)
      return query(
        `SELECT b.id, b.parcela_id, b.situacao_recadastramento, b.area_terreno, b.area_edificada,
                b.numero_pavimentos, b.tipologia_construtiva, b.estado_conservacao,
                b.numero_predial, b.observacoes, b.foto_urls,
                b.latitude_coleta, b.longitude_coleta, b.coletado_em,
                p.codigo AS parcela_codigo
         FROM sigweb.bics b
         JOIN sigweb.parcelas p ON p.id = b.parcela_id
         WHERE b.coletado_por = $1
         ORDER BY b.coletado_em DESC NULLS LAST, b.created_at DESC
         LIMIT 200`,
        [coletorId]
      )
    }
  )

  const bicAtualizacaoSchema = z.object({
    situacaoRecadastramento: z.enum(['visitado', 'recadastrado', 'impedido']).optional(),
    areaTerreno: z.number().optional(),
    areaEdificada: z.number().optional(),
    numeroPavimentos: z.number().int().optional(),
    tipologiaConstrutiva: z.string().optional(),
    estadoConservacao: z.string().optional(),
    numeroPredial: z.string().optional(),
    observacoes: z.string().optional(),
    fotoUrls: z.array(z.string()).optional(),
  })

  // Manutenção (atualização) de BIC cadastrado pelo app — req 179
  app.patch(
    '/mobile/bics/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_CAMPO', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = bicAtualizacaoSchema.parse(request.body)

      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1
      const campo = (coluna: string, valor: unknown) => { updates.push(`${coluna} = $${idx++}`); params.push(valor) }
      if (body.situacaoRecadastramento !== undefined) campo('situacao_recadastramento', body.situacaoRecadastramento)
      if (body.areaTerreno !== undefined)              campo('area_terreno', body.areaTerreno)
      if (body.areaEdificada !== undefined)            campo('area_edificada', body.areaEdificada)
      if (body.numeroPavimentos !== undefined)         campo('numero_pavimentos', body.numeroPavimentos)
      if (body.tipologiaConstrutiva !== undefined)     campo('tipologia_construtiva', body.tipologiaConstrutiva)
      if (body.estadoConservacao !== undefined)        campo('estado_conservacao', body.estadoConservacao)
      if (body.numeroPredial !== undefined)            campo('numero_predial', body.numeroPredial)
      if (body.observacoes !== undefined)              campo('observacoes', body.observacoes)
      if (body.fotoUrls !== undefined)                 campo('foto_urls', body.fotoUrls)
      if (!updates.length) return { ok: true }

      params.push(id)
      const result = await query(`UPDATE sigweb.bics SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`, params)
      if (result.length === 0) return reply.code(404).send({ error: 'BIC não encontrado' })
      return { ok: true }
    }
  )

  // Remoção de BIC cadastrado pelo app — req 179
  app.delete(
    '/mobile/bics/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_CAMPO', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const result = await query(`DELETE FROM sigweb.bics WHERE id = $1 RETURNING id`, [id])
      if (result.length === 0) return reply.code(404).send({ error: 'BIC não encontrado' })
      return { ok: true }
    }
  )

  // Chamados do app de chamados
  app.get('/mobile/chamados', async (request) => {
    const { usuarioId } = request.query as { usuarioId?: string }
    const where = usuarioId ? `WHERE s.solicitante_id = $1` : ''
    const params = usuarioId ? [usuarioId] : []
    return query(
      `SELECT s.*, c.nome AS categoria_nome, c.boletim AS categoria_boletim,
              a.nome AS analista_nome
       FROM sigweb.solicitacoes_chamado s
       JOIN sigweb.categorias_chamado c ON c.id = s.categoria_id
       LEFT JOIN sigweb.usuarios a ON a.id = s.analista_id
       ${where}
       ORDER BY s.created_at DESC LIMIT 100`,
      params
    )
  })

  // Dados do cidadão autenticado — usado pelo app para identificar suas próprias solicitações (req 163)
  // e exibir/editar o cadastro (req 164)
  const usuarioMeColunas = `id, nome, email, perfil, data_nascimento, celular`
  app.get('/mobile/me', async (request) => {
    const [usuario] = await query(
      `SELECT ${usuarioMeColunas} FROM sigweb.usuarios WHERE auth_uid = $1`,
      [request.user.uid]
    )
    if (usuario) return usuario
    await resolveUsuarioId(request.user.uid, request.user.email)
    const [criado] = await query(
      `SELECT ${usuarioMeColunas} FROM sigweb.usuarios WHERE auth_uid = $1`,
      [request.user.uid]
    )
    return criado
  })

  // Alteração de cadastro do cidadão — nome, nascimento, celular (req 164; e-mail/senha são geridos pelo Firebase Auth)
  app.patch('/mobile/me', async (request) => {
    const body = z.object({
      nome: z.string().min(1).optional(),
      dataNascimento: z.string().nullable().optional(),
      celular: z.string().nullable().optional(),
    }).parse(request.body)

    await resolveUsuarioId(request.user.uid, request.user.email)
    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (body.nome !== undefined)           { updates.push(`nome = $${idx++}`);            params.push(body.nome) }
    if (body.dataNascimento !== undefined) { updates.push(`data_nascimento = $${idx++}`); params.push(body.dataNascimento) }
    if (body.celular !== undefined)        { updates.push(`celular = $${idx++}`);         params.push(body.celular) }
    if (updates.length) {
      params.push(request.user.uid)
      await query(`UPDATE sigweb.usuarios SET ${updates.join(', ')}, updated_at = now() WHERE auth_uid = $${idx}`, params)
    }
    const [usuario] = await query(
      `SELECT ${usuarioMeColunas} FROM sigweb.usuarios WHERE auth_uid = $1`,
      [request.user.uid]
    )
    return usuario
  })

  app.post('/mobile/chamados', async (request, reply) => {
    const body = z.object({
      categoriaId: z.string().uuid(),
      descricao: z.string().min(5),
      latitude: z.number(),
      longitude: z.number(),
      endereco: z.string().optional(),
      fotoUrls: z.array(z.string()).default([]),
      respostasBoletim: z.record(z.unknown()).default({}),
    }).parse(request.body)

    const solicitanteId = await resolveUsuarioId(request.user.uid, request.user.email)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.solicitacoes_chamado
         (categoria_id, descricao, latitude, longitude, endereco, foto_urls, solicitante_id, respostas_boletim)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        body.categoriaId, body.descricao, body.latitude, body.longitude,
        body.endereco ?? null, body.fotoUrls, solicitanteId, JSON.stringify(body.respostasBoletim),
      ]
    )
    reply.code(201)
    return { id: row.id }
  })

  // Árvores para o app de arborização
  const arvoreBodySchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
    especie: z.string().optional(),
    nomePopular: z.string().optional(),
    alturaM: z.number().optional(),
    dapCm: z.number().optional(),
    estadoFitossanitario: z.string().optional(),
    situacaoCalcada: z.string().optional(),
    logradouroId: z.string().uuid().optional(),
    fotoUrls: z.array(z.string()).default([]),
  })

  // Lista as árvores cadastradas pelo próprio fiscal durante a coleta — req 185
  app.get(
    '/mobile/arvores',
    { preHandler: requireRole('ADMIN', 'FISCAL_CAMPO') },
    async (request) => {
      const coletorId = await resolveUsuarioId(request.user.uid, request.user.email)
      return query(
        `SELECT id, codigo, especie, nome_popular, altura_m, dap_cm,
                estado_fitossanitario, situacao_calcada, foto_urls, coletado_em,
                ST_X(ST_Transform(geometry, 4326)) AS longitude,
                ST_Y(ST_Transform(geometry, 4326)) AS latitude
         FROM sigweb.arvores
         WHERE coletado_por = $1
         ORDER BY coletado_em DESC NULLS LAST, created_at DESC
         LIMIT 200`,
        [coletorId]
      )
    }
  )

  app.post(
    '/mobile/arvores',
    { preHandler: requireRole('ADMIN', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const body = arvoreBodySchema.parse(request.body)
      const coletorId = await resolveUsuarioId(request.user.uid, request.user.email)

      const [row] = await query<{ id: string; codigo: number }>(
        `INSERT INTO sigweb.arvores
           (logradouro_id, especie, nome_popular, altura_m, dap_cm,
            estado_fitossanitario, situacao_calcada, data_cadastro, geometry,
            foto_urls, coletado_por, coletado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,
           ST_Transform(ST_SetSRID(ST_Point($8,$9),4326),31982),
           $10,$11,now())
         RETURNING id, codigo`,
        [
          body.logradouroId ?? null, body.especie ?? null, body.nomePopular ?? null,
          body.alturaM ?? null, body.dapCm ?? null,
          body.estadoFitossanitario ?? null, body.situacaoCalcada ?? null,
          body.longitude, body.latitude,
          body.fotoUrls, coletorId,
        ]
      )
      reply.code(201)
      return { id: row.id, codigo: row.codigo }
    }
  )

  // Manutenção (atualização) de árvore cadastrada pelo app — req 186
  app.patch(
    '/mobile/arvores/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = arvoreBodySchema.partial().parse(request.body)

      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1
      const campo = (coluna: string, valor: unknown) => { updates.push(`${coluna} = $${idx++}`); params.push(valor) }
      if (body.especie !== undefined)              campo('especie', body.especie ?? null)
      if (body.nomePopular !== undefined)          campo('nome_popular', body.nomePopular ?? null)
      if (body.alturaM !== undefined)              campo('altura_m', body.alturaM ?? null)
      if (body.dapCm !== undefined)                campo('dap_cm', body.dapCm ?? null)
      if (body.estadoFitossanitario !== undefined) campo('estado_fitossanitario', body.estadoFitossanitario ?? null)
      if (body.situacaoCalcada !== undefined)      campo('situacao_calcada', body.situacaoCalcada ?? null)
      if (body.logradouroId !== undefined)         campo('logradouro_id', body.logradouroId ?? null)
      if (body.fotoUrls !== undefined)             campo('foto_urls', body.fotoUrls)
      if (body.latitude !== undefined && body.longitude !== undefined) {
        updates.push(`geometry = ST_Transform(ST_SetSRID(ST_Point($${idx++},$${idx++}),4326),31982)`)
        params.push(body.longitude, body.latitude)
      }
      if (!updates.length) return { ok: true }

      params.push(id)
      const result = await query(`UPDATE sigweb.arvores SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`, params)
      if (result.length === 0) return reply.code(404).send({ error: 'Árvore não encontrada' })
      return { ok: true }
    }
  )

  // Registrar/atualizar token do dispositivo para notificações push (Expo) — req 144/146/147
  app.put('/mobile/dispositivo', async (request) => {
    const { expoPushToken } = z.object({ expoPushToken: z.string().min(1) }).parse(request.body)
    await query(`UPDATE sigweb.usuarios SET expo_push_token = $2 WHERE auth_uid = $1`, [request.user.uid, expoPushToken])
    return { ok: true }
  })

  // Atualizar situação (fase) de chamado — notifica o cidadão via sino + push Expo — req 146
  // e registra a transição no histórico (req 152)
  app.patch(
    '/mobile/chamados/:id/situacao',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { situacao } = z.object({
        situacao: z.enum(['aberta', 'em_analise', 'em_andamento', 'concluida', 'cancelada']),
      }).parse(request.body)
      const chamado = await query<{ solicitante_id: string | null; situacao: string; historico: HistoricoEntry[] }>(
        `SELECT solicitante_id, situacao, historico FROM sigweb.solicitacoes_chamado WHERE id = $1`, [id]
      )
      if (chamado.length === 0) return reply.code(404).send({ error: 'Chamado não encontrado' })

      const analistaId = await resolveUsuarioId(request.user.uid, request.user.email)
      const [analista] = await query<{ nome: string | null }>(`SELECT nome FROM sigweb.usuarios WHERE id = $1`, [analistaId])
      const historico = [
        ...(chamado[0].historico ?? []),
        { de: chamado[0].situacao, para: situacao, usuario: analista?.nome ?? request.user.email, data: new Date().toISOString() },
      ]

      await query(
        `UPDATE sigweb.solicitacoes_chamado
         SET situacao = $2, analista_id = $3, historico = $4
         WHERE id = $1`,
        [id, situacao, analistaId, JSON.stringify(historico)]
      )

      if (chamado[0].solicitante_id) {
        await notificarCidadao(
          chamado[0].solicitante_id, 'chamado_situacao',
          'Situação da sua solicitação foi alterada',
          `Nova situação: ${SITUACAO_LABEL[situacao] ?? situacao}`,
          id, request.user.email
        )
      }
      return { ok: true }
    }
  )

  // Atribuir responsável (analista) pelo chamado — req 129
  app.patch(
    '/mobile/chamados/:id/analista',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { analistaId } = z.object({ analistaId: z.string().uuid().nullable() }).parse(request.body)
      const result = await query(
        `UPDATE sigweb.solicitacoes_chamado SET analista_id = $2 WHERE id = $1 RETURNING id`,
        [id, analistaId]
      )
      if (result.length === 0) return reply.code(404).send({ error: 'Chamado não encontrado' })
      return { ok: true }
    }
  )

  // Lista de usuários da equipe (não-cidadãos) para atribuição de responsável — req 129
  app.get(
    '/mobile/equipe',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO') },
    async () => query(
      `SELECT id, nome, perfil FROM sigweb.usuarios WHERE perfil != 'CIDADAO' AND ativo = true ORDER BY nome`
    )
  )

  // Alterar categoria do chamado — notifica o cidadão via sino + push Expo — req 143/144
  app.patch(
    '/mobile/chamados/:id/categoria',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { categoriaId } = z.object({ categoriaId: z.string().uuid() }).parse(request.body)

      const chamado = await query<{ solicitante_id: string | null }>(
        `SELECT solicitante_id FROM sigweb.solicitacoes_chamado WHERE id = $1`, [id]
      )
      if (chamado.length === 0) return reply.code(404).send({ error: 'Chamado não encontrado' })

      const categoria = await query<{ nome: string }>(
        `SELECT nome FROM sigweb.categorias_chamado WHERE id = $1`, [categoriaId]
      )
      if (categoria.length === 0) return reply.code(404).send({ error: 'Categoria não encontrada' })

      await query(`UPDATE sigweb.solicitacoes_chamado SET categoria_id = $2 WHERE id = $1`, [id, categoriaId])

      if (chamado[0].solicitante_id) {
        await notificarCidadao(
          chamado[0].solicitante_id, 'chamado_categoria',
          'Categoria da sua solicitação foi alterada',
          `Nova categoria: ${categoria[0].nome}`,
          id, request.user.email
        )
      }
      return { ok: true }
    }
  )

  // Mensagens públicas (cidadão) e privadas (equipe interna) do chamado — req 147/148/149
  app.post(
    '/mobile/chamados/:id/mensagens',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = z.object({
        texto: z.string().min(1),
        publica: z.boolean().default(true),
      }).parse(request.body)

      const chamado = await query<{ solicitante_id: string | null; mensagens: unknown[] }>(
        `SELECT solicitante_id, mensagens FROM sigweb.solicitacoes_chamado WHERE id = $1`,
        [id]
      )
      if (chamado.length === 0) return reply.code(404).send({ error: 'Chamado não encontrado' })

      const autor = await query<{ id: string; nome: string }>(
        `SELECT id, nome FROM sigweb.usuarios WHERE auth_uid = $1`,
        [request.user.uid]
      )

      const mensagem = {
        id: crypto.randomUUID(),
        texto: body.texto,
        publica: body.publica,
        autor_id: autor[0]?.id ?? null,
        autor_nome: autor[0]?.nome ?? request.user.email,
        created_at: new Date().toISOString(),
      }

      const mensagens = [...(chamado[0].mensagens ?? []), mensagem]
      await query(
        `UPDATE sigweb.solicitacoes_chamado SET mensagens = $2 WHERE id = $1`,
        [id, JSON.stringify(mensagens)]
      )

      // Notifica o cidadão (sino + push Expo, req 147) — mensagens privadas ficam restritas à equipe (req 148)
      if (body.publica && chamado[0].solicitante_id) {
        await notificarCidadao(
          chamado[0].solicitante_id, 'chamado_mensagem',
          'Nova mensagem na sua solicitação', body.texto, id, request.user.email
        )
      }

      reply.code(201)
      return mensagem
    }
  )

  // Categorias de chamado (para configuração)
  app.get('/mobile/categorias', async () =>
    query(
      `SELECT id, nome, descricao, privada, ativa, boletim, categoria_pai_id, cor, icone_url
       FROM sigweb.categorias_chamado ORDER BY nome`
    )
  )

  // Hierarquia pai/filho e cor/ícone da categoria — req 134/135
  app.patch(
    '/mobile/categorias/:id',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = z.object({
        categoriaPaiId: z.string().uuid().nullable().optional(),
        cor: z.string().nullable().optional(),
        iconeUrl: z.string().nullable().optional(),
        privada: z.boolean().optional(),
      }).parse(request.body)

      if (body.categoriaPaiId === id) {
        return reply.code(400).send({ error: 'Uma categoria não pode ser pai de si mesma' })
      }

      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1
      if (body.categoriaPaiId !== undefined) { updates.push(`categoria_pai_id = $${idx++}`); params.push(body.categoriaPaiId) }
      if (body.cor !== undefined)            { updates.push(`cor = $${idx++}`);              params.push(body.cor) }
      if (body.iconeUrl !== undefined)       { updates.push(`icone_url = $${idx++}`);        params.push(body.iconeUrl) }
      if (body.privada !== undefined)        { updates.push(`privada = $${idx++}`);          params.push(body.privada) }
      if (!updates.length) return { ok: true }

      params.push(id)
      const result = await query(`UPDATE sigweb.categorias_chamado SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`, params)
      if (result.length === 0) return reply.code(404).send({ error: 'Categoria não encontrada' })
      return { ok: true }
    }
  )

  // Boletim (questionário) do Fluxo de Trabalho da categoria — req 132
  app.put(
    '/mobile/categorias/:id/boletim',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { boletim } = z.object({ boletim: z.array(perguntaBoletimSchema) }).parse(request.body)
      const categoria = await query<{ id: string }>(`SELECT id FROM sigweb.categorias_chamado WHERE id = $1`, [id])
      if (categoria.length === 0) return reply.code(404).send({ error: 'Categoria não encontrada' })
      await query(`UPDATE sigweb.categorias_chamado SET boletim = $2 WHERE id = $1`, [id, JSON.stringify(boletim)])
      return { ok: true }
    }
  )
}
