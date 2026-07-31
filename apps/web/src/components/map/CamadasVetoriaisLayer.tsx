import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useQuery } from '@tanstack/react-query'
import { useMapStore } from '../../store/map.store'
import { useStyleStore } from '../../store/style.store'
import api from '../../lib/api'

type CamadaMeta = { id: string; nome: string; cor: string }

function useCamadasAtivas(): CamadaMeta[] {
  const { activeLayers } = useMapStore()
  const { data: camadas = [] } = useQuery<CamadaMeta[]>({
    queryKey: ['camadas'],
    queryFn: () => api.get('/camadas').then(r => r.data),
    staleTime: 60_000,
  })
  return camadas.filter(c => activeLayers.includes(`camada:${c.id}`))
}

function CamadaLayer({ camada }: { camada: CamadaMeta }) {
  const { map } = useMapStore()
  const layerPrefs = useStyleStore(s => s.layerPrefs)
  const layerRef = useRef<L.GeoJSON | null>(null)

  const { data } = useQuery({
    queryKey: ['camada-parcelas', camada.id],
    queryFn: () => api.get(`/camadas/${camada.id}/parcelas?limit=2000`).then(r => r.data.data ?? []),
    staleTime: 60_000,
    enabled: !!map,
  })

  // Dependência no estilo preferido
  const pref = layerPrefs[`camada:${camada.id}`]
  const color = pref?.color ?? camada.cor
  const opacity = pref?.fillOpacity ?? 0.25

  useEffect(() => {
    if (!map) return
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null }
    if (!data?.length) return

    const features = data
      .filter((p: any) => p.geometry)
      .map((p: any) => ({
        type: 'Feature' as const,
        geometry: p.geometry,
        properties: { id: p.id, codigo: p.codigo, bairro: p.bairro, area_m2: p.area_m2 },
      }))

    if (!features.length) return

    layerRef.current = L.geoJSON({ type: 'FeatureCollection', features } as any, {
      style: {
        color: color,
        weight: 2,
        fillColor: color,
        fillOpacity: opacity,
      },
      onEachFeature(feature, layer) {
        layer.bindTooltip(
          `<strong>${feature.properties.codigo}</strong><br/>${feature.properties.bairro ?? ''}`,
          { sticky: true }
        )
      },
    }).addTo(map)

    return () => {
      if (layerRef.current && map) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, data, camada.cor, color, opacity]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export function CamadasVetoriaisLayer() {
  const ativas = useCamadasAtivas()
  return (
    <>
      {ativas.map(c => <CamadaLayer key={c.id} camada={c} />)}
    </>
  )
}
