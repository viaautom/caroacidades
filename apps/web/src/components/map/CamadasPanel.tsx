import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import proj4 from 'proj4'
import { useMapStore } from '../../store/map.store'

proj4.defs('EPSG:31982', '+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')

type CamadaCache = {
  id: string
  nome: string
  cor: string
  features: GeoJSON.Feature[]
}

type CamadaCarregada = {
  id: string
  nome: string
  visivel: boolean
  cor: string
  layer: L.GeoJSON
  contagem: number
}

const CORES = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#374151']
const SESSION_KEY = 'shp_cache'

function lerCache(): CamadaCache[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]') } catch { return [] }
}

function salvarCache(itens: CamadaCache[]) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(itens))
}

function precisaReprojetar(features: any[]): boolean {
  for (const f of features.slice(0, 3)) {
    const geom = f.geometry
    if (!geom || !geom.coordinates) continue
    const flat = flatCoords(geom.coordinates)
    if (flat.some(([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 90)) return true
  }
  return false
}

function flatCoords(coords: any): [number, number][] {
  if (!Array.isArray(coords)) return []
  if (typeof coords[0] === 'number') return [coords as [number, number]]
  return coords.flatMap(flatCoords)
}

function reprojetarCoords(coords: any, tipo: string): any {
  const t = (c: [number, number]) => proj4('EPSG:31982', 'WGS84', c)
  if (tipo === 'Point') return t(coords)
  if (tipo === 'MultiPoint' || tipo === 'LineString') return coords.map(t)
  if (tipo === 'Polygon' || tipo === 'MultiLineString') return coords.map((r: any) => r.map(t))
  if (tipo === 'MultiPolygon') return coords.map((p: any) => p.map((r: any) => r.map(t)))
  return coords
}

function kmlToFeatures(text: string): GeoJSON.Feature[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const features: GeoJSON.Feature[] = []

  function allTags(el: Element | Document, tag: string): Element[] {
    return Array.from(el.getElementsByTagName(tag))
  }
  function firstTag(el: Element | Document, tag: string): Element | undefined {
    return el.getElementsByTagName(tag)[0]
  }
  function parseCoords(el: Element): [number, number][] {
    return el.textContent!.trim().split(/\s+/)
      .map(s => { const p = s.split(','); return [+p[0], +p[1]] as [number, number] })
      .filter(([x, y]) => !isNaN(x) && !isNaN(y))
  }

  for (const pm of allTags(doc, 'Placemark')) {
    const name = firstTag(pm, 'name')?.textContent?.trim() ?? ''
    const props: Record<string, unknown> = { name }
    for (const sd of allTags(pm, 'SimpleData')) {
      const k = sd.getAttribute('name') ?? ''
      if (k) props[k] = sd.textContent?.trim() ?? ''
    }

    const pointEl = firstTag(pm, 'Point')
    if (pointEl) {
      const coordEl = firstTag(pointEl, 'coordinates')
      if (coordEl) {
        const [[lng, lat]] = parseCoords(coordEl)
        features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lng, lat] } })
        continue
      }
    }

    const lineEl = firstTag(pm, 'LineString')
    if (lineEl) {
      const coordEl = firstTag(lineEl, 'coordinates')
      if (coordEl) {
        features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: parseCoords(coordEl) } })
        continue
      }
    }

    const polyEl = firstTag(pm, 'Polygon')
    if (polyEl) {
      const outerEl = firstTag(firstTag(polyEl, 'outerBoundaryIs')!, 'coordinates')
      if (outerEl) {
        const innerRings = allTags(polyEl, 'innerBoundaryIs').map(ib => {
          const c = firstTag(ib, 'coordinates'); return c ? parseCoords(c) : []
        }).filter(r => r.length > 0)
        features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [parseCoords(outerEl), ...innerRings] } })
      }
    }
  }
  return features
}

function reprojetarFeatures(features: any[]): GeoJSON.Feature[] {
  return features.map(f => ({
    ...f,
    geometry: f.geometry
      ? { ...f.geometry, coordinates: reprojetarCoords(f.geometry.coordinates, f.geometry.type) }
      : f.geometry,
  }))
}

function buildLayer(features: GeoJSON.Feature[], cor: string, map: L.Map): L.GeoJSON {
  return L.geoJSON({ type: 'FeatureCollection', features } as any, {
    style: () => ({ color: cor, weight: 2, opacity: 0.9, fillColor: cor, fillOpacity: 0.2 }),
    pointToLayer: (_, latlng) =>
      L.circleMarker(latlng, { radius: 6, color: cor, weight: 2, fillColor: cor, fillOpacity: 0.7 }),
    onEachFeature: (feature, lyr) => {
      if (feature.properties) {
        const rows = Object.entries(feature.properties)
          .filter(([, v]) => v != null)
          .slice(0, 8)
          .map(([k, v]) => `<tr><td style="color:#6b7280;padding:2px 6px">${k}</td><td style="padding:2px 6px;font-weight:600">${v}</td></tr>`)
          .join('')
        if (rows) lyr.bindPopup(`<table style="font-size:12px">${rows}</table>`, { maxWidth: 300 })
      }
    },
  }).addTo(map)
}

