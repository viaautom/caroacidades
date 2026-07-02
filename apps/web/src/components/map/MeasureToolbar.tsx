import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useMapStore } from '../../store/map.store'

type Mode = 'off' | 'distance' | 'area' | 'elevation'

// Haversine distance between two LatLng points (meters)
function haversine(a: L.LatLng, b: L.LatLng): number {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

// Shoelace formula for area (m²) in WGS84 lat/lng (approximate for small areas)
function geodesicArea(pts: L.LatLng[]): number {
  const R = 6371000
  if (pts.length < 3) return 0
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area += (b.lng - a.lng) * Math.PI / 180 * (2 + Math.sin(a.lat * Math.PI / 180) + Math.sin(b.lat * Math.PI / 180))
  }
  return Math.abs(area * R * R / 2)
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${m.toFixed(1)} m`
}

function formatArea(m2: number): string {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(4)} ha` : `${m2.toFixed(1)} m²`
}

// Sample N evenly-spaced points along a polyline
function samplePolyline(pts: L.LatLng[], n: number): L.LatLng[] {
  if (pts.length < 2) return pts
  const total = pts.reduce((sum, p, i) => i === 0 ? 0 : sum + haversine(pts[i - 1], p), 0)
  const step = total / (n - 1)
  const samples: L.LatLng[] = [pts[0]]
  let walked = 0
  let seg = 0
  let segWalked = 0
  for (let s = 1; s < n - 1; s++) {
    const target = s * step
    while (seg < pts.length - 2) {
      const segLen = haversine(pts[seg], pts[seg + 1])
      if (segWalked + segLen >= target - walked) break
      walked += segLen - segWalked
      segWalked = 0
      seg++
    }
    const segLen = haversine(pts[seg], pts[seg + 1])
    const t = Math.min((target - walked - segWalked) / segLen, 1)
    samples.push(L.latLng(
      pts[seg].lat + t * (pts[seg + 1].lat - pts[seg].lat),
      pts[seg].lng + t * (pts[seg + 1].lng - pts[seg].lng),
    ))
    segWalked += t * segLen
  }
  samples.push(pts[pts.length - 1])
  return samples
}

type ElevPoint = { dist: number; elev: number }

async function fetchElevations(pts: L.LatLng[]): Promise<ElevPoint[]> {
  const locations = pts.map(p => ({ latitude: p.lat, longitude: p.lng }))
  const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations }),
  })
  const data = await res.json()
  let accDist = 0
  return (data.results as { latitude: number; longitude: number; elevation: number }[]).map((r, i) => {
    if (i > 0) accDist += haversine(pts[i - 1], pts[i])
    return { dist: Math.round(accDist), elev: r.elevation }
  })
}

