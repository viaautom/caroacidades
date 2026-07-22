import { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import toast from 'react-hot-toast'
import api from '../../../lib/api'
import { useMapStore } from '../../../store/map.store'
import 'leaflet/dist/leaflet.css'

type ModalConfigurarMapaProps = {
  onClose: () => void
}

export function ModalConfigurarMapa({ onClose }: ModalConfigurarMapaProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(false)
  const { initialCenter, initialZoom, setInitialView } = useMapStore()

  useEffect(() => {
    if (!mapRef.current) return

    mapInstance.current = L.map(mapRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(mapInstance.current)

    return () => {
      mapInstance.current?.remove()
    }
  }, [initialCenter, initialZoom])

  const buscarEndereco = async () => {
    if (!busca) return
    setLoading(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(busca)}`)
      const data = await res.json()
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat)
        const lon = parseFloat(data[0].lon)
        mapInstance.current?.flyTo([lat, lon], 12)
      } else {
        toast.error('Local não encontrado')
      }
    } catch (e) {
      toast.error('Erro na busca')
    } finally {
      setLoading(false)
    }
  }

  const salvar = async () => {
    if (!mapInstance.current) return
    
    const center = mapInstance.current.getCenter()
    const zoom = mapInstance.current.getZoom()
    
    try {
      const payload = { center: [center.lat, center.lng], zoom }
      await api.put('/admin/configuracoes/MAPA_INITIAL_VIEW', { valor: payload })
      setInitialView([center.lat, center.lng], zoom)
      toast.success('Centralidade padrão atualizada!')
      onClose()
    } catch (e) {
      toast.error('Erro ao salvar configuração')
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'white', borderRadius: 8, padding: 20, width: '100%', maxWidth: 700,
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)'
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#1e3a5f' }}>Configurar Visão Inicial do Mapa</h2>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input 
            type="text" 
            placeholder="Digite o nome da cidade (ex: Tupanciretã, RS)" 
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscarEndereco()}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4 }}
          />
          <button 
            onClick={buscarEndereco} 
            disabled={loading}
            style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Buscar
          </button>
        </div>

        <div style={{ marginBottom: 8, fontSize: 13, color: '#4b5563' }}>
          Posicione o mapa e ajuste o zoom exatamente como você deseja que o sistema abra por padrão.
        </div>
        
        <div ref={mapRef} style={{ height: 400, borderRadius: 4, border: '1px solid #e5e7eb', marginBottom: 16 }} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button 
            onClick={onClose}
            style={{ padding: '8px 16px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button 
            onClick={salvar}
            style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
          >
            Salvar Padrão
          </button>
        </div>
      </div>
    </div>
  )
}
