import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { SIGMap } from '../components/map/SIGMap'
import { MeasureToolbar } from '../components/map/MeasureToolbar'
import { useMapStore, BaseLayerId } from '../store/map.store'
import { useIsMobile } from '../hooks/useIsMobile'
import { ICONE_PATRIMONIO } from '../lib/patrimonio'
import { fetchStaticMapImage } from '../lib/staticMap'
import api from '../lib/api'

const BASE_LAYERS: { id: BaseLayerId; label: string }[] = [
  { id: 'osm',              label: 'Mapa' },
  { id: 'google_maps',      label: 'Ruas' },
  { id: 'google_satellite', label: 'Satélite' },
  { id: 'topografia',       label: 'Topografia' },
]

export function MapPage() {
  const { selectedParcelaId, selectParcela, selectedPatrimonioId, selectPatrimonio, baseLayer, setBaseLayer } = useMapStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const isMobile = useIsMobile()

  // Barra de busca é renderizada via portal no cabeçalho (ao lado do nome do sistema)
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setSearchSlot(document.getElementById('map-search-slot'))
  }, [])

  const { data: parcelaDetail } = useQuery({
    queryKey: ['parcela', selectedParcelaId],
    queryFn: () => api.get(`/parcelas/${selectedParcelaId}`).then(r => r.data),
    enabled: !!selectedParcelaId,
  })

  const { data: patrimonioDetail } = useQuery({
    queryKey: ['patrimonio-detalhe', selectedPatrimonioId],
    queryFn: () => api.get(`/patrimonio/${selectedPatrimonioId}`).then(r => r.data),
    enabled: !!selectedPatrimonioId,
  })

  const { data: bairrosCache = [] } = useQuery<any[]>({
    queryKey: ['bairros-all'],
    queryFn: () => api.get('/bairros').then(r => r.data.data ?? []),
    staleTime: Infinity,
  })

  async function handleSearch(q: string) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    const term = q.trim().toLowerCase()

    const [parcelasRes, logradourosRes, loteamentosRes, quadrasRes] = await Promise.all([
      api.get(`/parcelas/search?q=${encodeURIComponent(q)}&limit=5`).then(r => r.data.data ?? []),
      api.get(`/logradouros?q=${encodeURIComponent(q)}`).then(r => r.data ?? []),
      api.get(`/loteamentos?q=${encodeURIComponent(q)}&limit=5`).then(r => r.data.data ?? []),
      api.get(`/quadras?q=${encodeURIComponent(q)}`).then(r => r.data ?? []),
    ])

    const bairrosFiltrados = bairrosCache
      .filter(b => b.nome?.toLowerCase().includes(term))
      .slice(0, 3)
      .map(b => ({ ...b, _tipo: 'Bairro' }))

    const combined = [
      ...bairrosFiltrados,
      ...loteamentosRes.filter((l: any) => l.geometry).slice(0, 3).map((l: any) => ({ ...l, _tipo: 'Loteamento' })),
      ...logradourosRes.slice(0, 4).map((l: any) => ({ ...l, _tipo: 'Logradouro' })),
      ...quadrasRes.filter((q: any) => q.geometry).slice(0, 3).map((q: any) => ({ ...q, _tipo: 'Quadra' })),
      ...parcelasRes.slice(0, 5).map((p: any) => ({ ...p, _tipo: 'Parcela' })),
    ]
    setSearchResults(combined)
  }

  function canonicalizeMemorialForHash(memorial: any) {
    return JSON.stringify({
      parcelaId: selectedParcelaId,
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

  async function sha256Hex(value: string) {
    const encoder = new TextEncoder()
    const data = encoder.encode(value)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async function generateMemorialPDF() {
    if (!selectedParcelaId) return
    const res = await api.get(`/parcelas/${selectedParcelaId}/memorial`)
    const memorial = res.data

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    pdf.setFontSize(16)
    pdf.text('Memorial Descritivo', 14, 20)
    pdf.setFontSize(10)
    pdf.text('Arquivo INPI: Caroá_Cidades_Inteligentes_INPI.pdf', 14, 28)
    pdf.text(`Parcela: ${selectedParcelaId}`, 14, 36)
    pdf.text(`Área: ${memorial.areaM2.toFixed(2)} m²`, 14, 42)
    pdf.text(`Perímetro: ${memorial.perimetro.toFixed(2)} m`, 14, 48)
    pdf.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 54)

    ;(pdf as any).autoTable({
      startY: 62,
      head: [['N', 'X', 'Y', 'Azimute', 'Distância (m)']],
      body: memorial.vertices.map((v: any) => [
        v.n,
        v.x.toFixed(6),
        v.y.toFixed(6),
        v.azimute,
        v.distancia.toFixed(2),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8 },
    })

    const finalY = (pdf as any).lastAutoTable?.finalY ?? 62
    pdf.setFontSize(10)
    pdf.text('Confrontantes:', 14, finalY + 12)
    if (memorial.confrontantes.length > 0) {
      memorial.confrontantes.forEach((confrontante: any, index: number) => {
        const y = finalY + 18 + index * 6
        pdf.text(`- ${confrontante.codigo ?? confrontante.logradouro ?? confrontante.id}`, 14, y)
      })
    } else {
      pdf.text('- Nenhum confrontante cadastrado', 14, finalY + 18)
    }

    const hash = await sha256Hex(canonicalizeMemorialForHash(memorial))
    const hashText = pdf.splitTextToSize(`SHA-256 do memorial (dados internos): ${hash}`, 182)
    let hashY = finalY + 18 + Math.max(memorial.confrontantes.length, 1) * 6 + 10
    const bottomMargin = 20
    if (hashY + hashText.length * 6 > pdf.internal.pageSize.height - bottomMargin) {
      pdf.addPage()
      hashY = 20
    }
    pdf.setFontSize(8)
    pdf.text(hashText, 14, hashY)

    pdf.save('Caroá_Cidades_Inteligentes_INPI.pdf')
  }

  // Croqui de localização do imóvel — desenho esquemático + mapa real (req 05)
  async function gerarCroquiPDF() {
    if (!selectedParcelaId || !parcelaDetail?.geometry) return
    const geom = parcelaDetail.geometry
    const ring: [number, number][] =
      geom.type === 'Polygon' ? geom.coordinates[0]
      : geom.type === 'MultiPolygon' ? geom.coordinates[0][0]
      : []
    if (ring.length < 3) return

    const centroid = centroidFromGeometry(geom)
    const mapImg = centroid ? await fetchStaticMapImage(centroid[0], centroid[1], 17) : null

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    pdf.setFontSize(16)
    pdf.text('Croqui de Localização do Imóvel', 14, 20)
    pdf.setFontSize(10)
    pdf.text(`Parcela: ${parcelaDetail.codigo ?? selectedParcelaId}`, 14, 28)
    pdf.text(`Logradouro: ${[parcelaDetail.logradouro_tipo, parcelaDetail.logradouro_nome].filter(Boolean).join(' ') || '—'}`, 14, 34)
    pdf.text(`Bairro: ${parcelaDetail.bairro_nome ?? '—'}`, 14, 40)
    pdf.text(`Quadra: ${parcelaDetail.quadra_codigo ?? '—'}`, 14, 46)
    pdf.text(`Área: ${parcelaDetail.area_m2 ? `${Number(parcelaDetail.area_m2).toFixed(2)} m²` : '—'}`, 14, 52)

    // Converte graus decimais em metros aproximados (compensa a longitude pela latitude central)
    const lngs = ring.map(c => c[0])
    const lats = ring.map(c => c[1])
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const centerLat = (minLat + maxLat) / 2
    const mPerDegLat = 111_320
    const mPerDegLng = 111_320 * Math.cos((centerLat * Math.PI) / 180)
    const widthM = Math.max((maxLng - minLng) * mPerDegLng, 1)
    const heightM = Math.max((maxLat - minLat) * mPerDegLat, 1)

    const boxX = 14, boxY = 62, boxSize = 130, margin = 14
    const drawW = boxSize - margin * 2
    const drawH = boxSize - margin * 2
    const scale = Math.min(drawW / widthM, drawH / heightM)
    const offsetX = boxX + margin + (drawW - widthM * scale) / 2
    const offsetY = boxY + margin + (drawH - heightM * scale) / 2

    // Eixo Y invertido: latitude cresce para o norte, mas a coordenada Y do PDF cresce para baixo
    const points = ring.slice(0, -1).map(([lng, lat]) => [
      offsetX + (lng - minLng) * mPerDegLng * scale,
      offsetY + (maxLat - lat) * mPerDegLat * scale,
    ])

    pdf.setDrawColor(229, 231, 235)
    pdf.rect(boxX, boxY, boxSize, boxSize)

    pdf.setDrawColor(37, 99, 235)
    pdf.setLineWidth(0.7)
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[(i + 1) % points.length]
      pdf.line(x1, y1, x2, y2)
    }
    pdf.setFontSize(7)
    pdf.setTextColor(37, 99, 235)
    points.forEach(([x, y], i) => pdf.text(`V${i + 1}`, x + 1.5, y - 1.5))
    pdf.setTextColor(0, 0, 0)

    // Seta indicativa do norte
    const arrowX = boxX + boxSize - 14
    const arrowBaseY = boxY + 22
    const arrowTipY = boxY + 8
    pdf.setDrawColor(55, 65, 81)
    pdf.setLineWidth(0.5)
    pdf.line(arrowX, arrowBaseY, arrowX, arrowTipY)
    pdf.line(arrowX, arrowTipY, arrowX - 2, arrowTipY + 4)
    pdf.line(arrowX, arrowTipY, arrowX + 2, arrowTipY + 4)
    pdf.setFontSize(9)
    pdf.text('N', arrowX - 1.5, arrowTipY - 2)

    let y = boxY + boxSize + 10
    pdf.setFontSize(8)
    pdf.text(pdf.splitTextToSize(
      'Croqui esquemático gerado a partir da geometria cadastrada da parcela (sem escala cartográfica oficial) — representa de forma aproximada a forma e a orientação do lote, com vértices numerados (V1, V2...) conforme o memorial descritivo.',
      182
    ), 14, y)
    y += 20

    if (centroid) {
      const [lat, lng] = centroid
      pdf.setFontSize(10)
      pdf.text(`Coordenadas (centróide): ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 14, y)
      y += 6
      pdf.text(`Google Maps: https://www.google.com/maps?q=${lat},${lng}`, 14, y)
    }

    pdf.setFontSize(8)
    pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pdf.internal.pageSize.height - 10)

    // Página 2: mapa de localização real via tiles OSM
    if (mapImg && centroid) {
      const [lat, lng] = centroid
      pdf.addPage()
      pdf.setFontSize(14)
      pdf.text('Mapa de Localização', 14, 18)
      pdf.setFontSize(10)
      pdf.text(`Parcela: ${parcelaDetail.codigo ?? selectedParcelaId}`, 14, 26)
      pdf.text(`Logradouro: ${[parcelaDetail.logradouro_tipo, parcelaDetail.logradouro_nome].filter(Boolean).join(' ') || '—'}`, 14, 32)
      // 768×512px → razão 3:2 → 182×121 mm
      pdf.addImage(mapImg, 'JPEG', 14, 38, 182, 121)
      pdf.setFontSize(9)
      pdf.text(`Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 14, 163)
      pdf.text(`Google Maps: https://www.google.com/maps?q=${lat},${lng}`, 14, 169)
      pdf.setFontSize(7)
      pdf.text('Imagem cartográfica: © OpenStreetMap contributors (openstreetmap.org/copyright)', 14, 176)
      pdf.setFontSize(8)
      pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pdf.internal.pageSize.height - 10)
    }

    pdf.save(`Croqui_${parcelaDetail.codigo ?? selectedParcelaId}.pdf`)
  }

  function centroidFromGeometry(geom: any): [number, number] | null {
    if (!geom?.coordinates) return null
    if (geom.type === 'Point') return [geom.coordinates[1], geom.coordinates[0]]
    if (geom.type === 'LineString') {
      const c = geom.coordinates
      return [
        c.reduce((s: number, p: number[]) => s + p[1], 0) / c.length,
        c.reduce((s: number, p: number[]) => s + p[0], 0) / c.length,
      ]
    }
    if (geom.type === 'MultiLineString') {
      const all = geom.coordinates.flat()
      return [
        all.reduce((s: number, p: number[]) => s + p[1], 0) / all.length,
        all.reduce((s: number, p: number[]) => s + p[0], 0) / all.length,
      ]
    }
    if (geom.type === 'Polygon') {
      const ring = geom.coordinates[0]
      return [
        ring.reduce((s: number, p: number[]) => s + p[1], 0) / ring.length,
        ring.reduce((s: number, p: number[]) => s + p[0], 0) / ring.length,
      ]
    }
    if (geom.type === 'MultiPolygon') {
      const ring = geom.coordinates[0][0]
      return [
        ring.reduce((s: number, p: number[]) => s + p[1], 0) / ring.length,
        ring.reduce((s: number, p: number[]) => s + p[0], 0) / ring.length,
      ]
    }
    return null
  }

  function flyToResult(result: any) {
    const coords = centroidFromGeometry(result.geometry)
    if (coords) {
      const zoom = result._tipo === 'Bairro' || result._tipo === 'Loteamento' ? 14
        : result._tipo === 'Logradouro' || result._tipo === 'Quadra' ? 16
        : 18
      useMapStore.getState().flyTo(coords[0], coords[1], zoom)
    }
    if (result._tipo === 'Parcela') selectParcela(result.id)
    setSearchResults([])
    setSearchQuery('')
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>

      {/* Barra de seleção de base do mapa — fora do Leaflet para evitar interceptação de eventos */}
      <div style={{
        position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1001, display: 'flex', borderRadius: 8, overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        maxWidth: 'calc(100vw - 100px)',
      }}>
        {BASE_LAYERS.map((layer, i) => {
          const active = baseLayer === layer.id
          return (
            <button
              key={layer.id}
              onClick={() => setBaseLayer(layer.id)}
              style={{
                padding: isMobile ? '8px 10px' : '8px 18px',
                fontSize: isMobile ? 11 : 13,
                fontWeight: active ? 600 : 400,
                background: active ? '#1e3a5f' : 'white',
                color: active ? 'white' : '#374151',
                border: 'none',
                borderLeft: i > 0 ? '1px solid #e5e7eb' : 'none',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
                letterSpacing: '0.01em',
                whiteSpace: 'nowrap',
              }}
            >
              {layer.label}
            </button>
          )
        })}
      </div>

      {/* Barra de busca — renderizada no cabeçalho, ao lado do nome do sistema */}
      {searchSlot && createPortal(
        <div style={{ position: 'relative', width: isMobile ? '100%' : 320, maxWidth: 360 }}>
          <input
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar bairro, logradouro, parcela..."
            style={{
              width: '100%', padding: '7px 12px', border: '1px solid #d1d5db',
              borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none',
            }}
          />
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1002,
              background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
              marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', overflow: 'hidden',
            }}>
              {searchResults.map((r, i) => {
                const TIPO_COLORS: Record<string, string> = {
                  Bairro: '#7c3aed', Loteamento: '#b45309', Logradouro: '#0891b2',
                  Quadra: '#0f766e', Parcela: '#2563eb',
                }
                const cor = TIPO_COLORS[r._tipo] ?? '#374151'
                const label = r.nome ?? r.codigo ?? r.id
                const sub = r._tipo === 'Parcela'
                  ? [r.logradouro, r.bairro].filter(Boolean).join(' · ')
                  : r._tipo === 'Logradouro'
                    ? r.bairro_nome ?? ''
                    : r._tipo === 'Loteamento'
                      ? r.decreto ?? ''
                      : r._tipo === 'Quadra'
                        ? r.loteamento_nome ?? ''
                        : ''
                return (
                  <button
                    key={r.id ?? i}
                    onClick={() => flyToResult(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', textAlign: 'left',
                      padding: '8px 12px', border: 'none', background: 'white',
                      cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: cor,
                      background: cor + '15', padding: '2px 6px', borderRadius: 4,
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {r._tipo}
                    </span>
                    <span style={{ fontWeight: 600, flexShrink: 0 }}>{label}</span>
                    {sub && <span style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
                    {r._tipo === 'Parcela' && r.area_m2 && (
                      <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>
                        {Number(r.area_m2).toFixed(0)} m²
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>,
        searchSlot,
      )}

      {/* Ferramentas de medição */}
      <MeasureToolbar />

      {/* Mapa principal */}
      <SIGMap />

      {/* Painel de detalhes da parcela selecionada */}
      {selectedParcelaId && (
        <div style={isMobile ? {
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: '50vh', background: 'white', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
          overflow: 'auto', zIndex: 1000, padding: 16, borderRadius: '12px 12px 0 0',
        } : {
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 320, background: 'white', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          overflow: 'auto', zIndex: 1000, padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#1e3a5f' }}>Parcela</h3>
            <button
              onClick={() => selectParcela(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}
            >
              ✕
            </button>
          </div>

          {parcelaDetail ? (
            <div style={{ fontSize: 13 }}>
              <Row label="Código" value={parcelaDetail.codigo} />
              <Row label="Bairro" value={parcelaDetail.bairro_nome} />
              <Row label="Logradouro" value={parcelaDetail.logradouro_nome ? [parcelaDetail.logradouro_tipo, parcelaDetail.logradouro_nome].filter(Boolean).join(' ') : undefined} />
              <Row label="Quadra" value={parcelaDetail.quadra_codigo} />
              <Row label="Área" value={parcelaDetail.area_m2 ? `${Number(parcelaDetail.area_m2).toFixed(2)} m²` : '—'} />
              <Row label="Testada principal" value={parcelaDetail.testada_principal ? `${parcelaDetail.testada_principal} m` : '—'} />

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link
                  to={`/cadastro/parcelas/${selectedParcelaId}`}
                  style={{
                    display: 'block', textAlign: 'center', background: '#2563eb',
                    color: 'white', padding: '8px', borderRadius: 6, textDecoration: 'none', fontSize: 13,
                  }}
                >
                  Abrir cadastro completo
                </Link>
                <button
                  onClick={generateMemorialPDF}
                  style={{
                    background: '#f3f4f6', border: '1px solid #d1d5db',
                    padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  }}
                >
                  Gerar Memorial PDF
                </button>
                <button
                  onClick={gerarCroquiPDF}
                  style={{
                    background: '#f3f4f6', border: '1px solid #d1d5db',
                    padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  }}
                >
                  🖨 Croqui de Localização PDF
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: '#6b7280', fontSize: 13 }}>Carregando...</p>
          )}
        </div>
      )}

      {/* Painel de detalhes do patrimônio público selecionado */}
      {selectedPatrimonioId && (
        <div style={isMobile ? {
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: '50vh', background: 'white', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
          overflow: 'auto', zIndex: 1000, padding: 16, borderRadius: '12px 12px 0 0',
        } : {
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 320, background: 'white', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          overflow: 'auto', zIndex: 1000, padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#1e3a5f' }}>Patrimônio Público</h3>
            <button
              onClick={() => selectPatrimonio(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}
            >
              ✕
            </button>
          </div>

          {patrimonioDetail ? (
            <div style={{ fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{ICONE_PATRIMONIO[patrimonioDetail.finalidade] ?? '📍'}</span>
                <span style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>{patrimonioDetail.nome}</span>
              </div>
              <Row label="Finalidade" value={patrimonioDetail.finalidade?.replace('_', ' ')} />
              <Row label="Nº de registro" value={patrimonioDetail.numero_registro} />
              <Row label="Área" value={patrimonioDetail.area_m2 ? `${Number(patrimonioDetail.area_m2).toFixed(2)} m²` : undefined} />
              {patrimonioDetail.descricao && (
                <p style={{ marginTop: 10, color: '#374151' }}>{patrimonioDetail.descricao}</p>
              )}

              {patrimonioDetail.documento_urls?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#1e3a5f' }}>Documentos</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {patrimonioDetail.documento_urls.map((url: string, i: number) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: '#f3f4f6', border: '1px solid #d1d5db',
                          padding: '8px', borderRadius: 6, textAlign: 'center',
                          fontSize: 13, color: '#2563eb', textDecoration: 'none',
                        }}
                      >
                        Documento {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: '#6b7280', fontSize: 13 }}>Carregando...</p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '6px 0' }}>
      <span style={{ color: '#6b7280', width: 130, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, color: '#111' }}>{value ?? '—'}</span>
    </div>
  )
}