export function MeasureToolbar() {
  const { map, layerPanelOpen } = useMapStore()
  const [mode, setMode] = useState<Mode>('off')
  const [points, setPoints] = useState<L.LatLng[]>([])
  const [result, setResult] = useState('')
  const [elevData, setElevData] = useState<ElevPoint[]>([])
  const [elevLoading, setElevLoading] = useState(false)
  const [elevError, setElevError] = useState('')
  const layerRef = useRef<L.LayerGroup | null>(null)

  // Cleanup when mode changes or component unmounts
  useEffect(() => {
    if (!map) return
    if (!layerRef.current) {
      layerRef.current = L.layerGroup().addTo(map)
    }
    return () => {
      layerRef.current?.clearLayers()
    }
  }, [map])

  // Draw lines/polygon as user adds points
  useEffect(() => {
    if (!map || !layerRef.current) return
    layerRef.current.clearLayers()
    if (points.length === 0) return

    // Draw vertices
    points.forEach((pt, i) => {
      L.circleMarker(pt, { radius: 4, color: '#1e3a5f', fillColor: 'white', fillOpacity: 1, weight: 2 })
        .addTo(layerRef.current!)
      if (i > 0) {
        const seg = haversine(points[i - 1], pt)
        const midLat = (points[i - 1].lat + pt.lat) / 2
        const midLng = (points[i - 1].lng + pt.lng) / 2
        L.tooltip({ permanent: true, className: 'measure-label', direction: 'center' })
          .setLatLng([midLat, midLng])
          .setContent(formatDistance(seg))
          .addTo(layerRef.current!)
      }
    })

    if (mode === 'distance' && points.length > 1) {
      L.polyline(points, { color: '#1e3a5f', weight: 2, dashArray: '6 4' }).addTo(layerRef.current!)
      const total = points.reduce((sum, pt, i) => i === 0 ? 0 : sum + haversine(points[i - 1], pt), 0)
      setResult(`Total: ${formatDistance(total)}`)
    }

    if (mode === 'area' && points.length > 1) {
      const polyPts = points.length >= 3 ? [...points, points[0]] : points
      L.polyline(polyPts, { color: '#7c3aed', weight: 2, dashArray: '6 4' }).addTo(layerRef.current!)
      if (points.length >= 3) {
        const area = geodesicArea(points)
        const perim = points.reduce((sum, pt, i) => i === 0 ? 0 : sum + haversine(points[i - 1], pt), 0)
          + haversine(points[points.length - 1], points[0])
        setResult(`Área: ${formatArea(area)} | Perímetro: ${formatDistance(perim)}`)
      }
    }

    if (mode === 'elevation' && points.length > 1) {
      L.polyline(points, { color: '#16a34a', weight: 2, dashArray: '6 4' }).addTo(layerRef.current!)
      const total = points.reduce((sum, pt, i) => i === 0 ? 0 : sum + haversine(points[i - 1], pt), 0)
      setResult(`Extensão: ${formatDistance(total)}`)
    }
  }, [points, mode, map])

  // Map click handler
  useEffect(() => {
    if (!map || mode === 'off') return
    map.getContainer().style.cursor = 'crosshair'

    function onClick(e: L.LeafletMouseEvent) {
      setPoints(prev => [...prev, e.latlng])
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
      map.getContainer().style.cursor = ''
    }
  }, [map, mode])

  function activate(m: Mode) {
    if (mode === m) {
      stop()
    } else {
      layerRef.current?.clearLayers()
      setPoints([])
      setResult('')
      setElevData([])
      setElevError('')
      setMode(m)
    }
  }

  function stop() {
    setMode('off')
    setPoints([])
    setResult('')
    setElevData([])
    setElevError('')
    layerRef.current?.clearLayers()
  }

  function undoLast() {
    setPoints(prev => prev.slice(0, -1))
    setElevData([])
  }

  async function gerarPerfil() {
    if (points.length < 2) return
    setElevLoading(true)
    setElevError('')
    setElevData([])
    try {
      const amostras = samplePolyline(points, Math.min(50, points.length * 10))
      const data = await fetchElevations(amostras)
      setElevData(data)
    } catch {
      setElevError('Erro ao obter elevações. Verifique a conexão e tente novamente.')
    } finally {
      setElevLoading(false)
    }
  }

  const elevMin = elevData.length ? Math.min(...elevData.map(d => d.elev)) : 0
  const elevMax = elevData.length ? Math.max(...elevData.map(d => d.elev)) : 0
  const elevGain = elevData.length
    ? elevData.reduce((g, d, i) => i === 0 ? 0 : g + Math.max(0, d.elev - elevData[i - 1].elev), 0)
    : 0

  return (
    <div style={{
      position: 'absolute', top: 60, right: layerPanelOpen ? 278 : 38, zIndex: 1001,
      display: 'flex', flexDirection: 'column', gap: 4,
      maxHeight: 'calc(100% - 96px)', overflowY: 'auto',
    }}>
      {/* Botões de ativação */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button
          onClick={() => activate('distance')}
          title="Medir distância"
          style={{
            ...btnStyle,
            background: mode === 'distance' ? '#1e3a5f' : 'white',
            color: mode === 'distance' ? 'white' : '#374151',
            borderColor: mode === 'distance' ? '#1e3a5f' : '#d1d5db',
          }}
        >
          📏 Distância
        </button>
        <button
          onClick={() => activate('area')}
          title="Medir área"
          style={{
            ...btnStyle,
            background: mode === 'area' ? '#7c3aed' : 'white',
            color: mode === 'area' ? 'white' : '#374151',
            borderColor: mode === 'area' ? '#7c3aed' : '#d1d5db',
          }}
        >
          📐 Área
        </button>
        <button
          onClick={() => activate('elevation')}
          title="Perfil de terreno (altimetria)"
          style={{
            ...btnStyle,
            background: mode === 'elevation' ? '#16a34a' : 'white',
            color: mode === 'elevation' ? 'white' : '#374151',
            borderColor: mode === 'elevation' ? '#16a34a' : '#d1d5db',
          }}
        >
          ⛰ Altimetria
        </button>
      </div>

      {/* Painel de resultado e controles */}
      {mode !== 'off' && (
        <div style={{
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 6,
          padding: '8px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          fontSize: 12, color: '#1e3a5f',
          width: mode === 'elevation' && elevData.length ? 320 : 'auto',
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6b7280' }}>
            {mode === 'distance' && 'Clique no mapa para adicionar pontos'}
            {mode === 'area' && 'Clique nos vértices do polígono'}
            {mode === 'elevation' && 'Clique no mapa para traçar o perfil'}
          </p>
          {result && <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{result}</p>}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={undoLast} disabled={points.length === 0} style={{ ...btnSmall, borderColor: '#d1d5db' }}>
              ↩ Desfazer
            </button>
            {mode === 'elevation' && points.length >= 2 && (
              <button
                onClick={gerarPerfil}
                disabled={elevLoading}
                style={{ ...btnSmall, background: '#dcfce7', borderColor: '#86efac', color: '#166534' }}
              >
                {elevLoading ? '⏳ Consultando...' : '⛰ Gerar perfil'}
              </button>
            )}
            <button onClick={stop} style={{ ...btnSmall, background: '#fee2e2', borderColor: '#fca5a5', color: '#dc2626' }}>
              ✕ Limpar
            </button>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 10, color: '#9ca3af' }}>
            {points.length} ponto{points.length !== 1 ? 's' : ''}
          </p>

          {elevError && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#dc2626' }}>{elevError}</p>
          )}

          {/* Gráfico do perfil de elevação */}
          {elevData.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#374151', marginBottom: 6 }}>
                <span>Min: <b>{elevMin} m</b></span>
                <span>Max: <b>{elevMax} m</b></span>
                <span>Ganho: <b>+{Math.round(elevGain)} m</b></span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={elevData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="dist"
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}km` : `${v}m`}
                    tick={{ fontSize: 9 }}
                  />
                  <YAxis tick={{ fontSize: 9 }} unit=" m" />
                  <Tooltip
                    formatter={(v: number) => [`${v} m`, 'Elevação']}
                    labelFormatter={v => `Distância: ${v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${v} m`}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="elev"
                    stroke="#16a34a"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p style={{ margin: '4px 0 0', fontSize: 9, color: '#9ca3af' }}>
                Elevações: Open-Elevation · SRTM 90m
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid', borderRadius: 6,
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
  boxShadow: '0 1px 4px rgba(0,0,0,0.12)', whiteSpace: 'nowrap',
}
const btnSmall: React.CSSProperties = {
  padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 4,
  cursor: 'pointer', fontSize: 11, background: 'white', color: '#374151',
}
