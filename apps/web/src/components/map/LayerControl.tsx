import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMapStore } from '../../store/map.store'
import api from '../../lib/api'
import { ICONE_PATRIMONIO } from '../../lib/patrimonio'
import toast from 'react-hot-toast'

const OVERLAY_LAYERS = [
  { id: 'parcelas',          label: 'Lotes / Parcelas' },
  { id: 'edificacoes',       label: 'Edificações' },
  { id: 'bairros',           label: 'Bairros' },
  { id: 'postes',            label: 'Postes' },
  { id: 'arvores',           label: 'Árvores' },
  { id: 'recadastramento',   label: 'Recadastramento' },
  { id: 'reurb',             label: 'Lotes REURB (por situação)' },
  { id: 'zonas_uso',         label: 'Zonas de Uso' },
  { id: 'pgv',               label: 'PGV' },
  { id: 'patrimonio',        label: 'Patrimônio Público' },
  { id: '360_terrestre',     label: 'Imageamento 360°' },
]

type Camada = { id: string; nome: string; cor: string; total_parcelas: number }
type CamadaWms = { id: string; nome: string; categoria: string | null; ativa: boolean }

export function LayerControl() {
  const {
    activeLayers, toggleLayer, bairros, zoomToBairro,
    layerPanelOpen: open, setLayerPanelOpen: setOpen,
  } = useMapStore()
  const qc = useQueryClient()
  const [bairrosExpanded, setBairrosExpanded] = useState(false)
  const [bairroSearch, setBairroSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const shpInputRef = useRef<HTMLInputElement>(null)

  const { data: camadas = [] } = useQuery<Camada[]>({
    queryKey: ['camadas'],
    queryFn: () => api.get('/camadas').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: camadasWms = [] } = useQuery<CamadaWms[]>({
    queryKey: ['camadas-wms'],
    queryFn: () => api.get('/camadas-wms').then(r => r.data),
    staleTime: 60_000,
  })
  const wmsAtivas = camadasWms.filter(c => c.ativa)

  useEffect(() => {
    if (!ref.current) return
    L.DomEvent.disableClickPropagation(ref.current)
    L.DomEvent.disableScrollPropagation(ref.current)
  }, [])

  async function handleShpUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/camadas/upload-shp', form, {
        headers: { 'x-layer-name': file.name.replace(/\.zip$/i, '').replace(/_/g, ' ') },
      })
      await qc.invalidateQueries({ queryKey: ['camadas'] })
      toast.success(`Camada importada: ${res.data.importadas}/${res.data.total} feições`)
      if (res.data.erros?.length) toast.error(`${res.data.erros.length} erros na importação`)
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao importar shapefile')
    } finally {
      setUploading(false)
      if (shpInputRef.current) shpInputRef.current.value = ''
    }
  }

  async function deleteCamada(id: string, nome: string) {
    if (!confirm(`Excluir camada "${nome}"? Esta ação não pode ser desfeita.`)) return
    try {
      await api.delete(`/camadas/${id}`)
      await qc.invalidateQueries({ queryKey: ['camadas'] })
      toast.success(`Camada "${nome}" excluída`)
    } catch {
      toast.error('Erro ao excluir camada')
    }
  }

  async function downloadCamada(id: string, nome: string) {
    try {
      const res = await api.get(`/camadas/${id}/parcelas?limit=9999`)
      const items: any[] = res.data.data ?? []
      const geojson = {
        type: 'FeatureCollection',
        features: items.map(p => ({
          type: 'Feature',
          properties: { codigo: p.codigo, area_m2: p.area_m2, ...p.atributos },
          geometry: p.geometry ?? null,
        })),
      }
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${nome.replace(/\s+/g, '_')}.geojson`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`${nome} exportada`)
    } catch {
      toast.error('Erro ao exportar camada')
    }
  }

  const bairrosFiltrados = bairros
    .filter(b => b.nome.toLowerCase().includes(bairroSearch.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const totalAtivas = activeLayers.length

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'row', alignItems: 'stretch',
        zIndex: 1000, pointerEvents: 'none',
      }}
    >
      {/* ── Barra retraída (visível só quando fechado) ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Expandir painel de camadas"
          style={{
            pointerEvents: 'auto',
            width: 28,
            background: 'white',
            border: 'none',
            borderLeft: '1px solid #d1d5db',
            boxShadow: '-3px 0 10px rgba(0,0,0,0.10)',
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: 0, flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 16, color: '#374151', lineHeight: 1 }}>‹</span>
          <span style={{
            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            fontSize: 10, fontWeight: 700, color: '#6b7280',
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>Camadas</span>
          {totalAtivas > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: 'white',
              background: '#2563eb', borderRadius: 8,
              padding: '2px 5px', lineHeight: 1,
            }}>{totalAtivas}</span>
          )}
        </button>
      )}

      {/* ── Seta de colapsar (visível só quando aberto) ── */}
      {open && (
        <button
          onClick={() => setOpen(false)}
          title="Recolher painel de camadas"
          style={{
            pointerEvents: 'auto',
            alignSelf: 'center',
            width: 20, height: 52,
            background: 'white',
            border: '1px solid #d1d5db', borderRight: 'none',
            borderRadius: '6px 0 0 6px',
            boxShadow: '-2px 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: '#374151', padding: 0, flexShrink: 0,
          }}
        >
          ›
        </button>
      )}

      {/* ── Painel lateral ── */}
      <div style={{
        pointerEvents: 'auto',
        width: open ? 248 : 0,
        overflow: 'hidden',
        transition: 'width 0.2s ease',
        background: 'white',
        borderLeft: open ? '1px solid #e5e7eb' : 'none',
        boxShadow: open ? '-4px 0 16px rgba(0,0,0,0.10)' : 'none',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* largura fixa interna para o conteúdo não se comprimir durante a transição */}
        <div style={{ width: 248, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Cabeçalho */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid #f3f4f6',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#1e3a5f', flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              🗂 Camadas
              {totalAtivas > 0 && (
                <span style={{
                  background: 'rgba(255,255,255,0.25)', color: 'white',
                  borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                }}>{totalAtivas}</span>
              )}
            </span>
          </div>

          {/* Conteúdo scrollável */}
          <div style={{ overflowY: 'auto', flex: 1 }}>

            {/* ── Camadas de sistema ── */}
            <SectionHeader label="Camadas de dados" />
            {OVERLAY_LAYERS.map(layer => {
              const on = activeLayers.includes(layer.id)
              const isBairros = layer.id === 'bairros'
              const isRec = layer.id === 'recadastramento'
              const isPgv = layer.id === 'pgv'
              const isPatrimonio = layer.id === 'patrimonio'
              const isArvores = layer.id === 'arvores'
              return (
                <div key={layer.id}>
                  <LayerRow
                    label={layer.label}
                    on={on}
                    onToggle={() => toggleLayer(layer.id)}
                    extra={isBairros && on && bairros.length > 0 ? (
                      <button
                        onClick={e => { e.stopPropagation(); setBairrosExpanded(v => !v) }}
                        title={bairrosExpanded ? 'Recolher lista' : 'Ver bairros'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6b7280', padding: '0 2px' }}
                      >
                        {bairrosExpanded ? '▲' : '▼'}
                      </button>
                    ) : null}
                  />
                  {isRec && on && (
                    <div style={{ background: '#f8faff', borderBottom: '1px solid #e5e7eb', padding: '6px 14px 8px' }}>
                      {[
                        { cor: '#22c55e', label: 'Recadastrado' },
                        { cor: '#f59e0b', label: 'Visitado' },
                        { cor: '#9ca3af', label: 'Pendente' },
                        { cor: '#ef4444', label: 'Impedido' },
                      ].map(({ cor, label }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                          <span style={{ width: 12, height: 12, borderRadius: 2, background: cor, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: '#374151' }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isArvores && on && (
                    <div style={{ background: '#f8faff', borderBottom: '1px solid #e5e7eb', padding: '6px 14px 8px' }}>
                      {[
                        { cor: '#16a34a', label: 'Normal' },
                        { cor: '#f59e0b', label: 'Com solicitação' },
                        { cor: '#3b82f6', label: 'Em manutenção' },
                      ].map(({ cor, label }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: '#374151' }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isPgv && on && (
                    <div style={{ background: '#f8faff', borderBottom: '1px solid #e5e7eb', padding: '6px 14px 8px' }}>
                      <div style={{
                        height: 10, borderRadius: 5, marginBottom: 4,
                        background: 'linear-gradient(90deg, #fde68a 0%, #b91c1c 100%)',
                      }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#374151' }}>
                        <span>Menor valor/m²</span>
                        <span>Maior valor/m²</span>
                      </div>
                    </div>
                  )}
                  {isPatrimonio && on && (
                    <div style={{ background: '#f8faff', borderBottom: '1px solid #e5e7eb', padding: '6px 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {Object.entries(ICONE_PATRIMONIO).map(([fin, icone]) => (
                        <div key={fin} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 13 }}>{icone}</span>
                          <span style={{ fontSize: 11, color: '#374151', textTransform: 'capitalize' }}>{fin.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isBairros && on && bairrosExpanded && bairros.length > 0 && (
                    <div style={{ background: '#f8faff', borderBottom: '1px solid #e5e7eb' }}>
                      <div style={{ padding: '6px 10px' }}>
                        <input
                          value={bairroSearch}
                          onChange={e => setBairroSearch(e.target.value)}
                          placeholder="Filtrar bairro..."
                          onClick={e => e.stopPropagation()}
                          style={{
                            width: '100%', padding: '5px 8px', fontSize: 11,
                            border: '1px solid #d1d5db', borderRadius: 5,
                            outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                        {bairrosFiltrados.map(b => (
                          <button
                            key={b.id}
                            onClick={e => { e.stopPropagation(); zoomToBairro(b.bounds) }}
                            style={{
                              display: 'block', width: '100%', padding: '6px 16px',
                              border: 'none', background: 'none', cursor: 'pointer',
                              fontSize: 12, color: '#374151', textAlign: 'left',
                              borderBottom: '1px solid #f0f4ff',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#dbeafe')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            📍 {b.nome}
                          </button>
                        ))}
                        {bairrosFiltrados.length === 0 && (
                          <p style={{ margin: 0, padding: '8px 16px', fontSize: 11, color: '#9ca3af' }}>
                            Nenhum bairro encontrado
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* ── Camadas Auxiliares ── */}
            <input ref={shpInputRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleShpUpload} />
            <SectionHeader label="Camadas auxiliares" action={
              <button
                onClick={e => { e.stopPropagation(); shpInputRef.current?.click() }}
                disabled={uploading}
                title="Importar shapefile (.zip)"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#93c5fd', padding: '0 4px', fontWeight: 600 }}
              >{uploading ? '...' : '↑ SHP'}</button>
            } />

            {camadas.length === 0 ? (
              <div style={{ padding: '10px 14px' }}>
                <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                  Nenhuma camada importada ainda.
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>
                  Clique em ↑ SHP para importar um shapefile.
                </p>
              </div>
            ) : (
              camadas.map(c => {
                const layerId = `camada:${c.id}`
                const on = activeLayers.includes(layerId)
                return (
                  <LayerRow
                    key={c.id}
                    label={c.nome}
                    on={on}
                    onToggle={() => toggleLayer(layerId)}
                    colorDot={c.cor}
                    badge={c.total_parcelas > 0 ? String(c.total_parcelas) : undefined}
                    onDownload={() => downloadCamada(c.id, c.nome)}
                    onDelete={() => deleteCamada(c.id, c.nome)}
                  />
                )
              })
            )}

            {/* ── Camadas WMS externas (req 22) ── */}
            {wmsAtivas.length > 0 && (
              <>
                <SectionHeader label="Camadas WMS" />
                {wmsAtivas.map(c => {
                  const layerId = `wms:${c.id}`
                  const on = activeLayers.includes(layerId)
                  return (
                    <LayerRow
                      key={c.id}
                      label={c.nome}
                      on={on}
                      onToggle={() => toggleLayer(layerId)}
                    />
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div style={{
      padding: '7px 12px 5px', fontSize: 10, fontWeight: 700, color: '#6b7280',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6',
      background: '#fafafa', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {label}
      {action}
    </div>
  )
}

function LayerRow({
  label, on, onToggle, extra, colorDot, badge, onDownload, onDelete,
}: {
  label: string
  on: boolean
  onToggle: () => void
  extra?: React.ReactNode
  colorDot?: string
  badge?: string
  onDownload?: () => void
  onDelete?: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px',
      background: on ? '#eff6ff' : 'white',
      borderBottom: '1px solid #f9fafb',
    }}>
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        style={{
          display: 'flex', alignItems: 'center', flex: 1,
          border: 'none', cursor: 'pointer', fontSize: 13,
          background: 'transparent', color: on ? '#1d4ed8' : '#374151',
          padding: 0, textAlign: 'left', gap: 8,
        }}
      >
        <span style={{
          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
          border: on ? `2px solid ${colorDot ?? '#2563eb'}` : '2px solid #9ca3af',
          background: on ? (colorDot ?? '#2563eb') : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 10,
        }}>{on ? '✓' : ''}</span>

        {colorDot && (
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: colorDot, flexShrink: 0,
            border: '1.5px solid rgba(0,0,0,0.15)',
          }} />
        )}

        <span style={{ flex: 1 }}>{label}</span>

        {badge && (
          <span style={{
            fontSize: 10, background: '#e5e7eb', color: '#6b7280',
            borderRadius: 8, padding: '1px 5px', fontWeight: 600,
          }}>{badge}</span>
        )}
      </button>
      {onDownload && (
        <button
          onClick={e => { e.stopPropagation(); onDownload() }}
          title="Exportar como GeoJSON"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: '#6b7280', padding: '0 2px', lineHeight: 1, flexShrink: 0,
          }}
        >
          ↓
        </button>
      )}
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Excluir camada"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: '#ef4444', padding: '0 2px', lineHeight: 1, flexShrink: 0,
          }}
        >
          🗑
        </button>
      )}
      {extra}
    </div>
  )
}
