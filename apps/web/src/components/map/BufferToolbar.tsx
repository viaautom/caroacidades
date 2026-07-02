import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useQuery } from '@tanstack/react-query'
import buffer from '@turf/buffer'
import { useMapStore } from '../../store/map.store'
import api from '../../lib/api'

type ParcelaGeometry = {
  geometry?: GeoJSON.Geometry
}

export function BufferToolbar() {
  const { map, selectedParcelaId, layerPanelOpen } = useMapStore()
  const [open, setOpen] = useState(false)
  const [radius, setRadius] = useState('50')
  const [message, setMessage] = useState<string | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  const { data: parcela, isFetching } = useQuery<ParcelaGeometry | undefined>({
    queryKey: ['buffer-parcela-geometry', selectedParcelaId],
    queryFn: async () => {
      const res = await api.get(`/parcelas/${selectedParcelaId}`)
      return res.data as ParcelaGeometry
    },
    enabled: !!selectedParcelaId,
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (!map) return
    if (!layerRef.current) {
      layerRef.current = L.layerGroup().addTo(map)
    }
    return () => {
      layerRef.current?.remove()
      layerRef.current = null
    }
  }, [map])

  useEffect(() => {
    if (!map || !layerRef.current) return
    if (!parcela) return
    layerRef.current.clearLayers()
  }, [parcela, map])

  function clearBuffer() {
    setMessage(null)
    layerRef.current?.clearLayers()
  }

  async function applyBuffer() {
    if (!map) return
    if (!selectedParcelaId) {
      setMessage('Selecione uma parcela antes de gerar o buffer.')
      return
    }
    if (!parcela || !parcela.geometry) {
      setMessage('Não foi possível carregar a geometria da parcela selecionada.')
      return
    }

    const radiusValue = Number(radius.replace(',', '.'))
    if (Number.isNaN(radiusValue) || radiusValue <= 0) {
      setMessage('Informe um raio válido em metros.')
      return
    }

    try {
      const buffered = buffer(parcela.geometry, radiusValue, { units: 'meters' })
      if (layerRef.current) {
        layerRef.current.clearLayers()
        L.geoJSON(buffered, {
          style: {
            color: '#f97316',
            weight: 2,
            fillColor: '#fbbf24',
            fillOpacity: 0.22,
          },
        }).addTo(layerRef.current)
        if (buffered.bbox) {
          map.fitBounds([[buffered.bbox[1], buffered.bbox[0]], [buffered.bbox[3], buffered.bbox[2]]], { padding: [30, 30] })
        }
      }
      setMessage(`Buffer aplicado: ${radiusValue.toFixed(0)} m`)
    } catch (error) {
      setMessage('Erro ao gerar o buffer. Verifique a geometria e tente novamente.')
      console.error('BufferToolbar error', error)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Abrir buffer de geometria"
        style={{
          position: 'absolute', bottom: 36, right: layerPanelOpen ? 278 : 38, zIndex: 1001,
          width: 40, height: 40, borderRadius: '50%', border: '1px solid #d1d5db',
          background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.16)',
          cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ⭕
      </button>
    )
  }

  return (
    <div style={{
      position: 'absolute', bottom: 36, right: layerPanelOpen ? 278 : 38, zIndex: 1001,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{
        background: 'white', borderRadius: 10, padding: 12,
        width: 240, boxShadow: '0 2px 10px rgba(0,0,0,0.16)',
        fontSize: 12, color: '#111',
      }}>
        <div style={{ marginBottom: 10, fontWeight: 700, color: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Buffer de geometria
          <button
            onClick={() => setOpen(false)}
            title="Minimizar"
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, color: '#6b7280', padding: 2, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <label style={{ display: 'block', marginBottom: 6, color: '#4b5563' }}>
          Raio (m)
          <input
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            placeholder="50"
            style={{
              width: '100%', marginTop: 6, padding: '8px 10px', border: '1px solid #d1d5db',
              borderRadius: 8, fontSize: 13, boxSizing: 'border-box',
            }}
          />
        </label>
        <button
          onClick={applyBuffer}
          disabled={isFetching || !selectedParcelaId}
          style={{
            width: '100%', padding: '10px 12px', marginBottom: 6,
            background: selectedParcelaId ? '#1e3a5f' : '#e5e7eb',
            color: selectedParcelaId ? 'white' : '#9ca3af',
            border: 'none', borderRadius: 8, cursor: selectedParcelaId ? 'pointer' : 'not-allowed',
            fontWeight: 700,
          }}
        >
          {isFetching ? 'Carregando...' : 'Aplicar buffer'}
        </button>
        <button
          onClick={clearBuffer}
          style={{
            width: '100%', padding: '10px 12px', background: '#f3f4f6',
            border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer',
            color: '#374151', fontWeight: 700,
          }}
        >
          Limpar buffer
        </button>
        <p style={{ margin: '10px 0 0', fontSize: 11, color: '#6b7280' }}>
          {selectedParcelaId ? 'Usa a geometria da parcela selecionada.' : 'Selecione uma parcela no mapa.'}
        </p>
        {message && (
          <p style={{ margin: '10px 0 0', color: message.startsWith('Erro') ? '#dc2626' : '#166534' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
