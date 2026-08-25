import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const setorSchema = z.object({
  nome: z.string().min(1),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }),
})

const paradigmaSchema = z.object({
  paradigmaPadraoCub: z.string().min(1).optional().nullable(),
  paradigmaEstadoConservacao: z.string().min(1).optional().nullable(),
  paradigmaIdadeAparente: z.number().int().min(0).optional().nullable(),
})

const poloSchema = z.object({
  nome: z.string().min(1),
  tipo: z.string().optional(),
  setorId: z.string().uuid().optional(),
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

const cubSchema = z.object({
  tipologia: z.string().min(1),
  tipoEstrutura: z.string().optional(),
  padraoConstrutivo: z.string().min(1),
  coeficiente: z.number().positive().default(1),
  valorM2: z.number().positive(),
  mesReferencia: z.string(), // 'YYYY-MM-DD'
})

const depreciacaoSchema = z.object({
  estadoConservacao: z.string().min(1),
  idadeAparenteMin: z.number().int().min(0),
  idadeAparenteMax: z.number().int().min(0),
  coeficiente: z.number().positive(),
})

const simularIptuSchema = z.object({
  descricao: z.string(),
  aliquotaResidencial: z.number(),
  aliquotaComercial: z.number(),
  aliquotaIndustrial: z.number(),
  aliquotaTereno: z.number(),
  tetoAumentoPercent: z.number().default(15),
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

// Fator de CUB de uma amostra: relação entre o valor/m² do seu padrão
// construtivo e o mês de referência mais recente cadastrado (item 26).
// Padrão sem CUB cadastrado => fator neutro (1).
function valorCub(padrao: string | null | undefined, cubMap: Map<string, number>): number {
  if (!padrao) return 1
  return cubMap.get(padrao) ?? 1
}

// Coeficiente de depreciação por idade aparente/estado de conservação
// (item 27). Sem estado/idade informados ou sem faixa cadastrada => neutro (1).
function coeficienteDepreciacao(
  estado: string | null | undefined,
  idade: number | null | undefined,
  linhas: { estado_conservacao: string; idade_aparente_min: number; idade_aparente_max: number; coeficiente: number }[]
): number {
  if (!estado || idade == null) return 1
  const linha = linhas.find(
    l => l.estado_conservacao === estado && idade >= l.idade_aparente_min && idade <= l.idade_aparente_max
  )
  return linha?.coeficiente ?? 1
}

export async function pgvRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/pgv/setores', async () =>
    query(
      `SELECT s.id, s.nome, s.equacao, s.r2, s.coef_a, s.coef_b,
              s.paradigma_padrao_cub, s.paradigma_estado_conservacao, s.paradigma_idade_aparente,
              COUNT(a.id)::int AS qtd_amostras,
              AVG(a.valor_amostra) AS valor_medio,
              ST_Area(s.geometry) AS area_m2,
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

  // Define o lote paradigma de referência do setor, usado na homogeneização
  // de amostras (item 28)
  app.put(
    '/pgv/setores/:id/paradigma',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = paradigmaSchema.parse(request.body)
      await query(
        `UPDATE sigweb.setores_pgv
         SET paradigma_padrao_cub = $2, paradigma_estado_conservacao = $3, paradigma_idade_aparente = $4
         WHERE id = $1`,
        [id, body.paradigmaPadraoCub ?? null, body.paradigmaEstadoConservacao ?? null, body.paradigmaIdadeAparente ?? null]
      )
      reply.code(204)
    }
  )

  // req 211: polos valorizantes desenhados no mapa
  app.get('/pgv/polos', async () =>
    query(
      `SELECT id, nome, tipo, setor_id, ST_AsGeoJSON(ST_Transform(geometry,4326))::json AS geometry
       FROM sigweb.polos_pgv ORDER BY nome`
    )
  )

  app.post(
    '/pgv/polos',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = poloSchema.parse(request.body)
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.polos_pgv (nome, tipo, setor_id, geometry)
         VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4),4326),31982))
         RETURNING id`,
        [body.nome, body.tipo ?? null, body.setorId ?? null, JSON.stringify(body.geometry)]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  // Amostras de um setor, georreferenciadas — usadas na coleta em mapa e no
  // gráfico de dispersão/regressão (itens 23, 24, 29)
  app.get('/pgv/amostras', async (request) => {
    const { setorId } = request.query as { setorId?: string }
    const where = setorId ? 'WHERE a.setor_id = $1' : ''
    const params = setorId ? [setorId] : []
    return query(
      `SELECT a.id, a.setor_id, a.valor_amostra, a.valor_homogeneizado, a.idade_aparente,
              a.estado_conservacao, a.tipologia, a.padrao_cub, a.distancia_polo, a.espuria,
              ST_AsGeoJSON(ST_Transform(a.geometry,4326))::json AS geometry, a.created_at
       FROM sigweb.amostras_pgv a
       ${where}
       ORDER BY a.created_at DESC`,
      params
    )
  })

  app.post(
    '/pgv/amostras',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = amostraSchema.parse(request.body)

      // Prefere o polo vinculado ao mesmo setor da amostra (item 31); se o
      // setor ainda não tiver polo vinculado, cai para o polo mais próximo
      // em geral (compatibilidade com polos cadastrados antes do vínculo
      // polo↔setor)
      let polo = await queryOne<{ id: string; distancia: number }>(
        `SELECT p.id, ST_Distance(p.geometry, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),31982)) AS distancia
         FROM sigweb.polos_pgv p
         WHERE p.setor_id = $2
         ORDER BY distancia LIMIT 1`,
        [JSON.stringify(body.geometry), body.setorId]
      )
      if (!polo) {
        polo = await queryOne<{ id: string; distancia: number }>(
          `SELECT p.id, ST_Distance(p.geometry, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),31982)) AS distancia
           FROM sigweb.polos_pgv p
           ORDER BY distancia LIMIT 1`,
          [JSON.stringify(body.geometry)]
        )
      }

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
      const { setorId } = z.object({ setorId: z.string().uuid() }).parse(request.body)

      const setor = await queryOne<{
        paradigma_padrao_cub: string | null
        paradigma_estado_conservacao: string | null
        paradigma_idade_aparente: number | null
      }>(
        `SELECT paradigma_padrao_cub, paradigma_estado_conservacao, paradigma_idade_aparente
         FROM sigweb.setores_pgv WHERE id = $1`,
        [setorId]
      )
      if (!setor) return reply.code(404).send({ error: 'Setor não encontrado' })

      // Item 31: calcula automaticamente a distância de cada face de quadra
      // do setor até o polo valorizante mais próximo vinculado a este setor
      await query(
        `UPDATE sigweb.faces_quadra fq
         SET distancia_polo = (
               SELECT MIN(ST_Distance(ST_Centroid(fq.geometry), p.geometry))
               FROM sigweb.polos_pgv p WHERE p.setor_id = $1
             ),
             setor_pgv_id = $1
         WHERE ST_Within(ST_Centroid(fq.geometry), (SELECT geometry FROM sigweb.setores_pgv WHERE id = $1))
           AND EXISTS (SELECT 1 FROM sigweb.polos_pgv p WHERE p.setor_id = $1)`,
        [setorId]
      )

      const amostras = await query<{
        id: string; distancia_polo: number; valor_amostra: number
        padrao_cub: string | null; estado_conservacao: string | null; idade_aparente: number | null
      }>(
        `SELECT id, distancia_polo, valor_amostra, padrao_cub, estado_conservacao, idade_aparente
         FROM sigweb.amostras_pgv
         WHERE setor_id = $1 AND NOT espuria AND distancia_polo IS NOT NULL`,
        [setorId]
      )

      if (amostras.length < 2) {
        return reply.code(400).send({ error: 'Mínimo 2 amostras não espúrias com distância ao polo' })
      }

      // Item 28: homogeneíza cada amostra em relação ao lote paradigma do
      // setor (quando configurado). fator = elemento_amostra / elemento_paradigma;
      // valor_homogeneizado = valor_amostra / (fatorCub * fatorDepreciacao).
      // Sem paradigma configurado, os fatores ficam neutros (1) e o valor
      // homogeneizado é igual ao valor bruto da amostra.
      const temParadigma = !!(
        setor.paradigma_padrao_cub || setor.paradigma_estado_conservacao || setor.paradigma_idade_aparente != null
      )

      const cubRows = await query<{ padrao_construtivo: string; valor_m2: number }>(
        `SELECT DISTINCT ON (padrao_construtivo) padrao_construtivo, valor_m2
         FROM sigweb.cub_tabela ORDER BY padrao_construtivo, mes_referencia DESC`
      )
      const cubMap = new Map(cubRows.map(r => [r.padrao_construtivo, r.valor_m2]))

      const deprecRows = await query<{
        estado_conservacao: string; idade_aparente_min: number; idade_aparente_max: number; coeficiente: number
      }>(`SELECT estado_conservacao, idade_aparente_min, idade_aparente_max, coeficiente FROM sigweb.coeficientes_depreciacao`)

      const homogeneizadas = amostras.map(a => {
        if (!temParadigma) {
          return { ...a, fatorCub: 1, fatorDepreciacao: 1, valorHomogeneizado: a.valor_amostra }
        }
        const fatorCub = valorCub(a.padrao_cub, cubMap) / valorCub(setor.paradigma_padrao_cub, cubMap)
        const fatorDepreciacao =
          coeficienteDepreciacao(a.estado_conservacao, a.idade_aparente, deprecRows) /
          coeficienteDepreciacao(setor.paradigma_estado_conservacao, setor.paradigma_idade_aparente, deprecRows)
        const produtoFatores = fatorCub * fatorDepreciacao
        const valorHomogeneizado = produtoFatores === 0 ? a.valor_amostra : a.valor_amostra / produtoFatores
        return { ...a, fatorCub, fatorDepreciacao, valorHomogeneizado }
      })

      for (const h of homogeneizadas) {
        await query(`UPDATE sigweb.amostras_pgv SET valor_homogeneizado = $2 WHERE id = $1`, [h.id, h.valorHomogeneizado])
      }

      const pontos = homogeneizadas.map(h => ({ x: h.distancia_polo, y: h.valorHomogeneizado }))
      const { a, b, r2 } = regressaoLinear(pontos)
      const equacao = `V = ${a.toFixed(2)} + ${b.toFixed(6)} * D`

      await query(
        `UPDATE sigweb.setores_pgv SET equacao = $2, r2 = $3, coef_a = $4, coef_b = $5 WHERE id = $1`,
        [setorId, equacao, r2, a, b]
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

      return {
        equacao, r2, coefA: a, coefB: b, qtdAmostras: amostras.length,
        homogeneizacao: homogeneizadas.map(h => ({
          id: h.id,
          valorAmostra: h.valor_amostra,
          distanciaPolo: h.distancia_polo,
          fatorCub: h.fatorCub,
          fatorDepreciacao: h.fatorDepreciacao,
          valorHomogeneizado: h.valorHomogeneizado,
        })),
      }
    }
  )

  app.post(
    '/pgv/simular-iptu',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = simularIptuSchema.parse(request.body)

      const [simulacao] = await query<{ id: string }>(
        `INSERT INTO sigweb.simulacoes_iptu
           (descricao, aliquota_residencial, aliquota_comercial, aliquota_industrial, aliquota_terreno, teto_aumento_percent, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          body.descricao, body.aliquotaResidencial, body.aliquotaComercial,
          body.aliquotaIndustrial, body.aliquotaTereno, body.tetoAumentoPercent, request.user.uid,
        ]
      )

      // O cadastro (parcelas/edificações) não guarda IPTU/valor venal atual,
      // então não é possível montar o comparativo "atual vs simulado". Em vez
      // disso, calcula-se o IPTU simulado por parcela: valor de terreno
      // (valor_calculado da face de quadra × área da parcela) somado, quando
      // há edificação, ao valor da construção (área construída × CUB médio
      // do mês de referência mais recente). Como o cadastro ainda não
      // classifica o uso do imóvel (residencial/comercial/industrial), a
      // alíquota residencial é aplicada a todo imóvel edificado e a de
      // terreno ao que não tem edificação.
      const cubMedio = await queryOne<{ media: number | null }>(
        `SELECT AVG(valor_m2) AS media FROM sigweb.cub_tabela
         WHERE mes_referencia = (SELECT MAX(mes_referencia) FROM sigweb.cub_tabela)`
      )
      const valorCubMedio = cubMedio?.media ?? 0

      const imoveis = await query<{
        id: string; area_m2: number; valor_calculado: number
        area_construida_total: number; tem_edificacao: boolean
      }>(
        `SELECT p.id, p.area_m2, fq.valor_calculado,
                COALESCE(SUM(e.area_construida),0) AS area_construida_total,
                BOOL_OR(e.id IS NOT NULL) AS tem_edificacao
         FROM sigweb.parcelas p
         LEFT JOIN sigweb.edificacoes e ON e.parcela_id = p.id AND e.situacao <> 'demolida'
         LEFT JOIN LATERAL (
           SELECT fq2.valor_calculado
           FROM sigweb.faces_quadra fq2
           WHERE fq2.quadra_id = p.quadra_id AND fq2.logradouro_id = p.logradouro_id
             AND fq2.valor_calculado IS NOT NULL
           LIMIT 1
         ) fq ON true
         WHERE p.area_m2 IS NOT NULL AND fq.valor_calculado IS NOT NULL
         GROUP BY p.id, p.area_m2, fq.valor_calculado`
      )

      const resumo = new Map<string, { qtdImoveis: number; valorVenalTotal: number; iptuTotal: number }>([
        ['terreno', { qtdImoveis: 0, valorVenalTotal: 0, iptuTotal: 0 }],
        ['edificado', { qtdImoveis: 0, valorVenalTotal: 0, iptuTotal: 0 }],
      ])

      for (const im of imoveis) {
        const categoria = im.tem_edificacao ? 'edificado' : 'terreno'
        const aliquota = categoria === 'edificado' ? body.aliquotaResidencial : body.aliquotaTereno
        const valorVenal = im.area_m2 * im.valor_calculado + (im.tem_edificacao ? im.area_construida_total * valorCubMedio : 0)
        const iptu = valorVenal * (aliquota / 100)
        const acc = resumo.get(categoria)!
        acc.qtdImoveis += 1
        acc.valorVenalTotal += valorVenal
        acc.iptuTotal += iptu
      }

      const resumoPorCategoria = Array.from(resumo.entries()).map(([categoria, r]) => ({
        categoria,
        qtdImoveis: r.qtdImoveis,
        valorVenalTotal: r.valorVenalTotal,
        iptuTotal: r.iptuTotal,
        iptuMedio: r.qtdImoveis ? r.iptuTotal / r.qtdImoveis : 0,
      }))

      reply.code(201)
      return {
        id: simulacao.id,
        totalImoveis: imoveis.length,
        resumoPorCategoria,
        aviso:
          'Não há histórico de IPTU atual cadastrado em parcelas/edificações — o comparativo "atual vs simulado" não pôde ser calculado. ' +
          'O teto de aumento foi salvo apenas para referência futura. Como o cadastro ainda não classifica o uso do imóvel, ' +
          'a alíquota residencial foi aplicada a todo imóvel edificado.',
      }
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

  // Tabela de CUB (item 26) — administração dos valores do mês de referência
  app.get('/pgv/cub', async () =>
    query(`SELECT * FROM sigweb.cub_tabela ORDER BY mes_referencia DESC, padrao_construtivo`)
  )

  app.post(
    '/pgv/cub',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = cubSchema.parse(request.body)
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.cub_tabela (tipologia, tipo_estrutura, padrao_construtivo, coeficiente, valor_m2, mes_referencia)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [body.tipologia, body.tipoEstrutura ?? null, body.padraoConstrutivo, body.coeficiente, body.valorM2, body.mesReferencia]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/pgv/cub/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = cubSchema.parse(request.body)
      await query(
        `UPDATE sigweb.cub_tabela
         SET tipologia = $2, tipo_estrutura = $3, padrao_construtivo = $4, coeficiente = $5, valor_m2 = $6, mes_referencia = $7, updated_at = now()
         WHERE id = $1`,
        [id, body.tipologia, body.tipoEstrutura ?? null, body.padraoConstrutivo, body.coeficiente, body.valorM2, body.mesReferencia]
      )
      reply.code(204)
    }
  )

  app.delete(
    '/pgv/cub/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.cub_tabela WHERE id = $1`, [id])
      reply.code(204)
    }
  )

  // Coeficientes de depreciação (item 27) — administração
  app.get('/pgv/depreciacao', async () =>
    query(`SELECT * FROM sigweb.coeficientes_depreciacao ORDER BY estado_conservacao, idade_aparente_min`)
  )

  app.post(
    '/pgv/depreciacao',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = depreciacaoSchema.parse(request.body)
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.coeficientes_depreciacao (estado_conservacao, idade_aparente_min, idade_aparente_max, coeficiente)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [body.estadoConservacao, body.idadeAparenteMin, body.idadeAparenteMax, body.coeficiente]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/pgv/depreciacao/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = depreciacaoSchema.parse(request.body)
      await query(
        `UPDATE sigweb.coeficientes_depreciacao
         SET estado_conservacao = $2, idade_aparente_min = $3, idade_aparente_max = $4, coeficiente = $5
         WHERE id = $1`,
        [id, body.estadoConservacao, body.idadeAparenteMin, body.idadeAparenteMax, body.coeficiente]
      )
      reply.code(204)
    }
  )

  app.delete(
    '/pgv/depreciacao/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.coeficientes_depreciacao WHERE id = $1`, [id])
      reply.code(204)
    }
  )
}
