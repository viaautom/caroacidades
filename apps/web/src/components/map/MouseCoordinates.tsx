import { useEffect, useState } from 'react'
import { useMapStore } from '../../store/map.store'
import proj4 from 'proj4'

proj4.defs('EPSG:31982', '+proj=utm +zone=22 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')

export function MouseCoordinates() {
  const { map } = useMapStore()
  const [coords, setCoords] = useState<{ x: number, y: number, lat: number, lng: number } | null>(null)

  useEffect(() => {
    if (!map) return

    const onMouseMove = (e: any) => {
      const lat = e.latlng.lat
      const lng = e.latlng.lng
      try {
        const [x, y] = proj4('WGS84', 'EPSG:31982', [lng, lat])
        setCoords({ x, y, lat, lng })
      } catch (err) {
        // Ignora erros de projeção fora dos limites
      }
    }

    map.on('mousemove', onMouseMove)
    return () => {
      map.off('mousemove', onMouseMove)
    }
  }, [map])

  if (!coords) return null

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      left: 100, // Ao lado do botão SHP/KML
      background: 'rgba(255, 255, 255, 0.9)',
      padding: '4px 10px',
      borderRadius: 6,
      fontSize: 11,
      color: '#374151',
      fontWeight: 500,
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      zIndex: 1000,
      pointerEvents: 'none',
      fontFamily: 'monospace',
      display: 'flex',
      gap: 12
    }}>
      <span>X: {coords.x.toFixed(2)}</span>
      <span>Y: {coords.y.toFixed(2)}</span>
      <span style={{ color: '#9ca3af' }}>|</span>
      <span>Lat: {coords.lat.toFixed(5)}</span>
      <span>Lng: {coords.lng.toFixed(5)}</span>
    </div>
  )
}
