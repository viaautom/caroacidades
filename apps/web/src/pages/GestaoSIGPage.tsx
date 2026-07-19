import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissionsStore, MODULOS, type PerfilKey } from '../store/permissions.store'
import { useMapStore } from '../store/map.store'
import * as XLSX from 'xlsx'
import shpjs from 'shpjs'
import api from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { supabase, STORAGE_BUCKET } from '../lib/supabase'
import toast from 'react-hot-toast'

// ─── tipos ────────────────────────────────────────────────────────────────────
type Camada = {
  id: string
  nome: string
  descricao: string | null
  cor: string
  colunas: Coluna[]
  total_parcelas: number
  created_at: string
}
type Coluna = { nome: string; tipo: 'text' | 'number' | 'date' | 'boolean' }
type Parcela = { id: string; codigo: string; area_m2: number | null; atributos: Record<string, unknown>; bairro?: string; logradouro?: string }
type Usuario = { id: string; email: string; nome: string; perfil: string; ativo: boolean }

const ROLES = ['ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO']
const COR_PADRAO = '#2563eb'

// ─── helpers de estilo ────────────────────────────────────────────────────────
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
const input: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}
const card: React.CSSProperties = {
  background: 'white', border: '1px solid #e5e7eb',
  borderRadius: 10, padding: 20,
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Camadas
// ══════════════════════════════════════════════════════════════════════════════
function TabCamadas() {
  const qc = useQueryClient()
  const [novoNome, setNovoNome] = useState('')
  const [novaDesc, setNovaDesc] = useState('')
  const [novaCor, setNovaCor] = useState(COR_PADRAO)
  const [criando, setCriando] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const shpInputRef = useRef<HTMLInputElement>(null)

  const { data: camadas = [], isLoading } = useQuery<Camada[]>({
    queryKey: ['camadas'],
    queryFn: () => api.get('/camadas').then(r => r.data),
  })

  const criar = useMutation({
    mutationFn: () => api.post('/camadas', { nome: novoNome, descricao: novaDesc, cor: novaCor }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['camadas'] })
      setNovoNome(''); setNovaDesc(''); setNovaCor(COR_PADRAO); setCriando(false)
      toast.success('Camada criada!')
    },
    onError: () => toast.error('Erro ao criar camada'),
  })

  const deletar = useMutation({
    mutationFn: (id: string) => api.delete(`/camadas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['camadas'] })
      toast.success('Camada removida')
    },
    onError: () => toast.error('Erro ao remover camada'),
  })

  async function handleShpUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Selecione um arquivo .zip contendo o shapefile')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/camadas/upload-shp', form, {
        headers: { 'x-layer-name': file.name.replace(/\.zip$/i, '').replace(/_/g, ' ') },
      })
      qc.invalidateQueries({ queryKey: ['camadas'] })
      toast.success(`Camada importada: ${res.data.importadas}/${res.data.total} feições`)
      if (res.data.erros?.length) toast.error(`${res.data.erros.length} erros na importação`)
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao importar shapefile')
    } finally {
      setUploading(false)
      if (shpInputRef.current) shpInputRef.current.value = ''
    }
  }

  async function downloadGeoJSON(c: Camada) {
    setDownloading(`geojson-${c.id}`)
    try {
      const res = await api.get(`/camadas/${c.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${c.nome.replace(/\s+/g, '_')}.geojson`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao baixar GeoJSON')
    } finally {
      setDownloading(null)
    }
  }

  async function downloadSHP(c: Camada) {
    setDownloading(`shp-${c.id}`)
    try {
      const res = await api.get(`/camadas/${c.id}/download`)
      const shpWrite = await import('shp-write')
      const buf = await shpWrite.zip(res.data)
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${c.nome.replace(/\s+/g, '_')}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao baixar Shapefile')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>Camadas Vetoriais</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={shpInputRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleShpUpload} />
          <button style={outlineBtn()} disabled={uploading} onClick={() => shpInputRef.current?.click()}>
            {uploading ? 'Importando...' : '↑ Upload Shapefile (.zip)'}
          </button>
          <button style={btn()} onClick={() => setCriando(p => !p)}>+ Nova Camada</button>
        </div>
      </div>

      {criando && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nome *</label>
              <input style={input} value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Ex: Loteamento Jardim das Acácias" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Cor</label>
              <input type="color" value={novaCor} onChange={e => setNovaCor(e.target.value)}
                style={{ display: 'block', width: 44, height: 36, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Descrição</label>
            <input style={input} value={novaDesc} onChange={e => setNovaDesc(e.target.value)} placeholder="Opcional" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={outlineBtn()} onClick={() => setCriando(false)}>Cancelar</button>
            <button style={btn()} disabled={!novoNome.trim() || criar.isPending} onClick={() => criar.mutate()}>
              {criar.isPending ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      )}

      {isLoading && <p style={{ color: '#6b7280', fontSize: 13 }}>Carregando camadas...</p>}

      {camadas.map(c => (
        <div key={c.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: c.cor, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e3a5f' }}>{c.nome}</div>
            {c.descricao && <div style={{ fontSize: 12, color: '#6b7280' }}>{c.descricao}</div>}
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
              {c.total_parcelas} feições · {c.colunas?.length ?? 0} colunas extras
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              style={outlineBtn(true)}
              disabled={downloading === `geojson-${c.id}`}
              onClick={() => downloadGeoJSON(c)}
            >{downloading === `geojson-${c.id}` ? '...' : '↓ GeoJSON'}</button>
            <button
              style={outlineBtn(true)}
              disabled={downloading === `shp-${c.id}`}
              onClick={() => downloadSHP(c)}
            >{downloading === `shp-${c.id}` ? '...' : '↓ SHP'}</button>
            <button
              style={{ ...outlineBtn(true), color: '#dc2626', borderColor: '#fca5a5' }}
              onClick={() => {
                if (confirm(`Remover camada "${c.nome}"? As parcelas serão desvinculadas.`)) deletar.mutate(c.id)
              }}
            >Remover</button>
          </div>
        </div>
      ))}

      {!isLoading && camadas.length === 0 && !criando && (
        <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 32 }}>
          Nenhuma camada criada. Crie a primeira ou importe um shapefile.
        </p>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Camadas WMS (req 22 — mapas temáticos externos)
// ══════════════════════════════════════════════════════════════════════════════
type CamadaWms = {
  id: string
  nome: string
  categoria: string | null
  url: string
  camada_wms: string
  formato: string
  transparente: boolean
  opacidade: number
  ativa: boolean
}

function camadaWmsVazia() {
  return { nome: '', categoria: '', url: '', camadaWms: '', formato: 'image/png', transparente: true, opacidade: 0.8 }
}

function TabCamadasWms() {
  const qc = useQueryClient()
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState(camadaWmsVazia())

  const { data: camadas = [], isLoading } = useQuery<CamadaWms[]>({
    queryKey: ['camadas-wms'],
    queryFn: () => api.get('/camadas-wms').then(r => r.data),
  })

  const criar = useMutation({
    mutationFn: () => api.post('/camadas-wms', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['camadas-wms'] })
      setForm(camadaWmsVazia()); setCriando(false)
      toast.success('Camada WMS cadastrada!')
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Erro ao cadastrar camada WMS'),
  })

  const alternarAtiva = useMutation({
    mutationFn: ({ id, ativa }: { id: string; ativa: boolean }) => api.put(`/camadas-wms/${id}`, { ativa }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['camadas-wms'] }),
    onError: () => toast.error('Erro ao atualizar camada'),
  })

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/camadas-wms/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['camadas-wms'] })
      toast.success('Camada WMS removida')
    },
    onError: () => toast.error('Erro ao remover camada'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>Camadas WMS Externas</h3>
        <button style={btn()} onClick={() => setCriando(p => !p)}>+ Nova Camada WMS</button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
        Cadastre serviços WMS (mapas temáticos de órgãos externos como SINTER, IBGE, EMATER) para exibição sobreposta no mapa.
      </p>

      {criando && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nome *</label>
              <input style={input} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Limites Municipais — IBGE" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Categoria</label>
              <input style={input} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Ex: Cartografia oficial" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>URL do serviço WMS *</label>
            <input style={input} value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://geoservicos.exemplo.gov.br/geoserver/wms" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nome da camada (layers) *</label>
              <input style={input} value={form.camadaWms} onChange={e => setForm(f => ({ ...f, camadaWms: e.target.value }))} placeholder="Ex: ibge:limites_municipais" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Formato</label>
              <input style={{ ...input, width: 140 }} value={form.formato} onChange={e => setForm(f => ({ ...f, formato: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Opacidade</label>
              <input style={{ ...input, width: 90 }} type="number" min={0} max={1} step={0.1}
                value={form.opacidade} onChange={e => setForm(f => ({ ...f, opacidade: Number(e.target.value) }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
              <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={form.transparente} onChange={e => setForm(f => ({ ...f, transparente: e.target.checked }))} />
                Transparente
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={outlineBtn()} onClick={() => setCriando(false)}>Cancelar</button>
            <button style={btn()} disabled={!form.nome.trim() || !form.url.trim() || !form.camadaWms.trim() || criar.isPending} onClick={() => criar.mutate()}>
              {criar.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {isLoading && <p style={{ color: '#6b7280', fontSize: 13 }}>Carregando camadas WMS...</p>}

      {camadas.map(c => (
        <div key={c.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e3a5f' }}>{c.nome}</div>
            {c.categoria && <div style={{ fontSize: 12, color: '#6b7280' }}>{c.categoria}</div>}
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{c.url} · camada: {c.camada_wms}</div>
          </div>
          <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={c.ativa} onChange={e => alternarAtiva.mutate({ id: c.id, ativa: e.target.checked })} />
            Ativa
          </label>
          <button
            style={{ ...outlineBtn(true), color: '#dc2626', borderColor: '#fca5a5' }}
            onClick={() => { if (confirm(`Remover camada WMS "${c.nome}"?`)) remover.mutate(c.id) }}
          >Remover</button>
        </div>
      ))}

      {!isLoading && camadas.length === 0 && !criando && (
        <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 32 }}>
          Nenhuma camada WMS cadastrada.
        </p>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Importar
// ══════════════════════════════════════════════════════════════════════════════
function TabImportar() {
  const qc = useQueryClient()
  const [camadaId, setCamadaId] = useState('')
  const [novaCamadaNome, setNovaCamadaNome] = useState('')
  const [features, setFeatures] = useState<any[]>([])
  const [colunas, setColunas] = useState<string[]>([])
  const [codigoCol, setCodigoCol] = useState('')
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: camadas = [] } = useQuery<Camada[]>({
    queryKey: ['camadas'],
    queryFn: () => api.get('/camadas').then(r => r.data),
  })

  async function handleFile(file: File) {
    setFeatures([]); setColunas([]); setResultado(null)
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (rows.length === 0) { toast.error('Planilha vazia'); return }
      setColunas(Object.keys(rows[0]))
      setFeatures(rows.map(r => ({ atributos: r })))
      toast.success(`${rows.length} linhas carregadas`)
    } else if (ext === 'zip') {
      try {
        const buf = await file.arrayBuffer()
        const geojson: any = await shpjs(buf)
        const fc = geojson.features ? geojson : geojson[0]
        if (!fc?.features?.length) { toast.error('Shapefile vazio ou inválido'); return }
        const sample = fc.features[0].properties ?? {}
        setColunas(Object.keys(sample))
        setFeatures(fc.features.map((f: any) => ({
          geometry: f.geometry,
          atributos: f.properties ?? {},
        })))
        toast.success(`${fc.features.length} feições carregadas`)
      } catch {
        toast.error('Erro ao ler shapefile. Certifique-se de que o .zip contém .shp, .dbf e .prj')
      }
    } else if (ext === 'kml') {
      try {
        const text = await file.text()
        const xml = new DOMParser().parseFromString(text, 'text/xml')
        const placemarks = Array.from(xml.querySelectorAll('Placemark'))
        if (placemarks.length === 0) { toast.error('KML sem feições (Placemarks) encontradas'); return }

        const parsed = placemarks.map(pm => {
          const name = pm.querySelector('name')?.textContent?.trim() ?? ''
          const description = pm.querySelector('description')?.textContent?.trim() ?? ''
          let geometry: any = null

          const polygon = pm.querySelector('Polygon')
          const point = pm.querySelector('Point')
          const line = pm.querySelector('LineString')

          if (polygon) {
            const raw = polygon.querySelector('outerBoundaryIs coordinates')?.textContent?.trim()
              ?? polygon.querySelector('coordinates')?.textContent?.trim()
            if (raw) {
              const ring = raw.split(/\s+/).filter(Boolean).map(c => {
                const [lng, lat] = c.split(',').map(Number)
                return [lng, lat]
              })
              geometry = { type: 'Polygon', coordinates: [ring] }
            }
          } else if (point) {
            const raw = point.querySelector('coordinates')?.textContent?.trim()
            if (raw) {
              const [lng, lat] = raw.split(',').map(Number)
              geometry = { type: 'Point', coordinates: [lng, lat] }
            }
          } else if (line) {
            const raw = line.querySelector('coordinates')?.textContent?.trim()
            if (raw) {
              const coords = raw.split(/\s+/).filter(Boolean).map(c => {
                const [lng, lat] = c.split(',').map(Number)
                return [lng, lat]
              })
              geometry = { type: 'LineString', coordinates: coords }
            }
          }

          return { geometry, atributos: { nome: name, descricao: description } }
        })

        setColunas(['nome', 'descricao'])
        setFeatures(parsed)
        toast.success(`${parsed.length} feições carregadas do KML`)
      } catch {
        toast.error('Erro ao processar arquivo KML')
      }
    } else {
      toast.error('Formato não suportado. Use .xlsx, .xls, .csv, .zip (shapefile) ou .kml')
    }
  }

  async function importar() {
    if (!features.length) { toast.error('Carregue um arquivo primeiro'); return }

    let targetId = camadaId
    if (!targetId) {
      if (!novaCamadaNome.trim()) { toast.error('Escolha uma camada ou informe um nome para criar uma nova'); return }
      const res = await api.post('/camadas', { nome: novaCamadaNome })
      targetId = res.data.id
      qc.invalidateQueries({ queryKey: ['camadas'] })
    }

    setImporting(true)
    try {
      const payload = features.map(f => ({
        codigo: codigoCol ? String(f.atributos?.[codigoCol] ?? '') : undefined,
        geometry: f.geometry ?? null,
        atributos: f.atributos ?? {},
      }))
      const res = await api.post(`/camadas/${targetId}/importar`, { features: payload })
      setResultado(res.data)
      qc.invalidateQueries({ queryKey: ['camadas'] })
      toast.success(`${res.data.importadas} feições importadas`)
    } catch {
      toast.error('Erro na importação')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>Importar Camada Vetorial</h3>
      <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
        Formatos aceitos: <strong>.xlsx / .xls / .csv</strong> (planilha), <strong>.zip</strong> contendo shapefile (.shp + .dbf + .prj) ou <strong>.kml</strong>
      </p>

      {/* Zona de drop */}
      <div
        style={{
          border: '2px dashed #d1d5db', borderRadius: 10, padding: 40,
          textAlign: 'center', cursor: 'pointer', color: '#6b7280', fontSize: 13,
          background: '#f9fafb',
        }}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
        Clique ou arraste o arquivo aqui
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.zip,.kml" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
      </div>

      {features.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>
            ✓ {features.length} feições carregadas · {colunas.length} colunas detectadas
          </div>

          {/* Seleção da coluna de código */}
          {colunas.length > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                Coluna que será usada como Código (opcional)
              </label>
              <select value={codigoCol} onChange={e => setCodigoCol(e.target.value)}
                style={{ ...input, width: 260 }}>
                <option value="">— auto-gerado —</option>
                {colunas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Destino */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              Salvar na camada
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select value={camadaId} onChange={e => { setCamadaId(e.target.value); if (e.target.value) setNovaCamadaNome('') }}
                style={{ ...input, width: 260 }}>
                <option value="">— criar nova camada —</option>
                {camadas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              {!camadaId && (
                <input style={{ ...input, width: 220 }} placeholder="Nome da nova camada"
                  value={novaCamadaNome} onChange={e => setNovaCamadaNome(e.target.value)} />
              )}
            </div>
          </div>

          {/* Preview */}
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['#', ...colunas.slice(0, 6)].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                  {colunas.length > 6 && <th style={{ padding: '7px 10px', color: '#9ca3af' }}>+{colunas.length - 6} cols</th>}
                  {features[0]?.geometry && <th style={{ padding: '7px 10px', color: '#374151' }}>Geometria</th>}
                </tr>
              </thead>
              <tbody>
                {features.slice(0, 5).map((f, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 10px', color: '#9ca3af' }}>{i + 1}</td>
                    {colunas.slice(0, 6).map(c => (
                      <td key={c} style={{ padding: '6px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(f.atributos?.[c] ?? '')}
                      </td>
                    ))}
                    {colunas.length > 6 && <td />}
                    {f.geometry && <td style={{ padding: '6px 10px', color: '#059669', fontSize: 11 }}>✓ {f.geometry.type}</td>}
                  </tr>
                ))}
                {features.length > 5 && (
                  <tr><td colSpan={99} style={{ padding: '6px 10px', color: '#9ca3af', textAlign: 'center' }}>
                    + {features.length - 5} linhas ocultas
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={btn()} disabled={importing} onClick={importar}>
              {importing ? 'Importando...' : `Importar ${features.length} feições`}
            </button>
          </div>
        </>
      )}

      {resultado && (
        <div style={{ ...card, background: resultado.erros.length ? '#fffbeb' : '#f0fdf4', borderColor: resultado.erros.length ? '#fbbf24' : '#86efac' }}>
          <div style={{ fontWeight: 600, color: resultado.erros.length ? '#92400e' : '#14532d' }}>
            ✓ {resultado.importadas} de {resultado.total} feições importadas
          </div>
          {resultado.erros.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#92400e' }}>
              {resultado.erros.slice(0, 10).map((e: string, i: number) => <li key={i}>{e}</li>)}
              {resultado.erros.length > 10 && <li>+{resultado.erros.length - 10} erros...</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Tabela de Atributos
// ══════════════════════════════════════════════════════════════════════════════
function TabTabela() {
  const qc = useQueryClient()
  const [camadaId, setCamadaId] = useState('')
  const [editingCell, setEditingCell] = useState<{ parcelaId: string; col: string } | null>(null)
  const [cellValue, setCellValue] = useState('')
  const [novaColNome, setNovaColNome] = useState('')
  const [novaColTipo, setNovaColTipo] = useState<Coluna['tipo']>('text')

  const { data: camadas = [] } = useQuery<Camada[]>({
    queryKey: ['camadas'],
    queryFn: () => api.get('/camadas').then(r => r.data),
  })

  const camadaAtual = camadas.find(c => c.id === camadaId)

  const { data: paginaData, isLoading } = useQuery({
    queryKey: ['camada-parcelas', camadaId],
    queryFn: () => api.get(`/camadas/${camadaId}/parcelas?limit=200`).then(r => r.data),
    enabled: !!camadaId,
  })

  const parcelas: Parcela[] = paginaData?.data ?? []

  const colunasPadrao = ['codigo', 'logradouro', 'bairro', 'area_m2']
  const colunasExtra: Coluna[] = camadaAtual?.colunas ?? []

  function startEdit(parcelaId: string, col: string, atual: unknown) {
    setEditingCell({ parcelaId, col })
    setCellValue(String(atual ?? ''))
  }

  async function commitEdit() {
    if (!editingCell) return
    const { parcelaId, col } = editingCell
    const parcela = parcelas.find(p => p.id === parcelaId)
    if (!parcela) { setEditingCell(null); return }

    if (col === 'codigo') {
      await api.patch(`/parcelas/${parcelaId}/atributos`, { codigo: cellValue })
    } else {
      const novosAtributos = { ...parcela.atributos, [col]: cellValue }
      await api.patch(`/parcelas/${parcelaId}/atributos`, { atributos: novosAtributos })
    }
    qc.invalidateQueries({ queryKey: ['camada-parcelas', camadaId] })
    setEditingCell(null)
  }

  async function adicionarColuna() {
    if (!novaColNome.trim() || !camadaAtual) return
    const novasColunas = [...colunasExtra, { nome: novaColNome.trim(), tipo: novaColTipo }]
    await api.put(`/camadas/${camadaId}`, { colunas: novasColunas })
    qc.invalidateQueries({ queryKey: ['camadas'] })
    setNovaColNome('')
    toast.success('Coluna adicionada')
  }

  async function removerColuna(nome: string) {
    if (!camadaAtual) return
    const novasColunas = colunasExtra.filter(c => c.nome !== nome)
    await api.put(`/camadas/${camadaId}`, { colunas: novasColunas })
    qc.invalidateQueries({ queryKey: ['camadas'] })
    toast.success('Coluna removida')
  }

  const getCellValue = (parcela: Parcela, col: string): unknown => {
    if (col === 'codigo') return parcela.codigo
    if (col === 'logradouro') return parcela.logradouro
    if (col === 'bairro') return parcela.bairro
    if (col === 'area_m2') return parcela.area_m2 != null ? Number(parcela.area_m2).toFixed(2) : ''
    return parcela.atributos?.[col]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>Tabela de Atributos</h3>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <select value={camadaId} onChange={e => setCamadaId(e.target.value)}
          style={{ ...input, width: 280 }}>
          <option value="">Selecionar camada...</option>
          {camadas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.total_parcelas})</option>)}
        </select>
      </div>

      {camadaId && (
        <>
          {/* Gerenciar colunas extras */}
          <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Nova coluna</label>
              <input style={{ ...input, width: 180 }} placeholder="Nome da coluna"
                value={novaColNome} onChange={e => setNovaColNome(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Tipo</label>
              <select style={{ ...input, width: 120 }} value={novaColTipo} onChange={e => setNovaColTipo(e.target.value as Coluna['tipo'])}>
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="date">Data</option>
                <option value="boolean">Sim/Não</option>
              </select>
            </div>
            <button style={btn()} onClick={adicionarColuna} disabled={!novaColNome.trim()}>+ Adicionar</button>

            {colunasExtra.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
                {colunasExtra.map(c => (
                  <span key={c.nome} style={{
                    background: '#eff6ff', color: '#1d4ed8', fontSize: 11,
                    padding: '3px 8px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4
                  }}>
                    {c.nome} ({c.tipo})
                    <button onClick={() => removerColuna(c.nome)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {isLoading && <p style={{ color: '#6b7280', fontSize: 13 }}>Carregando dados...</p>}

          {!isLoading && parcelas.length > 0 && (
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {[...colunasPadrao, ...colunasExtra.map(c => c.nome)].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parcelas.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      {[...colunasPadrao, ...colunasExtra.map(c => c.nome)].map(col => {
                        const isEditing = editingCell?.parcelaId === p.id && editingCell.col === col
                        const readonly = col === 'logradouro' || col === 'bairro' || col === 'area_m2'
                        const val = getCellValue(p, col)
                        return (
                          <td key={col} style={{ padding: '6px 10px', cursor: readonly ? 'default' : 'pointer' }}
                            onDoubleClick={() => !readonly && startEdit(p.id, col, val)}>
                            {isEditing ? (
                              <input
                                autoFocus
                                value={cellValue}
                                onChange={e => setCellValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingCell(null) }}
                                style={{ ...input, padding: '3px 6px', width: '100%', fontSize: 12 }}
                              />
                            ) : (
                              <span title={readonly ? '' : 'Duplo clique para editar'}>
                                {String(val ?? '—')}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '8px 12px', fontSize: 11, color: '#9ca3af', borderTop: '1px solid #f3f4f6' }}>
                Duplo clique numa célula para editar · {parcelas.length} registros
              </div>
            </div>
          )}

          {!isLoading && parcelas.length === 0 && (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: 32, fontSize: 13 }}>
              Nenhuma feição nesta camada. Use a aba Importar ou crie lotes no mapa.
            </p>
          )}
        </>
      )}
    </div>
  )
}

const PERFIL_LABEL: Record<string, string> = {
  ADMIN:             'Administrador',
  FISCAL_TRIBUTARIO: 'Fiscal Tributário',
  SETOR_PROJETOS:    'Setor de Projetos',
  FISCAL_CAMPO:      'Fiscal de Campo',
  CIDADAO:           'Cidadão',
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Usuários
// ══════════════════════════════════════════════════════════════════════════════
function TabUsuarios({ onPreview }: { onPreview?: (p: PerfilKey) => void }) {
  const { perfil } = useAuthStore()
  const [bootstrapping, setBootstrapping] = useState(false)
  const [criando, setCriando] = useState(false)
  const [novoForm, setNovoForm] = useState({ email: '', nome: '', senha: '', perfil: 'FISCAL_CAMPO' })
  const [salvando, setSalvando] = useState(false)
  const qc = useQueryClient()

  const { data: usuarios = [], isLoading } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/usuarios').then(r => r.data),
  })

  async function bootstrap() {
    setBootstrapping(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/admin/bootstrap`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success(data.mensagem)
      qc.invalidateQueries({ queryKey: ['usuarios'] })
    } catch {
      toast.error('Erro ao executar bootstrap')
    } finally {
      setBootstrapping(false)
    }
  }

  async function setPerfil(uid: string, novoPerfil: string) {
    try {
      await api.patch(`/usuarios/${uid}/perfil`, { perfil: novoPerfil })
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      toast.success('Perfil atualizado. O usuário deve fazer logout e entrar novamente.')
    } catch {
      toast.error('Erro ao atualizar perfil')
    }
  }

  async function setAtivo(uid: string, ativo: boolean) {
    try {
      await api.patch(`/usuarios/${uid}/ativo`, { ativo })
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      toast.success(ativo ? 'Acesso reativado.' : 'Acesso suspenso.')
    } catch {
      toast.error('Erro ao alterar situação do usuário')
    }
  }

  async function criarUsuario() {
    if (!novoForm.email || !novoForm.nome || !novoForm.senha) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    setSalvando(true)
    try {
      await api.post('/usuarios', novoForm)
      toast.success(`Usuário ${novoForm.email} criado com sucesso.`)
      setNovoForm({ email: '', nome: '', senha: '', perfil: 'FISCAL_CAMPO' })
      setCriando(false)
      qc.invalidateQueries({ queryKey: ['usuarios'] })
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Erro ao criar usuário')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>Gerenciar Usuários</h3>
        {perfil === 'ADMIN' && (
          <button style={btn()} onClick={() => setCriando(p => !p)}>
            {criando ? 'Cancelar' : '+ Novo Usuário'}
          </button>
        )}
      </div>

      {/* Bootstrap admin (setup inicial) */}
      {perfil !== 'ADMIN' && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fbbf24' }}>
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 6 }}>Configuração inicial</div>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#78350f' }}>
            Seu perfil atual é <strong>{PERFIL_LABEL[perfil ?? ''] ?? perfil ?? 'Cidadão'}</strong>.
            Se ainda não há nenhum administrador no sistema, clique abaixo para se tornar ADMIN.
          </p>
          <button style={btn('#d97706')} disabled={bootstrapping} onClick={bootstrap}>
            {bootstrapping ? 'Aguarde...' : 'Tornar-me Administrador'}
          </button>
        </div>
      )}

      {/* Formulário de criação */}
      {criando && (
        <div style={{ ...card, background: '#f0fdf4', borderColor: '#86efac' }}>
          <p style={{ margin: '0 0 12px', fontWeight: 600, color: '#14532d', fontSize: 14 }}>Novo Usuário</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>E-mail *</label>
              <input style={input} type="email" placeholder="servidor@prefeitura.rs.gov.br"
                value={novoForm.email} onChange={e => setNovoForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Nome completo *</label>
              <input style={input} placeholder="Nome do servidor"
                value={novoForm.nome} onChange={e => setNovoForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Senha temporária *</label>
              <input style={input} type="password" placeholder="Mínimo 6 caracteres"
                value={novoForm.senha} onChange={e => setNovoForm(f => ({ ...f, senha: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>Perfil</label>
              <select style={input} value={novoForm.perfil}
                onChange={e => setNovoForm(f => ({ ...f, perfil: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{PERFIL_LABEL[r] ?? r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button style={btn()} disabled={salvando} onClick={criarUsuario}>
              {salvando ? 'Criando...' : 'Criar usuário'}
            </button>
            <button style={outlineBtn()} onClick={() => setCriando(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {isLoading && <p style={{ color: '#6b7280', fontSize: 13 }}>Carregando usuários...</p>}

      {!isLoading && usuarios.length > 0 && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['E-mail', 'Nome', 'Perfil', 'Alterar perfil', 'Situação'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u: any) => (
                <tr key={u.id} style={{ borderTop: '1px solid #f3f4f6', opacity: u.ativo === false ? 0.5 : 1 }}>
                  <td style={{ padding: '8px 12px', color: '#374151' }}>{u.email}</td>
                  <td style={{ padding: '8px 12px' }}>{u.nome || '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      background: u.perfil === 'ADMIN' ? '#eff6ff' : '#f3f4f6',
                      color: u.perfil === 'ADMIN' ? '#1d4ed8' : '#374151',
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                    }}>{PERFIL_LABEL[u.perfil] ?? u.perfil}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {perfil === 'ADMIN' ? (
                      <select
                        defaultValue={u.perfil}
                        onChange={e => setPerfil(u.auth_uid ?? u.id, e.target.value)}
                        style={{ ...input, width: 180, padding: '4px 8px' }}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{PERFIL_LABEL[r] ?? r}</option>)}
                      </select>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>— requer ADMIN —</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {perfil === 'ADMIN' && (
                      <button
                        onClick={() => setAtivo(u.auth_uid ?? u.id, !u.ativo)}
                        style={{
                          padding: '3px 10px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: u.ativo !== false ? '#fee2e2' : '#dcfce7',
                          color: u.ativo !== false ? '#dc2626' : '#16a34a',
                          fontWeight: 600,
                        }}
                      >
                        {u.ativo !== false ? 'Suspender' : 'Reativar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && usuarios.length === 0 && (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: 32, fontSize: 13 }}>
          Nenhum usuário cadastrado. Clique em "Novo Usuário" para começar.
        </p>
      )}

      {/* ── Tabela de permissões ── */}
      <TabelaPermissoes onPreview={onPreview} />
    </div>
  )
}

const PERFIS_COLS: PerfilKey[] = ['ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO']

const PERFIL_COR: Record<PerfilKey, string> = {
  ADMIN:             '#1d4ed8',
  FISCAL_TRIBUTARIO: '#16a34a',
  SETOR_PROJETOS:    '#9333ea',
  FISCAL_CAMPO:      '#ea580c',
  CIDADAO:           '#6b7280',
}

const PERFIL_ABREV: Record<PerfilKey, string> = {
  ADMIN:             'Admin',
  FISCAL_TRIBUTARIO: 'Fiscal Trib.',
  SETOR_PROJETOS:    'Projetos',
  FISCAL_CAMPO:      'Campo',
  CIDADAO:           'Cidadão',
}

function TabelaPermissoes({ onPreview }: { onPreview?: (p: PerfilKey) => void }) {
  const { perfil: perfilAtual } = useAuthStore()
  const { isHabilitado, setOverride } = usePermissionsStore()
  const isAdmin = perfilAtual === 'ADMIN'
  const [saving, setSaving] = useState<string | null>(null)

  async function toggle(moduloId: string, perfil: PerfilKey) {
    if (!isAdmin) return
    // ADMIN sempre tem tudo — não permitir desabilitar para si mesmo
    if (perfil === 'ADMIN') return
    const novoValor = !isHabilitado(moduloId, perfil)
    const key = `${moduloId}:${perfil}`
    setSaving(key)
    try {
      await api.put('/permissoes', { modulo: moduloId, perfil, habilitado: novoValor })
      setOverride(moduloId, perfil, novoValor)
    } catch {
      toast.error('Erro ao salvar permissão')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, color: '#1e3a5f', fontSize: 14, fontWeight: 600 }}>
          Permissões por Perfil
        </h4>
        {isAdmin && (
          <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
            Clique numa célula para habilitar / desabilitar
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', minWidth: 160 }}>
                Módulo
              </th>
              {PERFIS_COLS.map(p => (
                <th key={p} style={{
                  padding: '8px 6px', textAlign: 'center', fontWeight: 700,
                  borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap',
                  color: PERFIL_COR[p], minWidth: 90,
                }}>
                  <div style={{ marginBottom: onPreview && p !== 'ADMIN' ? 4 : 0 }}>
                    {PERFIL_ABREV[p]}
                  </div>
                  {onPreview && (
                    <button
                      onClick={() => onPreview(p)}
                      title={`Ver o sistema como ${PERFIL_ABREV[p]}`}
                      style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                        background: PERFIL_COR[p] + '18', color: PERFIL_COR[p],
                        border: `1px solid ${PERFIL_COR[p]}44`, fontWeight: 600,
                        display: 'block', width: '100%',
                      }}
                    >
                      👁 Ver como
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULOS.map((m, i) => (
              <tr key={m.id} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={{ padding: '7px 14px', color: '#374151', borderBottom: '1px solid #f3f4f6', fontWeight: 500 }}>
                  {m.label}
                </td>
                {PERFIS_COLS.map(p => {
                  const habilitado = isHabilitado(m.id, p)
                  const key = `${m.id}:${p}`
                  const isSaving = saving === key
                  const canToggle = isAdmin && p !== 'ADMIN'
                  return (
                    <td
                      key={p}
                      onClick={() => canToggle && toggle(m.id, p)}
                      style={{
                        padding: '7px 6px', textAlign: 'center', borderBottom: '1px solid #f3f4f6',
                        cursor: canToggle ? 'pointer' : 'default',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (canToggle) e.currentTarget.style.background = '#f0f9ff' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      title={canToggle ? (habilitado ? 'Clique para desabilitar' : 'Clique para habilitar') : ''}
                    >
                      {isSaving ? (
                        <span style={{ color: '#9ca3af', fontSize: 11 }}>…</span>
                      ) : habilitado ? (
                        <span style={{ color: PERFIL_COR[p], fontWeight: 700, fontSize: 15 }}>✓</span>
                      ) : (
                        <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9ca3af' }}>
        {isAdmin
          ? 'Alterações são aplicadas imediatamente na navegação. Usuários já logados precisam recarregar a página.'
          : 'Apenas administradores podem alterar permissões.'}
      </p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Imagens 360°
// ══════════════════════════════════════════════════════════════════════════════
function TabImagens360() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ titulo: '', lat: '', lng: '', heading: '0', capturadoEm: '' })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)

  const { data: panoramas = [], isLoading } = useQuery<any[]>({
    queryKey: ['imagens360'],
    queryFn: () => api.get('/imagens360').then(r => r.data?.data ?? []),
  })

  async function enviar() {
    if (!arquivo) { toast.error('Selecione um arquivo de imagem'); return }
    if (!form.titulo.trim()) { toast.error('Informe o título'); return }
    if (!form.lat || !form.lng) { toast.error('Informe latitude e longitude'); return }

    setSalvando(true)
    try {
      // 1. Upload para o Storage do Supabase
      const path = `panoramas/${Date.now()}_${arquivo.name.replace(/\s+/g, '_')}`
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, arquivo)
      if (uploadError) throw uploadError
      const { data: signed, error: signError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, 10 * 365 * 24 * 60 * 60)
      if (signError) throw signError
      const url = signed.signedUrl

      // 2. Registrar no banco
      await api.post('/imagens360', {
        titulo: form.titulo.trim(),
        urlPanorama: url,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        heading: parseFloat(form.heading) || 0,
        capturadoEm: form.capturadoEm || undefined,
      })

      toast.success('Panorama cadastrado! Os demos serão substituídos automaticamente.')
      qc.invalidateQueries({ queryKey: ['imagens360'] })
      setForm({ titulo: '', lat: '', lng: '', heading: '0', capturadoEm: '' })
      setArquivo(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message ?? 'Falha no upload'))
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(id: string, titulo: string) {
    if (!confirm(`Excluir "${titulo}"?`)) return
    try {
      await api.delete(`/imagens360/${id}`)
      qc.invalidateQueries({ queryKey: ['imagens360'] })
      toast.success('Panorama removido')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h3 style={{ margin: '0 0 6px', color: '#1e3a5f', fontSize: 16 }}>Imagens 360° do Município</h3>
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
          Faça upload de fotos equirretangulares captadas no município. Formatos aceitos: JPEG, PNG.<br />
          Câmeras sugeridas: Ricoh Theta, Insta360, GoPro Max ou similar.<br />
          Quando houver imagens reais cadastradas, os pontos demo são automaticamente ocultados.
        </p>
      </div>

      {/* Formulário de upload */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h4 style={{ margin: 0, fontSize: 14, color: '#1e3a5f' }}>Adicionar novo panorama</h4>

        <div>
          <label style={labelSt}>Título *</label>
          <input style={input} value={form.titulo} placeholder="Ex: Praça João Maia — Centro"
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelSt}>Latitude * (ex: -29.07800)</label>
            <input style={input} type="number" step="any" value={form.lat} placeholder="-29.07800"
              onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} />
          </div>
          <div>
            <label style={labelSt}>Longitude * (ex: -53.83900)</label>
            <input style={input} type="number" step="any" value={form.lng} placeholder="-53.83900"
              onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} />
          </div>
          <div>
            <label style={labelSt}>Heading inicial (direção, 0–360°)</label>
            <input style={input} type="number" min="0" max="360" value={form.heading}
              onChange={e => setForm(f => ({ ...f, heading: e.target.value }))} />
          </div>
          <div>
            <label style={labelSt}>Data de captura</label>
            <input style={input} type="date" value={form.capturadoEm}
              onChange={e => setForm(f => ({ ...f, capturadoEm: e.target.value }))} />
          </div>
        </div>

        <div>
          <label style={labelSt}>Arquivo de imagem equirretangular *</label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            onChange={e => setArquivo(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13 }} />
          {arquivo && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>
              {arquivo.name} · {(arquivo.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
        </div>

        {/* Indicador de envio */}
        {salvando && (
          <div>
            <div style={{ background: '#e5e7eb', borderRadius: 99, overflow: 'hidden', height: 8 }}>
              <div style={{ width: '100%', height: '100%', background: '#2563eb' }} />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>Enviando…</p>
          </div>
        )}

        <button style={btn()} onClick={enviar} disabled={salvando || !arquivo || !form.titulo}>
          {salvando ? 'Enviando...' : '↑ Upload e cadastrar'}
        </button>
      </div>

      {/* Lista de panoramas */}
      {isLoading && <p style={{ color: '#6b7280', fontSize: 13 }}>Carregando...</p>}

      {!isLoading && panoramas.length === 0 && (
        <div style={{ ...card, background: '#f0f9ff', borderColor: '#bae6fd', textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
          <p style={{ margin: 0, color: '#0369a1', fontWeight: 600 }}>Nenhum panorama real cadastrado</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#0284c7' }}>
            4 pontos demo estão sendo exibidos no mapa. Quando você adicionar imagens reais, elas substituem os demos.
          </p>
        </div>
      )}

      {panoramas.map((p: any) => (
        <div key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e3a5f' }}>{p.titulo}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}
              {' · '}{p.heading}° heading
              {p.capturado_em && ` · ${new Date(p.capturado_em).toLocaleDateString('pt-BR')}`}
            </div>
          </div>
          <a href={p.url_panorama} target="_blank" rel="noopener noreferrer"
            style={{ color: '#2563eb', fontSize: 12, textDecoration: 'none' }}>
            Ver imagem ↗
          </a>
          <button
            onClick={() => excluir(p.id, p.titulo)}
            style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', padding: '5px 12px', fontSize: 12 }}>
            Excluir
          </button>
        </div>
      ))}
    </div>
  )
}

const labelSt: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }

// ══════════════════════════════════════════════════════════════════════════════
// Tab: Banco de Dados
// ══════════════════════════════════════════════════════════════════════════════
type TabelaStats = { tabela: string; registros: number }
type DbStats = { tabelas: TabelaStats[]; tamanho_banco: string; tamanho_banco_bytes: number }

const DB_SECOES: { label: string; cor: string; tabelas: string[] }[] = [
  {
    label: 'Cadastro Territorial',
    cor: '#2563eb',
    tabelas: ['parcelas', 'edificacoes', 'bairros', 'quadras', 'logradouros', 'pessoas'],
  },
  {
    label: 'Processos & Aprovações',
    cor: '#7c3aed',
    tabelas: ['processos', 'habite_se', 'reurb', 'processos_documentos'],
  },
  {
    label: 'Camadas Vetoriais',
    cor: '#059669',
    tabelas: ['camadas_vetoriais', 'camadas_atributos', 'camadas_parcelas'],
  },
]

function secaoDeTabela(nome: string): { label: string; cor: string } {
  for (const s of DB_SECOES) {
    if (s.tabelas.some(t => nome.includes(t))) return s
  }
  return { label: 'Outros', cor: '#6b7280' }
}

function TabBancoDados() {
  const { data, isLoading, refetch, isFetching } = useQuery<DbStats>({
    queryKey: ['db-stats'],
    queryFn: () => api.get('/admin/db-stats').then(r => r.data),
    staleTime: 30_000,
  })

  const totalRegistros = data?.tabelas.reduce((s, t) => s + t.registros, 0) ?? 0
  const maxRegistros = Math.max(...(data?.tabelas.map(t => t.registros) ?? [1]))

  // Agrupa tabelas por seção
  const secoes = data
    ? Object.entries(
        data.tabelas.reduce<Record<string, TabelaStats[]>>((acc, t) => {
          const { label } = secaoDeTabela(t.tabela)
          ;(acc[label] ??= []).push(t)
          return acc
        }, {})
      )
    : []

  // Ordena seções na ordem definida em DB_SECOES, com "Outros" por último
  const ordemSecoes = [...DB_SECOES.map(s => s.label), 'Outros']
  secoes.sort(([a], [b]) => ordemSecoes.indexOf(a) - ordemSecoes.indexOf(b))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>Banco de Dados</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Visão geral das tabelas e armazenamento do SIGWEB
          </p>
        </div>
        <button style={outlineBtn(true)} onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Atualizando...' : '↻ Atualizar'}
        </button>
      </div>

      {/* Cards de resumo */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <StatCard label="Tabelas" value={String(data.tabelas.length)} icon="🗄" />
          <StatCard label="Total de registros" value={totalRegistros.toLocaleString('pt-BR')} icon="📊" />
          <StatCard label="Armazenamento" value={data.tamanho_banco} icon="💾" />
        </div>
      )}

      {isLoading && <p style={{ color: '#6b7280', fontSize: 13 }}>Carregando estatísticas...</p>}

      {/* Tabelas agrupadas por seção */}
      {secoes.map(([secaoLabel, tabelas]) => {
        const secaoCor = [...DB_SECOES, { label: 'Outros', cor: '#6b7280', tabelas: [] }]
          .find(s => s.label === secaoLabel)?.cor ?? '#6b7280'
        return (
          <div key={secaoLabel}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 4, height: 16, background: secaoCor, borderRadius: 2 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {secaoLabel}
              </span>
            </div>
            <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {tabelas.map(t => (
                    <tr key={t.tabela} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 16px', fontFamily: 'monospace', fontSize: 12, color: '#1e3a5f', width: '45%' }}>
                        {t.tabela}
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', width: 90 }}>
                        {t.registros.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '8px 16px' }}>
                        <div style={{ background: '#e5e7eb', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 4,
                            background: secaoCor,
                            width: `${maxRegistros > 0 ? (t.registros / maxRegistros) * 100 : 0}%`,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ fontSize: 28, lineHeight: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1e3a5f' }}>{value}</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Componentes para Desenvolvedores
// ══════════════════════════════════════════════════════════════════════════════

interface PasswordModalProps {
  onClose: () => void
  onSuccess: () => void
}

function PasswordModal({ onClose, onSuccess }: PasswordModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const expectedPassword = import.meta.env.VITE_DEV_PASSWORD
    if (password === expectedPassword) {
      setError(false)
      onSuccess()
    } else {
      setError(true)
      toast.error('Senha incorreta!')
    }
  }

  return (
    <div className="animate-fade-in" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div className="animate-slide-down" style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: 32,
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>🛡️</span>
            <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a', fontWeight: 700 }}>Acesso do Desenvolvedor</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1
            }}
          >
            &times;
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: '1.5' }}>
          Esta área contém ferramentas de diagnóstico de sistema. Digite a credencial para continuar.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Senha de Acesso</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(false)
              }}
              autoFocus
              className={error ? 'animate-shake' : ''}
              style={{
                ...input,
                borderColor: error ? '#ef4444' : '#cbd5e1',
                boxShadow: error ? '0 0 0 2px rgba(239, 68, 68, 0.2)' : 'none',
                padding: '10px 14px',
                fontSize: 14,
                borderRadius: 8
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                ...outlineBtn(),
                flex: 1,
                padding: '10px 16px',
                borderRadius: 8,
                fontWeight: 600
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                ...btn('#0f172a'),
                flex: 1,
                padding: '10px 16px',
                borderRadius: 8,
                fontWeight: 600
              }}
            >
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface WipeDbModalProps {
  onClose: () => void
}

// Confirmação para apagar todos os dados do banco (TRUNCATE) — exige a senha
// novamente; a validação real ocorre no backend (DEV_WIPE_PASSWORD)
function WipeDbModal({ onClose }: WipeDbModalProps) {
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const wipe = useMutation({
    mutationFn: () => api.post('/admin/wipe-db', { senha: password }),
    onSuccess: (res) => {
      toast.success(`Banco de dados apagado (${res.data.tabelas} tabelas zeradas)`)
      qc.clear()
      onClose()
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? 'Erro ao apagar banco de dados')
    },
  })

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: '#ffffff', border: '1px solid #fecaca', borderRadius: 16, padding: 32,
        width: '100%', maxWidth: 440, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 24 }}>🗑️</span>
          <h3 style={{ margin: 0, fontSize: 18, color: '#991b1b', fontWeight: 700 }}>Apagar banco de dados</h3>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, fontSize: 13, color: '#7f1d1d', lineHeight: 1.5 }}>
          ⚠️ Esta ação apaga <strong>todos os dados de todas as tabelas</strong> do banco
          (TRUNCATE), mantendo apenas a estrutura. <strong>Não pode ser desfeita.</strong>
          Disponível somente em ambiente de desenvolvimento.
        </div>

        <form onSubmit={(e) => { e.preventDefault(); setError(null); wipe.mutate() }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Confirme a senha de desenvolvedor</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
              autoFocus
              style={{
                ...input,
                borderColor: error ? '#ef4444' : '#cbd5e1',
                padding: '10px 14px', fontSize: 14, borderRadius: 8,
              }}
            />
            {error && <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span>}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ ...outlineBtn(), flex: 1, padding: '10px 16px', borderRadius: 8, fontWeight: 600 }}>
              Cancelar
            </button>
            <button type="submit" disabled={wipe.isPending || !password} style={{ ...btn('#dc2626'), flex: 1, padding: '10px 16px', borderRadius: 8, fontWeight: 600, opacity: wipe.isPending ? 0.7 : 1 }}>
              {wipe.isPending ? 'Apagando...' : 'Apagar tudo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TabDesenvolvedor({ onLock }: { onLock: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const recentralizar = useMapStore(s => s.recentralizar)
  const { previewPerfil, setPreviewPerfil } = usePermissionsStore()
  const { perfil } = useAuthStore()
  const [latency, setLatency] = useState<number | null>(null)
  const [pinging, setPinging] = useState(false)
  const [pingError, setPingError] = useState<string | null>(null)
  const [showWipeModal, setShowWipeModal] = useState(false)

  const testConnection = async () => {
    setPinging(true)
    setPingError(null)
    const start = performance.now()
    try {
      await api.get('/camadas')
      const end = performance.now()
      setLatency(Math.round(end - start))
    } catch (err: any) {
      setPingError(err.message || 'Erro de conexão')
      setLatency(null)
    } finally {
      setPinging(false)
    }
  }

  const clearStorage = (type: 'local' | 'session' | 'query') => {
    if (type === 'local') {
      localStorage.clear()
      toast.success('Local Storage limpo com sucesso!')
    } else if (type === 'session') {
      sessionStorage.clear()
      toast.success('Session Storage limpo com sucesso!')
    } else if (type === 'query') {
      qc.clear()
      toast.success('React Query Cache limpo!')
    }
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }} className="animate-fade-in">
      {/* Linha superior de informações do sistema */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={{
          ...card,
          background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', right: -20, top: -20, fontSize: 100, opacity: 0.1, pointerEvents: 'none'
          }}>⚙️</div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#60a5fa', fontWeight: 600 }}>Ambiente & Configurações</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            <div>
              <strong>Modo:</strong> 
              <span style={{
                background: import.meta.env.MODE === 'development' ? '#eab308' : '#22c55e',
                color: '#0f172a',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                marginLeft: 6
              }}>{import.meta.env.MODE.toUpperCase()}</span>
            </div>
            <div style={{ wordBreak: 'break-all' }}><strong>API URL:</strong> <code style={{ color: '#93c5fd' }}>{import.meta.env.VITE_API_URL || '(relativa)'}</code></div>
            <div style={{ wordBreak: 'break-all' }}><strong>Tileserv:</strong> <code style={{ color: '#93c5fd' }}>{import.meta.env.VITE_PG_TILESERV_URL || 'Não definido'}</code></div>
            <div><strong>Mapillary Token:</strong> {import.meta.env.VITE_MAPILLARY_TOKEN ? '✅ Configurado' : '❌ Ausente'}</div>
          </div>
        </div>

        <div style={{ ...card, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: 16, color: '#1e3a5f', fontWeight: 600 }}>Simulador de Perfil</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#6b7280' }}>
              Simule a visualização do sistema sob a perspectiva de outro cargo de usuário.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>Cargo Ativo:</label>
              <select
                value={previewPerfil || perfil || ''}
                onChange={(e) => setPreviewPerfil((e.target.value as PerfilKey) || null)}
                style={{
                  ...input,
                  background: '#f3f4f6',
                  fontWeight: 500,
                  color: '#1f2937'
                }}
              >
                <option value="">Cargo Original ({perfil || 'Nenhum'})</option>
                {ROLES.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          {previewPerfil && (
            <div style={{
              marginTop: 12, background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#1e40af'
            }}>
              ⚠️ Você está visualizando o SIG como <strong>{previewPerfil}</strong>.
            </div>
          )}
        </div>

        <div style={{ ...card, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: 16, color: '#1e3a5f', fontWeight: 600 }}>Diagnóstico da API</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#6b7280' }}>
              Teste a resposta e a latência de rede com o servidor.
            </p>
            
            {latency !== null && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0',
                background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46',
                borderRadius: 6, padding: '8px 12px', fontSize: 13
              }}>
                <span style={{ fontSize: 16 }}>⚡</span>
                <span>Conexão bem-sucedida! Latência: <strong>{latency} ms</strong></span>
              </div>
            )}

            {pingError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0',
                background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b',
                borderRadius: 6, padding: '8px 12px', fontSize: 13
              }}>
                <span style={{ fontSize: 16 }}>❌</span>
                <span>{pingError}</span>
              </div>
            )}
          </div>

          <button
            onClick={testConnection}
            disabled={pinging}
            style={{
              ...btn('#2563eb'),
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: pinging ? 0.7 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            {pinging ? 'Testando...' : '↻ Testar Conexão'}
          </button>
        </div>

        <div style={{ ...card, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: 16, color: '#1e3a5f', fontWeight: 600 }}>Mapa</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#6b7280' }}>
              Volta o mapa para a visão inicial do sistema, que destaca o município de Tupanciretã.
            </p>
          </div>
          <button
            onClick={() => { navigate('/mapa'); recentralizar() }}
            style={{
              ...btn('#1e3a5f'),
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            🎯 Recentralizar Mapa
          </button>
        </div>
      </div>

      {/* Ações de Gerenciamento de Dados */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h3 style={{ margin: '0 0 6px 0', fontSize: 16, color: '#1e3a5f', fontWeight: 600 }}>Limpeza de Estado & Cache</h3>
          <p style={{ margin: '0', fontSize: 12, color: '#6b7280' }}>
            Redefina dados salvos localmente para depuração e atualização imediata do painel. A página será recarregada após a limpeza.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <button
            onClick={() => clearStorage('query')}
            style={{
              ...outlineBtn(),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '16px 12px',
              textAlign: 'center',
              border: '1px dashed #cbd5e1',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
          >
            <span style={{ fontSize: 20 }}>🧹</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Limpar React Query Cache</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Forçar re-fetch de todos os dados</span>
          </button>

          <button
            onClick={() => clearStorage('session')}
            style={{
              ...outlineBtn(),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '16px 12px',
              textAlign: 'center',
              border: '1px dashed #cbd5e1',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
          >
            <span style={{ fontSize: 20 }}>💾</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Limpar Session Storage</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Limpa tokens de abas temporários</span>
          </button>

          <button
            onClick={() => clearStorage('local')}
            style={{
              ...outlineBtn(),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '16px 12px',
              textAlign: 'center',
              border: '1px dashed #cbd5e1',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
          >
            <span style={{ fontSize: 20 }}>⚙️</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Limpar Local Storage</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Limpa credenciais/preferências persistentes</span>
          </button>
        </div>
      </div>

      {/* Zona de Perigo */}
      {import.meta.env.DEV && (
        <div style={{ ...card, border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 16, color: '#991b1b', fontWeight: 600 }}>⚠️ Zona de Perigo</h3>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              Apaga todos os dados de todas as tabelas do banco (TRUNCATE), mantendo a estrutura.
              Disponível somente em ambiente de desenvolvimento — bloqueado em produção.
            </p>
          </div>
          <button
            onClick={() => setShowWipeModal(true)}
            style={{ ...btn('#dc2626'), alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            🗑️ Apagar Banco de Dados
          </button>
        </div>
      )}

      {showWipeModal && <WipeDbModal onClose={() => setShowWipeModal(false)} />}

      {/* Ação para bloqueio */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onLock}
          style={{
            ...outlineBtn(),
            color: '#ef4444',
            borderColor: '#fca5a5',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          🔒 Bloquear Área de Desenvolvedor
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Página principal
// ══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'camadas',    label: 'Camadas Vetoriais' },
  { id: 'camadas_wms', label: 'Camadas WMS' },
  { id: 'importar',  label: 'Importar' },
  { id: 'tabela',    label: 'Tabela de Atributos' },
  { id: 'imagens360', label: 'Imagens 360°' },
  { id: 'banco',     label: 'Banco de Dados' },
  { id: 'usuarios',  label: 'Usuários' },
]

export function GestaoSIGPage({ onPreview }: { onPreview?: (p: PerfilKey) => void } = {}) {
  const [tab, setTab] = useState('camadas')
  const [isDevUnlocked, setIsDevUnlocked] = useState(() => sessionStorage.getItem('sigweb_dev_unlocked') === 'true')
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const visibleTabs = isDevUnlocked
    ? [...TABS, { id: 'desenvolvedor', label: '⚙️ Desenvolvedor' }]
    : TABS

  const handleLock = () => {
    sessionStorage.removeItem('sigweb_dev_unlocked')
    setIsDevUnlocked(false)
    if (tab === 'desenvolvedor') setTab('camadas')
    toast.success('Área do desenvolvedor bloqueada')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f9fafb' }}>
      {/* Cabeçalho */}
      <div style={{
        padding: '16px 24px',
        background: 'white',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#1e3a5f' }}>Gestão do SIG</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
            Ferramentas de gerenciamento de dados geoespaciais
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isDevUnlocked ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setTab('desenvolvedor')}
                style={{
                  ...outlineBtn(true),
                  borderColor: tab === 'desenvolvedor' ? '#10b981' : '#d1d5db',
                  color: tab === 'desenvolvedor' ? '#047857' : '#374151',
                  background: tab === 'desenvolvedor' ? '#ecfdf5' : 'white',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                🔓 Painel Dev Aberto
              </button>
              <button
                onClick={handleLock}
                style={{
                  ...outlineBtn(true),
                  color: '#ef4444',
                  borderColor: '#fca5a5'
                }}
                title="Bloquear painel"
              >
                Bloquear 🔒
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowPasswordModal(true)}
              style={{
                ...outlineBtn(true),
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600
              }}
            >
              🛠️ Área do Dev
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '0 24px', display: 'flex', gap: 0 }}>
        {visibleTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 18px', border: 'none', cursor: 'pointer', fontSize: 13,
            background: 'none', fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? '#2563eb' : '#6b7280',
            borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {tab === 'camadas'    && <TabCamadas />}
        {tab === 'camadas_wms' && <TabCamadasWms />}
        {tab === 'importar'   && <TabImportar />}
        {tab === 'tabela'     && <TabTabela />}
        {tab === 'imagens360' && <TabImagens360 />}
        {tab === 'banco'      && <TabBancoDados />}
        {tab === 'usuarios'   && <TabUsuarios onPreview={onPreview} />}
        {tab === 'desenvolvedor' && isDevUnlocked && <TabDesenvolvedor onLock={handleLock} />}
      </div>

      {showPasswordModal && (
        <PasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={() => {
            setIsDevUnlocked(true)
            sessionStorage.setItem('sigweb_dev_unlocked', 'true')
            setShowPasswordModal(false)
            setTab('desenvolvedor')
            toast.success('Área do desenvolvedor desbloqueada!')
          }}
        />
      )}
    </div>
  )
}

