import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { useMapStore } from '../../store/map.store'
import { useAuthStore } from '../../store/auth.store'
import api from '../../lib/api'
import toast from 'react-hot-toast'

// ── Geometria inline (evita problema de tipos com @turf/turf exports) ─────────
function polyCentroid(coords: number[][]): [number, number] {
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
  return [lng, lat]
}

function ptInRing(pt: [number, number], ring: number[][]): boolean {
  const [x, y] = pt
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function ptInGeom(pt: [number, number], geom: any): boolean {
  if (!geom) return false
  if (geom.type === 'Polygon') return ptInRing(pt, geom.coordinates[0])
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((p: number[][][]) => ptInRing(pt, p[0]))
  return false
}
// ──────────────────────────────────────────────────────────────────────────────

type Modo = 'idle' | 'nova' | 'desmembrar' | 'unificar' | 'guias' | 'ortogonal' | 'clonar' | 'espelhar'

type ModalData = {
  geometry: GeoJSON.Geometry
  layer: L.Layer
}

function toRadians(degrees: number) {
  return degrees * Math.PI / 180
}

function toDegrees(radians: number) {
  return radians * 180 / Math.PI
}

function destinationPoint([lng, lat]: [number, number], bearing: number, distance: number): [number, number] {
  const R = 6371000
  const φ1 = toRadians(lat)
  const λ1 = toRadians(lng)
  const θ = toRadians(bearing)
  const δ = distance / R
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
  )
  return [toDegrees(λ2), toDegrees(φ2)]
}