export function CamadasPanel() {
  const { map, activeLayers, toggleLayer, bairros, zoomToBairro } = useMapStore()
  const [aberta, setAberta] = useState(false)
  const [camadas, setCamadas] = useState<CamadaCarregada[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const corIdx = useRef(0)
  const restorado = useRef(false)

  const bairrosAtivos = activeLayers.includes('bairros')

  // Restaurar camadas da sessão quando o mapa estiver pronto
  useEffect(() => {
    if (!map || restorado.current) return
    restorado.current = true
    const cached = lerCache()
    if (!cached.length) return

    const restauradas: CamadaCarregada[] = []
    for (const c of cached) {
      try {
        const layer = buildLayer(c.features, c.cor, map)
        restauradas.push({ id: c.id, nome: c.nome, cor: c.cor, visivel: true, layer, contagem: c.features.length })
        corIdx.current++
      } catch { /* entrada corrompida, ignorar */ }
    }
    if (restauradas.length) setCamadas(restauradas)
  }, [map])

  function proximaCor() {
    const cor = CORES[corIdx.current % CORES.length]
    corIdx.current++
    return cor
  }

  function zoomTodosBairros() {
    if (!map || !bairros.length) return
    const bounds = bairros.reduce(
      (acc, b) => acc.extend(b.bounds),
      L.latLngBounds(bairros[0].bounds)
    )
    map.fitBounds(bounds, { padding: [30, 30] })
  }

  const carregarArquivo = useCallback(async (file: File) => {
    if (!map) return
    setCarregando(true)
    setErro('')

    try {
      let features: GeoJSON.Feature[]

      if (file.name.toLowerCase().endsWith('.kml')) {
        const text = await file.text()
        features = kmlToFeatures(text)
      } else {
        const shp = (await import('shpjs')).default
        const buf = await file.arrayBuffer()
        const geojson = await shp(buf)
        let raw: any[] = Array.isArray(geojson)
          ? geojson.flatMap((g: any) => g.features ?? [])
          : (geojson as any).features ?? []
        if (precisaReprojetar(raw)) raw = reprojetarFeatures(raw)
        features = raw
      }

      if (!features.length) { setErro('Arquivo sem feições geométricas.'); return }

      const cor = proximaCor()
      const layer = buildLayer(features as GeoJSON.Feature[], cor, map)

      const id = crypto.randomUUID()
      const nome = file.name.replace(/\.(zip|shp)$/i, '')

      const cached = lerCache()
      cached.push({ id, nome, cor, features: features as GeoJSON.Feature[] })
      salvarCache(cached)

      map.fitBounds(layer.getBounds(), { padding: [20, 20] })
      setCamadas(prev => [...prev, { id, nome, cor, visivel: true, layer, contagem: features.length }])
    } catch (e: any) {
      setErro('Erro ao carregar: ' + (e?.message ?? 'formato inválido'))
    } finally {
      setCarregando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [map])

  function toggleVisivel(id: string) {
    setCamadas(prev => prev.map(c => {
      if (c.id !== id) return c
      if (c.visivel) map?.removeLayer(c.layer)
      else map?.addLayer(c.layer)
      return { ...c, visivel: !c.visivel }
    }))
  }

  function remover(id: string) {
    setCamadas(prev => {
      const c = prev.find(x => x.id === id)
      if (c) map?.removeLayer(c.layer)
      salvarCache(lerCache().filter(x => x.id !== id))
      return prev.filter(x => x.id !== id)
    })
  }

  function mudarCor(id: string, cor: string) {
    setCamadas(prev => prev.map(c => {
      if (c.id !== id) return c
      c.layer.setStyle({ color: cor, fillColor: cor })
      return { ...c, cor }
    }))
    salvarCache(lerCache().map(c => c.id === id ? { ...c, cor } : c))
  }

  function zoomParaCamada(id: string) {
    const c = camadas.find(x => x.id === id)
    if (c && map) map.fitBounds(c.layer.getBounds(), { padding: [20, 20] })
  }

  function removerTodas() {
    camadas.forEach(c => map?.removeLayer(c.layer))
    setCamadas([])
    sessionStorage.removeItem(SESSION_KEY)
  }

  return (
    <>
      <button
        onClick={() => setAberta(p => !p)}
        title="Importar shapefile ou KML (sessão)"
        style={{
          position: 'absolute', bottom: 70, left: aberta ? 308 : 10, zIndex: 1006,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8,
          background: aberta ? '#1e3a5f' : 'white',
          color: aberta ? 'white' : '#1f2937',
          border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          cursor: 'pointer', fontSize: 13, fontWeight: 500,
          transition: 'left 0.2s',
        }}
      >
        📁 SHP / KML
      </button>

      {aberta && (
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: 300,
          background: 'white', zIndex: 1005,
          boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 16px', background: '#1e3a5f', color: 'white',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Camadas</p>
              <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>
                {1 + camadas.length} {1 + camadas.length === 1 ? 'camada' : 'camadas'}
              </p>
            </div>
            <button onClick={() => setAberta(false)}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 18, opacity: 0.7 }}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            <p style={secLabel}>Sistema</p>
            <div style={{ ...itemCard, background: bairrosAtivos ? '#f0f7ff' : '#f9fafb', opacity: bairrosAtivos ? 1 : 0.65, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button onClick={() => toggleLayer('bairros')} title={bairrosAtivos ? 'Ocultar' : 'Mostrar'}
                  style={{ ...iconBtn, background: bairrosAtivos ? '#eff6ff' : '#f3f4f6' }}>
                  {bairrosAtivos ? '👁' : '🚫'}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1e3a5f' }}>Bairros de Tupanciretã</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>
                    {bairros.length > 0 ? `${bairros.length} bairros · IBGE` : 'Limites municipais · IBGE'}
                  </p>
                </div>
                <button onClick={zoomTodosBairros} title="Zoom para todos os bairros"
                  style={{ ...smallBtn, background: '#eff6ff', color: '#2563eb' }}>
                  🔍
                </button>
              </div>

              {bairrosAtivos && bairros.length > 0 && (
                <div style={{ maxHeight: 160, overflowY: 'auto', borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
                  {[...bairros].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(b => (
                    <button
                      key={b.id}
                      onClick={() => zoomToBairro(b.bounds)}
                      style={{
                        display: 'block', width: '100%', padding: '4px 6px',
                        border: 'none', background: 'none', cursor: 'pointer',
                        fontSize: 11, color: '#374151', textAlign: 'left', borderRadius: 4,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#dbeafe')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      📍 {b.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {camadas.length > 0 && (
              <>
                <p style={secLabel}>Importados</p>
                {camadas.map(c => (
                  <div key={c.id} style={{ ...itemCard, background: c.visivel ? 'white' : '#f9fafb', opacity: c.visivel ? 1 : 0.6, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <button onClick={() => toggleVisivel(c.id)} title={c.visivel ? 'Ocultar' : 'Mostrar'}
                        style={{ ...iconBtn, background: c.visivel ? '#eff6ff' : '#f3f4f6' }}>
                        {c.visivel ? '👁' : '🚫'}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1e3a5f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={c.nome}>{c.nome}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>{c.contagem} feições · temporário</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="color" value={c.cor} onChange={e => mudarCor(c.id, e.target.value)}
                        title="Cor" style={{ width: 28, height: 28, padding: 2, border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }} />
                      <button onClick={() => zoomParaCamada(c.id)} style={{ ...smallBtn, background: '#eff6ff', color: '#2563eb' }}>🔍 Zoom</button>
                      <button onClick={() => remover(c.id)} style={{ ...smallBtn, background: '#fef2f2', color: '#dc2626', marginLeft: 'auto' }}>🗑</button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={removerTodas}
                  style={{ width: '100%', padding: '6px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, marginBottom: 4 }}
                >
                  Remover todas as importadas
                </button>
              </>
            )}
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
            <input ref={inputRef} type="file" accept=".zip,.shp,.kml" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) carregarArquivo(f) }} />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={carregando}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 10px',
                background: 'none', border: '1px dashed #d1d5db', borderRadius: 6,
                color: '#6b7280', cursor: 'pointer', fontSize: 12,
              }}
            >
              <span>{carregando ? '⏳' : '📁'}</span>
              <span>{carregando ? 'Carregando arquivo...' : 'Adicionar shapefile (.zip) ou KML'}</span>
            </button>
            {erro && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#dc2626', background: '#fef2f2', padding: '4px 8px', borderRadius: 4 }}>
                ⚠ {erro}
              </p>
            )}
            <p style={{ margin: '6px 0 0', fontSize: 10, color: '#9ca3af' }}>
              Temporário · sessão · EPSG:4326 e EPSG:31982 · KML
            </p>
          </div>
        </div>
      )}
    </>
  )
}

const secLabel: React.CSSProperties = {
  margin: '4px 0 6px', fontSize: 10, fontWeight: 700, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 2px',
}
const itemCard: React.CSSProperties = {
  borderRadius: 8, border: '1px solid #e5e7eb', padding: 10,
}
const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: 'none',
  cursor: 'pointer', fontSize: 14, flexShrink: 0,
}
const smallBtn: React.CSSProperties = {
  border: 'none', padding: '4px 10px', borderRadius: 6,
  cursor: 'pointer', fontSize: 11, fontWeight: 600,
}
