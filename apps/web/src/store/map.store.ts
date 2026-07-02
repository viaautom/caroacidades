import { create } from 'zustand'
import type { Map as LeafletMap } from 'leaflet'

export type BaseLayerId = 'osm' | 'google_maps' | 'google_satellite' | 'topografia'

export type BairroInfo = {
  id: string
  nome: string
  bounds: [[number, number], [number, number]]
}

export type PendingTarget = { lat: number; lng: number; zoom?: number }

// Centro/zoom padrão ao iniciar o sistema — destaca o município de Tupanciretã
export const MUNICIPIO_CENTER: [number, number] = [-29.0803, -53.8389]
export const MUNICIPIO_ZOOM = 15

type MapState = {
  map: LeafletMap | null
  selectedParcelaId: string | null
  selectedPosteId: string | null
  selectedArvoreId: string | null
  selectedPatrimonioId: string | null
  activeLayers: string[]
  baseLayer: BaseLayerId
  bairros: BairroInfo[]
  layerPanelOpen: boolean
  mvtRefreshKey: number
  postesRefreshKey: number
  arvoresRefreshKey: number
  pendingTarget: PendingTarget | null
  lastDrawnGeometry: GeoJSON.Geometry | null
  setMap: (map: LeafletMap | null) => void
  setBaseLayer: (baseLayer: BaseLayerId) => void
  selectParcela: (id: string | null) => void
  selectPoste: (id: string | null) => void
  selectArvore: (id: string | null) => void
  selectPatrimonio: (id: string | null) => void
  toggleLayer: (layerId: string) => void
  setLayerPanelOpen: (open: boolean) => void
  flyTo: (lat: number, lng: number, zoom?: number) => void
  flyToFeature: (lat: number, lng: number, layerId?: string, zoom?: number) => void
  setPendingTarget: (target: PendingTarget | null) => void
  recentralizar: () => void
  setBairros: (bairros: BairroInfo[]) => void
  zoomToBairro: (bounds: [[number, number], [number, number]]) => void
  refreshMVT: () => void
  refreshPostes: () => void
  refreshArvores: () => void
  setLastDrawnGeometry: (geom: GeoJSON.Geometry | null) => void
}

export const useMapStore = create<MapState>((set, get) => ({
  map: null,
  selectedParcelaId: null,
  selectedPosteId: null,
  selectedArvoreId: null,
  selectedPatrimonioId: null,
  activeLayers: ['parcelas', 'edificacoes', 'bairros'],
  baseLayer: 'osm',
  bairros: [],
  layerPanelOpen: true,
  mvtRefreshKey: 0,
  postesRefreshKey: 0,
  arvoresRefreshKey: 0,
  pendingTarget: null,
  lastDrawnGeometry: null,
  setMap: (map) => set({ map }),
  setBaseLayer: (baseLayer) => set({ baseLayer }),
  selectParcela: (id) => set({ selectedParcelaId: id }),
  selectPoste: (id) => set({ selectedPosteId: id }),
  selectArvore: (id) => set({ selectedArvoreId: id }),
  selectPatrimonio: (id) => set({ selectedPatrimonioId: id }),
  toggleLayer: (layerId) =>
    set((state) => ({
      activeLayers: state.activeLayers.includes(layerId)
        ? state.activeLayers.filter((l) => l !== layerId)
        : [...state.activeLayers, layerId],
    })),
  setLayerPanelOpen: (open) => set({ layerPanelOpen: open }),
  flyTo: (lat, lng, zoom = 18) => {
    get().map?.flyTo([lat, lng], zoom, { animate: true, duration: 0.8 })
  },
  flyToFeature: (lat, lng, layerId, zoom = 18) => {
    const { map, activeLayers, toggleLayer } = get()
    if (layerId && !activeLayers.includes(layerId)) toggleLayer(layerId)
    if (map) {
      map.flyTo([lat, lng], zoom, { animate: true, duration: 0.8 })
    } else {
      set({ pendingTarget: { lat, lng, zoom } })
    }
  },
  setPendingTarget: (target) => set({ pendingTarget: target }),
  // req: botão "Recentralizar Mapa" — volta à visão inicial que destaca o município
  recentralizar: () => {
    const { map, flyTo } = get()
    if (map) flyTo(MUNICIPIO_CENTER[0], MUNICIPIO_CENTER[1], MUNICIPIO_ZOOM)
    else set({ pendingTarget: { lat: MUNICIPIO_CENTER[0], lng: MUNICIPIO_CENTER[1], zoom: MUNICIPIO_ZOOM } })
  },
  setBairros: (bairros) => set({ bairros }),
  zoomToBairro: (bounds) => {
    get().map?.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true })
  },
  refreshMVT: () => set((state) => ({ mvtRefreshKey: state.mvtRefreshKey + 1 })),
  refreshPostes: () => set((state) => ({ postesRefreshKey: state.postesRefreshKey + 1 })),
  refreshArvores: () => set((state) => ({ arvoresRefreshKey: state.arvoresRefreshKey + 1 })),
  setLastDrawnGeometry: (geom) => set({ lastDrawnGeometry: geom }),
}))
