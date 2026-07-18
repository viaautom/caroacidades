import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import toast from 'react-hot-toast'

type TipoEnvio = 'teste' | 'incremental' | 'completo'

interface Envio {
  id: string
  numero_envio: number
  tipo: TipoEnvio
  status: string
  qtd_parcelas: number
  qtd_erros: number
  arquivo_storage: string | null
  enviado_em: string | null
  validado_em: string | null
  created_at: string
  criado_por_nome: string | null
}

interface Stats {
  total: string
  pendentes: string
  incluidas: string
  aceitas: string
  rejeitadas: string
  erros_count: string
  total_cadastradas: string
}

interface EnvioDetalhe extends Envio {
  erros: { id: string; codigo: string | null; erros: string[] }[]
  parcelas: {
    codigo: string | null
    inscricao_imobiliaria: string | null
    area_m2: number | null
    status: string
    codigo_nitu: string | null
    erros: string[]
  }[]
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  preparando: { label: 'Preparando', color: '#6b7280' },
  validando:  { label: 'Pronto para envio', color: '#2563eb' },
  enviado:    { label: 'Enviado', color: '#d97706' },
  aceito:     { label: 'Aceito pela RFB', color: '#16a34a' },
  rejeitado:  { label: 'Rejeitado', color: '#dc2626' },
  erro:       { label: 'Erro', color: '#dc2626' },
}

const TIPO_LABEL: Record<TipoEnvio, string> = {
  teste:       'Teste',
  incremental: 'Incremental',
  completo:    'Completo',
}

function Badge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, color: '#6b7280' }
  return (
    <span style={{
      background: cfg.color, color: '#fff', borderRadius: 4,
      padding: '2px 8px', fontSize: 12, fontWeight: 600,
    }}>
      {cfg.label}
    </span>
  )
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

