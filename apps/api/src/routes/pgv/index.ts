import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const setorSchema = z.object({
  nome: z.string().min(1),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }),
})

const poloSchema = z.object({
  nome: z.string().min(1),
  tipo: z.string().optional(),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }),
})

const amostraSchema = z.object({
  setorId: z.string().uuid(),
  valorAmostra: z.number().positive(),
  idadeAparente: z.number().int().optional(),
  estadoConservacao: z.string().optional(),
  tipologia: z.string().optional(),
  padraoCub: z.string().optional(),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }),
})

function regressaoLinear(pontos: { x: number; y: number }[]) {
  const n = pontos.length
  if (n < 2) return { a: 0, b: 0, r2: 0 }
  const sumX = pontos.reduce((acc, p) => acc + p.x, 0)
  const sumY = pontos.reduce((acc, p) => acc + p.y, 0)
  const sumXY = pontos.reduce((acc, p) => acc + p.x * p.y, 0)
  const sumX2 = pontos.reduce((acc, p) => acc + p.x * p.x, 0)
  const meanY = sumY / n
  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const a = (sumY - b * sumX) / n
  const ssTot = pontos.reduce((acc, p) => acc + Math.pow(p.y - meanY, 2), 0)
  const ssRes = pontos.reduce((acc, p) => acc + Math.pow(p.y - (a + b * p.x), 2), 0)
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot
  return { a, b, r2 }
}

