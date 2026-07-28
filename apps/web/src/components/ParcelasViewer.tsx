import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import toast from 'react-hot-toast'
import L from 'leaflet'
import { useMapStore } from '../store/map.store'

const btn = (cor = '#2563eb', small = false): React.CSSProperties => ({
  padding: small ? '4px 12px' : '8px 18px',
  background: cor, color: 'white', border: 'none', borderRadius: 6,
  cursor: 'pointer', fontSize: small ? 12 : 13, fontWeight: 500,
})

const outlineBtn = (small = false): React.CSSProperties => ({
  padding: small ? '4px 12px' : '8px 16px',
  background: 'white', color: '#374151', border: '1px solid #d1d5db',
  borderRadius: 6, cursor: 'pointer', fontSize: small ? 12 : 13,
})

export function ParcelasViewer({ camadaId }: { camadaId: string }) {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['camadas', camadaId, 'parcelas', page],
    queryFn: () => api.get(`/camadas/${camadaId}/parcelas`, { params: { page, limit } }).then(r => r.data),
  })

  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => api.post('/parcelas/bulk-delete', { parcelaIds: ids }),
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ['camadas'] })
      setSelected(new Set())
      toast.success(`${ids.length} parcelas removidas com sucesso!`)
    },
    onError: () => toast.error('Erro ao remover parcelas'),
  })

  function toggleAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked && data?.data) {
      setSelected(new Set(data.data.map((p: any) => p.id)))
    } else {
      setSelected(new Set())
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function verNoMapa(geometry: object) {
    if (!geometry) return toast.error('Sem geometria')
    try {
      const geojson = L.geoJSON(geometry as any)
      useMapStore.getState().map?.fitBounds(geojson.getBounds(), { padding: [40, 40] })
      window.dispatchEvent(new CustomEvent('close-painel-gestao'))
    } catch (e) {
      toast.error('Geometria inválida')
    }
  }

  function handleDeleteSelected() {
    if (selected.size === 0) return
    if (window.confirm(`Apagar ${selected.size} parcelas selecionadas? Essa ação não pode ser desfeita.`)) {
      bulkDelete.mutate(Array.from(selected))
    }
  }

  if (isLoading) return <p style={{ fontSize: 12, color: '#6b7280' }}>Carregando parcelas...</p>
  if (!data?.data?.length) return <p style={{ fontSize: 12, color: '#6b7280' }}>Nenhuma parcela encontrada.</p>

  const parcelas = data.data

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: '#1e3a5f' }}>Listagem de Parcelas</h4>
        <button 
          style={{ ...btn('#dc2626', true), opacity: selected.size === 0 ? 0.5 : 1 }}
          disabled={selected.size === 0 || bulkDelete.isPending}
          onClick={handleDeleteSelected}
        >
          {bulkDelete.isPending ? 'Deletando...' : `Deletar Selecionadas (${selected.size})`}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '8px 4px' }}>
                <input type="checkbox" onChange={toggleAll} checked={selected.size === parcelas.length && parcelas.length > 0} />
              </th>
              <th style={{ padding: '8px 4px' }}>Código</th>
              <th style={{ padding: '8px 4px' }}>Área (m²)</th>
              <th style={{ padding: '8px 4px' }}>Bairro / Logradouro</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {parcelas.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '6px 4px' }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                </td>
                <td style={{ padding: '6px 4px', fontFamily: 'monospace' }}>{p.codigo || 'S/N'}</td>
                <td style={{ padding: '6px 4px' }}>{p.area_m2 ? p.area_m2.toFixed(2) : '--'}</td>
                <td style={{ padding: '6px 4px' }}>{p.bairro || '--'} / {p.logradouro || '--'}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  <button style={outlineBtn(true)} onClick={() => verNoMapa(p.geometry)}>📍 Ver no Mapa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          Total: {data.pagination.total} (Página {page})
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={outlineBtn(true)} disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <button style={outlineBtn(true)} disabled={parcelas.length < limit} onClick={() => setPage(p => p + 1)}>Próxima</button>
        </div>
      </div>
    </div>
  )
}
