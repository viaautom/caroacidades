import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { SIGMap } from '../components/map/SIGMap'
import { PgvSetoresLayer } from '../components/map/PgvSetoresLayer'
import { useAuthStore } from '../store/auth.store'

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type Amostra = {
  id: string; setor_id: string; valor_amostra: number; valor_homogeneizado: number | null
  idade_aparente: number | null; estado_conservacao: string | null; tipologia: string | null
  padrao_cub: string | null; distancia_polo: number | null; espuria: boolean
}

const TABS = ['setores', 'mapa', 'amostras', 'relatorio', 'simulacao', 'admin'] as const
type Tab = typeof TABS[number]
const TAB_LABEL: Record<Tab, string> = {
  setores: 'Setores PGV', mapa: 'Mapa', amostras: 'Amostras e Regressão',
  relatorio: 'Relatório', simulacao: 'Simulação IPTU', admin: 'CUB e Depreciação',
}

export function PGVPage() {
  const [tab, setTab] = useState<Tab>('setores')
  const [setorSelecionado, setSetorSelecionado] = useState<string | null>(null)
  const { perfil } = useAuthStore()
  const podeEditar = perfil === 'ADMIN' || perfil === 'FISCAL_TRIBUTARIO'
  const qc = useQueryClient()

  const { data: setores } = useQuery({
    queryKey: ['pgv-setores'],
    queryFn: () => api.get('/pgv/setores').then(r => r.data),
  })

  const calcular = useMutation({
    mutationFn: (setorId: string) => api.post('/pgv/calcular', { setorId }).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pgv-setores'] })
      qc.invalidateQueries({ queryKey: ['pgv-amostras'] })
      toast.success(`Equação: ${data.equacao} | R²=${data.r2?.toFixed(4)}`)
    },
    onError: () => toast.error('Erro no cálculo. Verifique as amostras.'),
  })

  const setor = setores?.find((s: any) => s.id === setorSelecionado)
  const visibleTabs = TABS.filter(t => t !== 'admin' || podeEditar)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', background: 'white', flexShrink: 0 }}>
        {visibleTabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '12px 24px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#2563eb' : '#6b7280',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2, transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'mapa' ? (
        <div style={{ flex: 1, position: 'relative' }}>
          <SIGMap compact />
          <PgvSetoresLayer />
        </div>
      ) : (
      <div style={{ flex: 1, overflow: 'auto', padding: 20, animation: 'fadeIn 0.15s ease-in' }}>
        {tab === 'setores' && (
          <SetoresTab
            setores={setores}
            calcular={calcular}
            onSelecionar={(id: string) => { setSetorSelecionado(id); setTab('amostras') }}
          />
        )}

        {tab === 'amostras' && (
          <AmostrasTab
            setorId={setorSelecionado}
            setor={setor}
            setores={setores}
            onSelecionarSetor={setSetorSelecionado}
            podeEditar={podeEditar}
            recalcular={calcular}
          />
        )}

        {tab === 'relatorio' && (
          <RelatorioTab setorId={setorSelecionado} setor={setor} setores={setores} onSelecionarSetor={setSetorSelecionado} />
        )}

        {tab === 'simulacao' && <SimulacaoIPTU />}

        {tab === 'admin' && podeEditar && <AdminCubDepreciacao />}
      </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Aba: Setores PGV — cards de resumo (nº amostras, R², equação, valor
// médio, área)
// ══════════════════════════════════════════════════════════════════════════
function SetoresTab({ setores, calcular, onSelecionar }: any) {
  return (
    <div>
      <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Setores de Cálculo PGV</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {setores?.map((s: any) => (
          <div
            key={s.id}
            onClick={() => onSelecionar(s.id)}
            style={{
              background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
              padding: 16, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              transition: 'box-shadow 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'none' }}
          >
            <h4 style={{ margin: '0 0 8px', color: '#1e3a5f' }}>{s.nome}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
              <span>Amostras: <strong style={{ color: '#374151' }}>{s.qtd_amostras}</strong></span>
              <span>Área: <strong style={{ color: '#374151' }}>{s.area_m2 ? `${(s.area_m2 / 10000).toFixed(2)} ha` : '—'}</strong></span>
              <span>Valor médio: <strong style={{ color: '#374151' }}>{s.valor_medio ? formatoMoeda.format(s.valor_medio) : '—'}</strong></span>
              <span>R²: <strong style={{ color: s.r2 > 0.7 ? '#22c55e' : '#f59e0b' }}>{s.r2 ? Number(s.r2).toFixed(4) : '—'}</strong></span>
            </div>
            {s.equacao && (
              <p style={{ margin: '0 0 8px', fontSize: 12, fontFamily: 'monospace', color: '#374151', background: '#f9fafb', padding: '4px 8px', borderRadius: 4 }}>
                {s.equacao}
              </p>
            )}
            <button
              onClick={e => { e.stopPropagation(); calcular.mutate(s.id) }}
              disabled={calcular.isPending}
              style={{
                marginTop: 4, padding: '6px 14px', background: '#2563eb', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
              }}
            >
              {calcular.isPending ? 'Calculando...' : 'Recalcular'}
            </button>
          </div>
        ))}
        {setores?.length === 0 && (
          <p style={{ color: '#6b7280' }}>Nenhum setor cadastrado. Desenhe um na aba "Mapa".</p>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Aba: Amostras e Regressão — item 29 (dispersão + reta de tendência),
// item 28 (lote paradigma/homogeneização), item 30 (marcar espúria)
// ══════════════════════════════════════════════════════════════════════════
function AmostrasTab({ setorId, setor, setores, onSelecionarSetor, podeEditar, recalcular }: any) {
  const qc = useQueryClient()
  const [homogeneizacao, setHomogeneizacao] = useState<any[] | null>(null)
  const [paradigma, setParadigma] = useState({
    paradigmaPadraoCub: setor?.paradigma_padrao_cub ?? '',
    paradigmaEstadoConservacao: setor?.paradigma_estado_conservacao ?? '',
    paradigmaIdadeAparente: setor?.paradigma_idade_aparente ?? '',
  })

  const { data: amostras = [] } = useQuery<Amostra[]>({
    queryKey: ['pgv-amostras', setorId],
    queryFn: () => api.get('/pgv/amostras', { params: { setorId } }).then(r => r.data),
    enabled: !!setorId,
  })

  const marcarEspuria = useMutation({
    mutationFn: (id: string) => api.delete(`/pgv/amostras/${id}`),
    onSuccess: async () => {
      toast.success('Amostra marcada como espúria. Recalculando...')
      qc.invalidateQueries({ queryKey: ['pgv-amostras', setorId] })
      const data = await recalcular.mutateAsync(setorId)
      setHomogeneizacao(data.homogeneizacao)
    },
    onError: () => toast.error('Erro ao marcar amostra como espúria'),
  })

  const salvarParadigma = useMutation({
    mutationFn: () => api.put(`/pgv/setores/${setorId}/paradigma`, paradigma),
    onSuccess: () => {
      toast.success('Lote paradigma salvo. Recalcule o setor para aplicar a homogeneização.')
      qc.invalidateQueries({ queryKey: ['pgv-setores'] })
    },
    onError: () => toast.error('Erro ao salvar lote paradigma'),
  })

  async function handleRecalcular() {
    const data = await recalcular.mutateAsync(setorId)
    setHomogeneizacao(data.homogeneizacao)
  }

  if (!setorId) {
    return (
      <div>
        <h3 style={{ margin: '0 0 12px', color: '#1e3a5f' }}>Amostras e Regressão</h3>
        <p style={{ color: '#6b7280', marginBottom: 12 }}>Selecione um setor:</p>
        <select onChange={e => onSelecionarSetor(e.target.value || null)} style={selectSt}>
          <option value="">Selecione...</option>
          {setores?.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>
    )
  }

  const scatterData = amostras.map(a => ({
    x: a.distancia_polo ?? 0,
    y: a.valor_homogeneizado ?? a.valor_amostra,
    espuria: a.espuria,
    id: a.id,
  }))
  const xs = scatterData.map(d => d.x)
  const minX = xs.length ? Math.min(...xs) : 0
  const maxX = xs.length ? Math.max(...xs) : 1
  const temReta = setor?.coef_a != null && setor?.coef_b != null
  const linhaTendencia = temReta ? [
    { x: minX, y: setor.coef_a + setor.coef_b * minX },
    { x: maxX, y: setor.coef_a + setor.coef_b * maxX },
  ] : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h3 style={{ margin: 0, color: '#1e3a5f' }}>Dispersão — {setor?.nome ?? '...'}</h3>
        <select value={setorId} onChange={e => onSelecionarSetor(e.target.value || null)} style={{ ...selectSt, width: 220 }}>
          {setores?.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>
      {setor?.equacao && (
        <p style={{ margin: '0 0 16px', fontFamily: 'monospace', fontSize: 13, color: '#6b7280' }}>
          {setor.equacao} | R² = {Number(setor.r2).toFixed(4)}
        </p>
      )}

      {scatterData.length > 0 ? (
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" type="number" name="Distância ao polo (m)" unit="m" domain={['dataMin', 'dataMax']} />
            <YAxis dataKey="y" type="number" name="Valor homogeneizado (R$/m²)" unit="" tickFormatter={(v) => formatoMoeda.format(v)} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              formatter={(value: number, name: string) => [name === 'y' ? formatoMoeda.format(value) : value, name === 'y' ? 'Valor' : 'Distância']}
            />
            <Scatter name="Amostras" data={scatterData} fill="#2563eb" isAnimationActive>
              {scatterData.map((d, i) => <Cell key={i} fill={d.espuria ? '#d1d5db' : '#2563eb'} />)}
            </Scatter>
            {temReta && (
              <Line data={linhaTendencia} dataKey="y" stroke="#dc2626" strokeWidth={2} dot={false} isAnimationActive legendType="none" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <p style={{ color: '#6b7280' }}>Nenhuma amostra neste setor. Colete amostras na aba "Mapa".</p>
      )}

      {podeEditar && (
        <div style={{ margin: '20px 0', padding: 16, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: '0 0 4px', color: '#1e3a5f', fontSize: 14 }}>Lote paradigma (homogeneização — item 28)</h4>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b7280' }}>
            Define a referência de padrão CUB e estado/idade de conservação usada para homogeneizar as amostras
            (fator = elemento da amostra ÷ elemento do paradigma; valor homogeneizado = valor bruto ÷ produto dos fatores).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={paradigma.paradigmaPadraoCub}
              onChange={e => setParadigma(p => ({ ...p, paradigmaPadraoCub: e.target.value }))}
              placeholder="Padrão CUB de referência"
              style={{ ...inputSt, width: 180 }}
            />
            <input
              value={paradigma.paradigmaEstadoConservacao}
              onChange={e => setParadigma(p => ({ ...p, paradigmaEstadoConservacao: e.target.value }))}
              placeholder="Estado de conservação de referência"
              style={{ ...inputSt, width: 200 }}
            />
            <input
              type="number" min={0}
              value={paradigma.paradigmaIdadeAparente}
              onChange={e => setParadigma(p => ({ ...p, paradigmaIdadeAparente: e.target.value }))}
              placeholder="Idade aparente de referência"
              style={{ ...inputSt, width: 160 }}
            />
            <button onClick={() => salvarParadigma.mutate()} disabled={salvarParadigma.isPending} style={primaryBtnSt}>
              Salvar paradigma
            </button>
            <button onClick={handleRecalcular} disabled={recalcular.isPending} style={{ ...primaryBtnSt, background: '#16a34a' }}>
              {recalcular.isPending ? 'Recalculando...' : 'Recalcular com homogeneização'}
            </button>
          </div>
        </div>
      )}

      {homogeneizacao && (
        <div style={{ margin: '16px 0' }}>
          <h4 style={{ margin: '0 0 8px', color: '#1e3a5f', fontSize: 14 }}>Fatores aplicados no último cálculo</h4>
          <TabelaSimples
            colunas={['Valor bruto', 'Fator CUB', 'Fator depreciação', 'Valor homogeneizado']}
            linhas={homogeneizacao.map(h => [
              formatoMoeda.format(h.valorAmostra),
              h.fatorCub.toFixed(3),
              h.fatorDepreciacao.toFixed(3),
              formatoMoeda.format(h.valorHomogeneizado),
            ])}
          />
        </div>
      )}

      <h4 style={{ margin: '20px 0 8px', color: '#1e3a5f', fontSize: 14 }}>Amostras coletadas ({amostras.length})</h4>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              {['Valor', 'Homogeneizado', 'Distância (m)', 'Tipologia', 'Padrão CUB', 'Conservação', 'Idade', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '6px 8px', color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {amostras.map(a => (
              <tr key={a.id} style={{ borderTop: '1px solid #e5e7eb', opacity: a.espuria ? 0.5 : 1 }}>
                <td style={{ padding: '6px 8px' }}>{formatoMoeda.format(a.valor_amostra)}</td>
                <td style={{ padding: '6px 8px' }}>{a.valor_homogeneizado != null ? formatoMoeda.format(a.valor_homogeneizado) : '—'}</td>
                <td style={{ padding: '6px 8px' }}>{a.distancia_polo?.toFixed(1) ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{a.tipologia ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{a.padrao_cub ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{a.estado_conservacao ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{a.idade_aparente ?? '—'}</td>
                <td style={{ padding: '6px 8px' }}>{a.espuria ? 'Espúria' : 'Válida'}</td>
                <td style={{ padding: '6px 8px' }}>
                  {podeEditar && !a.espuria && (
                    <button
                      onClick={() => marcarEspuria.mutate(a.id)}
                      disabled={marcarEspuria.isPending}
                      style={{ padding: '3px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                    >
                      Marcar espúria
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Aba: Relatório de faces de quadra — item 34 (exportação CSV/XLS/PDF)
// ══════════════════════════════════════════════════════════════════════════
function RelatorioTab({ setorId, setor, setores, onSelecionarSetor }: any) {
  const { data: linhas = [] } = useQuery<any[]>({
    queryKey: ['pgv-relatorio', setorId],
    queryFn: () => api.get('/pgv/relatorio', { params: setorId ? { setorId } : {} }).then(r => r.data),
  })

  function exportarCSV() {
    const headers = ['Quadra', 'Logradouro', 'Lado', 'Distância ao Polo (m)', 'Valor Calculado (R$/m²)', 'Setor']
    const linhasCsv = linhas.map(l => [l.quadra_codigo ?? '', l.logradouro_nome ?? '', l.lado ?? '', l.distancia_polo ?? '', l.valor_calculado ?? '', l.setor_nome ?? ''].join(';'))
    const blob = new Blob([[headers.join(';'), ...linhasCsv].join('\n')], { type: 'text/csv;charset=utf-8;' })
    baixarBlob(blob, 'relatorio-pgv.csv')
  }

  function exportarXLSX() {
    const ws = XLSX.utils.json_to_sheet(linhas.map(l => ({
      Quadra: l.quadra_codigo, Logradouro: l.logradouro_nome, Lado: l.lado,
      'Distância ao Polo (m)': l.distancia_polo, 'Valor Calculado (R$/m²)': l.valor_calculado, Setor: l.setor_nome,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório PGV')
    XLSX.writeFile(wb, 'relatorio-pgv.xlsx')
  }

  function exportarPDF() {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    pdf.setFontSize(16)
    pdf.text('Relatório PGV — Faces de Quadra', 14, 20)
    pdf.setFontSize(10)
    pdf.text(`Setor: ${setor?.nome ?? 'Todos'}`, 14, 28)
    pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 34)
    ;(pdf as any).autoTable({
      startY: 42,
      head: [['Quadra', 'Logradouro', 'Lado', 'Distância (m)', 'Valor (R$/m²)']],
      body: linhas.map(l => [
        l.quadra_codigo ?? '—', l.logradouro_nome ?? '—', l.lado ?? '—',
        l.distancia_polo != null ? Number(l.distancia_polo).toFixed(1) : '—',
        l.valor_calculado != null ? formatoMoeda.format(l.valor_calculado) : '—',
      ]),
      theme: 'striped', headStyles: { fillColor: [37, 99, 235] }, styles: { fontSize: 8 },
    })
    pdf.save('relatorio-pgv.pdf')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, color: '#1e3a5f' }}>Relatório de Faces de Quadra</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={setorId ?? ''} onChange={e => onSelecionarSetor(e.target.value || null)} style={selectSt}>
            <option value="">Todos os setores</option>
            {setores?.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <button onClick={exportarCSV} style={exportBtnSt}>CSV</button>
          <button onClick={exportarXLSX} style={exportBtnSt}>XLS</button>
          <button onClick={exportarPDF} style={exportBtnSt}>PDF</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              {['Quadra', 'Logradouro', 'Lado', 'Distância ao Polo (m)', 'Valor Calculado', 'Setor'].map(h => (
                <th key={h} style={{ padding: '8px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l: any) => (
              <tr key={l.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px' }}>{l.quadra_codigo ?? '—'}</td>
                <td style={{ padding: '8px' }}>{l.logradouro_nome ?? '—'}</td>
                <td style={{ padding: '8px' }}>{l.lado ?? '—'}</td>
                <td style={{ padding: '8px' }}>{l.distancia_polo != null ? Number(l.distancia_polo).toFixed(1) : '—'}</td>
                <td style={{ padding: '8px' }}>{l.valor_calculado != null ? formatoMoeda.format(l.valor_calculado) : '—'}</td>
                <td style={{ padding: '8px' }}>{l.setor_nome ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && <p style={{ color: '#6b7280', marginTop: 12 }}>Nenhuma face de quadra calculada ainda.</p>}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Aba: Simulação IPTU — item 35
// ══════════════════════════════════════════════════════════════════════════
function SimulacaoIPTU() {
  const [form, setForm] = useState({
    descricao: '', aliquotaResidencial: 0.5, aliquotaComercial: 1.0,
    aliquotaIndustrial: 1.5, aliquotaTereno: 0.3, tetoAumentoPercent: 15,
  })
  const [resultado, setResultado] = useState<any>(null)

  const simular = useMutation({
    mutationFn: () => api.post('/pgv/simular-iptu', form).then(r => r.data),
    onSuccess: (data) => {
      setResultado(data)
      toast.success('Simulação calculada')
    },
    onError: () => toast.error('Erro ao simular IPTU'),
  })

  return (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      <div style={{ maxWidth: 420, flex: '0 0 420px' }}>
        <h3 style={{ margin: '0 0 20px', color: '#1e3a5f' }}>Simulação de IPTU</h3>
        {[
          ['descricao', 'Descrição', 'text'],
          ['aliquotaResidencial', 'Alíquota Residencial (%)', 'number'],
          ['aliquotaComercial', 'Alíquota Comercial (%)', 'number'],
          ['aliquotaIndustrial', 'Alíquota Industrial (%)', 'number'],
          ['aliquotaTereno', 'Alíquota Terreno (%)', 'number'],
          ['tetoAumentoPercent', 'Teto de Aumento (%)', 'number'],
        ].map(([key, label, type]) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              {label}
            </label>
            <input
              type={type}
              value={(form as any)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
              style={{
                width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
                borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </div>
        ))}
        <button onClick={() => simular.mutate()} disabled={simular.isPending} style={primaryBtnSt}>
          {simular.isPending ? 'Calculando...' : 'Simular IPTU'}
        </button>
      </div>

      {resultado && (
        <div style={{ flex: 1, minWidth: 320 }}>
          <h4 style={{ margin: '0 0 12px', color: '#1e3a5f' }}>Resultado — {resultado.totalImoveis} imóveis</h4>
          <TabelaSimples
            colunas={['Categoria', 'Qtd. Imóveis', 'Valor Venal Total', 'IPTU Total', 'IPTU Médio']}
            linhas={resultado.resumoPorCategoria.map((r: any) => [
              r.categoria === 'terreno' ? 'Terreno' : 'Edificado',
              r.qtdImoveis,
              formatoMoeda.format(r.valorVenalTotal),
              formatoMoeda.format(r.iptuTotal),
              formatoMoeda.format(r.iptuMedio),
            ])}
          />
          {resultado.aviso && (
            <p style={{ marginTop: 16, padding: 12, background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: 12 }}>
              {resultado.aviso}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Aba: Administração de CUB (item 26) e coeficientes de depreciação (item 27)
// ══════════════════════════════════════════════════════════════════════════
function AdminCubDepreciacao() {
  return (
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      <CubAdmin />
      <DepreciacaoAdmin />
    </div>
  )
}

function CubAdmin() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ tipologia: '', tipoEstrutura: '', padraoConstrutivo: '', coeficiente: '1', valorM2: '', mesReferencia: '' })

  const { data: itens = [] } = useQuery<any[]>({ queryKey: ['pgv-cub'], queryFn: () => api.get('/pgv/cub').then(r => r.data) })

  const criar = useMutation({
    mutationFn: () => api.post('/pgv/cub', {
      tipologia: form.tipologia, tipoEstrutura: form.tipoEstrutura || undefined,
      padraoConstrutivo: form.padraoConstrutivo, coeficiente: Number(form.coeficiente),
      valorM2: Number(form.valorM2), mesReferencia: `${form.mesReferencia}-01`,
    }),
    onSuccess: () => {
      toast.success('Valor de CUB cadastrado')
      qc.invalidateQueries({ queryKey: ['pgv-cub'] })
      setForm({ tipologia: '', tipoEstrutura: '', padraoConstrutivo: '', coeficiente: '1', valorM2: '', mesReferencia: '' })
    },
    onError: () => toast.error('Erro ao cadastrar CUB'),
  })

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/pgv/cub/${id}`),
    onSuccess: () => { toast.success('Removido'); qc.invalidateQueries({ queryKey: ['pgv-cub'] }) },
  })

  return (
    <div style={{ flex: '1 1 420px', minWidth: 380 }}>
      <h3 style={{ margin: '0 0 12px', color: '#1e3a5f' }}>Tabela de CUB</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input value={form.tipologia} onChange={e => setForm(f => ({ ...f, tipologia: e.target.value }))} placeholder="Tipologia" style={{ ...inputSt, width: 140 }} />
        <input value={form.tipoEstrutura} onChange={e => setForm(f => ({ ...f, tipoEstrutura: e.target.value }))} placeholder="Estrutura" style={{ ...inputSt, width: 110 }} />
        <input value={form.padraoConstrutivo} onChange={e => setForm(f => ({ ...f, padraoConstrutivo: e.target.value }))} placeholder="Padrão construtivo" style={{ ...inputSt, width: 150 }} />
        <input type="number" step="0.01" value={form.coeficiente} onChange={e => setForm(f => ({ ...f, coeficiente: e.target.value }))} placeholder="Coeficiente" style={{ ...inputSt, width: 100 }} />
        <input type="number" step="0.01" value={form.valorM2} onChange={e => setForm(f => ({ ...f, valorM2: e.target.value }))} placeholder="Valor/m² (R$)" style={{ ...inputSt, width: 120 }} />
        <input type="month" value={form.mesReferencia} onChange={e => setForm(f => ({ ...f, mesReferencia: e.target.value }))} style={{ ...inputSt, width: 140 }} />
        <button
          onClick={() => criar.mutate()}
          disabled={criar.isPending || !form.tipologia || !form.padraoConstrutivo || !form.valorM2 || !form.mesReferencia}
          style={primaryBtnSt}
        >
          Adicionar
        </button>
      </div>
      <TabelaSimples
        colunas={['Tipologia', 'Padrão', 'Valor/m²', 'Mês Ref.', '']}
        linhas={itens.map(i => [
          i.tipologia, i.padrao_construtivo, formatoMoeda.format(i.valor_m2),
          new Date(i.mes_referencia).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }),
          <button key={i.id} onClick={() => remover.mutate(i.id)} style={{ padding: '3px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Remover</button>,
        ])}
      />
    </div>
  )
}

function DepreciacaoAdmin() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ estadoConservacao: '', idadeAparenteMin: '', idadeAparenteMax: '', coeficiente: '1' })

  const { data: itens = [] } = useQuery<any[]>({ queryKey: ['pgv-depreciacao'], queryFn: () => api.get('/pgv/depreciacao').then(r => r.data) })

  const criar = useMutation({
    mutationFn: () => api.post('/pgv/depreciacao', {
      estadoConservacao: form.estadoConservacao,
      idadeAparenteMin: Number(form.idadeAparenteMin), idadeAparenteMax: Number(form.idadeAparenteMax),
      coeficiente: Number(form.coeficiente),
    }),
    onSuccess: () => {
      toast.success('Coeficiente cadastrado')
      qc.invalidateQueries({ queryKey: ['pgv-depreciacao'] })
      setForm({ estadoConservacao: '', idadeAparenteMin: '', idadeAparenteMax: '', coeficiente: '1' })
    },
    onError: () => toast.error('Erro ao cadastrar coeficiente'),
  })

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/pgv/depreciacao/${id}`),
    onSuccess: () => { toast.success('Removido'); qc.invalidateQueries({ queryKey: ['pgv-depreciacao'] }) },
  })

  return (
    <div style={{ flex: '1 1 380px', minWidth: 340 }}>
      <h3 style={{ margin: '0 0 12px', color: '#1e3a5f' }}>Coeficientes de Depreciação</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input value={form.estadoConservacao} onChange={e => setForm(f => ({ ...f, estadoConservacao: e.target.value }))} placeholder="Estado de conservação" style={{ ...inputSt, width: 170 }} />
        <input type="number" min={0} value={form.idadeAparenteMin} onChange={e => setForm(f => ({ ...f, idadeAparenteMin: e.target.value }))} placeholder="Idade mín." style={{ ...inputSt, width: 90 }} />
        <input type="number" min={0} value={form.idadeAparenteMax} onChange={e => setForm(f => ({ ...f, idadeAparenteMax: e.target.value }))} placeholder="Idade máx." style={{ ...inputSt, width: 90 }} />
        <input type="number" step="0.01" value={form.coeficiente} onChange={e => setForm(f => ({ ...f, coeficiente: e.target.value }))} placeholder="Coeficiente" style={{ ...inputSt, width: 100 }} />
        <button
          onClick={() => criar.mutate()}
          disabled={criar.isPending || !form.estadoConservacao || form.idadeAparenteMin === '' || form.idadeAparenteMax === ''}
          style={primaryBtnSt}
        >
          Adicionar
        </button>
      </div>
      <TabelaSimples
        colunas={['Estado', 'Idade (anos)', 'Coeficiente', '']}
        linhas={itens.map(i => [
          i.estado_conservacao, `${i.idade_aparente_min}–${i.idade_aparente_max}`, i.coeficiente,
          <button key={i.id} onClick={() => remover.mutate(i.id)} style={{ padding: '3px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Remover</button>,
        ])}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Utilitários
// ══════════════════════════════════════════════════════════════════════════
function baixarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function TabelaSimples({ colunas, linhas }: { colunas: string[]; linhas: any[][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
          {colunas.map(c => <th key={c} style={{ padding: '6px 8px', color: '#374151' }}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i} style={{ borderTop: '1px solid #e5e7eb' }}>
            {linha.map((valor, j) => <td key={j} style={{ padding: '6px 8px' }}>{valor}</td>)}
          </tr>
        ))}
        {linhas.length === 0 && (
          <tr><td colSpan={colunas.length} style={{ padding: 12, color: '#6b7280' }}>Nenhum registro.</td></tr>
        )}
      </tbody>
    </table>
  )
}

const selectSt: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13,
}

const inputSt: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
}

const primaryBtnSt: React.CSSProperties = {
  padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
}

const exportBtnSt: React.CSSProperties = {
  padding: '6px 14px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6,
  cursor: 'pointer', fontSize: 13,
}
