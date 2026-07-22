import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useMapStore, BaseLayerId } from '../../store/map.store'
import { MVTLayer } from './MVTLayer'
import { EditToolbar } from './EditToolbar'
import { LayerControl } from './LayerControl'
import { CamadasPanel } from './CamadasPanel'
import { BairrosLayer } from './BairrosLayer'
import { StreetView360 } from './StreetView360'
import { CamadasVetoriaisLayer } from './CamadasVetoriaisLayer'
import { PgvLayer } from './PgvLayer'
import { PatrimonioLayer } from './PatrimonioLayer'
import { BaseLayerSwitcher } from './BaseLayerSwitcher'
import { BufferToolbar } from './BufferToolbar'
import { PrintControl } from './PrintControl'

// Tile configs. Google Satélite bloqueia por Referer em produção —
// usa ESRI World Imagery que é público e não requer API key.
const TILE_CONFIGS: Record<BaseLayerId, { url: string; attribution: string; subdomains?: string[] }> = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: ['a', 'b', 'c'],
  },
  google_maps: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://carto.com/">CARTO</a> © OpenStreetMap',
    subdomains: ['a', 'b', 'c', 'd'],
  },
  google_satellite: {
    url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '© Google',
    subdomains: ['0', '1', '2', '3'],
  },
  topografia: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://opentopomap.org/">OpenTopoMap</a>',
    subdomains: ['a', 'b', 'c'],
  },
}

export function SIGMap({ compact = false }: { compact?: boolean } = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const baseTileRef  = useRef<L.TileLayer | null>(null)
  const { setMap, map, baseLayer, pendingTarget, setPendingTarget, flyTo } = useMapStore()

  // Inicializa o mapa uma única vez
  useEffect(() => {
    if (!containerRef.current || map) return
    const instance = L.map(containerRef.current, {
      center: useMapStore.getState().initialCenter, zoom: useMapStore.getState().initialZoom,
      zoomControl: true, attributionControl: true,
    })
    setMap(instance)
    return () => {
      instance.remove()
      setMap(null)  // libera o store para o próximo SIGMap inicializar
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Executa flyTo pendente assim que o mapa estiver disponível
  useEffect(() => {
    if (!map || !pendingTarget) return
    flyTo(pendingTarget.lat, pendingTarget.lng, pendingTarget.zoom)
    setPendingTarget(null)
  }, [map, pendingTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  // Troca o tile base sempre que baseLayer mudar
  useEffect(() => {
    if (!map) return
    if (baseTileRef.current) {
      map.removeLayer(baseTileRef.current)
      baseTileRef.current = null
    }
    const cfg = TILE_CONFIGS[baseLayer]
    baseTileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 22,
      ...(cfg.subdomains ? { subdomains: cfg.subdomains } : {}),
    })
    baseTileRef.current.addTo(map)
  }, [map, baseLayer])

  // Ortomosaico (opcional, via env)
  useEffect(() => {
    if (!map) return
    const url = import.meta.env.VITE_ORTOMOSAICO_WMTS_URL
    if (!url) return
    const layer = L.tileLayer(url, { attribution: 'Ortomosaico SIGWEB 2026', maxZoom: 22, opacity: 0.85 })
    layer.addTo(map)
    return () => { map.removeLayer(layer) }
  }, [map])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {map && (
        <>
          {!compact && <BaseLayerSwitcher />}
          <MVTLayer />
          <BairrosLayer />
          <CamadasVetoriaisLayer />
          <PgvLayer />
          <PatrimonioLayer />
          {!compact && <StreetView360 />}
          {!compact && <EditToolbar />}
          {!compact && <BufferToolbar />}
          {!compact && <LayerControl />}
          {!compact && <CamadasPanel />}
          {!compact && <PrintControl />}
        </>
      )}
    </div>
  )
}