export async function pgvRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/pgv/setores', async () =>
    query(
      `SELECT s.id, s.nome, s.equacao, s.r2, COUNT(a.id)::int AS qtd_amostras,
              ST_AsGeoJSON(ST_Transform(s.geometry,4326))::json AS geometry
       FROM sigweb.setores_pgv s
       LEFT JOIN sigweb.amostras_pgv a ON a.setor_id = s.id AND NOT a.espuria
       GROUP BY s.id ORDER BY s.nome`
    )
  )

  app.post(
    '/pgv/setores',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = setorSchema.parse(request.body)
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.setores_pgv (nome, geometry)
         VALUES ($1, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2),4326),31982))
         RETURNING id`,
        [body.nome, JSON.stringify(body.geometry)]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  // req 211: polos valorizantes desenhados no mapa
  app.get('/pgv/polos', async () =>
    query(
      `SELECT id, nome, tipo, ST_AsGeoJSON(ST_Transform(geometry,4326))::json AS geometry
       FROM sigweb.polos_pgv ORDER BY nome`
    )
  )

  app.post(
    '/pgv/polos',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = poloSchema.parse(request.body)
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.polos_pgv (nome, tipo, geometry)
         VALUES ($1, $2, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3),4326),31982))
         RETURNING id`,
        [body.nome, body.tipo ?? null, JSON.stringify(body.geometry)]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.post(
    '/pgv/amostras',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = amostraSchema.parse(request.body)

      // Calcula distância ao polo PGV mais próximo do setor
      const polo = await queryOne<{ id: string; distancia: number }>(
        `SELECT p.id, ST_Distance(p.geometry, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),31982)) AS distancia
         FROM sigweb.polos_pgv p
         ORDER BY distancia LIMIT 1`,
        [JSON.stringify(body.geometry)]
      )

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.amostras_pgv
           (setor_id, valor_amostra, idade_aparente, estado_conservacao, tipologia, padrao_cub, distancia_polo, geometry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($8),4326),31982))
         RETURNING id`,
        [
          body.setorId, body.valorAmostra, body.idadeAparente ?? null,
          body.estadoConservacao ?? null, body.tipologia ?? null,
          body.padraoCub ?? null, polo?.distancia ?? null,
          JSON.stringify(body.geometry),
        ]
      )
      reply.code(201)
      return { id: row.id, distanciaPolo: polo?.distancia }
    }
  )

  app.delete(
    '/pgv/amostras/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`UPDATE sigweb.amostras_pgv SET espuria = TRUE WHERE id = $1`, [id])
      reply.code(204)
    }
  )

  // Calcular regressão para o setor e aplicar às faces de quadra
  app.post(
    '/pgv/calcular',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { setorId } = request.body as { setorId: string }

      const amostras = await query<{ distancia_polo: number; valor_amostra: number }>(
        `SELECT distancia_polo, valor_amostra FROM sigweb.amostras_pgv
         WHERE setor_id = $1 AND NOT espuria AND distancia_polo IS NOT NULL`,
        [setorId]
      )

      if (amostras.length < 2) {
        return reply.code(400).send({ error: 'Mínimo 2 amostras não espúrias com distância ao polo' })
      }

      const pontos = amostras.map(a => ({ x: a.distancia_polo, y: a.valor_amostra }))
      const { a, b, r2 } = regressaoLinear(pontos)
      const equacao = `V = ${a.toFixed(2)} + ${b.toFixed(6)} * D`

      await query(
        `UPDATE sigweb.setores_pgv SET equacao = $2, r2 = $3 WHERE id = $1`,
        [setorId, equacao, r2]
      )

      // Aplica às faces de quadra dentro do setor
      await query(
        `UPDATE sigweb.faces_quadra fq
         SET valor_calculado = $2 + $3 * fq.distancia_polo,
             setor_pgv_id = $1
         WHERE ST_Within(ST_Centroid(fq.geometry),
           (SELECT geometry FROM sigweb.setores_pgv WHERE id = $1))
           AND fq.distancia_polo IS NOT NULL`,
        [setorId, a, b]
      )

      return { equacao, r2, qtdAmostras: amostras.length }
    }
  )

  app.post(
    '/pgv/simular-iptu',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = z.object({
        descricao: z.string(),
        aliquotaResidencial: z.number(),
        aliquotaComercial: z.number(),
        aliquotaIndustrial: z.number(),
        aliquotaTereno: z.number(),
        tetoAumentoPercent: z.number().default(15),
      }).parse(request.body)

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.simulacoes_iptu
           (descricao, aliquota_residencial, aliquota_comercial, aliquota_industrial, aliquota_terreno, teto_aumento_percent, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          body.descricao, body.aliquotaResidencial, body.aliquotaComercial,
          body.aliquotaIndustrial, body.aliquotaTereno, body.tetoAumentoPercent, request.user.uid,
        ]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  // Faces de quadra com valor PGV calculado, georreferenciadas — camada
  // temática do mapa (req 219)
  app.get('/pgv/faces-quadra', async () =>
    query(
      `SELECT fq.id, fq.valor_calculado, fq.lado,
              q.codigo AS quadra_codigo, l.nome AS logradouro_nome,
              ST_AsGeoJSON(ST_Transform(fq.geometry, 4326))::json AS geometry
       FROM sigweb.faces_quadra fq
       LEFT JOIN sigweb.quadras q ON q.id = fq.quadra_id
       LEFT JOIN sigweb.logradouros l ON l.id = fq.logradouro_id
       WHERE fq.valor_calculado IS NOT NULL AND fq.geometry IS NOT NULL`
    )
  )

  app.get('/pgv/relatorio', async (request) => {
    const { setorId } = request.query as { setorId?: string }
    const where = setorId ? `WHERE fq.setor_pgv_id = $1` : ''
    const params = setorId ? [setorId] : []
    return query(
      `SELECT fq.*, q.codigo AS quadra_codigo, l.nome AS logradouro_nome, s.nome AS setor_nome
       FROM sigweb.faces_quadra fq
       LEFT JOIN sigweb.quadras q ON q.id = fq.quadra_id
       LEFT JOIN sigweb.logradouros l ON l.id = fq.logradouro_id
       LEFT JOIN sigweb.setores_pgv s ON s.id = fq.setor_pgv_id
       ${where}
       ORDER BY q.codigo, l.nome`,
      params
    )
  })
}
