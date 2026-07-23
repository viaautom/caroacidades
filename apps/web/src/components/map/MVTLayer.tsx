import { useEffect } from 'react'
import L from 'leaflet'
import 'leaflet.vectorgrid'
import { useQuery } from '@tanstack/react-query'
import { useMapStore } from '../../store/map.store'
import api from '../../lib/api'

const PG_TILESERV = import.meta.env.VITE_PG_TILESERV_URL ?? '/tiles'

type CamadaWms = {
  id: string
  nome: string
  url: string
  camada_wms: string
  formato: string
  transparente: boolean
  opacidade: number
  ativa: boolean
}

// Estilo por situação da parcela / edificação
const PARCELA_STYLE = {
  weight: 1.5,
  color: '#2563eb',
  fill: true,
  fillColor: '#93c5fd',
  fillOpacity: 0.15,
}

const PARCELA_SELECTED = {
  ...PARCELA_STYLE,
  color: '#dc2626',
  fillColor: '#fca5a5',
  fillOpacity: 0.25,
  weight: 2.5,
}

const POSTE_COLORS: Record<string, string> = {
  normal: '#22c55e',
  defeito: '#ef4444',
  em_manutencao: '#f59e0b',
}

// Cores por situação da árvore (req 77: com_solicitacao, req 82: em_manutencao)
const ARVORE_COLORS: Record<string, string> = {
  normal:           '#16a34a',
  com_solicitacao:  '#f59e0b',
  em_manutencao:    '#3b82f6',
}

// Cores por situação de recadastramento (req 07)
const REC_FILL: Record<string, string> = {
  pendente:      '#9ca3af',  // cinza
  visitado:      '#f59e0b',  // amarelo
  recadastrado:  '#22c55e',  // verde
  impedido:      '#ef4444',  // vermelho
}
const REC_BORDER: Record<string, string> = {
  pendente:      '#6b7280',
  visitado:      '#d97706',
  recadastrado:  '#16a34a',
  impedido:      '#dc2626',
}

// Cores por situação da edificação (req 20/21/26)
const EDIFICACAO_FILL: Record<string, string> = {
  regular:        '#10b981',
  irregular:      '#ef4444',
  em_construcao:  '#3b82f6',
  demolida:       '#6b7280',
  terreno_vazio:  '#9ca3af',
}
const EDIFICACAO_BORDER: Record<string, string> = {
  regular:        '#059669',
  irregular:      '#b91c1c',
  em_construcao:  '#1d4ed8',
  demolida:       '#374151',
  terreno_vazio:  '#6b7280',
}

// Cores por situação do processo de REURB (req 207)
const REURB_FILL: Record<string, string> = {
  rascunho:   '#9ca3af',
  aberto:     '#3b82f6',
  em_analise: '#f59e0b',
  aprovado:   '#10b981',
  reprovado:  '#ef4444',
}
const REURB_BORDER: Record<string, string> = {
  rascunho:   '#6b7280',
  aberto:     '#1d4ed8',
  em_analise: '#d97706',
  aprovado:   '#059669',
  reprovado:  '#dc2626',
}

