import { query, queryOne } from '../db/pool'

// historico_cartografico.usuario_id referencia sigweb.usuarios(id), mas
// request.user.uid é o auth_uid (auth.users.id) do Supabase — precisa
// resolver o id interno antes de gravar, senão viola a FK.
async function resolveUsuarioId(authUid: string): Promise<string | null> {
  const usuario = await queryOne<{ id: string }>(`SELECT id FROM sigweb.usuarios WHERE auth_uid = $1`, [authUid])
  return usuario?.id ?? null
}

export interface MemorialDescritivo {
  vertices: { n: number; x: number; y: number; azimute: string; distancia: number }[]
  confrontantes: { id: string; codigo?: string; logradouro?: string }[]
  areaM2: number
  perimetro: number
}

export async function getMemorialDescritivo(parcelaId: string): Promise<MemorialDescritivo | null> {
  const parcela = await queryOne<{ area: number; perimetro: number; geojson: string }>(
    `SELECT
       ST_Area(geometry)      AS area,
       ST_Perimeter(geometry) AS perimetro,
       ST_AsGeoJSON(ST_Transform(geometry, 4326)) AS geojson
     FROM sigweb.parcelas WHERE id = $1`,
    [parcelaId]
  )
  if (!parcela) return null

  const confrontantes = await query<{ id: string; codigo: string }>(
    `SELECT b.id, b.codigo
     FROM sigweb.parcelas a
     JOIN sigweb.parcelas b ON ST_Touches(a.geometry, b.geometry)
     WHERE a.id = $1 AND b.id != $1`,
    [parcelaId]
  )

  const geom = JSON.parse(parcela.geojson)
  const coords: [number, number][] = geom.coordinates[0]

  const vertices = coords.slice(0, -1).map((coord, i) => {
    const next = coords[(i + 1) % (coords.length - 1)]
    const dx = next[0] - coord[0]
    const dy = next[1] - coord[1]
    const distRad = Math.sqrt(dx * dx + dy * dy) * 111_319.9
    const azRad = Math.atan2(dx, dy)
    const azDeg = ((azRad * 180) / Math.PI + 360) % 360
    const graus = Math.floor(azDeg)
    const minutos = Math.floor((azDeg - graus) * 60)
    const segundos = Math.round(((azDeg - graus) * 60 - minutos) * 60)
    return {
      n: i + 1,
      x: coord[0],
      y: coord[1],
      azimute: `${graus}°${minutos}'${segundos}"`,
      distancia: Math.round(distRad * 100) / 100,
    }
  })

  return {
    vertices,
    confrontantes,
    areaM2: Math.round(parcela.area * 100) / 100,
    perimetro: Math.round(parcela.perimetro * 100) / 100,
  }
}

// Roda o ST_Split e devolve as duas partes resultantes (SRID 31982, ainda
// não persistidas). `geom` é HEXEWKB (via ::text) — para regravar no banco,
// usar cast direto `::geometry`, nunca ST_GeomFromText (que espera WKT e
// falha com "parse error - invalid geometry" ao receber HEXEWKB).
async function splitParcelaEmDuasPartes(parcelaId: string, linhaGeoJSON: object) {
  const partes = await query<{ geom: string; area_m2: number }>(
    `SELECT part.geom::text AS geom, ST_Area(part.geom) AS area_m2
     FROM sigweb.parcelas orig
     CROSS JOIN LATERAL (
       SELECT (ST_Dump(ST_Split(orig.geometry, ST_Transform(ST_GeomFromGeoJSON($2), 31982)))).geom
     ) AS part
     WHERE orig.id = $1
       AND GeometryType(part.geom) = 'POLYGON'
       AND ST_Area(part.geom) > 0`,
    [parcelaId, JSON.stringify(linhaGeoJSON)]
  )

  if (partes.length < 2) throw new Error('A linha não atravessa a parcela — desenhe uma linha que corte o polígono de um lado a outro')
  if (partes.length > 2) throw new Error('O corte gerou mais de duas partes — desenhe uma linha reta que atravesse a parcela uma única vez')

  return partes
}

export async function previewDesmembrar(parcelaId: string, linhaGeoJSON: object) {
  const partes = await splitParcelaEmDuasPartes(parcelaId, linhaGeoJSON)

  const original = await queryOne<{ codigo: string }>(`SELECT codigo FROM sigweb.parcelas WHERE id = $1`, [parcelaId])
  if (!original) throw new Error('Parcela não encontrada')

  const geojson = await query<{ geometry: object; area_m2: number }>(
    `SELECT ST_AsGeoJSON(ST_Transform($1::geometry, 4326))::json AS geometry, ST_Area($1::geometry) AS area_m2`,
    [partes[0].geom]
  )
  const geojson2 = await query<{ geometry: object; area_m2: number }>(
    `SELECT ST_AsGeoJSON(ST_Transform($1::geometry, 4326))::json AS geometry, ST_Area($1::geometry) AS area_m2`,
    [partes[1].geom]
  )

  return {
    novoCodigo: `${original.codigo}/2`,
    partes: [
      { geometry: geojson[0].geometry, areaM2: geojson[0].area_m2 },
      { geometry: geojson2[0].geometry, areaM2: geojson2[0].area_m2 },
    ],
  }
}

