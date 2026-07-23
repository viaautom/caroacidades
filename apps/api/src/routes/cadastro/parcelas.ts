import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { jsPDF } from 'jspdf'
import { utils, write } from 'xlsx'
import crypto from 'crypto'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'
import {
  getMemorialDescritivo,
  desmembrarParcela,
  unificarParcelas,
  getParcelasNoBbox,
} from '../../services/spatial.service'

const EXPORT_FORMATS = ['csv', 'xml', 'xlsx'] as const

export const MIGRATION_PARCELAS_GEOM = `
  ALTER TABLE sigweb.parcelas ALTER COLUMN geometry TYPE GEOMETRY(Geometry, 31982);
`

type ExportFormat = (typeof EXPORT_FORMATS)[number]

function escapeCsv(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.map(escapeCsv).join(',')]
  for (const row of rows) {
    lines.push(headers.map((key) => escapeCsv(row[key])).join(','))
  }
  return lines.join('\r\n')
}

function toXml(rootName: string, rows: Record<string, unknown>[]) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += `<${rootName}>\n`
  for (const row of rows) {
    xml += '  <row>\n'
    for (const [key, value] of Object.entries(row)) {
      xml += `    <${key}>${value == null ? '' : String(value)}</${key}>\n`
    }
    xml += '  </row>\n'
  }
  xml += `</${rootName}>\n`
  return xml
}

function toXlsx(rows: Record<string, unknown>[]) {
  const worksheet = utils.json_to_sheet(rows)
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, 'export')
  return write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function canonicalizeMemorialForHash(memorial: any, parcelaId: string) {
  return JSON.stringify({
    parcelaId,
    areaM2: memorial.areaM2,
    perimetro: memorial.perimetro,
    vertices: memorial.vertices.map((v: any) => ({
      n: v.n,
      x: Number(v.x.toFixed(6)),
      y: Number(v.y.toFixed(6)),
      azimute: v.azimute,
      distancia: Number(v.distancia.toFixed(2)),
    })),
    confrontantes: memorial.confrontantes.map((c: any) => ({
      id: c.id,
      codigo: c.codigo,
      logradouro: c.logradouro,
    })),
  })
}

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

const bboxSchema = z.object({
  minx: z.coerce.number(),
  miny: z.coerce.number(),
  maxx: z.coerce.number(),
  maxy: z.coerce.number(),
})

const parcelaSchema = z.object({
  codigo: z.string().min(1).max(30),
  bairroId: z.string().uuid().optional(),
  logradouroId: z.string().uuid().optional(),
  loteamentoId: z.string().uuid().optional(),
  quadraId: z.string().uuid().optional(),
  camadaId: z.string().uuid().optional(),
  areaM2: z.number().positive().optional(),
  testadaPrincipal: z.number().positive().optional(),
  testadaSecundaria: z.number().positive().optional(),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).optional(),
})