export function MVTLayer() {
  const { 
    map, 
    activeLayers, 
    selectParcela, 
    selectedParcelaId, 
    multiSelectedParcelas,
    toggleMultiSelect,
    clearMultiSelect,
    mvtRefreshKey, 
    postesRefreshKey, 
    arvoresRefreshKey, 
    selectPoste, 
    selectArvore 
  } = useMapStore()

  const { data: camadasWms = [] } = useQuery<CamadaWms[]>({
    queryKey: ['camadas-wms'],
    queryFn: () => api.get('/camadas-wms').then(r => r.data),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!map) return

    // mvtRefreshKey força re-criação do layer após salvar nova parcela (cache-buster na URL)
    const parcelasLayer = (L as any).vectorGrid?.protobuf(
      `${PG_TILESERV}/sigweb.parcelas/{z}/{x}/{y}.pbf?v=${mvtRefreshKey}`,
      {
        vectorTileLayerStyles: {
          'sigweb.parcelas': (props: any) => {
            const id = String(props.id)
            if (id === selectedParcelaId || multiSelectedParcelas.some(p => p.id === id)) return PARCELA_SELECTED
            return PARCELA_STYLE
          }
        },
        interactive: true,
        getFeatureId: (f: any) => f.properties?.id ?? f.id,
      }
    )

    if (parcelasLayer && activeLayers.includes('parcelas')) {
      parcelasLayer.addTo(map)
      parcelasLayer.on('click', (e: any) => {
        const id = e.layer?.properties?.id ?? e.layer?.feature?.properties?.id ?? e.feature?.properties?.id ?? e.feature?.id ?? e.layer?.feature?.id ?? e.id
        const codigo = e.layer?.properties?.codigo ?? e.layer?.feature?.properties?.codigo ?? e.feature?.properties?.codigo ?? 'S/C'
        
        const isCtrl = e.originalEvent?.ctrlKey || e.originalEvent?.metaKey
        
        if (id) {
          if (isCtrl) {
            toggleMultiSelect(String(id), String(codigo))
          } else {
            selectParcela(String(id))
            clearMultiSelect()
          }
        }
      })
    }

    return () => {
      if (parcelasLayer) map.removeLayer(parcelasLayer)
    }
  }, [map, activeLayers, selectedParcelaId, multiSelectedParcelas, mvtRefreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Camada de edificações (quando ativa) — coloridas por situação (req 20/21/26)
  useEffect(() => {
    if (!map || !activeLayers.includes('edificacoes')) return

    const edificacoesLayer = (L as any).vectorGrid?.protobuf(
      `${PG_TILESERV}/sigweb.edificacoes/{z}/{x}/{y}.pbf`,
      {
        vectorTileLayerStyles: {
          'sigweb.edificacoes': (props: any) => ({
            weight: props.situacao === 'irregular' ? 2.5 : 1.5,
            color: EDIFICACAO_BORDER[props.situacao] ?? EDIFICACAO_BORDER.regular,
            fill: true,
            fillColor: EDIFICACAO_FILL[props.situacao] ?? EDIFICACAO_FILL.regular,
            fillOpacity: props.situacao === 'irregular' ? 0.65 : 0.45,
          }),
        },
        interactive: false,
      }
    )

    if (edificacoesLayer) edificacoesLayer.addTo(map)
    return () => { if (edificacoesLayer) map.removeLayer(edificacoesLayer) }
  }, [map, activeLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Camada de postes (quando ativa) — click → selectPoste (req 59, 64, 69)
  // postesRefreshKey garante que tiles são recarregados após criar/atualizar OS (req 61, 66)
  useEffect(() => {
    if (!map || !activeLayers.includes('postes')) return

    const postesLayer = (L as any).vectorGrid?.protobuf(
      `${PG_TILESERV}/sigweb.postes/{z}/{x}/{y}.pbf?v=${postesRefreshKey}`,
      {
        vectorTileLayerStyles: {
          'sigweb.postes': (props: any) => ({
            radius: 5,
            fillColor: POSTE_COLORS[props.situacao] ?? '#6b7280',
            color: '#fff',
            weight: 1,
            fillOpacity: 0.9,
          }),
        },
        interactive: true,
        getFeatureId: (f: any) => f.properties?.id ?? f.id,
      }
    )

    if (postesLayer) {
      postesLayer.addTo(map)
      postesLayer.on('click', (e: any) => {
        const id = e.layer?.properties?.id ?? e.feature?.properties?.id ?? e.feature?.id
        if (id) selectPoste(String(id))
      })
    }
    return () => { if (postesLayer) map.removeLayer(postesLayer) }
  }, [map, activeLayers, postesRefreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Camada de recadastramento (req 07) — parcelas coloridas por situação do BIC mais recente
  useEffect(() => {
    if (!map || !activeLayers.includes('recadastramento')) return

    const recLayer = (L as any).vectorGrid?.protobuf(
      `${PG_TILESERV}/sigweb.v_parcelas_recadastramento/{z}/{x}/{y}.pbf`,
      {
        vectorTileLayerStyles: {
          'sigweb.v_parcelas_recadastramento': (props: any) => ({
            weight: 1.5,
            color: REC_BORDER[props.situacao] ?? REC_BORDER.pendente,
            fill: true,
            fillColor: REC_FILL[props.situacao] ?? REC_FILL.pendente,
            fillOpacity: 0.55,
          }),
        },
        interactive: false,
      }
    )

    if (recLayer) recLayer.addTo(map)
    return () => { if (recLayer) map.removeLayer(recLayer) }
  }, [map, activeLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Camada de lotes em processo de REURB (req 207) — coloridos pela situação do processo
  useEffect(() => {
    if (!map || !activeLayers.includes('reurb')) return

    const reurbLayer = (L as any).vectorGrid?.protobuf(
      `${PG_TILESERV}/sigweb.v_lotes_reurb/{z}/{x}/{y}.pbf`,
      {
        vectorTileLayerStyles: {
          'sigweb.v_lotes_reurb': (props: any) => ({
            weight: 2,
            color: REURB_BORDER[props.processo_situacao] ?? REURB_BORDER.aberto,
            fill: true,
            fillColor: REURB_FILL[props.processo_situacao] ?? REURB_FILL.aberto,
            fillOpacity: 0.6,
          }),
        },
        interactive: false,
      }
    )

    if (reurbLayer) reurbLayer.addTo(map)
    return () => { if (reurbLayer) map.removeLayer(reurbLayer) }
  }, [map, activeLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Camadas WMS externas/temáticas ativas (req 22)
  useEffect(() => {
    if (!map) return
    const ativas = camadasWms.filter(c => activeLayers.includes(`wms:${c.id}`))
    const layers = ativas.map(c => L.tileLayer.wms(c.url, {
      layers: c.camada_wms,
      format: c.formato,
      transparent: c.transparente,
      opacity: Number(c.opacidade),
    }))
    layers.forEach(l => l.addTo(map))
    return () => { layers.forEach(l => map.removeLayer(l)) }
  }, [map, activeLayers, camadasWms])

  // Camada de árvores (quando ativa) — click → selectArvore (req 75, 80, 85)
  // Coloridas por situação: verde=normal, laranja=com_solicitacao, azul=em_manutencao (req 77, 82)
  // arvoresRefreshKey garante reload após criar/atualizar OS
  useEffect(() => {
    if (!map || !activeLayers.includes('arvores')) return

    const arvoresLayer = (L as any).vectorGrid?.protobuf(
      `${PG_TILESERV}/sigweb.arvores/{z}/{x}/{y}.pbf?v=${arvoresRefreshKey}`,
      {
        vectorTileLayerStyles: {
          'sigweb.arvores': (props: any) => ({
            radius: 5,
            fillColor: ARVORE_COLORS[props.situacao] ?? ARVORE_COLORS.normal,
            color: '#fff',
            weight: 1,
            fillOpacity: 0.85,
          }),
        },
        interactive: true,
        getFeatureId: (f: any) => f.properties?.id ?? f.id,
      }
    )

    if (arvoresLayer) {
      arvoresLayer.addTo(map)
      arvoresLayer.on('click', (e: any) => {
        const id = e.layer?.properties?.id ?? e.feature?.properties?.id ?? e.feature?.id
        if (id) selectArvore(String(id))
      })
    }
    return () => { if (arvoresLayer) map.removeLayer(arvoresLayer) }
  }, [map, activeLayers, arvoresRefreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