export async function confirmarDesmembrar(
  parcelaId: string,
  linhaGeoJSON: object,
  parteEscolhidaIndex: 0 | 1,
  usuarioId: string
): Promise<{ originalId: string; novaId: string; novoCodigo: string }> {
  const partes = await splitParcelaEmDuasPartes(parcelaId, linhaGeoJSON)

  const original = await queryOne<{ codigo: string; bairro_id: string; logradouro_id: string; loteamento_id: string; quadra_id: string }>(
    `SELECT codigo, bairro_id, logradouro_id, loteamento_id, quadra_id
     FROM sigweb.parcelas WHERE id = $1`,
    [parcelaId]
  )
  if (!original) throw new Error('Parcela não encontrada')

  const novoCodigo = `${original.codigo}/2`
  const parteNova = partes[parteEscolhidaIndex]
  const parteOriginal = partes[parteEscolhidaIndex === 0 ? 1 : 0]

  await query(
    `UPDATE sigweb.parcelas
     SET geometry = $2::geometry,
         area_m2 = ST_Area($2::geometry)
     WHERE id = $1`,
    [parcelaId, parteOriginal.geom]
  )

  const [novaParcela] = await query<{ id: string }>(
    `INSERT INTO sigweb.parcelas
       (codigo, bairro_id, logradouro_id, loteamento_id, quadra_id, geometry, area_m2)
     VALUES ($1, $2, $3, $4, $5, $6::geometry, ST_Area($6::geometry))
     RETURNING id`,
    [novoCodigo, original.bairro_id, original.logradouro_id, original.loteamento_id, original.quadra_id, parteNova.geom]
  )

  await query(
    `INSERT INTO sigweb.historico_cartografico (entidade, entidade_id, operacao, usuario_id)
     VALUES ('parcelas', $1, 'desmembramento', $2)`,
    [parcelaId, await resolveUsuarioId(usuarioId)]
  )

  return { originalId: parcelaId, novaId: novaParcela.id, novoCodigo }
}

export async function unificarParcelas(
  parcelaIds: string[],
  novoCodigo: string,
  usuarioId: string
): Promise<string> {
  if (parcelaIds.length < 2) throw new Error('Selecione ao menos 2 parcelas')

  const placeholders = parcelaIds.map((_, i) => `$${i + 1}`).join(',')
  const base = await queryOne<{
    bairro_id: string
    logradouro_id: string
    loteamento_id: string
    quadra_id: string
    codigo: string
  }>(
    `SELECT bairro_id, logradouro_id, loteamento_id, quadra_id, codigo
     FROM sigweb.parcelas WHERE id = $1`,
    [parcelaIds[0]]
  )
  if (!base) throw new Error('Parcela não encontrada')

  const rows = await query<{ id: string }>(
    `INSERT INTO sigweb.parcelas (codigo, bairro_id, logradouro_id, loteamento_id, quadra_id, geometry, area_m2)
     SELECT
       $${parcelaIds.length + 1}::varchar,
       $${parcelaIds.length + 2}::uuid,
       $${parcelaIds.length + 3}::uuid,
       $${parcelaIds.length + 4}::uuid,
       $${parcelaIds.length + 5}::uuid,
       ST_Union(geometry),
       ST_Area(ST_Union(geometry))
     FROM sigweb.parcelas
     WHERE id IN (${placeholders})
     RETURNING id`,
    [
      ...parcelaIds,
      novoCodigo,
      base.bairro_id,
      base.logradouro_id,
      base.loteamento_id,
      base.quadra_id,
    ]
  )

  const usuarioInternoId = await resolveUsuarioId(usuarioId)
  for (const id of parcelaIds) {
    await query(
      `INSERT INTO sigweb.historico_cartografico (entidade, entidade_id, operacao, usuario_id)
       VALUES ('parcelas', $1, 'unificacao', $2)`,
      [id, usuarioInternoId]
    )
  }
  await query(`DELETE FROM sigweb.parcelas WHERE id IN (${placeholders})`, parcelaIds)

  return rows[0].id
}

export async function getParcelasNoBbox(bbox: { minx: number; miny: number; maxx: number; maxy: number }) {
  return query(
    `SELECT
       p.id, p.codigo, p.area_m2, p.numero_predial_principal,
       b.nome AS bairro, l.nome AS logradouro,
       ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
     FROM sigweb.parcelas p
     LEFT JOIN sigweb.bairros b ON b.id = p.bairro_id
     LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
     WHERE ST_Intersects(p.geometry, ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326),31982))
     LIMIT 2000`,
    [bbox.minx, bbox.miny, bbox.maxx, bbox.maxy]
  )
}