function computeBearing([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
  const φ1 = toRadians(lat1)
  const φ2 = toRadians(lat2)
  const Δλ = toRadians(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

function computeDistanceMetros([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
  const φ1 = toRadians(lat1)
  const φ2 = toRadians(lat2)
  const Δφ = toRadians(lat2 - lat1)
  const Δλ = toRadians(lng2 - lng1)
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return 6371000 * c
}

function parseCoordinatesText(text: string) {
  return text
    .split(/\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,;\s]+/).map(Number)
      if (parts.length !== 2 || parts.some(Number.isNaN)) {
        throw new Error(`Linha inválida: ${line}`)
      }
      return [parts[0], parts[1]] as [number, number]
    })
}

function closePolygonCoords(coords: [number, number][]) {
  if (coords.length > 0) {
    const first = coords[0]
    const last = coords[coords.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return [...coords, first]
    }
  }
  return coords
}

function computeOrthogonalLine(geometry: GeoJSON.LineString): GeoJSON.LineString | null {
  const coords = geometry.coordinates
  if (coords.length < 2) return null
  const start = coords[0] as [number, number]
  const end = coords[coords.length - 1] as [number, number]
  const midpoint: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
  const length = Math.max(computeDistanceMetros(start, end), 10)
  const bearing = computeBearing(start, end)
  const perp = (bearing + 90) % 360
  const half = length / 2
  const p1 = destinationPoint(midpoint, perp, half)
  const p2 = destinationPoint(midpoint, perp + 180, half)
  return { type: 'LineString', coordinates: [p1, p2] }
}

export function EditToolbar() {
  const { map, selectedParcelaId, selectParcela, refreshMVT, setLastDrawnGeometry, multiSelectedParcelas, clearMultiSelect } = useMapStore()
  const { perfil } = useAuthStore()

  const [modo, setModo] = useState<Modo>('idle')
  const [modal, setModal] = useState<ModalData | null>(null)
  const [form, setForm] = useState({ codigo: '', bairroId: '', bairroNome: '', camadaId: '' })
  const [bairros, setBairros] = useState<{ id: string; nome: string; geometry?: any }[]>([])
  const [camadas, setCamadas] = useState<{ id: string; nome: string }[]>([])
  const [unifyCodigo, setUnifyCodigo] = useState('')
  const [unifyModalOpen, setUnifyModalOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [desmembrarState, setDesmembrarState] = useState<{ geometry: GeoJSON.LineString; layer: L.Layer } | null>(null)
  const [desmembrarCodigo, setDesmembrarCodigo] = useState('')
  const [xyModalOpen, setXyModalOpen] = useState(false)
  const [xyText, setXyText] = useState('')
  const [xyShapeType, setXyShapeType] = useState<'polygon' | 'line'>('polygon')
  const [azimuteModalOpen, setAzimuteModalOpen] = useState(false)
  const [azimuteOrigin, setAzimuteOrigin] = useState('')
  const [azimuteText, setAzimuteText] = useState('')
  const [azimuteClose, setAzimuteClose] = useState(true)
  const [espelharModalOpen, setEspelharModalOpen] = useState(false)
  const [espelharEixo, setEspelharEixo] = useState<'H' | 'V'>('H')

  const parcelaLayerRef = useRef<L.GeoJSON | null>(null)
  const guidesLayerRef = useRef<L.LayerGroup | null>(null)
  const orthogonalLayerRef = useRef<L.LayerGroup | null>(null)
  const adHocLayerRef = useRef<L.LayerGroup | null>(null)
  // Qualquer perfil interno pode criar parcelas (não apenas ADMIN/FISCAL)
  const canEdit = !!perfil && perfil !== 'CIDADAO'

  // Inicializa Geoman uma vez
  useEffect(() => {
    if (!map || !canEdit) return

    // Tradução PT-BR dos controles de desenho
    ;(map as any).pm.setLang('ptBR', {
      tooltips: {
        placeMarker: 'Clique para posicionar',
        firstVertex: 'Clique para o primeiro vértice',
        continueLine: 'Clique para continuar',
        finishLine: 'Clique no primeiro ponto para fechar',
        finishPoly: 'Clique no primeiro ponto para fechar',
        finishRect: 'Clique para finalizar',
        startCircle: 'Clique e arraste para desenhar',
        finishCircle: 'Solte para finalizar',
        placeCircleMarker: 'Clique para posicionar',
      },
      actions: {
        finish: 'Finalizar',
        cancel: 'Cancelar',
        removeLastVertex: 'Remover último vértice',
      },
      buttonTitles: {
        drawMarkerButton: 'Inserir Marcador',
        drawPolyButton: 'Desenhar Polígono',
        drawLineButton: 'Desenhar Linha',
        drawCircleButton: 'Desenhar Círculo',
        drawRectButton: 'Desenhar Retângulo',
        editButton: 'Editar Feições',
        dragButton: 'Mover Feições',
        cutButton: 'Recortar',
        deleteButton: 'Excluir Feições',
        drawCircleMarkerButton: 'Marcador Circular',
        snapButton: 'Encaixar em outros polígonos',
        rotateButton: 'Girar Feições',
      },
    }, 'en')
    ;(map as any).pm.setLang('ptBR')

    ;(map as any).pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: true,
      drawRectangle: false,
      drawPolygon: true,
      drawCircle: false,
      editMode: true,
      dragMode: false,
      cutPolygon: false, // controlamos manualmente
      removalMode: false,
      rotateMode: false,
    })
    ;(map as any).pm.setGlobalOptions({ snappable: true, snapDistance: 10, allowSelfIntersection: false })
    return () => { ;(map as any).pm.removeControls() }
  }, [map, canEdit])

  useEffect(() => {
    if (!map) return
    if (!guidesLayerRef.current) guidesLayerRef.current = L.layerGroup().addTo(map)
    if (!orthogonalLayerRef.current) orthogonalLayerRef.current = L.layerGroup().addTo(map)
    if (!adHocLayerRef.current) adHocLayerRef.current = L.layerGroup().addTo(map)
    return () => {
      guidesLayerRef.current?.remove()
      orthogonalLayerRef.current?.remove()
      adHocLayerRef.current?.remove()
      guidesLayerRef.current = null
      orthogonalLayerRef.current = null
      adHocLayerRef.current = null
    }
  }, [map])

  // Listener de criação de geometria
  useEffect(() => {
    if (!map || !canEdit) return

    const onCreated = (e: any) => {
      const type = e.shape as string
      if (type === 'Polygon') {
        const geojson = (e.layer as L.Polygon).toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>
        setLastDrawnGeometry(geojson.geometry)
        setModal({ geometry: geojson.geometry, layer: e.layer })
        ;(map as any).pm.disableDraw()
        setModo('idle')
      }
      if (type === 'Line') {
        const geojson = (e.layer as L.Polyline).toGeoJSON() as GeoJSON.Feature<GeoJSON.LineString>
        if (modo === 'desmembrar' && selectedParcelaId) {
          map.removeLayer(e.layer)
          setDesmembrarState({ geometry: geojson.geometry, layer: e.layer })
          setDesmembrarCodigo('')
          ;(map as any).pm.disableDraw()
          return
        }
        if (modo === 'guias') {
          const layer = e.layer as L.Polyline
          layer.setStyle({ color: '#0284c7', weight: 2, dashArray: '8,8' })
          guidesLayerRef.current?.addLayer(layer)
          setModo('idle')
          toast.success('Linha guia adicionada')
          return
        }
        if (modo === 'ortogonal') {
          const layer = e.layer as L.Polyline
          layer.setStyle({ color: '#1d4ed8', weight: 2 })
          orthogonalLayerRef.current?.addLayer(layer)
          const orthoGeo = computeOrthogonalLine(geojson.geometry)
          if (orthoGeo) {
            L.geoJSON(orthoGeo, {
              style: { color: '#16a34a', weight: 2, dashArray: '4,6' },
            }).addTo(orthogonalLayerRef.current!)
          }
          setModo('idle')
          toast.success('Linha ortogonal gerada')
          return
        }
      }
    }

    map.on('pm:create', onCreated)
    return () => { map.off('pm:create', onCreated) }
  }, [map, canEdit, modo, selectedParcelaId])

  // Quando muda de modo — configura Geoman
  useEffect(() => {
    if (!map || !canEdit) return

    ;(map as any).pm.disableDraw()
    removeParcelaLayer()

    if (modo === 'nova') {
      ;(map as any).pm.enableDraw('Polygon')
      toast('Desenhe o polígono da nova parcela', { icon: '✏️', duration: 3000 })
    }

    if (modo === 'desmembrar') {
      if (!selectedParcelaId) {
        toast('Clique em um lote para selecionar e desmembrar', { icon: '✂️', duration: 5000 })
      } else {
        carregarParcelaParaEdicao(selectedParcelaId)
      }
    }

    if (modo === 'unificar') {
      setUnifyIds(selectedParcelaId ? [selectedParcelaId] : [])
      toast('Clique em parcelas no mapa para adicioná-las à seleção', { icon: '🔗', duration: 5000 })
    }

    if (modo === 'guias') {
      ;(map as any).pm.enableDraw('Line')
      toast('Desenhe uma linha guia no mapa', { icon: '📏', duration: 3000 })
    }

    if (modo === 'ortogonal') {
      ;(map as any).pm.enableDraw('Line')
      toast('Desenhe a linha base para gerar a ortogonal', { icon: '⊥', duration: 3000 })
    }
  }, [modo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map || !canEdit) return
    if (modo !== 'desmembrar' || !selectedParcelaId || desmembrarState) return
    carregarParcelaParaEdicao(selectedParcelaId)
  }, [map, canEdit, modo, selectedParcelaId, desmembrarState])

  function removeParcelaLayer() {
    if (parcelaLayerRef.current && map) {
      map.removeLayer(parcelaLayerRef.current)
      parcelaLayerRef.current = null
    }
  }

  async function carregarParcelaParaEdicao(id: string) {
    try {
      const res = await api.get(`/parcelas/${id}`)
      if (!res.data.geometry) { toast.error('Parcela sem geometria cadastrada'); setModo('idle'); return }

      removeParcelaLayer()
      const layer = L.geoJSON(res.data.geometry, {
        style: { color: '#dc2626', weight: 2.5, fillColor: '#fca5a5', fillOpacity: 0.4 },
      }).addTo(map!)
      parcelaLayerRef.current = layer
      map!.fitBounds(layer.getBounds(), { padding: [40, 40] })

      ;(map as any).pm.enableDraw('Line')
      toast('Desenhe uma linha para dividir a parcela', { icon: '✂️', duration: 5000 })
    } catch {
      toast.error('Erro ao carregar parcela'); setModo('idle')
    }
  }

  async function executarDesmembramento(parcelaId: string, linha: GeoJSON.LineString, novoCodigo: string) {
    removeParcelaLayer()
    if (desmembrarState) {
      map?.removeLayer(desmembrarState.layer)
    }
    setDesmembrarState(null)
    setDesmembrarCodigo('')
    try {
      const res = await api.post(`/parcelas/${parcelaId}/desmembrar`, {
        linhaGeoJSON: linha,
        novoCodigo,
      })
      toast.success(`Parcela desmembrada. Novo lote criado: ${novoCodigo}`)
      refreshMVT()
      selectParcela(null)
      return res.data
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Erro no desmembramento')
      throw e
    }
  }

  async function confirmarDesmembrar() {
    if (!selectedParcelaId || !desmembrarState) {
      toast.error('Selecione uma parcela antes de desmembrar')
      return
    }
    if (!desmembrarCodigo.trim()) {
      toast.error('Informe o código do novo lote')
      return
    }
    setSalvando(true)
    try {
      const resultado = await executarDesmembramento(selectedParcelaId, desmembrarState.geometry, desmembrarCodigo.trim())
      if (resultado?.novaId) {
        selectParcela(resultado.novaId)
      }
      setModo('idle')
    } finally {
      setSalvando(false)
    }
  }

  function cancelarDesmembrar() {
    if (desmembrarState) {
      map?.removeLayer(desmembrarState.layer)
      setDesmembrarState(null)
      setDesmembrarCodigo('')
    }
    setModo('idle')
  }

  function clearGuideLines() {
    guidesLayerRef.current?.clearLayers()
    toast.success('Linhas guia removidas')
  }

  function clearOrthogonalLines() {
    orthogonalLayerRef.current?.clearLayers()
    toast.success('Linhas ortogonais removidas')
  }

  function clearAdHocLayers() {
    adHocLayerRef.current?.clearLayers()
  }

  function drawXYGeometry() {
    try {
      const points = parseCoordinatesText(xyText)
      if (points.length < 2) {
        toast.error('Informe ao menos 2 vértices.')
        return
      }
      const geometry: GeoJSON.Geometry = xyShapeType === 'polygon'
        ? { type: 'Polygon', coordinates: [closePolygonCoords(points)] }
        : { type: 'LineString', coordinates: points }
      clearAdHocLayers()
      L.geoJSON(geometry, {
        style: { color: '#9333ea', weight: 3, fillColor: '#ede9fe', fillOpacity: 0.3 },
      }).addTo(adHocLayerRef.current!)
      setXyModalOpen(false)
      setXyText('')
      setModo('idle')
      toast.success(`Geometria ${xyShapeType === 'polygon' ? 'de polígono' : 'de linha'} criada`) 
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao gerar geometria')
    }
  }

  function drawAzimuteGeometry() {
    try {
      const origin = parseCoordinatesText(azimuteOrigin)
      if (origin.length !== 1) {
        toast.error('Informe a origem como um único par X,Y.')
        return
      }
      const base = origin[0]
      const instructions = azimuteText
        .split(/\n|\r/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const parts = line.split(/[,;\s]+/).map(Number)
          if (parts.length !== 2 || parts.some(Number.isNaN)) {
            throw new Error(`Linha inválida: ${line}`)
          }
          return { bearing: parts[0], distance: parts[1] }
        })
      if (instructions.length === 0) {
        toast.error('Informe ao menos um azimute e distância.')
        return
      }
      const coords: [number, number][] = [base]
      for (const step of instructions) {
        const next = destinationPoint(coords[coords.length - 1], step.bearing, step.distance)
        coords.push(next)
      }
      const geometry: GeoJSON.Geometry = azimuteClose && coords.length >= 3
        ? { type: 'Polygon', coordinates: [closePolygonCoords(coords)] }
        : { type: 'LineString', coordinates: coords }
      clearAdHocLayers()
      L.geoJSON(geometry, {
        style: { color: '#0f766e', weight: 3, fillColor: '#ccfbf1', fillOpacity: 0.25 },
      }).addTo(adHocLayerRef.current!)
      setAzimuteModalOpen(false)
      setAzimuteOrigin('')
      setAzimuteText('')
      setModo('idle')
      toast.success(`Geometria por azimutes criada`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao gerar azimutes')
    }
  }

  // Clique no mapa em modo unificar — captura ID da parcela
  async function executarUnificacao() {
    const ids = multiSelectedParcelas.map(p => p.id)
    if (ids.length < 2) { toast.error('Selecione ao menos 2 parcelas'); return }
    if (!unifyCodigo.trim()) { toast.error('Informe o novo código/matrícula'); return }
    setSalvando(true)
    try {
      const res = await api.post('/parcelas/unificar', { parcelaIds: ids, novoCodigo: unifyCodigo.trim() })
      toast.success('Parcelas unificadas ✓')
      selectParcela(res.data.id)
      clearMultiSelect()
      setUnifyCodigo('')
      setUnifyModalOpen(false)
      setModo('idle')
      refreshMVT()
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Erro na unificação')
    } finally {
      setSalvando(false)
    }
  }

  // Abre modal — carrega bairros e auto-detecta pelo centróide do polígono
  useEffect(() => {
    if (!modal) return

    Promise.all([
      api.get('/bairros').then(r => r.data?.data ?? []),
      api.get('/camadas').then(r => r.data ?? []),
    ]).then(([listaBairros, listaCamadas]) => {
      setBairros(listaBairros)
      setCamadas(listaCamadas)

      // Auto-detecção: centróide do polígono desenhado → ponto-em-polígono com os bairros
      if (modal.geometry?.type === 'Polygon') {
        const coords = (modal.geometry as GeoJSON.Polygon).coordinates[0]
        const centro = polyCentroid(coords) // [lng, lat]
        const match = listaBairros.find((b: any) => ptInGeom(centro, b.geometry))
        if (match) setForm(f => ({ ...f, bairroId: match.id, bairroNome: match.nome }))
      }
    })
  }, [modal])

  async function salvarNovaParcela() {
    if (!modal || !form.codigo) { toast.error('Código é obrigatório'); return }
    setSalvando(true)
    try {
      const res = await api.post('/parcelas', {
        codigo: form.codigo,
        bairroId: form.bairroId || undefined,
        camadaId: form.camadaId || undefined,
        geometry: modal.geometry,
      })
      map?.removeLayer(modal.layer)
      setModal(null)
      setForm({ codigo: '', bairroId: '', bairroNome: '', camadaId: '' })
      selectParcela(res.data.id)
      refreshMVT()
      toast.success(`Parcela ${form.codigo} criada ✓`)
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Erro ao criar parcela')
    } finally {
      setSalvando(false)
    }
  }

  function cancelarModal() {
    if (modal) map?.removeLayer(modal.layer)
    setModal(null)
    setForm({ codigo: '', bairroId: '', bairroNome: '', camadaId: '' })
  }

  async function clonarParcela() {
    if (!selectedParcelaId) return
    setSalvando(true)
    try {
      const res = await api.get(`/parcelas/${selectedParcelaId}`)
      const geom: GeoJSON.Polygon = res.data.geometry
      if (!geom?.coordinates?.[0]) { toast.error('Parcela sem geometria'); return }

      const OFFSET = 0.0002
      const novasCoords = geom.coordinates[0].map(
        ([lng, lat]: number[]) => [lng + OFFSET, lat + OFFSET]
      )
      const novaGeom: GeoJSON.Polygon = { type: 'Polygon', coordinates: [novasCoords] }
      const novoCodigo = `${res.data.codigo}-CLONE`

      const nova = await api.post('/parcelas', { codigo: novoCodigo, geometry: novaGeom })
      selectParcela(nova.data.id)
      refreshMVT()
      toast.success(`Parcela clonada: ${novoCodigo}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Erro ao clonar parcela')
    } finally {
      setSalvando(false)
      setModo('idle')
    }
  }

  async function espelharParcela(eixo: 'H' | 'V') {
    if (!selectedParcelaId) return
    setSalvando(true)
    try {
      const res = await api.get(`/parcelas/${selectedParcelaId}`)
      const geom: GeoJSON.Polygon = res.data.geometry
      if (!geom?.coordinates?.[0]) { toast.error('Parcela sem geometria'); return }

      const ring = geom.coordinates[0] as [number, number][]
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length

      const espelhado = ring.map(([lng, lat]: [number, number]) =>
        eixo === 'H' ? [cx * 2 - lng, lat] : [lng, cy * 2 - lat]
      )
      const novaGeom: GeoJSON.Polygon = { type: 'Polygon', coordinates: [espelhado] }
      const novoCodigo = `${res.data.codigo}-ESP${eixo}`

      const nova = await api.post('/parcelas', { codigo: novoCodigo, geometry: novaGeom })
      selectParcela(nova.data.id)
      refreshMVT()
      toast.success(`Parcela espelhada (${eixo}): ${novoCodigo}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Erro ao espelhar parcela')
    } finally {
      setSalvando(false)
      setEspelharModalOpen(false)
      setModo('idle')
    }
  }

  if (!canEdit) return null

  return (
    <>
      {/* Barra de ferramentas de edição — abaixo dos controles Geoman */}
      <div style={{
        position: 'absolute',
        top: 260,
        left: 10,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Parcelas
        </p>

        {/* Nova parcela */}
        <BotaoFerramenta
          label="Nova parcela"
          icon="⬡"
          ativo={modo === 'nova'}
          onClick={() => setModo(m => m === 'nova' ? 'idle' : 'nova')}
          title="Desenhar novo lote/parcela"
        />

        {/* Desmembrar */}
        <BotaoFerramenta
          label="Desmembrar"
          icon="✂"
          ativo={modo === 'desmembrar'}
          onClick={() => {
            if (!selectedParcelaId) return
            setModo(m => m === 'desmembrar' ? 'idle' : 'desmembrar')
          }}
          title="Dividir a parcela selecionada com uma linha"
          disabled={!selectedParcelaId}
        />

        {/* Unificar */}
        <BotaoFerramenta
          label="Unificar (Ctrl+Click)"
          icon="⊞"
          ativo={false}
          onClick={() => toast.info('Para unificar parcelas, segure a tecla CTRL e clique nas parcelas desejadas no mapa.')}
          title="Segure CTRL e clique nas parcelas para unificar"
        />

        {/* Linha guia */}
        <BotaoFerramenta
          label="Linha guia"
          icon="—"
          ativo={modo === 'guias'}
          onClick={() => setModo(m => m === 'guias' ? 'idle' : 'guias')}
          title="Desenhar linha guia para auxiliar no desenho"
        />

        {/* Ortogonal */}
        <BotaoFerramenta
          label="Ortogonal"
          icon="⊥"
          ativo={modo === 'ortogonal'}
          onClick={() => setModo(m => m === 'ortogonal' ? 'idle' : 'ortogonal')}
          title="Desenhar linha base e gerar linha ortogonal"
        />

        {/* Entrada XY */}
        <BotaoFerramenta
          label="Entrada XY"
          icon="XY"
          ativo={xyModalOpen}
          onClick={() => {
            setModo('idle')
            setXyModalOpen(true)
          }}
          title="Criar geometria a partir de coordenadas"
        />

        {/* Azimutes */}
        <BotaoFerramenta
          label="Azimutes"
          icon="∠"
          ativo={azimuteModalOpen}
          onClick={() => {
            setModo('idle')
            setAzimuteModalOpen(true)
          }}
          title="Criar geometria por azimutes + distâncias"
        />

        {/* Clonar */}
        <BotaoFerramenta
          label="Clonar"
          icon="⎘"
          ativo={modo === 'clonar'}
          onClick={() => {
            if (!selectedParcelaId) return
            setModo('clonar')
            clonarParcela()
          }}
          title="Clonar parcela selecionada com offset"
          disabled={!selectedParcelaId || salvando}
        />

        {/* Espelhar */}
        <BotaoFerramenta
          label="Espelhar"
          icon="⇔"
          ativo={espelharModalOpen}
          onClick={() => {
            if (!selectedParcelaId) return
            setEspelharModalOpen(true)
          }}
          title="Espelhar parcela em relação ao centróide"
          disabled={!selectedParcelaId || salvando}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            onClick={clearGuideLines}
            style={{ ...buttonSmallStyle, background: '#eff6ff', color: '#1d4ed8' }}
            type="button"
          >Limpar guias</button>
          <button
            onClick={clearOrthogonalLines}
            style={{ ...buttonSmallStyle, background: '#ecfdf5', color: '#0f766e' }}
            type="button"
          >Limpar ortogonais</button>
        </div>

        {/* FAB de Unificação */}
        {multiSelectedParcelas.length >= 2 && !unifyModalOpen && (
          <div style={{
            position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
            background: '#1e3a5f', padding: '10px 20px', borderRadius: 30,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex', gap: 12, alignItems: 'center', zIndex: 9999
          }}>
            <span style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>
              {multiSelectedParcelas.length} parcelas selecionadas
            </span>
            <button
              onClick={() => setUnifyModalOpen(true)}
              style={{
                background: '#10b981', color: 'white', border: 'none', borderRadius: 20,
                padding: '6px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13
              }}
            >
              Unificar Lotes
            </button>
            <button
              onClick={clearMultiSelect}
              style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
              title="Cancelar seleção"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal de Confirmação da Unificação */}
        {unifyModalOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 10000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
          }}>
            <div style={{
              background: 'white', padding: 24, borderRadius: 12, width: 400,
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
              <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Unificar Parcelas</h3>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#4b5563' }}>
                Você quer unificar os {multiSelectedParcelas.length} lotes abaixo?
              </p>
              <div style={{ background: '#f3f4f6', padding: 12, borderRadius: 8, maxHeight: 150, overflowY: 'auto', marginBottom: 16 }}>
                {multiSelectedParcelas.map(p => (
                  <div key={p.id} style={{ fontSize: 13, fontFamily: 'monospace', color: '#374151', marginBottom: 4 }}>
                    • Código: {p.codigo}
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Novo Código / Matrícula
                </label>
                <input
                  type="text"
                  value={unifyCodigo}
                  onChange={e => setUnifyCodigo(e.target.value)}
                  placeholder="Ex: 99999"
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  onClick={() => setUnifyModalOpen(false)}
                  style={{ padding: '8px 16px', background: 'none', border: 'none', color: '#6b7280', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={executarUnificacao}
                  disabled={salvando || !unifyCodigo.trim()}
                  style={{
                    padding: '8px 20px', borderRadius: 6, border: 'none', fontWeight: 600,
                    background: unifyCodigo.trim() ? '#10b981' : '#e5e7eb',
                    color: unifyCodigo.trim() ? 'white' : '#9ca3af',
                    cursor: unifyCodigo.trim() ? 'pointer' : 'default'
                  }}
                >
                  {salvando ? 'Salvando...' : 'Salvar Unificação'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Parcela selecionada */}
        {selectedParcelaId && modo === 'idle' && (
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: 8, width: 180, border: '1px solid #bfdbfe', fontSize: 11 }}>
            <p style={{ margin: '0 0 2px', fontWeight: 700, color: '#1d4ed8' }}>Parcela selecionada</p>
            <p style={{ margin: '0 0 6px', fontFamily: 'monospace', color: '#374151' }}>{selectedParcelaId.slice(0, 8)}…</p>
            <button onClick={() => selectParcela(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 11, padding: 0 }}>
              Desselecionar ✕
            </button>
          </div>
        )}
      </div>

      {/* Modal — nova parcela */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 28, width: 420,
            boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e3a5f', fontSize: 18 }}>Nova Parcela / Lote</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Campo label="Código *">
                <input
                  autoFocus
                  value={form.codigo}
                  onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                  placeholder="ex: 01-02-003"
                  style={inputSt}
                />
              </Campo>

              {/* Bairro detectado automaticamente pela posição do lote */}
              <Campo label="Bairro (detectado automaticamente)">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {form.bairroNome ? (
                    <span style={{
                      flex: 1, padding: '9px 12px', background: '#f0fdf4',
                      border: '1px solid #86efac', borderRadius: 8, fontSize: 14,
                      color: '#14532d', fontWeight: 600,
                    }}>
                      ✓ {form.bairroNome}
                    </span>
                  ) : (
                    <span style={{
                      flex: 1, padding: '9px 12px', background: '#fffbeb',
                      border: '1px solid #fcd34d', borderRadius: 8, fontSize: 13, color: '#92400e',
                    }}>
                      Fora dos bairros cadastrados
                    </span>
                  )}
                  <select
                    value={form.bairroId}
                    onChange={e => {
                      const b = bairros.find(x => x.id === e.target.value)
                      setForm(f => ({ ...f, bairroId: e.target.value, bairroNome: b?.nome ?? '' }))
                    }}
                    style={{ ...inputSt, width: 'auto', fontSize: 12, padding: '4px 8px' }}
                    title="Corrigir bairro manualmente"
                  >
                    <option value="">Corrigir</option>
                    {bairros.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                  </select>
                </div>
              </Campo>

              {/* Camada vetorial (opcional) */}
              <Campo label="Camada (opcional)">
                <select value={form.camadaId} onChange={e => setForm(f => ({ ...f, camadaId: e.target.value }))} style={inputSt}>
                  <option value="">— Sem camada —</option>
                  {camadas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={cancelarModal} style={btnSec}>Cancelar</button>
              <button
                onClick={salvarNovaParcela}
                disabled={!form.codigo || salvando}
                style={{ ...btnPri, opacity: !form.codigo || salvando ? 0.6 : 1 }}
              >
                {salvando ? 'Salvando...' : '✓ Salvar parcela'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — entrada XY de vértices */}
      {xyModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 460, boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e3a5f', fontSize: 18 }}>Entrada de coordenadas XY</h3>
            <p style={{ margin: '0 0 16px', color: '#374151', fontSize: 13 }}>
              Informe cada vértice em uma linha no formato <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: 4 }}>lng, lat</code>.
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                Tipo de geometria
                <select value={xyShapeType} onChange={(e) => setXyShapeType(e.target.value as 'polygon' | 'line')} style={inputSt}>
                  <option value="polygon">Polígono</option>
                  <option value="line">Linha</option>
                </select>
              </label>
            </div>
            <textarea
              value={xyText}
              onChange={(e) => setXyText(e.target.value)}
              placeholder="-53.8389, -29.0803\n-53.8390, -29.0810\n-53.8380, -29.0815"
              style={{ ...inputSt, minHeight: 140, fontFamily: 'monospace' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setXyModalOpen(false)} style={btnSec}>Cancelar</button>
              <button onClick={drawXYGeometry} style={btnPri}>Desenhar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — azimutes */}
      {azimuteModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 460, boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e3a5f', fontSize: 18 }}>Geometria por azimutes</h3>
            <p style={{ margin: '0 0 16px', color: '#374151', fontSize: 13 }}>
              Informe a origem em <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: 4 }}>lng, lat</code> e cada linha contendo <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: 4 }}>azimute, distância(m)</code>.
            </p>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Origem (lng, lat)
              <input value={azimuteOrigin} onChange={(e) => setAzimuteOrigin(e.target.value)} placeholder="-53.8389, -29.0803" style={inputSt} />
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Azimutes + distância
              <textarea
                value={azimuteText}
                onChange={(e) => setAzimuteText(e.target.value)}
                placeholder="45, 50\n90, 30\n180, 20"
                style={{ ...inputSt, minHeight: 120, fontFamily: 'monospace' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 12, color: '#374151' }}>
              <input type="checkbox" checked={azimuteClose} onChange={(e) => setAzimuteClose(e.target.checked)} />
              Fechar como polígono quando possível
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setAzimuteModalOpen(false)} style={btnSec}>Cancelar</button>
              <button onClick={drawAzimuteGeometry} style={btnPri}>Desenhar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — código do novo lote ao desmembrar */}
      {desmembrarState && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 28, width: 420,
            boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e3a5f', fontSize: 18 }}>Desmembrar parcela</h3>
            <p style={{ margin: '0 0 18px', color: '#374151', fontSize: 13 }}>
              Informe o código do novo lote que será destacado da parcela original.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Campo label="Parcela original">
                <input value={selectedParcelaId ?? ''} readOnly style={{ ...inputSt, background: '#f8fafc' }} />
              </Campo>
              <Campo label="Código do novo lote *">
                <input
                  autoFocus
                  value={desmembrarCodigo}
                  onChange={e => setDesmembrarCodigo(e.target.value)}
                  placeholder="Ex: 01-02-003-A"
                  style={inputSt}
                />
              </Campo>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={cancelarDesmembrar} style={btnSec}>Cancelar</button>
              <button
                onClick={confirmarDesmembrar}
                disabled={!desmembrarCodigo || salvando}
                style={{ ...btnPri, opacity: !desmembrarCodigo || salvando ? 0.6 : 1 }}
              >
                {salvando ? 'Salvando...' : '✓ Salvar desmembramento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — espelhar parcela */}
      {espelharModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 28, width: 360,
            boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f', fontSize: 18 }}>Espelhar parcela</h3>
            <p style={{ margin: '0 0 18px', color: '#374151', fontSize: 13 }}>
              Escolha o eixo de espelhamento em relação ao centróide da parcela.
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <button
                onClick={() => setEspelharEixo('H')}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, border: '2px solid',
                  borderColor: espelharEixo === 'H' ? '#1e3a5f' : '#d1d5db',
                  background: espelharEixo === 'H' ? '#eff6ff' : 'white',
                  cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#1e3a5f',
                }}
              >
                ↔ Horizontal
              </button>
              <button
                onClick={() => setEspelharEixo('V')}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, border: '2px solid',
                  borderColor: espelharEixo === 'V' ? '#1e3a5f' : '#d1d5db',
                  background: espelharEixo === 'V' ? '#eff6ff' : 'white',
                  cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#1e3a5f',
                }}
              >
                ↕ Vertical
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEspelharModalOpen(false)} style={btnSec}>Cancelar</button>
              <button
                onClick={() => espelharParcela(espelharEixo)}
                disabled={salvando}
                style={{ ...btnPri, opacity: salvando ? 0.6 : 1 }}
              >
                {salvando ? 'Salvando...' : '✓ Espelhar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function BotaoFerramenta({
  label, icon, ativo, onClick, title, disabled = false,
}: {
  label: string; icon: string; ativo: boolean
  onClick: () => void; title: string; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: ativo ? '#1e3a5f' : 'white',
        color: ativo ? 'white' : disabled ? '#9ca3af' : '#374151',
        fontSize: 12, fontWeight: ativo ? 700 : 500,
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        transition: 'background 0.15s',
        width: 150,
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #d1d5db',
  borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
}
const buttonSmallStyle: React.CSSProperties = {
  width: '100%', border: '1px solid rgba(148, 163, 184, 0.4)', borderRadius: 8,
  padding: '8px 10px', fontSize: 12, cursor: 'pointer', textAlign: 'center',
}
const btnPri: React.CSSProperties = {
  background: '#1e3a5f', color: 'white', border: 'none',
  padding: '9px 22px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
}
const btnSec: React.CSSProperties = {
  background: 'white', color: '#374151', border: '1px solid #d1d5db',
  padding: '9px 22px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
}
