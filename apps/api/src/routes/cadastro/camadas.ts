import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

export const MIGRATION_CAMADAS = `
  CREATE TABLE IF NOT EXISTS sigweb.camadas_vetoriais (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nome       TEXT        NOT NULL,
    descricao  TEXT,
    cor        TEXT        NOT NULL DEFAULT '#2563eb',
    colunas    JSONB       NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE sigweb.parcelas
    ADD COLUMN IF NOT EXISTS camada_id  UUID  REFERENCES sigweb.camadas_vetoriais(id),
    ADD COLUMN IF NOT EXISTS atributos  JSONB NOT NULL DEFAULT '{}';

  CREATE TABLE IF NOT EXISTS sigweb.camadas_wms (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nome        TEXT        NOT NULL,
    categoria   TEXT,
    url         TEXT        NOT NULL,
    camada_wms  TEXT        NOT NULL,
    formato     TEXT        NOT NULL DEFAULT 'image/png',
    transparente BOOLEAN    NOT NULL DEFAULT true,
    opacidade   NUMERIC(3,2) NOT NULL DEFAULT 0.8,
    ativa       BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

const colunaSchema = z.object({ nome: z.string().min(1), tipo: z.enum(['text', 'number', 'date', 'boolean']) })

function flatCoords(c: unknown): number[] {
  if (!Array.isArray(c)) return []
  if (typeof c[0] === 'number') return c as number[]
  return (c as unknown[]).flatMap(flatCoords)
}

// Returns 31982 if UTM coordinates detected, otherwise 4326 (WGS84)
function detectShpSrid(features: any[]): 4326 | 31982 {
  for (const f of features.slice(0, 5)) {
    const coords = flatCoords(f.geometry?.coordinates)
    if (coords.some(v => Math.abs(v) > 180)) return 31982
  }
  return 4326
}

export async function camadasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Listar camadas com contagem de feições
  app.get('/camadas', async () => {
    return query(`
      SELECT cv.id, cv.nome, cv.descricao, cv.cor, cv.colunas, cv.created_at,
             COUNT(p.id)::int AS total_parcelas
      FROM sigweb.camadas_vetoriais cv
      LEFT JOIN sigweb.parcelas p ON p.camada_id = cv.id
      GROUP BY cv.id
      ORDER BY cv.created_at DESC
    `)
  })

  // Criar camada
  app.post('/camadas', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') }, async (request, reply) => {
    const body = z.object({
      nome: z.string().min(1),
      descricao: z.string().optional(),
      cor: z.string().default('#2563eb'),
    }).parse(request.body)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.camadas_vetoriais (nome, descricao, cor)
       VALUES ($1, $2, $3) RETURNING id`,
      [body.nome, body.descricao ?? null, body.cor]
    )
    reply.code(201)
    return { id: row.id }
  })

  // Atualizar camada (nome/descrição/cor/colunas)
  app.put('/camadas/:id', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') }, async (request) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      nome: z.string().min(1).optional(),
      descricao: z.string().optional(),
      cor: z.string().optional(),
      colunas: z.array(colunaSchema).optional(),
    }).parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [id]
    let i = 2
    if (body.nome !== undefined)     { sets.push(`nome = $${i++}`);              params.push(body.nome) }
    if (body.descricao !== undefined) { sets.push(`descricao = $${i++}`);         params.push(body.descricao) }
    if (body.cor !== undefined)       { sets.push(`cor = $${i++}`);               params.push(body.cor) }
    if (body.colunas !== undefined)   { sets.push(`colunas = $${i++}`);           params.push(JSON.stringify(body.colunas)) }
    if (sets.length === 0) return { ok: true }

    await query(`UPDATE sigweb.camadas_vetoriais SET ${sets.join(', ')} WHERE id = $1`, params)
    return { ok: true }
  })

  // Deletar camada (desvincula parcelas)
  app.delete('/camadas/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await query(`UPDATE sigweb.parcelas SET camada_id = NULL WHERE camada_id = $1`, [id])
    await query(`DELETE FROM sigweb.camadas_vetoriais WHERE id = $1`, [id])
    reply.code(204)
  })

  // Listar parcelas de uma camada
  app.get('/camadas/:id/parcelas', async (request) => {
    const { id } = request.params as { id: string }
    const { page = '1', limit = '200' } = request.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)

    const rows = await query(`
      SELECT p.id, p.codigo, p.area_m2, p.atributos,
             b.nome AS bairro, l.nome AS logradouro,
             ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
      FROM sigweb.parcelas p
      LEFT JOIN sigweb.bairros b ON b.id = p.bairro_id
      LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
      WHERE p.camada_id = $1
      ORDER BY p.codigo
      LIMIT $2 OFFSET $3
    `, [id, Number(limit), offset])

    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*) FROM sigweb.parcelas WHERE camada_id = $1`, [id]
    )
    return { data: rows, pagination: { page: Number(page), limit: Number(limit), total: Number(count) } }
  })

  // Download da camada como GeoJSON FeatureCollection (sem paginação)
  app.get('/camadas/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string }

    const camada = await queryOne<{ nome: string }>(
      `SELECT nome FROM sigweb.camadas_vetoriais WHERE id = $1`, [id]
    )
    if (!camada) return reply.code(404).send({ error: 'Não encontrada' })

    const rows = await query<{
      id: string; codigo: string | null; area_m2: number | null
      atributos: Record<string, unknown>; geometry: object | null
    }>(`
      SELECT p.id, p.codigo, p.area_m2, p.atributos,
             ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
      FROM sigweb.parcelas p
      WHERE p.camada_id = $1 AND p.geometry IS NOT NULL
      ORDER BY p.codigo
    `, [id])

    const fc = {
      type: 'FeatureCollection',
      name: camada.nome,
      features: rows.map(r => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: { id: r.id, codigo: r.codigo, area_m2: r.area_m2, ...r.atributos },
      })),
    }

    reply
      .header('Content-Type', 'application/geo+json')
      .header('Content-Disposition', `attachment; filename="${camada.nome.replace(/\s+/g, '_')}.geojson"`)
    return fc
  })

  // Upload de shapefile (.zip) → cria camada + importa feições
  app.post('/camadas/upload-shp', { preHandler: authMiddleware }, async (request, reply) => {
    const os = await import('os')
    const { join } = await import('path')
    const { writeFileSync, unlinkSync, existsSync } = await import('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const JSZip = require('jszip') as { loadAsync(data: Buffer): Promise<{ files: Record<string, { name: string; dir: boolean; async(type: string): Promise<ArrayBuffer> }> }> }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shapefile = require('shapefile') as { read(path: string): Promise<{ features: any[] }> }

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'Nenhum arquivo enviado' })

    const nome = (request.headers['x-layer-name'] as string) || data.filename.replace(/\.zip$/i, '').replace(/_/g, ' ')

    const buf = await data.toBuffer()
    let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
    try {
      zip = await JSZip.loadAsync(buf)
    } catch {
      return reply.code(400).send({ error: 'Arquivo ZIP inválido' })
    }

    // Encontra os arquivos .shp e .dbf dentro do zip
    const shpEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.shp') && !f.dir)
    const dbfEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.dbf') && !f.dir)

    if (!shpEntry) return reply.code(400).send({ error: 'Arquivo .shp não encontrado dentro do ZIP' })

    const tmpDir = os.tmpdir()
    const prefix = `shp_${Date.now()}`
    const shpPath = join(tmpDir, `${prefix}.shp`)
    const dbfPath = join(tmpDir, `${prefix}.dbf`)

    writeFileSync(shpPath, Buffer.from(await shpEntry.async('arraybuffer')))
    if (dbfEntry) writeFileSync(dbfPath, Buffer.from(await dbfEntry.async('arraybuffer')))

    let features: any[]
    try {
      const fc = await shapefile.read(shpPath)
      features = fc.features
    } catch (err: any) {
      return reply.code(400).send({ error: `Erro ao ler shapefile: ${err.message}` })
    } finally {
      if (existsSync(shpPath)) unlinkSync(shpPath)
      if (existsSync(dbfPath)) unlinkSync(dbfPath)
    }

    // Detecta se as coordenadas são UTM/EPSG:31982 (valores > 180) ou WGS84
    const srcSrid = detectShpSrid(features)

    // Cria a camada
    const [camada] = await query<{ id: string }>(
      `INSERT INTO sigweb.camadas_vetoriais (nome) VALUES ($1) RETURNING id`, [nome]
    )

    let importadas = 0
    const erros: string[] = []

    for (const [idx, feat] of features.entries()) {
      try {
        const codigo = `IMP-${camada.id.slice(0, 6)}-${String(idx + 1).padStart(4, '0')}`
        const atributos = feat.properties ?? {}
        const hasGeom = feat.geometry && typeof feat.geometry === 'object' && feat.geometry.type
        const geomExpr = hasGeom
          ? srcSrid === 31982
            ? `ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($4), 31982))`
            : `ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 31982))`
          : 'NULL'
        const areaExpr = hasGeom
          ? srcSrid === 31982
            ? `ST_Area(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($4), 31982)))`
            : `ST_Area(ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 31982)))`
          : 'NULL'

        const params: unknown[] = [codigo, camada.id, JSON.stringify(atributos)]
        if (hasGeom) params.push(JSON.stringify(feat.geometry))

        await query(
          `INSERT INTO sigweb.parcelas (codigo, camada_id, atributos, geometry, area_m2)
           VALUES ($1, $2, $3, ${geomExpr}, ${areaExpr})`,
          params
        )
        importadas++
      } catch (err: any) {
        erros.push(`Feição ${idx + 1}: ${err.message?.split('\n')[0]}`)
      }
    }

    reply.code(201)
    return { id: camada.id, nome, total: features.length, importadas, erros }
  })

  // Importar Camada (GeoJSON ou KML direto)
  app.post('/camadas/upload-geojson', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'Nenhum arquivo enviado' })

    const nome = request.headers['x-layer-name'] as string || 'Nova Camada'
    const buf = await data.toBuffer()
    const content = buf.toString('utf-8')

    let fc: any
    try {
      if (content.trim().startsWith('<')) {
        // Provável KML/XML
        const { DOMParser } = require('@xmldom/xmldom')
        const toGeoJSON = require('@tmcw/togeojson')
        const kml = new DOMParser().parseFromString(content, 'text/xml')
        fc = toGeoJSON.kml(kml)
      } else {
        fc = JSON.parse(content)
      }

      if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
        return reply.code(400).send({ error: 'O arquivo não é um GeoJSON ou KML válido' })
      }
    } catch (err: any) {
      return reply.code(400).send({ error: `Erro ao fazer parse do arquivo: ${err.message}` })
    }

    const features = fc.features

    // Detecta se as coordenadas são UTM/EPSG:31982 (valores > 180) ou WGS84
    let srcSrid = 4326
    for (const f of features.slice(0, 5)) {
      const coords = f.geometry?.coordinates?.flat(Infinity)
      if (coords?.some((v: number) => Math.abs(v) > 180)) {
        srcSrid = 31982
        break
      }
    }

    // Cria a camada
    const [camada] = await query<{ id: string }>(
      `INSERT INTO sigweb.camadas_vetoriais (nome) VALUES ($1) RETURNING id`, [nome]
    )

    let importadas = 0
    const erros: string[] = []

    for (const [idx, feat] of features.entries()) {
      try {
        const codigo = feat.properties?.codigo?.trim() || feat.codigo?.trim() || `IMP-${camada.id.slice(0, 6)}-${String(idx + 1).padStart(4, '0')}`
        const atributos = feat.properties ?? {}
        const hasGeom = feat.geometry && typeof feat.geometry === 'object' && feat.geometry.type
        const geomExpr = hasGeom
          ? srcSrid === 31982
            ? `ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($4), 31982))`
            : `ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 31982))`
          : 'NULL'
        const areaExpr = hasGeom
          ? srcSrid === 31982
            ? `ST_Area(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($4), 31982)))`
            : `ST_Area(ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 31982)))`
          : 'NULL'

        const params: unknown[] = [codigo, camada.id, JSON.stringify(atributos)]
        if (hasGeom) params.push(JSON.stringify(feat.geometry))

        await query(`
          INSERT INTO sigweb.parcelas (codigo, camada_id, atributos, geometry, area_m2)
          VALUES ($1, $2, $3, ${geomExpr}, ${areaExpr})
        `, params)
        importadas++
      } catch (err: any) {
        erros.push(`Feição ${idx + 1}: ${err.message}`)
      }
    }

    return { ok: true, camadaId: camada.id, total: features.length, importadas, erros }
  })

  // Importar feições (GeoJSON features ou linhas de planilha) para uma camada
  app.post('/camadas/:id/importar', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      features: z.array(z.object({
        codigo: z.string().optional(),
        geometry: z.object({ type: z.string(), coordinates: z.unknown() }).nullable().optional(),
        atributos: z.record(z.unknown()).optional(),
      })).min(1),
    }).parse(request.body)

    let importadas = 0
    const erros: string[] = []

    for (const [idx, feat] of body.features.entries()) {
      try {
        const codigo = feat.codigo?.trim() || `IMP-${id.slice(0, 6)}-${String(idx + 1).padStart(4, '0')}`
        const hasGeom = feat.geometry && typeof feat.geometry === 'object' && feat.geometry.type
        const geomExpr = hasGeom
          ? `ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 31982))`
          : `NULL`
        const areaExpr = hasGeom
          ? `ST_Area(ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 31982)))`
          : `NULL`

        const params: unknown[] = [codigo, id, JSON.stringify(feat.atributos ?? {})]
        if (hasGeom) params.push(JSON.stringify(feat.geometry))

        await query(
          `INSERT INTO sigweb.parcelas (codigo, camada_id, atributos, geometry, area_m2)
           VALUES ($1, $2, $3, ${geomExpr}, ${areaExpr})`,
          params
        )
        importadas++
      } catch (err: any) {
        erros.push(`Linha ${idx + 1}: ${err.message?.split('\n')[0] ?? 'erro desconhecido'}`)
      }
    }

    reply.code(erros.length === 0 ? 200 : 207)
    return { total: body.features.length, importadas, erros }
  })

  // ── Camadas WMS — mapas temáticos do sistema e externos (req 22) ──────────

  app.get('/camadas-wms', async () => {
    return query(`SELECT * FROM sigweb.camadas_wms ORDER BY categoria NULLS LAST, nome`)
  })

  app.post('/camadas-wms', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') }, async (request, reply) => {
    const body = z.object({
      nome: z.string().min(1),
      categoria: z.string().optional(),
      url: z.string().url(),
      camadaWms: z.string().min(1),
      formato: z.string().default('image/png'),
      transparente: z.boolean().default(true),
      opacidade: z.number().min(0).max(1).default(0.8),
    }).parse(request.body)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.camadas_wms (nome, categoria, url, camada_wms, formato, transparente, opacidade)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [body.nome, body.categoria ?? null, body.url, body.camadaWms, body.formato, body.transparente, body.opacidade]
    )
    reply.code(201)
    return { id: row.id }
  })

  app.put('/camadas-wms/:id', { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') }, async (request) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      nome: z.string().min(1).optional(),
      categoria: z.string().optional(),
      url: z.string().url().optional(),
      camadaWms: z.string().min(1).optional(),
      formato: z.string().optional(),
      transparente: z.boolean().optional(),
      opacidade: z.number().min(0).max(1).optional(),
      ativa: z.boolean().optional(),
    }).parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [id]
    let i = 2
    if (body.nome !== undefined)         { sets.push(`nome = $${i++}`);          params.push(body.nome) }
    if (body.categoria !== undefined)    { sets.push(`categoria = $${i++}`);      params.push(body.categoria) }
    if (body.url !== undefined)          { sets.push(`url = $${i++}`);            params.push(body.url) }
    if (body.camadaWms !== undefined)    { sets.push(`camada_wms = $${i++}`);     params.push(body.camadaWms) }
    if (body.formato !== undefined)      { sets.push(`formato = $${i++}`);        params.push(body.formato) }
    if (body.transparente !== undefined) { sets.push(`transparente = $${i++}`);   params.push(body.transparente) }
    if (body.opacidade !== undefined)    { sets.push(`opacidade = $${i++}`);      params.push(body.opacidade) }
    if (body.ativa !== undefined)        { sets.push(`ativa = $${i++}`);          params.push(body.ativa) }
    if (sets.length === 0) return { ok: true }

    await query(`UPDATE sigweb.camadas_wms SET ${sets.join(', ')} WHERE id = $1`, params)
    return { ok: true }
  })

  app.delete('/camadas-wms/:id', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await query(`DELETE FROM sigweb.camadas_wms WHERE id = $1`, [id])
    reply.code(204)
  })

  // Atualizar atributos e/ou código de uma parcela
  app.patch('/parcelas/:id/atributos', async (request) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      codigo: z.string().min(1).optional(),
      atributos: z.record(z.unknown()).optional(),
      camadaId: z.string().uuid().optional(),
    }).parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [id]
    let i = 2
    if (body.codigo !== undefined)   { sets.push(`codigo = $${i++}`);    params.push(body.codigo) }
    if (body.atributos !== undefined) { sets.push(`atributos = $${i++}`); params.push(JSON.stringify(body.atributos)) }
    if (body.camadaId !== undefined)  { sets.push(`camada_id = $${i++}`); params.push(body.camadaId) }
    if (sets.length === 0) return { ok: true }

    await query(`UPDATE sigweb.parcelas SET ${sets.join(', ')} WHERE id = $1`, params)
    return { ok: true }
  })
}
