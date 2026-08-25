import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMapStore } from '../../store/map.store'
import { useAuthStore } from '../../store/auth.store'
import api from '../../lib/api'
import toast from 'react-hot-toast'

type Setor = { id: string; nome: string; geometry: GeoJSON.Geometry | null }
type Polo  = { id: string; nome: string; tipo: string | null; setor_id: string | null; geometry: GeoJSON.Geometry | null }
type Amostra = {
  id: string; setor_id: string; valor_amostra: number; espuria: boolean
  estado_conservacao: string | null; tipologia: string | null; padrao_cub: string | null
  idade_aparente: number | null; distancia_polo: number | null; geometry: GeoJSON.Geometry | null
}
type Pendente = { tipo: 'setor' | 'polo' | 'amostra'; geometry: GeoJSON.Geometry; layer: L.Layer }

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

// Exibe os setores de cálculo e polos valorizantes do PGV no mapa, permite
// desenhar novos diretamente sobre ele (req 211) e coletar amostras de
// mercado por clique, vinculadas ao setor ativo (itens 23, 24, 31)
export function PgvSetoresLayer() {
  const map = useMapStore(s => s.map)
  const { perfil } = useAuthStore()
  const qc = useQueryClient()
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [setorAtivoId, setSetorAtivoId] = useState('')
  const [modoDesenho, setModoDesenho] = useState<'polo' | 'amostra' | null>(null)
  const [amostraForm, setAmostraForm] = useState({
    valorAmostra: '', idadeAparente: '', estadoConservacao: '', tipologia: '', padraoCub: '',
  })

  const setoresLayerRef = useRef<L.GeoJSON | null>(null)
  const polosLayerRef = useRef<L.LayerGroup | null>(null)
  const amostrasLayerRef = useRef<L.LayerGroup | null>(null)

  const podeDesenhar = perfil === 'ADMIN' || perfil === 'FISCAL_TRIBUTARIO'

  const { data: setores = [] } = useQuery<Setor[]>({
    queryKey: ['pgv-setores-mapa'],
    queryFn: () => api.get('/pgv/setores').then(r => r.data),
  })

  const { data: polos = [] } = useQuery<Polo[]>({
    queryKey: ['pgv-polos'],
    queryFn: () => api.get('/pgv/polos').then(r => r.data),
  })

  const { data: amostras = [] } = useQuery<Amostra[]>({
    queryKey: ['pgv-amostras-mapa', setorAtivoId],
    queryFn: () => api.get('/pgv/amostras', { params: { setorId: setorAtivoId } }).then(r => r.data),
    enabled: !!setorAtivoId,
  })

  const { data: cubTabela = [] } = useQuery<{ padrao_construtivo: string }[]>({
    queryKey: ['pgv-cub-lista'],
    queryFn: () => api.get('/pgv/cub').then(r => r.data),
    enabled: podeDesenhar,
  })

  const { data: depreciacaoTabela = [] } = useQuery<{ estado_conservacao: string }[]>({
    queryKey: ['pgv-depreciacao-lista'],
    queryFn: () => api.get('/pgv/depreciacao').then(r => r.data),
    enabled: podeDesenhar,
  })

  const padroesCub = Array.from(new Set(cubTabela.map(c => c.padrao_construtivo)))
  const estadosConservacao = Array.from(new Set(depreciacaoTabela.map(d => d.estado_conservacao)))

  // Setores existentes — polígonos
  useEffect(() => {
    if (!map) return
    const features = setores
      .filter(s => s.geometry)
      .map(s => ({ type: 'Feature' as const, geometry: s.geometry!, properties: { nome: s.nome } }))
    const layer = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
      style: { color: '#2563eb', weight: 2, fillColor: '#93c5fd', fillOpacity: 0.15, dashArray: '6,4' },
      onEachFeature: (f, l) => l.bindTooltip(f.properties.nome, { sticky: true }),
    }).addTo(map)
    setoresLayerRef.current = layer
    return () => { map.removeLayer(layer) }
  }, [map, setores])

  // Polos valorizantes existentes — marcadores
  useEffect(() => {
    if (!map) return
    const group = L.layerGroup()
    for (const p of polos) {
      if (!p.geometry || p.geometry.type !== 'Point') continue
      const [lng, lat] = p.geometry.coordinates as [number, number]
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).bindTooltip(`${p.nome}${p.tipo ? ` (${p.tipo})` : ''}`).addTo(group)
    }
    group.addTo(map)
    polosLayerRef.current = group
    return () => { map.removeLayer(group) }
  }, [map, polos])

  // Amostras do setor ativo — marcadores com popup de detalhe e ação de
  // marcar como espúria (item 30)
  const marcarEspuria = useMutation({
    mutationFn: (id: string) => api.delete(`/pgv/amostras/${id}`),
    onSuccess: () => {
      toast.success('Amostra marcada como espúria. Recalculando o setor...')
      qc.invalidateQueries({ queryKey: ['pgv-amostras-mapa'] })
      qc.invalidateQueries({ queryKey: ['pgv-amostras'] })
      if (setorAtivoId) recalcular.mutate(setorAtivoId)
    },
    onError: () => toast.error('Erro ao marcar amostra como espúria'),
  })

  const recalcular = useMutation({
    mutationFn: (id: string) => api.post('/pgv/calcular', { setorId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pgv-setores'] })
      qc.invalidateQueries({ queryKey: ['pgv-setores-mapa'] })
    },
  })

  useEffect(() => {
    if (!map) return
    const group = L.layerGroup()
    for (const a of amostras) {
      if (!a.geometry || a.geometry.type !== 'Point') continue
      const [lng, lat] = a.geometry.coordinates as [number, number]
      const cor = a.espuria ? '#9ca3af' : '#16a34a'
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:14px;height:14px;border-radius:3px;background:${cor};opacity:${a.espuria ? 0.5 : 1};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      })
      const popupId = `pgv-amostra-espuria-${a.id}`
      marker.bindPopup(`
        <div style="font-size:12px;min-width:170px">
          <strong>${formatoMoeda.format(a.valor_amostra)}</strong>${a.espuria ? ' <em>(espúria)</em>' : ''}<br/>
          ${a.tipologia ? `Tipologia: ${a.tipologia}<br/>` : ''}
          ${a.padrao_cub ? `Padrão CUB: ${a.padrao_cub}<br/>` : ''}
          ${a.estado_conservacao ? `Conservação: ${a.estado_conservacao}<br/>` : ''}
          ${a.idade_aparente != null ? `Idade aparente: ${a.idade_aparente} anos<br/>` : ''}
          ${a.distancia_polo != null ? `Distância ao polo: ${a.distancia_polo.toFixed(1)} m<br/>` : ''}
          ${podeDesenhar && !a.espuria ? `<button id="${popupId}" style="margin-top:6px;padding:4px 8px;background:#dc2626;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px">Marcar como espúria</button>` : ''}
        </div>
      `)
      if (podeDesenhar && !a.espuria) {
        marker.on('popupopen', () => {
          document.getElementById(popupId)?.addEventListener('click', () => marcarEspuria.mutate(a.id))
        })
      }
      marker.addTo(group)
    }
    group.addTo(map)
    amostrasLayerRef.current = group
    return () => { map.removeLayer(group) }
  }, [map, amostras, podeDesenhar]) // eslint-disable-line react-hooks/exhaustive-deps

  // Captura a geometria desenhada: polígono → novo setor, marcador → novo
  // polo ou nova amostra, dependendo do modo ativo
  useEffect(() => {
    if (!map || !podeDesenhar) return
    const onCreated = (e: any) => {
      if (e.shape === 'Polygon') {
        const geojson = (e.layer as L.Polygon).toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>
        setPendente({ tipo: 'setor', geometry: geojson.geometry, layer: e.layer })
      }
      if (e.shape === 'Marker') {
        const geojson = (e.layer as L.Marker).toGeoJSON() as GeoJSON.Feature<GeoJSON.Point>
        if (modoDesenho === 'amostra') {
          setPendente({ tipo: 'amostra', geometry: geojson.geometry, layer: e.layer })
        } else {
          setPendente({ tipo: 'polo', geometry: geojson.geometry, layer: e.layer })
        }
      }
      ;(map as any).pm.disableDraw()
    }
    map.on('pm:create', onCreated)
    return () => { map.off('pm:create', onCreated) }
  }, [map, podeDesenhar, modoDesenho])

  const salvarSetor = useMutation({
    mutationFn: () => api.post('/pgv/setores', { nome, geometry: pendente!.geometry }),
    onSuccess: () => {
      toast.success('Setor PGV criado')
      qc.invalidateQueries({ queryKey: ['pgv-setores-mapa'] })
      qc.invalidateQueries({ queryKey: ['pgv-setores'] })
      cancelar()
    },
    onError: () => toast.error('Erro ao criar setor'),
  })

  const salvarPolo = useMutation({
    mutationFn: () => api.post('/pgv/polos', { nome, tipo: tipo || undefined, setorId: setorAtivoId || undefined, geometry: pendente!.geometry }),
    onSuccess: () => {
      toast.success('Polo valorizante criado')
      qc.invalidateQueries({ queryKey: ['pgv-polos'] })
      cancelar()
    },
    onError: () => toast.error('Erro ao criar polo'),
  })

  const salvarAmostra = useMutation({
    mutationFn: () => api.post('/pgv/amostras', {
      setorId: setorAtivoId,
      valorAmostra: Number(amostraForm.valorAmostra),
      idadeAparente: amostraForm.idadeAparente ? Number(amostraForm.idadeAparente) : undefined,
      estadoConservacao: amostraForm.estadoConservacao || undefined,
      tipologia: amostraForm.tipologia || undefined,
      padraoCub: amostraForm.padraoCub || undefined,
      geometry: pendente!.geometry,
    }),
    onSuccess: () => {
      toast.success('Amostra coletada')
      qc.invalidateQueries({ queryKey: ['pgv-amostras-mapa'] })
      qc.invalidateQueries({ queryKey: ['pgv-amostras'] })
      cancelar()
    },
    onError: () => toast.error('Erro ao salvar amostra'),
  })

  function cancelar() {
    if (pendente) map?.removeLayer(pendente.layer)
    setPendente(null)
    setNome('')
    setTipo('')
    setAmostraForm({ valorAmostra: '', idadeAparente: '', estadoConservacao: '', tipologia: '', padraoCub: '' })
    setModoDesenho(null)
  }

  function confirmar() {
    if (pendente?.tipo === 'setor') {
      if (!nome.trim()) { toast.error('Informe um nome'); return }
      salvarSetor.mutate()
    } else if (pendente?.tipo === 'polo') {
      if (!nome.trim()) { toast.error('Informe um nome'); return }
      salvarPolo.mutate()
    } else if (pendente?.tipo === 'amostra') {
      if (!amostraForm.valorAmostra || Number(amostraForm.valorAmostra) <= 0) { toast.error('Informe o valor da amostra'); return }
      salvarAmostra.mutate()
    }
  }

  function iniciarColetaAmostra() {
    if (!setorAtivoId) { toast.error('Selecione um setor ativo primeiro'); return }
    setModoDesenho('amostra')
    ;(map as any)?.pm.enableDraw('Marker')
  }

  function iniciarPolo() {
    setModoDesenho('polo')
    ;(map as any)?.pm.enableDraw('Marker')
  }

  if (!podeDesenhar) return null

  return (
    <>
      <div style={{ position: 'absolute', top: 10, left: 50, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6, width: 200 }}>
        <select
          value={setorAtivoId}
          onChange={e => setSetorAtivoId(e.target.value)}
          style={{ ...btnSt, textAlign: 'left' as const }}
        >
          <option value="">Setor ativo: nenhum</option>
          {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        <button onClick={() => (map as any)?.pm.enableDraw('Polygon')} style={btnSt}>⬡ Desenhar setor</button>
        <button onClick={iniciarPolo} style={btnSt}>📍 Adicionar polo</button>
        <button onClick={iniciarColetaAmostra} style={btnSt} disabled={!setorAtivoId}>📊 Coletar amostra</button>
      </div>

      {pendente && (
        <div style={{ position: 'absolute', top: 10, left: 260, zIndex: 1000, background: 'white', borderRadius: 8, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', width: 240 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
            {pendente.tipo === 'setor' ? 'Novo setor PGV' : pendente.tipo === 'polo' ? 'Novo polo valorizante' : 'Nova amostra de mercado'}
          </p>

          {(pendente.tipo === 'setor' || pendente.tipo === 'polo') && (
            <input
              value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" autoFocus
              style={inputSt}
            />
          )}
          {pendente.tipo === 'polo' && (
            <input
              value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Tipo (ex: praça, escola)"
              style={inputSt}
            />
          )}

          {pendente.tipo === 'amostra' && (
            <>
              <input
                type="number" min={0} step="0.01" autoFocus
                value={amostraForm.valorAmostra}
                onChange={e => setAmostraForm(f => ({ ...f, valorAmostra: e.target.value }))}
                placeholder="Valor da amostra (R$/m²)"
                style={inputSt}
              />
              <input
                type="number" min={0}
                value={amostraForm.idadeAparente}
                onChange={e => setAmostraForm(f => ({ ...f, idadeAparente: e.target.value }))}
                placeholder="Idade aparente (anos)"
                style={inputSt}
              />
              <input
                list="pgv-estados-conservacao"
                value={amostraForm.estadoConservacao}
                onChange={e => setAmostraForm(f => ({ ...f, estadoConservacao: e.target.value }))}
                placeholder="Estado de conservação"
                style={inputSt}
              />
              <datalist id="pgv-estados-conservacao">
                {estadosConservacao.map(e => <option key={e} value={e} />)}
              </datalist>
              <input
                value={amostraForm.tipologia}
                onChange={e => setAmostraForm(f => ({ ...f, tipologia: e.target.value }))}
                placeholder="Tipologia"
                style={inputSt}
              />
              <input
                list="pgv-padroes-cub"
                value={amostraForm.padraoCub}
                onChange={e => setAmostraForm(f => ({ ...f, padraoCub: e.target.value }))}
                placeholder="Padrão CUB"
                style={inputSt}
              />
              <datalist id="pgv-padroes-cub">
                {padroesCub.map(p => <option key={p} value={p} />)}
              </datalist>
            </>
          )}

          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={cancelar} style={{ ...btnSt, background: '#f3f4f6', color: '#374151' }}>Cancelar</button>
            <button
              onClick={confirmar}
              disabled={salvarSetor.isPending || salvarPolo.isPending || salvarAmostra.isPending}
              style={{ ...btnSt, background: '#1e3a5f', color: 'white' }}
            >
              Salvar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const btnSt: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'white', color: '#374151', fontSize: 12, fontWeight: 600,
  boxShadow: '0 2px 6px rgba(0,0,0,0.18)', textAlign: 'left',
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: 12, marginBottom: 8, boxSizing: 'border-box',
}
