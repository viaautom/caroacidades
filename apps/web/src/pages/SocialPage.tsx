import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import L from 'leaflet'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { supabase, STORAGE_BUCKET } from '../lib/supabase'
import { CadastrosAuxiliaresPanel } from './SocialAuxiliares'

const TUPANCIRETA: [number, number] = [-29.079, -53.841]

type Familia = {
  id: string
  codigo: string
  situacao_cadastral: string
  qtd_membros: number
  renda_bruta: number | null
  renda_per_capita: number | null
  indice_vulnerabilidade: number | null
  programas_sociais: string[]
  empreendimento_id: string | null
  tipo_imovel_moradia: string | null
  situacao_terreno: string | null
  area_terreno_m2: number | null
  created_at: string
  geometry: { type: string; coordinates: [number, number] } | null
}

type Stat = { situacao_cadastral: string; total: number }

type Membro = {
  id: string
  codigo: string | null
  nome: string
  data_nascimento: string | null
  sexo: string | null
  escolaridade: string | null
  parentesco: string | null
  compoe_renda: boolean
  rg: string | null
  ctps: string | null
  certidao: string | null
  telefone: string | null
  estado_civil: string | null
  nome_pai: string | null
  nome_mae: string | null
  conjuge_id: string | null
  cpf: string | null
  nis: string | null
  pis: string | null
}

type Renda = {
  id: string
  pessoa_id: string
  tipo_renda_id: string | null
  tipo_renda_nome: string | null
  valor: number
  compoe_renda: boolean
}

type Informacao = {
  id: string
  familia_id: string
  tipo: string
  descricao: string | null
  score: number
}

type TipoRenda = { id: string; nome: string }
type Empreendimento = { id: string; nome: string; situacao: string; qtd_unidades: number | null }
type Programa = { id: string; nome: string; descricao: string | null }
type Deficiencia = { id: string; pessoa_id: string; cid_codigo: string | null; descricao: string }
type Ocorrencia = { id: string; familia_id: string; tipo: string; descricao: string | null; data_ocorrencia: string }
type Documento = { id: string; familia_id: string; pessoa_id: string | null; nome: string; url: string; created_at: string }

type FamiliaDetalhe = Familia & {
  empreendimento_nome: string | null
  membros: Membro[]
  rendas: Renda[]
  informacoes: Informacao[]
  deficiencias: Deficiencia[]
  ocorrencias: Ocorrencia[]
  documentos: Documento[]
}

const COR: Record<string, string> = {
  ativo:      '#10b981',
  inativo:    '#9ca3af',
  pendente:   '#f59e0b',
  vulneravel: '#ef4444',
}

const PARENTESCOS = ['Responsável', 'Cônjuge', 'Filho(a)', 'Pai', 'Mãe', 'Outro']
const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)']
const TIPOS_INFORMACAO = [
  'Pessoa com deficiência', 'Doença crônica/grave', 'Desemprego', 'Situação de rua/risco',
  'Trabalho infantil', 'Violência doméstica', 'Gestante/nutriz', 'Outro',
]
const TIPOS_IMOVEL_MORADIA = ['Próprio', 'Alugado', 'Cedido', 'Ocupação/Posse', 'Financiado']
const SITUACOES_TERRENO = ['Regularizado', 'Em regularização', 'Irregular', 'Área de risco']
const TIPOS_OCORRENCIA = ['Visita técnica', 'Denúncia', 'Atendimento', 'Reunião', 'Outro']

const fmt = (v?: number | null) =>
  v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'

function idade(dataNascimento?: string | null): number | null {
  if (!dataNascimento) return null
  const nasc = new Date(dataNascimento)
  if (isNaN(nasc.getTime())) return null
  const hoje = new Date()
  let anos = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--
  return anos
}

function vulnInfo(indice?: number | null) {
  const v = Number(indice ?? 0)
  if (v >= 60) return { label: 'Alto', color: '#ef4444' }
  if (v >= 30) return { label: 'Médio', color: '#f59e0b' }
  return { label: 'Baixo', color: '#10b981' }
}

const inputSt: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', width: '100%',
}
const addBtnSt: React.CSSProperties = {
  background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 6,
  padding: '6px 10px', fontSize: 12, cursor: 'pointer', marginTop: 6,
}
const saveBtnSt: React.CSSProperties = {
  background: '#1e3a5f', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
}
const cancelBtnSt: React.CSSProperties = {
  background: 'none', border: '1px solid #d1d5db', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#6b7280',
}
const sectionTitleSt: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '16px 0 8px',
}