export function SinterPage() {
  const qc = useQueryClient()
  const [tipoNovo, setTipoNovo] = useState<TipoEnvio>('incremental')
  const [envioSelecionado, setEnvioSelecionado] = useState<string | null>(null)
  const [respostaStatus, setRespostaStatus] = useState<'aceito' | 'rejeitado'>('aceito')
  const [respostaTexto, setRespostaTexto] = useState('')

  const { data: stats } = useQuery<Stats>({
    queryKey: ['sinter-stats'],
    queryFn: () => api.get('/admin/sinter/stats').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: envios = [], isLoading } = useQuery<Envio[]>({
    queryKey: ['sinter-envios'],
    queryFn: () => api.get('/admin/sinter/envios').then(r => r.data),
  })

  const { data: detalhe } = useQuery<EnvioDetalhe>({
    queryKey: ['sinter-envio', envioSelecionado],
    queryFn: () => api.get(`/admin/sinter/envios/${envioSelecionado}`).then(r => r.data),
    enabled: !!envioSelecionado,
  })

  const preparar = useMutation({
    mutationFn: () => api.post('/admin/sinter/preparar', { tipo: tipoNovo }),
    onSuccess: (res) => {
      toast.success(`Lote #${res.data.numero_envio} preparado: ${res.data.qtd_parcelas} parcelas, ${res.data.qtd_erros} com erro`)
      qc.invalidateQueries({ queryKey: ['sinter-envios'] })
      qc.invalidateQueries({ queryKey: ['sinter-stats'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Erro ao preparar lote'),
  })

  const enviar = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sinter/envios/${id}/enviar`),
    onSuccess: () => {
      toast.success('Envio registrado. Aguardando retorno da RFB.')
      qc.invalidateQueries({ queryKey: ['sinter-envios'] })
      qc.invalidateQueries({ queryKey: ['sinter-envio', envioSelecionado] })
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Erro ao enviar'),
  })

  const registrarResposta = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sinter/envios/${id}/resposta`, {
      status: respostaStatus,
      resposta_rfb: respostaTexto || undefined,
    }),
    onSuccess: () => {
      toast.success('Resposta da RFB registrada.')
      qc.invalidateQueries({ queryKey: ['sinter-envios'] })
      qc.invalidateQueries({ queryKey: ['sinter-envio', envioSelecionado] })
      qc.invalidateQueries({ queryKey: ['sinter-stats'] })
      setRespostaTexto('')
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Erro ao registrar resposta'),
  })

  const statCard = (label: string, val: string | undefined, color = '#6b7280') => (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
      padding: '16px 24px', textAlign: 'center', minWidth: 120,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{val ?? '—'}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>SINTER — Envio à Receita Federal</h2>
      <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>
        Sistema Nacional de Gestão de Informações Territoriais · IN RFB nº 1.890/2019 ·
        Prazo contratual: primeiro envio de teste até <strong>Julho/2026</strong>
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        {statCard('Parcelas cadastradas', stats?.total_cadastradas, '#1d4ed8')}
        {statCard('Aceitas pela RFB', stats?.aceitas, '#16a34a')}
        {statCard('Incluídas (aguardando)', stats?.incluidas, '#d97706')}
        {statCard('Pendentes (nunca enviadas)', stats?.pendentes, '#6b7280')}
        {statCard('Rejeitadas', stats?.rejeitadas, '#dc2626')}
        {statCard('Com erro', stats?.erros_count, '#dc2626')}
      </div>

      {/* Preparar novo lote */}
      <div style={{
        background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
        padding: 20, marginBottom: 32,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Preparar novo lote</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={tipoNovo}
            onChange={e => setTipoNovo(e.target.value as TipoEnvio)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
          >
            <option value="teste">Teste (máx. 100 parcelas)</option>
            <option value="incremental">Incremental (somente pendentes/rejeitadas)</option>
            <option value="completo">Completo (todas as parcelas com geometria)</option>
          </select>
          <button
            onClick={() => preparar.mutate()}
            disabled={preparar.isPending}
            style={{
              background: '#2563eb', color: '#fff', border: 'none',
              borderRadius: 6, padding: '7px 20px', cursor: 'pointer', fontWeight: 600,
            }}
          >
            {preparar.isPending ? 'Preparando...' : 'Preparar lote XML'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Gera o XML no formato SINTER 2.0 e sobe para o Cloud Storage.
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: envioSelecionado ? '1fr 1fr' : '1fr', gap: 24 }}>
        {/* Histórico de envios */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Histórico de envios</div>
          {isLoading ? (
            <div style={{ color: '#6b7280' }}>Carregando...</div>
          ) : envios.length === 0 ? (
            <div style={{ color: '#6b7280', padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center' }}>
              Nenhum envio registrado ainda.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  {['Lote', 'Tipo', 'Status', 'Parcelas', 'Erros', 'Criado em', 'Por', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {envios.map(e => (
                  <tr
                    key={e.id}
                    onClick={() => setEnvioSelecionado(e.id === envioSelecionado ? null : e.id)}
                    style={{
                      cursor: 'pointer',
                      background: e.id === envioSelecionado ? '#eff6ff' : undefined,
                    }}
                  >
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>
                      #{e.numero_envio}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                      {TIPO_LABEL[e.tipo]}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                      <Badge status={e.status} />
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                      {e.qtd_parcelas}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', color: e.qtd_erros > 0 ? '#dc2626' : '#6b7280' }}>
                      {e.qtd_erros}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
                      {fmt(e.created_at)}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
                      {e.criado_por_nome ?? '—'}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
                      {['validando', 'rejeitado'].includes(e.status) && (
                        <button
                          onClick={ev => { ev.stopPropagation(); enviar.mutate(e.id) }}
                          disabled={enviar.isPending}
                          style={{
                            background: '#16a34a', color: '#fff', border: 'none',
                            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          Enviar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detalhe do envio selecionado */}
        {envioSelecionado && detalhe && (
          <div style={{ borderLeft: '2px solid #e5e7eb', paddingLeft: 24 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>
              Detalhe — Lote #{detalhe.numero_envio} <Badge status={detalhe.status} />
            </div>

            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              <div>Arquivo: <code style={{ fontSize: 11 }}>{detalhe.arquivo_storage ?? '—'}</code></div>
              <div>Enviado em: {fmt(detalhe.enviado_em)}</div>
              <div>Validado em: {fmt(detalhe.validado_em)}</div>
            </div>

            {/* Registrar resposta da RFB */}
            {detalhe.status === 'enviado' && (
              <div style={{
                background: '#fefce8', border: '1px solid #fde047',
                borderRadius: 8, padding: 16, marginBottom: 16,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Registrar retorno da RFB</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={respostaStatus}
                    onChange={e => setRespostaStatus(e.target.value as 'aceito' | 'rejeitado')}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                  >
                    <option value="aceito">Aceito</option>
                    <option value="rejeitado">Rejeitado</option>
                  </select>
                  <input
                    placeholder="Protocolo / observação da RFB (opcional)"
                    value={respostaTexto}
                    onChange={e => setRespostaTexto(e.target.value)}
                    style={{ flex: 1, padding: '5px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                  />
                  <button
                    onClick={() => registrarResposta.mutate(envioSelecionado)}
                    disabled={registrarResposta.isPending}
                    style={{
                      background: '#2563eb', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 13,
                    }}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )}

            {/* Erros de validação */}
            {detalhe.erros?.length > 0 && (
              <details style={{ marginBottom: 16 }}>
                <summary style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 600, fontSize: 13 }}>
                  {detalhe.erros.length} parcela(s) com erro de validação (excluídas do lote)
                </summary>
                <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
                  {detalhe.erros.map((e: any) => (
                    <div key={e.id} style={{ fontSize: 12, color: '#6b7280', padding: '2px 0' }}>
                      <strong>{e.codigo ?? e.id}</strong>: {e.erros.join('; ')}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Tabela de parcelas do lote */}
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
              Parcelas incluídas ({detalhe.parcelas?.length ?? 0})
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto', fontSize: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                    {['Código', 'Inscrição', 'Área m²', 'Status', 'NITU'].map(h => (
                      <th key={h} style={{ padding: '5px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalhe.parcelas?.map((p, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6' }}>{p.codigo ?? '—'}</td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6' }}>{p.inscricao_imobiliaria ?? '—'}</td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6' }}>{p.area_m2?.toFixed(1) ?? '—'}</td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6' }}>
                        <Badge status={p.status} />
                      </td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
                        {p.codigo_nitu ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