export async function parcelasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Listar parcelas por bbox (para o mapa)
  app.get('/parcelas', async (request, reply) => {
    const parsed = bboxSchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bbox inválido' })
    }
    const parcelas = await getParcelasNoBbox(parsed.data)
    return { data: parcelas }
  })

  // Busca textual por código / logradouro, com filtro opcional por camada
  app.get('/parcelas/search', async (request, reply) => {
    const { q, page = '1', limit = '50', camada_id } = request.query as Record<string, string>
    if (!q || q.length < 2) return reply.code(400).send({ error: 'Mínimo 2 caracteres' })

    const offset = (Number(page) - 1) * Number(limit)

    // Construção segura do filtro opcional de camada usando parâmetro posicional
    const baseParams: unknown[] = [`%${q}%`]
    const camadaClause = camada_id ? `AND p.camada_id = $${baseParams.push(camada_id)}` : ''

    const rows = await query(
      `SELECT p.id, p.codigo, p.area_m2, p.camada_id,
              b.nome AS bairro, l.nome AS logradouro,
              ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
       FROM sigweb.parcelas p
       LEFT JOIN sigweb.bairros b ON b.id = p.bairro_id
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       WHERE (p.codigo ILIKE $1 OR l.nome ILIKE $1) ${camadaClause}
       ORDER BY p.codigo
       LIMIT $${baseParams.push(Number(limit))} OFFSET $${baseParams.push(offset)}`,
      baseParams
    )

    const countParams: unknown[] = [`%${q}%`]
    const camadaClauseCount = camada_id ? `AND p.camada_id = $${countParams.push(camada_id)}` : ''
    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*) FROM sigweb.parcelas p
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       WHERE (p.codigo ILIKE $1 OR l.nome ILIKE $1) ${camadaClauseCount}`,
      countParams
    )
    return { data: rows, pagination: { page: Number(page), limit: Number(limit), total: Number(count) } }
  })

  // Lista todas as parcelas para o Banco de Dados
  app.get('/parcelas/all', async () => {
    return query(
      `SELECT p.id, p.codigo, p.area_m2, p.quadra_id, p.bairro_id, p.logradouro_id,
              b.nome AS bairro, l.nome AS logradouro, q.codigo AS quadra_codigo
       FROM sigweb.parcelas p
       LEFT JOIN sigweb.bairros b ON b.id = p.bairro_id
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       LEFT JOIN sigweb.quadras q ON q.id = p.quadra_id
       ORDER BY p.codigo`
    )
  })

  // Detalhe de uma parcela
  app.get('/parcelas/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parcela = await queryOne(
      `SELECT
         p.*,
         b.nome AS bairro_nome, b.codigo AS bairro_codigo,
         l.nome AS logradouro_nome, l.tipo AS logradouro_tipo,
         q.codigo AS quadra_codigo,
         ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry,
         ST_Area(p.geometry) AS area_m2_calc
       FROM sigweb.parcelas p
       LEFT JOIN sigweb.bairros b ON b.id = p.bairro_id
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       LEFT JOIN sigweb.quadras q ON q.id = p.quadra_id
       WHERE p.id = $1`,
      [id]
    )
    if (!parcela) return reply.code(404).send({ error: 'Parcela não encontrada' })
    return parcela
  })

  // Criar parcela — qualquer perfil interno (não CIDADAO) pode criar
  app.post(
    '/parcelas',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const body = parcelaSchema.parse(request.body)
      // $1...$7 = dados cadastrais; $8 = geometry GeoJSON (se fornecida)
      const params: unknown[] = [
        body.codigo,
        body.bairroId ?? null,
        body.logradouroId ?? null,
        body.loteamentoId ?? null,
        body.quadraId ?? null,
        body.testadaPrincipal ?? null,
        body.testadaSecundaria ?? null,
        body.camadaId ?? null,
      ]
      if (body.geometry) params.push(JSON.stringify(body.geometry))

      const geomIdx  = params.length   // índice do geometry se presente
      const geomSql  = body.geometry ? `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${geomIdx}), 4326), 31982)` : `NULL`
      const areaSql  = body.geometry ? `ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${geomIdx}), 4326), 31982))` : `NULL`

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.parcelas
           (codigo, bairro_id, logradouro_id, loteamento_id, quadra_id, testada_principal, testada_secundaria, camada_id, geometry, area_m2)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${geomSql},${areaSql})
         RETURNING id`,
        params
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  // Atualizar geometria da parcela
  app.put(
    '/parcelas/:id/geometry',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { geometry } = request.body as { geometry: object }

      await query(
        `UPDATE sigweb.parcelas
         SET geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 31982),
             area_m2  = ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 31982))
         WHERE id = $1`,
        [id, JSON.stringify(geometry)]
      )
      return { ok: true }
    }
  )

  // Atualizar dados cadastrais da parcela
  app.put(
    '/parcelas/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = parcelaSchema.parse(request.body)
      await query(
        `UPDATE sigweb.parcelas
         SET codigo             = $2,
             bairro_id          = $3,
             logradouro_id      = $4,
             quadra_id          = $5,
             testada_principal  = $6,
             testada_secundaria = $7,
             camada_id          = $8
         WHERE id = $1`,
        [
          id,
          body.codigo,
          body.bairroId ?? null,
          body.logradouroId ?? null,
          body.quadraId ?? null,
          body.testadaPrincipal ?? null,
          body.testadaSecundaria ?? null,
          body.camadaId ?? null,
        ]
      )
      return { ok: true }
    }
  )

  // Deletar parcela
  app.delete(
    '/parcelas/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.parcelas WHERE id = $1`, [id])
      reply.code(204)
    }
  )

  // Exportação de parcelas para CSV / XML / XLSX
  app.get('/parcelas/export', async (request, reply) => {
    const { format = 'csv' } = request.query as { format?: string }
    if (!EXPORT_FORMATS.includes(format as ExportFormat)) {
      return reply.code(400).send({ error: 'Formato inválido. Use csv, xml ou xlsx.' })
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT p.id, p.codigo, p.area_m2, p.testada_principal, p.testada_secundaria,
              b.nome AS bairro, l.nome AS logradouro, q.codigo AS quadra_codigo
       FROM sigweb.parcelas p
       LEFT JOIN sigweb.bairros b ON b.id = p.bairro_id
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       LEFT JOIN sigweb.quadras q ON q.id = p.quadra_id
       ORDER BY p.codigo`
    )

    const filename = `parcelas.${format}`
    if (format === 'csv') {
      const csv = toCsv(rows)
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return csv
    }

    if (format === 'xml') {
      const xml = toXml('parcelas', rows)
      reply.header('Content-Type', 'application/xml; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return xml
    }

    const buffer = toXlsx(rows)
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return buffer
  })

  // Memorial descritivo em JSON (o PDF é gerado no frontend com jsPDF)
  app.get('/parcelas/:id/memorial', async (request, reply) => {
    const { id } = request.params as { id: string }
    const memorial = await getMemorialDescritivo(id)
    if (!memorial) return reply.code(404).send({ error: 'Parcela não encontrada' })
    return memorial
  })

  app.get('/parcelas/:id/memorial-descritivo', async (request, reply) => {
    const { id } = request.params as { id: string }
    const memorial = await getMemorialDescritivo(id)
    if (!memorial) return reply.code(404).send({ error: 'Parcela não encontrada' })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    pdf.setFontSize(16)
    pdf.text('Memorial Descritivo', 14, 20)
    pdf.setFontSize(10)
    pdf.text(`Parcela: ${id}`, 14, 28)
    pdf.text(`Área: ${memorial.areaM2.toFixed(2)} m²`, 14, 34)
    pdf.text(`Perímetro: ${memorial.perimetro.toFixed(2)} m`, 14, 40)
    pdf.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 46)

    const columns = ['N', 'X', 'Y', 'Azimute', 'Distância (m)']
    const rows = memorial.vertices.map((v) => [v.n, v.x.toFixed(6), v.y.toFixed(6), v.azimute, v.distancia.toFixed(2)])
    ;(pdf as any).autoTable({
      startY: 52,
      head: [columns],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8 },
    })

    const finalY = (pdf as any).lastAutoTable?.finalY ?? 52
    pdf.setFontSize(10)
    pdf.text('Confrontantes:', 14, finalY + 12)
    if (memorial.confrontantes.length > 0) {
      memorial.confrontantes.forEach((confrontante, index) => {
        const y = finalY + 18 + index * 6
        pdf.text(`- ${confrontante.codigo ?? confrontante.logradouro ?? confrontante.id}`, 14, y)
      })
    } else {
      pdf.text('- Nenhum confrontante cadastrado', 14, finalY + 18)
    }

    const hash = sha256Hex(canonicalizeMemorialForHash(memorial, id))
    const hashText = pdf.splitTextToSize(`SHA-256 do memorial (dados internos): ${hash}`, 182)
    let hashY = finalY + 18 + Math.max(memorial.confrontantes.length, 1) * 6 + 10
    const bottomMargin = 20
    if (hashY + hashText.length * 6 > pdf.internal.pageSize.height - bottomMargin) {
      pdf.addPage()
      hashY = 20
    }
    pdf.setFontSize(8)
    pdf.text(hashText, 14, hashY)

    const output = pdf.output('arraybuffer')
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="Caroá_Cidades_Inteligentes_INPI.pdf"`)
    return Buffer.from(output)
  })

  // Edificações da parcela
  app.get('/parcelas/:id/edificacoes', async (request, reply) => {
    const { id } = request.params as { id: string }
    return query(
      `SELECT e.*,
              ST_AsGeoJSON(ST_Transform(e.geometry, 4326))::json AS geometry
       FROM sigweb.edificacoes e WHERE e.parcela_id = $1`,
      [id]
    )
  })

  // Desmembramento
  app.post(
    '/parcelas/:id/desmembrar',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = z.object({
        linhaGeoJSON: z.object({ type: z.literal('LineString'), coordinates: z.array(z.array(z.number())).min(2) }),
        novoCodigo: z.string().min(1).max(60),
      }).parse(request.body)
      try {
        const resultado = await desmembrarParcela(id, body.linhaGeoJSON, body.novoCodigo, request.user.uid)
        reply.code(201)
        return resultado
      } catch (err: any) {
        return reply.code(400).send({ error: err.message ?? 'Erro no desmembramento' })
      }
    }
  )

  // Unificação
  app.post(
    '/parcelas/unificar',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { parcelaIds, novoCodigo } = request.body as { parcelaIds: string[]; novoCodigo: string }
      try {
        const novoId = await unificarParcelas(parcelaIds, novoCodigo, request.user.uid)
        reply.code(201)
        return { id: novoId }
      } catch (err: any) {
        return reply.code(400).send({ error: err.message ?? 'Erro na unificação' })
      }
    }
  )

  // Histórico de alterações
  app.get('/parcelas/:id/historico', async (request, reply) => {
    const { id } = request.params as { id: string }
    return query(
      `SELECT h.*, u.nome AS usuario_nome
       FROM sigweb.historico_cartografico h
       LEFT JOIN sigweb.usuarios u ON u.id = h.usuario_id
       WHERE h.entidade = 'parcelas' AND h.entidade_id = $1
       ORDER BY h.created_at DESC`,
      [id]
    )
  })
}