export function SocialPage() {
  const [situacao, setSituacao] = useState('')
  const [selected, setSelected] = useState<Familia | null>(null)

  const mapDiv = useRef<HTMLDivElement>(null)
  const lmap = useRef<L.Map | null>(null)
  const markersLayer = useRef<L.LayerGroup>(L.layerGroup())
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

  const { data: familias = [] } = useQuery<Familia[]>({
    queryKey: ['social-familias', situacao],
    queryFn: () =>
      api.get(`/social/familias${situacao ? `?situacao=${situacao}` : ''}`).then(r => r.data),
  })

  const { data: stats = [] } = useQuery<Stat[]>({
    queryKey: ['social-stats'],
    queryFn: () => api.get('/social/stats').then(r => r.data),
  })

  const { data: detalhe } = useQuery<FamiliaDetalhe>({
    queryKey: ['social-familia', selected?.id],
    queryFn: () => api.get(`/social/familias/${selected!.id}`).then(r => r.data),
    enabled: !!selected,
  })

  const { data: tiposRenda = [] } = useQuery<TipoRenda[]>({
    queryKey: ['social-tipos-renda'],
    queryFn: () => api.get('/social/tipos-renda').then(r => r.data),
  })

  const { data: empreendimentos = [] } = useQuery<Empreendimento[]>({
    queryKey: ['social-catalog', '/social/empreendimentos'],
    queryFn: () => api.get('/social/empreendimentos').then(r => r.data),
  })

  const { data: programas = [] } = useQuery<Programa[]>({
    queryKey: ['social-catalog', '/social/programas'],
    queryFn: () => api.get('/social/programas').then(r => r.data),
  })

  const chartData = stats.map(s => ({
    name: s.situacao_cadastral,
    value: s.total,
    fill: COR[s.situacao_cadastral] ?? '#6b7280',
  }))

  // Mapa embutido: marcadores coloridos por situação cadastral, clicar
  // seleciona a família e rola até a linha correspondente na tabela (req 94)
  useEffect(() => {
    if (!mapDiv.current || lmap.current) return
    const map = L.map(mapDiv.current, { center: TUPANCIRETA, zoom: 13, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 20,
    }).addTo(map)
    markersLayer.current.addTo(map)
    lmap.current = map
    setTimeout(() => map.invalidateSize(), 100)
    return () => { map.remove(); lmap.current = null }
  }, [])

  useEffect(() => {
    if (!lmap.current) return
    const group = markersLayer.current
    group.clearLayers()
    familias.forEach(f => {
      if (!f.geometry?.coordinates) return
      const [lng, lat] = f.geometry.coordinates
      const cor = COR[f.situacao_cadastral] ?? '#9ca3af'
      const isSelected = selected?.id === f.id
      const marker = L.circleMarker([lat, lng], {
        radius: isSelected ? 9 : 6,
        color: isSelected ? '#1e3a5f' : cor,
        fillColor: cor, fillOpacity: 0.85, weight: isSelected ? 3 : 1,
      })
      marker.bindTooltip(`${f.codigo} — ${f.situacao_cadastral}`)
      marker.on('click', () => {
        setSelected(f)
        rowRefs.current.get(f.id)?.scrollIntoView({ block: 'nearest' })
      })
      group.addLayer(marker)
    })
  }, [familias, selected])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Lista */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: 20 }}>Cadastro Social</h2>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{familias.length} famílias</p>
          </div>
          <select
            value={situacao}
            onChange={e => setSituacao(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
          >
            <option value="">Todas as situações</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="pendente">Pendente</option>
            <option value="vulneravel">Vulnerável</option>
          </select>
        </div>

        <CadastrosAuxiliaresPanel />

        {/* Gráfico pizza + mapa */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {chartData.length > 0 && (
            <div style={{ flex: '1 1 320px', background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', padding: 16 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>
                Distribuição por Situação <span style={{ fontWeight: 400, textTransform: 'none', color: '#9ca3af' }}>(clique para filtrar)</span>
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={chartData} dataKey="value" nameKey="name" outerRadius={70}
                    label={({ name, value }) => `${name}: ${value}`}
                    onClick={(d: any) => setSituacao(s => s === d.name ? '' : d.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} stroke={situacao === d.name ? '#1e3a5f' : 'none'} strokeWidth={situacao === d.name ? 3 : 0} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ flex: '1 1 320px', background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', padding: 16 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>Mapa — Famílias</p>
            <div ref={mapDiv} style={{ height: 180, borderRadius: 6, overflow: 'hidden' }} />
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Código', 'Situação', 'Membros', 'Renda bruta', 'Renda per capita', 'Vulnerabilidade', 'Programas'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {familias.map(f => {
                const vi = vulnInfo(f.indice_vulnerabilidade)
                return (
                  <tr
                    key={f.id}
                    ref={el => { if (el) rowRefs.current.set(f.id, el); else rowRefs.current.delete(f.id) }}
                    onClick={() => setSelected(f)}
                    style={{
                      borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                      background: selected?.id === f.id ? '#eff6ff' : 'white',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e3a5f' }}>{f.codigo}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        background: (COR[f.situacao_cadastral] ?? '#9ca3af') + '22',
                        color: COR[f.situacao_cadastral] ?? '#9ca3af',
                        padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                      }}>{f.situacao_cadastral}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{f.qtd_membros}</td>
                    <td style={{ padding: '10px 12px' }}>{fmt(f.renda_bruta)}</td>
                    <td style={{ padding: '10px 12px' }}>{fmt(f.renda_per_capita)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: vi.color + '22', color: vi.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                        {Number(f.indice_vulnerabilidade ?? 0).toFixed(0)} · {vi.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: 12 }}>
                      {(f.programas_sociais ?? []).join(', ') || '—'}
                    </td>
                  </tr>
                )
              })}
              {familias.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Nenhum registro encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalhe */}
      {selected && (
        <div style={{
          width: 380, background: 'white', borderLeft: '1px solid #e5e7eb',
          overflowY: 'auto', padding: 20, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#1e3a5f' }}>{selected.codigo}</h3>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
          </div>
          {detalhe && (
            <>
              <Row label="Membros" value={String(detalhe.qtd_membros)} />
              <Row label="Renda bruta" value={fmt(detalhe.renda_bruta)} />
              <Row label="Per capita" value={fmt(detalhe.renda_per_capita)} />
              <VulnerabilidadeRow indice={detalhe.indice_vulnerabilidade} />

              <p style={sectionTitleSt}>Situação, moradia e programas</p>
              <FamiliaInfoForm detalhe={detalhe} empreendimentos={empreendimentos} programas={programas} />

              <p style={sectionTitleSt}>Membros</p>
              {detalhe.membros.map(m => (
                <MembroCard
                  key={m.id}
                  membro={m}
                  rendas={detalhe.rendas.filter(r => r.pessoa_id === m.id)}
                  deficiencias={detalhe.deficiencias.filter(d => d.pessoa_id === m.id)}
                  tiposRenda={tiposRenda}
                  familiaId={detalhe.id}
                />
              ))}
              <AddMembroForm familiaId={detalhe.id} membros={detalhe.membros} />

              <p style={sectionTitleSt}>Informações sociais</p>
              {detalhe.informacoes.length === 0 && (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>Nenhuma informação registrada</p>
              )}
              {detalhe.informacoes.map(info => (
                <InformacaoRow key={info.id} info={info} familiaId={detalhe.id} />
              ))}
              <AddInformacaoForm familiaId={detalhe.id} />

              <p style={sectionTitleSt}>Ocorrências</p>
              {detalhe.ocorrencias.length === 0 && (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>Nenhuma ocorrência registrada</p>
              )}
              {detalhe.ocorrencias.map(o => (
                <OcorrenciaRow key={o.id} ocorrencia={o} familiaId={detalhe.id} />
              ))}
              <AddOcorrenciaForm familiaId={detalhe.id} />

              <p style={sectionTitleSt}>Documentos / Fotos</p>
              {detalhe.documentos.length === 0 && (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>Nenhum documento anexado</p>
              )}
              {detalhe.documentos.map(d => (
                <DocumentoRow key={d.id} documento={d} familiaId={detalhe.id} />
              ))}
              <AddDocumentoForm familiaId={detalhe.id} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: '#6b7280', width: 120, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value ?? '—'}</span>
    </div>
  )
}

function VulnerabilidadeRow({ indice }: { indice: number | null }) {
  const vi = vulnInfo(indice)
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f3f4f6', padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: '#6b7280', width: 120, flexShrink: 0 }}>Vulnerabilidade</span>
      <span style={{ fontWeight: 600 }}>{Number(indice ?? 0).toFixed(0)}/100</span>
      <span style={{ marginLeft: 8, background: vi.color + '22', color: vi.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{vi.label}</span>
    </div>
  )
}

function FamiliaInfoForm({ detalhe, empreendimentos, programas }: {
  detalhe: FamiliaDetalhe; empreendimentos: Empreendimento[]; programas: Programa[]
}) {
  const qc = useQueryClient()
  const [situacao, setSituacao] = useState(detalhe.situacao_cadastral)
  const [empreendimentoId, setEmpreendimentoId] = useState(detalhe.empreendimento_id ?? '')
  const [tipoImovel, setTipoImovel] = useState(detalhe.tipo_imovel_moradia ?? '')
  const [situacaoTerreno, setSituacaoTerreno] = useState(detalhe.situacao_terreno ?? '')
  const [areaTerreno, setAreaTerreno] = useState(detalhe.area_terreno_m2 != null ? String(detalhe.area_terreno_m2) : '')
  const [programasSel, setProgramasSel] = useState<string[]>(detalhe.programas_sociais ?? [])

  useEffect(() => {
    setSituacao(detalhe.situacao_cadastral)
    setEmpreendimentoId(detalhe.empreendimento_id ?? '')
    setTipoImovel(detalhe.tipo_imovel_moradia ?? '')
    setSituacaoTerreno(detalhe.situacao_terreno ?? '')
    setAreaTerreno(detalhe.area_terreno_m2 != null ? String(detalhe.area_terreno_m2) : '')
    setProgramasSel(detalhe.programas_sociais ?? [])
  }, [detalhe.id])

  const salvar = useMutation({
    mutationFn: () => api.patch(`/social/familias/${detalhe.id}`, {
      situacaoCadastral: situacao,
      empreendimentoId: empreendimentoId || null,
      tipoImovelMoradia: tipoImovel || null,
      situacaoTerreno: situacaoTerreno || null,
      areaTerrenoM2: areaTerreno ? Number(areaTerreno) : null,
      programasSociais: programasSel,
    }),
    onSuccess: () => {
      toast.success('Dados atualizados')
      qc.invalidateQueries({ queryKey: ['social-familia', detalhe.id] })
      qc.invalidateQueries({ queryKey: ['social-familias'] })
      qc.invalidateQueries({ queryKey: ['social-stats'] })
    },
    onError: () => toast.error('Erro ao atualizar'),
  })

  const togglePrograma = (nome: string) => {
    setProgramasSel(p => p.includes(nome) ? p.filter(x => x !== nome) : [...p, nome])
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <select value={situacao} onChange={e => setSituacao(e.target.value)} style={inputSt}>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
          <option value="pendente">Pendente</option>
          <option value="vulneravel">Vulnerável</option>
        </select>
        <select value={empreendimentoId} onChange={e => setEmpreendimentoId(e.target.value)} style={inputSt}>
          <option value="">Empreendimento — nenhum</option>
          {empreendimentos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <select value={tipoImovel} onChange={e => setTipoImovel(e.target.value)} style={inputSt}>
          <option value="">Imóvel de moradia</option>
          {TIPOS_IMOVEL_MORADIA.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={situacaoTerreno} onChange={e => setSituacaoTerreno(e.target.value)} style={inputSt}>
          <option value="">Situação do terreno</option>
          {SITUACOES_TERRENO.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="number" min="0" step="0.01" placeholder="Área do terreno (m²)"
          value={areaTerreno} onChange={e => setAreaTerreno(e.target.value)}
          style={{ ...inputSt, gridColumn: '1 / -1' }}
        />
      </div>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', margin: '8px 0 4px' }}>Programas sociais</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {programas.map(p => (
          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 12, padding: '2px 8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={programasSel.includes(p.nome)} onChange={() => togglePrograma(p.nome)} /> {p.nome}
          </label>
        ))}
      </div>
      <button onClick={() => salvar.mutate()} disabled={salvar.isPending} style={{ ...saveBtnSt, marginTop: 8 }}>Salvar</button>
    </div>
  )
}

function MembroCard({ membro, rendas, deficiencias, tiposRenda, familiaId }: {
  membro: Membro; rendas: Renda[]; deficiencias: Deficiencia[]; tiposRenda: TipoRenda[]; familiaId: string
}) {
  const qc = useQueryClient()
  const [showRenda, setShowRenda] = useState(false)
  const [tipoRendaId, setTipoRendaId] = useState('')
  const [valor, setValor] = useState('')
  const [showDef, setShowDef] = useState(false)
  const [cidCodigo, setCidCodigo] = useState('')
  const [descDef, setDescDef] = useState('')

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['social-familia', familiaId] })
    qc.invalidateQueries({ queryKey: ['social-familias'] })
  }

  const delMembro = useMutation({
    mutationFn: () => api.delete(`/social/membros/${membro.id}`),
    onSuccess: () => { toast.success('Membro removido'); invalidar() },
    onError: () => toast.error('Erro ao remover membro'),
  })

  const addRenda = useMutation({
    mutationFn: () => api.post(`/social/membros/${membro.id}/rendas`, {
      tipoRendaId: tipoRendaId || null, valor: Number(valor), compoeRenda: true,
    }),
    onSuccess: () => {
      toast.success('Renda adicionada')
      setValor(''); setTipoRendaId(''); setShowRenda(false)
      invalidar()
    },
    onError: () => toast.error('Erro ao adicionar renda'),
  })

  const delRenda = useMutation({
    mutationFn: (id: string) => api.delete(`/social/rendas/${id}`),
    onSuccess: invalidar,
    onError: () => toast.error('Erro ao remover renda'),
  })

  const addDeficiencia = useMutation({
    mutationFn: () => api.post(`/social/membros/${membro.id}/deficiencias`, {
      cidCodigo: cidCodigo || null, descricao: descDef,
    }),
    onSuccess: () => {
      toast.success('Deficiência registrada')
      setCidCodigo(''); setDescDef(''); setShowDef(false)
      invalidar()
    },
    onError: () => toast.error('Erro ao registrar deficiência'),
  })

  const delDeficiencia = useMutation({
    mutationFn: (id: string) => api.delete(`/social/deficiencias/${id}`),
    onSuccess: invalidar,
    onError: () => toast.error('Erro ao remover deficiência'),
  })

  const idadeAnos = idade(membro.data_nascimento)

  return (
    <div style={{ border: '1px solid #f3f4f6', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontWeight: 700 }}>{membro.nome}</span>
          {membro.parentesco && <span style={{ color: '#6b7280', marginLeft: 6 }}>({membro.parentesco})</span>}
          {idadeAnos != null && <span style={{ color: '#6b7280', marginLeft: 6 }}>{idadeAnos} anos</span>}
          {membro.compoe_renda && <span style={{ color: '#059669', marginLeft: 6, fontSize: 11 }}>● compõe renda</span>}
        </div>
        <button onClick={() => delMembro.mutate()} disabled={delMembro.isPending} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>🗑</button>
      </div>

      <div style={{ color: '#6b7280', marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
        {membro.codigo && <span>Código: {membro.codigo}</span>}
        {membro.sexo && <span>Sexo: {membro.sexo}</span>}
        {membro.estado_civil && <span>Estado civil: {membro.estado_civil}</span>}
        {membro.escolaridade && <span>Escolaridade: {membro.escolaridade}</span>}
        {membro.telefone && <span>Tel: {membro.telefone}</span>}
        {membro.rg && <span>RG: {membro.rg}</span>}
        {membro.ctps && <span>CTPS: {membro.ctps}</span>}
        {membro.certidao && <span>Certidão: {membro.certidao}</span>}
        {membro.cpf && <span>CPF: {membro.cpf}</span>}
        {membro.nis && <span>NIS: {membro.nis}</span>}
        {membro.pis && <span>PIS: {membro.pis}</span>}
        {membro.nome_pai && <span>Pai: {membro.nome_pai}</span>}
        {membro.nome_mae && <span>Mãe: {membro.nome_mae}</span>}
      </div>

      {rendas.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {rendas.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>{r.tipo_renda_nome ?? 'Renda'}: {fmt(r.valor)}{!r.compoe_renda && ' (não compõe)'}</span>
              <button onClick={() => delRenda.mutate(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {showRenda ? (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <select value={tipoRendaId} onChange={e => setTipoRendaId(e.target.value)} style={{ ...inputSt, width: 'auto', flex: 1 }}>
            <option value="">Tipo</option>
            {tiposRenda.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <input type="number" min="0" step="0.01" placeholder="Valor" value={valor} onChange={e => setValor(e.target.value)} style={{ ...inputSt, width: 80 }} />
          <button onClick={() => addRenda.mutate()} disabled={!valor || addRenda.isPending} style={saveBtnSt}>OK</button>
          <button onClick={() => setShowRenda(false)} style={cancelBtnSt}>✕</button>
        </div>
      ) : (
        <button onClick={() => setShowRenda(true)} style={addBtnSt}>+ renda</button>
      )}

      {deficiencias.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {deficiencias.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>♿ {d.cid_codigo ? `[${d.cid_codigo}] ` : ''}{d.descricao}</span>
              <button onClick={() => delDeficiencia.mutate(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {showDef ? (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <input placeholder="CID" value={cidCodigo} onChange={e => setCidCodigo(e.target.value)} style={{ ...inputSt, width: 60 }} />
          <input placeholder="Descrição" value={descDef} onChange={e => setDescDef(e.target.value)} style={{ ...inputSt, flex: 1 }} />
          <button onClick={() => addDeficiencia.mutate()} disabled={!descDef || addDeficiencia.isPending} style={saveBtnSt}>OK</button>
          <button onClick={() => setShowDef(false)} style={cancelBtnSt}>✕</button>
        </div>
      ) : (
        <button onClick={() => setShowDef(true)} style={addBtnSt}>+ deficiência</button>
      )}
    </div>
  )
}

const emptyMembroForm = {
  nome: '', dataNascimento: '', sexo: '', parentesco: '', estadoCivil: '', telefone: '', escolaridade: '',
  compoeRenda: false, rg: '', ctps: '', certidao: '', cpf: '', nis: '', pis: '', nomePai: '', nomeMae: '', conjugeId: '',
}

function AddMembroForm({ familiaId, membros }: { familiaId: string; membros: Membro[] }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyMembroForm)

  const set = (k: keyof typeof emptyMembroForm, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const addMembro = useMutation({
    mutationFn: () => api.post(`/social/familias/${familiaId}/membros`, {
      nome: form.nome,
      dataNascimento: form.dataNascimento || null,
      sexo: form.sexo || null,
      parentesco: form.parentesco || null,
      estadoCivil: form.estadoCivil || null,
      telefone: form.telefone || null,
      escolaridade: form.escolaridade || null,
      compoeRenda: form.compoeRenda,
      rg: form.rg || null,
      ctps: form.ctps || null,
      certidao: form.certidao || null,
      cpf: form.cpf || null,
      nis: form.nis || null,
      pis: form.pis || null,
      nomePai: form.nomePai || null,
      nomeMae: form.nomeMae || null,
      conjugeId: form.conjugeId || null,
    }),
    onSuccess: () => {
      toast.success('Membro adicionado')
      setForm(emptyMembroForm)
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['social-familia', familiaId] })
      qc.invalidateQueries({ queryKey: ['social-familias'] })
    },
    onError: () => toast.error('Erro ao adicionar membro'),
  })

  if (!open) return <button onClick={() => setOpen(true)} style={addBtnSt}>+ Adicionar membro</button>

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginTop: 6, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <input placeholder="Nome*" value={form.nome} onChange={e => set('nome', e.target.value)} style={{ ...inputSt, gridColumn: '1 / -1' }} />
        <input type="date" value={form.dataNascimento} onChange={e => set('dataNascimento', e.target.value)} style={inputSt} />
        <select value={form.sexo} onChange={e => set('sexo', e.target.value)} style={inputSt}>
          <option value="">Sexo</option><option value="M">M</option><option value="F">F</option>
        </select>
        <select value={form.parentesco} onChange={e => set('parentesco', e.target.value)} style={inputSt}>
          <option value="">Parentesco</option>
          {PARENTESCOS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={form.estadoCivil} onChange={e => set('estadoCivil', e.target.value)} style={inputSt}>
          <option value="">Estado civil</option>
          {ESTADOS_CIVIS.map(e2 => <option key={e2} value={e2}>{e2}</option>)}
        </select>
        <input placeholder="Telefone" value={form.telefone} onChange={e => set('telefone', e.target.value)} style={inputSt} />
        <input placeholder="Escolaridade" value={form.escolaridade} onChange={e => set('escolaridade', e.target.value)} style={inputSt} />
        <input placeholder="RG" value={form.rg} onChange={e => set('rg', e.target.value)} style={inputSt} />
        <input placeholder="CTPS" value={form.ctps} onChange={e => set('ctps', e.target.value)} style={inputSt} />
        <input placeholder="Certidão" value={form.certidao} onChange={e => set('certidao', e.target.value)} style={inputSt} />
        <input placeholder="CPF" value={form.cpf} onChange={e => set('cpf', e.target.value)} style={inputSt} />
        <input placeholder="NIS" value={form.nis} onChange={e => set('nis', e.target.value)} style={inputSt} />
        <input placeholder="PIS" value={form.pis} onChange={e => set('pis', e.target.value)} style={inputSt} />
        <input placeholder="Nome do pai" value={form.nomePai} onChange={e => set('nomePai', e.target.value)} style={inputSt} />
        <input placeholder="Nome da mãe" value={form.nomeMae} onChange={e => set('nomeMae', e.target.value)} style={inputSt} />
        {membros.length > 0 && (
          <select value={form.conjugeId} onChange={e => set('conjugeId', e.target.value)} style={{ ...inputSt, gridColumn: '1 / -1' }}>
            <option value="">Cônjuge — nenhum</option>
            {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, gridColumn: '1 / -1' }}>
          <input type="checkbox" checked={form.compoeRenda} onChange={e => set('compoeRenda', e.target.checked)} /> Compõe renda
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={() => addMembro.mutate()} disabled={!form.nome || addMembro.isPending} style={saveBtnSt}>Salvar</button>
        <button onClick={() => { setOpen(false); setForm(emptyMembroForm) }} style={cancelBtnSt}>Cancelar</button>
      </div>
    </div>
  )
}

function InformacaoRow({ info, familiaId }: { info: Informacao; familiaId: string }) {
  const qc = useQueryClient()
  const delInfo = useMutation({
    mutationFn: () => api.delete(`/social/informacoes/${info.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-familia', familiaId] })
      qc.invalidateQueries({ queryKey: ['social-familias'] })
    },
    onError: () => toast.error('Erro ao remover informação'),
  })
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
      <div>
        <span style={{ fontWeight: 600 }}>{info.tipo}</span>
        {info.descricao && <span style={{ color: '#6b7280', marginLeft: 6 }}>{info.descricao}</span>}
        <span style={{ marginLeft: 6, color: '#ef4444', fontWeight: 600 }}>+{info.score} pts</span>
      </div>
      <button onClick={() => delInfo.mutate()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
    </div>
  )
}

function AddInformacaoForm({ familiaId }: { familiaId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [score, setScore] = useState('10')

  const addInfo = useMutation({
    mutationFn: () => api.post(`/social/familias/${familiaId}/informacoes`, {
      tipo, descricao: descricao || null, score: Number(score),
    }),
    onSuccess: () => {
      toast.success('Informação registrada')
      setTipo(''); setDescricao(''); setScore('10'); setOpen(false)
      qc.invalidateQueries({ queryKey: ['social-familia', familiaId] })
      qc.invalidateQueries({ queryKey: ['social-familias'] })
    },
    onError: () => toast.error('Erro ao registrar informação'),
  })

  if (!open) return <button onClick={() => setOpen(true)} style={addBtnSt}>+ Adicionar informação</button>

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginTop: 6 }}>
      <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inputSt, marginBottom: 6 }}>
        <option value="">Tipo de informação</option>
        {TIPOS_INFORMACAO.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input placeholder="Descrição (opcional)" value={descricao} onChange={e => setDescricao(e.target.value)} style={{ ...inputSt, marginBottom: 6 }} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: '#6b7280' }}>Peso na vulnerabilidade (0-30):</label>
        <input type="number" min={0} max={30} value={score} onChange={e => setScore(e.target.value)} style={{ ...inputSt, width: 60 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={() => addInfo.mutate()} disabled={!tipo || addInfo.isPending} style={saveBtnSt}>Salvar</button>
        <button onClick={() => setOpen(false)} style={cancelBtnSt}>Cancelar</button>
      </div>
    </div>
  )
}

function OcorrenciaRow({ ocorrencia, familiaId }: { ocorrencia: Ocorrencia; familiaId: string }) {
  const qc = useQueryClient()
  const delOcorrencia = useMutation({
    mutationFn: () => api.delete(`/social/ocorrencias/${ocorrencia.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-familia', familiaId] }),
    onError: () => toast.error('Erro ao remover ocorrência'),
  })
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
      <div>
        <span style={{ fontWeight: 600 }}>{ocorrencia.tipo}</span>
        <span style={{ color: '#6b7280', marginLeft: 6 }}>{new Date(ocorrencia.data_ocorrencia).toLocaleDateString('pt-BR')}</span>
        {ocorrencia.descricao && <div style={{ color: '#6b7280' }}>{ocorrencia.descricao}</div>}
      </div>
      <button onClick={() => delOcorrencia.mutate()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
    </div>
  )
}

function AddOcorrenciaForm({ familiaId }: { familiaId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dataOcorrencia, setDataOcorrencia] = useState('')

  const addOcorrencia = useMutation({
    mutationFn: () => api.post(`/social/familias/${familiaId}/ocorrencias`, {
      tipo, descricao: descricao || null, dataOcorrencia: dataOcorrencia || null,
    }),
    onSuccess: () => {
      toast.success('Ocorrência registrada')
      setTipo(''); setDescricao(''); setDataOcorrencia(''); setOpen(false)
      qc.invalidateQueries({ queryKey: ['social-familia', familiaId] })
    },
    onError: () => toast.error('Erro ao registrar ocorrência'),
  })

  if (!open) return <button onClick={() => setOpen(true)} style={addBtnSt}>+ Adicionar ocorrência</button>

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginTop: 6 }}>
      <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inputSt, marginBottom: 6 }}>
        <option value="">Tipo de ocorrência</option>
        {TIPOS_OCORRENCIA.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input type="date" value={dataOcorrencia} onChange={e => setDataOcorrencia(e.target.value)} style={{ ...inputSt, marginBottom: 6 }} />
      <input placeholder="Descrição (opcional)" value={descricao} onChange={e => setDescricao(e.target.value)} style={{ ...inputSt, marginBottom: 6 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => addOcorrencia.mutate()} disabled={!tipo || addOcorrencia.isPending} style={saveBtnSt}>Salvar</button>
        <button onClick={() => setOpen(false)} style={cancelBtnSt}>Cancelar</button>
      </div>
    </div>
  )
}

function DocumentoRow({ documento, familiaId }: { documento: Documento; familiaId: string }) {
  const qc = useQueryClient()
  const delDocumento = useMutation({
    mutationFn: () => api.delete(`/social/documentos/${documento.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-familia', familiaId] }),
    onError: () => toast.error('Erro ao remover documento'),
  })
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
      <a href={documento.url} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', textDecoration: 'none' }}>📎 {documento.nome}</a>
      <button onClick={() => delDocumento.mutate()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
    </div>
  )
}

function AddDocumentoForm({ familiaId }: { familiaId: string }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!arquivo) { toast.error('Selecione um arquivo'); return }
    setEnviando(true)
    try {
      const path = `social/familias/${familiaId}/${Date.now()}_${arquivo.name.replace(/\s+/g, '_')}`
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, arquivo)
      if (uploadError) throw uploadError
      const { data: signed, error: signError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, 10 * 365 * 24 * 60 * 60)
      if (signError) throw signError
      await api.post(`/social/familias/${familiaId}/documentos`, { nome: nome || arquivo.name, url: signed.signedUrl })
      toast.success('Documento anexado')
      setNome(''); setArquivo(null)
      if (fileRef.current) fileRef.current.value = ''
      qc.invalidateQueries({ queryKey: ['social-familia', familiaId] })
    } catch {
      toast.error('Erro ao enviar documento')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginTop: 6 }}>
      <input placeholder="Nome do documento (opcional)" value={nome} onChange={e => setNome(e.target.value)} style={{ ...inputSt, marginBottom: 6 }} />
      <input ref={fileRef} type="file" onChange={e => setArquivo(e.target.files?.[0] ?? null)} style={{ fontSize: 12, marginBottom: 6 }} />
      {enviando && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Enviando...</div>}
      <button onClick={enviar} disabled={!arquivo || enviando} style={saveBtnSt}>Enviar</button>
    </div>
  )
}
