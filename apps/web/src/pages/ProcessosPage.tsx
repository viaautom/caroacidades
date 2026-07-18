import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { supabase, STORAGE_BUCKET } from '../lib/supabase'
import { useMapStore } from '../store/map.store'
import { useAuthStore } from '../store/auth.store'
import { SIGMap } from '../components/map/SIGMap'
import { FormularioRenderer } from '../components/reurb/FormularioRenderer'
import { FormularioCampos, type CampoFormulario } from '../components/reurb/FormularioCampos'

export const PERFIS_ANALISE = ['ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO']

type Anexo = {
  id: string
  nome: string
  tipo_mime: string | null
  tamanho_bytes: number | null
  url: string
  anexo_original_id: string | null
}

type Processo = {
  id: string
  codigo: string
  tipo: 'aprovacao_projeto' | 'habite_se' | 'reurb'
  situacao: string
  requerente_nome: string | null
  analista_nome: string | null
  parcela_codigo: string | null
  created_at: string
}

export const SIT: Record<string, { label: string; color: string }> = {
  rascunho:   { label: 'Rascunho',    color: '#9ca3af' },
  aberto:     { label: 'Aberto',      color: '#3b82f6' },
  em_analise: { label: 'Em análise',  color: '#f59e0b' },
  aprovado:   { label: 'Aprovado',    color: '#10b981' },
  reprovado:  { label: 'Reprovado',   color: '#ef4444' },
  arquivado:  { label: 'Arquivado',   color: '#6b7280' },
}

export function ProcessosPage({ tipo = 'aprovacao_projeto' }: { tipo?: string }) {
  const qc = useQueryClient()
  const { user, perfil } = useAuthStore()
  const { selectedParcelaId, selectParcela } = useMapStore()
  const podeAnalisar = !!perfil && PERFIS_ANALISE.includes(perfil)
  const [filtroSit, setFiltroSit] = useState('')
  const [busca, setBusca] = useState('')
  const [selected, setSelected] = useState<Processo | null>(null)
  const [criando, setCriando] = useState(false)
  const [formTipo] = useState(tipo)
  const [encaminharPara, setEncaminharPara] = useState('')

  // Campos configuráveis (com obrigatoriedade) do formulário de abertura — req 109/120
  const { data: formularioCampos = [] } = useQuery<CampoFormulario[]>({
    queryKey: ['processo-formulario', tipo],
    queryFn: () => api.get(`/processos/formulario?tipo=${tipo}`).then(r => r.data.campos ?? []),
    enabled: tipo !== 'reurb',
  })
  const [novoMetadados, setNovoMetadados] = useState<Record<string, unknown>>({})

  // Configuração dos campos do formulário pelo analista — req 109/120
  const [configurando, setConfigurando] = useState(false)
  const [editCampos, setEditCampos] = useState<CampoFormulario[]>([])

  const salvarFormulario = useMutation({
    mutationFn: () => api.put('/processos/formulario', { tipo, campos: editCampos }),
    onSuccess: () => {
      toast.success('Formulário atualizado')
      qc.invalidateQueries({ queryKey: ['processo-formulario', tipo] })
      setConfigurando(false)
    },
    onError: () => toast.error('Erro ao salvar formulário'),
  })

  // req 115/126: analista filtrar processos por valor de um campo do formulário
  const [campoFiltro, setCampoFiltro] = useState('')
  const [valorFiltro, setValorFiltro] = useState('')

  const { data: processos = [] } = useQuery<Processo[]>({
    queryKey: ['processos', tipo, filtroSit, campoFiltro, valorFiltro, busca],
    queryFn: () =>
      api.get(`/processos?tipo=${tipo}${filtroSit ? `&situacao=${filtroSit}` : ''}${
        campoFiltro && valorFiltro ? `&campo=${encodeURIComponent(campoFiltro)}&valor=${encodeURIComponent(valorFiltro)}` : ''
      }${busca ? `&busca=${encodeURIComponent(busca)}` : ''}`).then(r => r.data.data ?? []),
  })

  const { data: detalhe } = useQuery({
    queryKey: ['processo-detalhe', selected?.id],
    queryFn: () => api.get(`/processos/${selected!.id}`).then(r => r.data),
    enabled: !!selected,
  })

  // Valores dos formulários das etapas reprovadas, editáveis pelo solicitante (req 204)
  const [editedMetadados, setEditedMetadados] = useState<Record<string, unknown>>({})
  useEffect(() => {
    setEditedMetadados(detalhe?.metadados ?? {})
  }, [detalhe?.id, detalhe?.situacao])

  const { data: parcelaSelecionada } = useQuery({
    queryKey: ['parcela-processo', selectedParcelaId],
    queryFn: () => api.get(`/parcelas/${selectedParcelaId}`).then(r => r.data),
    enabled: criando && !!selectedParcelaId,
  })

  const { data: analistas = [] } = useQuery<{ id: string; nome: string; email: string; perfil: string }[]>({
    queryKey: ['processos-analistas', selected?.id],
    queryFn: () => api.get(`/processos/analistas?processoId=${selected!.id}`).then(r => r.data),
    enabled: !!selected && podeAnalisar,
  })

  const abrirCriacao = () => { selectParcela(null); setNovoMetadados({}); setCriando(true) }
  const fecharCriacao = () => { selectParcela(null); setNovoMetadados({}); setCriando(false) }

  const criar = useMutation({
    mutationFn: () => api.post('/processos', { tipo: formTipo, parcelaId: selectedParcelaId ?? undefined, metadados: novoMetadados }),
    onSuccess: (res) => {
      toast.success(`Processo ${res.data.codigo} criado`)
      qc.invalidateQueries({ queryKey: ['processos'] })
      fecharCriacao()
    },
    onError: () => toast.error('Erro ao criar processo'),
  })

  // req 109/120: bloqueia a abertura se algum campo obrigatório do formulário estiver vazio
  const abrirProcesso = () => {
    for (const campo of formularioCampos) {
      const v = novoMetadados[campo.nome]
      if (campo.obrigatorio && (v === undefined || v === null || v === '')) {
        toast.error(`Campo obrigatório não preenchido: ${campo.rotulo}`)
        return
      }
    }
    criar.mutate()
  }

  const enviar = useMutation({
    mutationFn: (id: string) => api.patch(`/processos/${id}/enviar`),
    onSuccess: () => { toast.success('Processo enviado'); qc.invalidateQueries({ queryKey: ['processos'] }) },
  })

  const invalidarDetalhe = () => {
    qc.invalidateQueries({ queryKey: ['processos'] })
    qc.invalidateQueries({ queryKey: ['processo-detalhe', selected?.id] })
  }

  const encaminhar = useMutation({
    mutationFn: (analistaId: string) => api.patch(`/processos/${selected!.id}/encaminhar`, { analistaId }),
    onSuccess: () => { toast.success('Processo encaminhado'); setEncaminharPara(''); invalidarDetalhe() },
    onError: () => toast.error('Erro ao encaminhar processo'),
  })

  const retirarAnalista = useMutation({
    mutationFn: () => api.patch(`/processos/${selected!.id}/retirar-analista`),
    onSuccess: () => { toast.success('Analista retirado do processo'); invalidarDetalhe() },
    onError: () => toast.error('Erro ao retirar analista'),
  })

  const reenviar = useMutation({
    mutationFn: () => api.patch(`/processos/${selected!.id}/reenviar`, { metadados: editedMetadados }),
    onSuccess: () => { toast.success('Processo corrigido e reenviado para análise'); invalidarDetalhe() },
    onError: () => toast.error('Erro ao reenviar processo'),
  })

  // Parecer do analista na etapa atual do processo (req 107/118)
  const [parecerTexto, setParecerTexto] = useState('')
  useEffect(() => { setParecerTexto('') }, [selected?.id])

  const etapasPendentes = (detalhe?.etapas ?? []).filter((e: any) => e.situacao === 'pendente')
  const etapaAtual = etapasPendentes.length > 0
    ? etapasPendentes.reduce((min: any, e: any) => (e.ordem < min.ordem ? e : min))
    : null

  const darParecer = useMutation({
    mutationFn: (vars: { etapaId: string; situacao: 'aprovado' | 'reprovado' }) =>
      api.post(`/processos/${selected!.id}/etapas/${vars.etapaId}/parecer`, { situacao: vars.situacao, parecer: parecerTexto }),
    onSuccess: () => { toast.success('Parecer registrado'); setParecerTexto(''); invalidarDetalhe() },
    onError: () => toast.error('Erro ao registrar parecer'),
  })

  const TITULO: Record<string, string> = {
    aprovacao_projeto: 'Aprovação de Projetos',
    habite_se:         'Habite-se Online',
    reurb:             'REURB Digital',
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: 20 }}>{TITULO[tipo] ?? tipo}</h2>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{processos.length} processos</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por código, requerente, telefone ou email…"
              style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: 260 }}
            />
            <select
              value={filtroSit}
              onChange={e => setFiltroSit(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            >
              <option value="">Todas as situações</option>
              {Object.entries(SIT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {podeAnalisar && tipo !== 'reurb' && (
              <button
                onClick={() => { setEditCampos(formularioCampos); setConfigurando(v => !v) }}
                style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                ⚙ Configurar formulário
              </button>
            )}
            <button
              onClick={() => (criando ? fecharCriacao() : abrirCriacao())}
              style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >
              {criando ? 'Cancelar abertura' : '+ Abrir processo'}
            </button>
          </div>
        </div>

        {configurando && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
              Campos do formulário de abertura ({TITULO[tipo] ?? tipo})
            </p>
            <FormularioCampos campos={editCampos} onChange={setEditCampos} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                onClick={() => salvarFormulario.mutate()}
                disabled={salvarFormulario.isPending}
                style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                Salvar
              </button>
            </div>
          </div>
        )}

        {podeAnalisar && formularioCampos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select
              value={campoFiltro}
              onChange={e => { setCampoFiltro(e.target.value); setValorFiltro('') }}
              style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            >
              <option value="">Filtrar por campo do formulário…</option>
              {formularioCampos
                .filter(c => c.tipo === 'texto' || c.tipo === 'cpf_telefone')
                .map(c => <option key={c.nome} value={c.nome}>{c.rotulo}</option>)}
            </select>
            {campoFiltro && (
              <input
                value={valorFiltro}
                onChange={e => setValorFiltro(e.target.value)}
                placeholder="Valor…"
                style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
              />
            )}
          </div>
        )}

        {criando && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
              Selecione o imóvel no mapa (opcional)
            </p>
            <div style={{ height: 280, borderRadius: 8, overflow: 'hidden', border: '1px solid #bfdbfe' }}>
              <SIGMap compact />
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#374151' }}>
              Imóvel selecionado: <strong>{parcelaSelecionada?.codigo ?? '— nenhum (clique em uma parcela no mapa) —'}</strong>
            </p>

            {formularioCampos.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <FormularioRenderer
                  campos={formularioCampos}
                  valores={novoMetadados}
                  onChange={(nome, valor) => setNovoMetadados(m => ({ ...m, [nome]: valor }))}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                onClick={abrirProcesso}
                disabled={criar.isPending}
                style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                Abrir processo
              </button>
            </div>
          </div>
        )}

        <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Código', 'Situação', 'Requerente', 'Analista', 'Parcela', 'Data', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processos.map(p => {
                const sit = SIT[p.situacao] ?? { label: p.situacao, color: '#9ca3af' }
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    style={{
                      borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                      background: selected?.id === p.id ? '#eff6ff' : 'white',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e3a5f' }}>{p.codigo}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: sit.color + '22', color: sit.color, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                        {sit.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{p.requerente_nome ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{p.analista_nome ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{p.parcela_codigo ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {p.situacao === 'rascunho' && (
                        <button
                          onClick={e => { e.stopPropagation(); enviar.mutate(p.id) }}
                          style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                        >
                          Enviar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {processos.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Nenhum processo encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalhe */}
      {selected && (
        <div style={{ width: 340, background: 'white', borderLeft: '1px solid #e5e7eb', overflowY: 'auto', padding: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#1e3a5f' }}>{selected.codigo}</h3>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
          </div>
          {detalhe && (
            <>
              <Row label="Tipo" value={TITULO[detalhe.tipo]} />
              <Row label="Situação" value={SIT[detalhe.situacao]?.label ?? detalhe.situacao} />
              <Row label="Requerente" value={detalhe.requerente_nome} />
              <Row label="Analista" value={detalhe.analista_nome} />
              <Row label="Parcela" value={detalhe.parcela_codigo} />
              <Row label="Abertura" value={new Date(detalhe.created_at).toLocaleDateString('pt-BR')} />

              {formularioCampos
                .filter(c => c.tipo === 'texto' || c.tipo === 'cpf_telefone')
                .map(c => (
                  <Row key={c.nome} label={c.rotulo} value={String((detalhe.metadados as Record<string, unknown> | undefined)?.[c.nome] ?? '')} />
                ))}

              {detalhe.situacao === 'reprovado' && detalhe.created_by === user?.id && (
                <div style={{ marginTop: 16, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#991b1b' }}>
                    Este processo foi reprovado. Corrija os formulários das etapas reprovadas abaixo e reenvie para nova análise.
                  </p>
                  {(detalhe.etapas ?? [])
                    .filter((e: any) => e.situacao === 'reprovado' && Array.isArray(e.formulario) && e.formulario.length > 0)
                    .map((etapa: any) => (
                      <div key={etapa.id} style={{ marginBottom: 12, padding: 10, background: 'white', borderRadius: 6, border: '1px solid #fecaca' }}>
                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#991b1b' }}>{etapa.nome}</p>
                        {etapa.parecer && (
                          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#991b1b' }}>Motivo: {etapa.parecer}</p>
                        )}
                        <FormularioRenderer
                          campos={etapa.formulario as CampoFormulario[]}
                          valores={editedMetadados}
                          onChange={(nome, valor) => setEditedMetadados(m => ({ ...m, [nome]: valor }))}
                        />
                      </div>
                    ))}
                  <button
                    onClick={() => reenviar.mutate()}
                    disabled={reenviar.isPending}
                    style={{ background: '#dc2626', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                  >
                    Corrigir e reenviar para análise
                  </button>
                </div>
              )}

              {podeAnalisar && ['aberto', 'em_analise'].includes(detalhe.situacao) && (
                <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Gestão da análise</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: detalhe.analista_id ? 8 : 0 }}>
                    <select
                      value={encaminharPara}
                      onChange={e => setEncaminharPara(e.target.value)}
                      style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}
                    >
                      <option value="">Selecione um analista…</option>
                      {analistas.map(a => <option key={a.id} value={a.id}>{a.nome} ({a.email})</option>)}
                    </select>
                    <button
                      onClick={() => encaminharPara && encaminhar.mutate(encaminharPara)}
                      disabled={!encaminharPara || encaminhar.isPending}
                      style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                    >
                      Encaminhar
                    </button>
                  </div>
                  {detalhe.analista_id && (
                    <button
                      onClick={() => retirarAnalista.mutate()}
                      disabled={retirarAnalista.isPending}
                      style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, width: '100%' }}
                    >
                      Retirar analista do processo
                    </button>
                  )}
                </div>
              )}

              {detalhe.etapas?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 8px' }}>Etapas</p>
                  {detalhe.etapas.map((e: any) => (
                    <div key={e.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ fontWeight: 600 }}>{e.nome}</span>
                      <span style={{ color: '#6b7280', marginLeft: 8 }}>{e.situacao}</span>
                      {e.situacao === 'reprovado' && e.parecer && (
                        <p style={{ margin: '2px 0 0', color: '#991b1b', fontSize: 11 }}>{e.parecer}</p>
                      )}
                    </div>
                  ))}

                  {podeAnalisar && detalhe.situacao === 'em_analise' && etapaAtual && (
                    <div style={{ marginTop: 8, padding: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                      <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                        Dar parecer — {etapaAtual.nome}
                      </p>
                      <textarea
                        value={parecerTexto}
                        onChange={e => setParecerTexto(e.target.value)}
                        placeholder="Comentário (obrigatório para reprovar)"
                        rows={3}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', resize: 'vertical', marginBottom: 6 }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => darParecer.mutate({ etapaId: etapaAtual.id, situacao: 'aprovado' })}
                          disabled={darParecer.isPending}
                          style={{ flex: 1, background: '#10b981', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => {
                            if (!parecerTexto.trim()) { toast.error('Informe o motivo da reprovação'); return }
                            darParecer.mutate({ etapaId: etapaAtual.id, situacao: 'reprovado' })
                          }}
                          disabled={darParecer.isPending}
                          style={{ flex: 1, background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                        >
                          Reprovar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 8px' }}>Anexos</p>
                {(detalhe.anexos ?? []).map((a: Anexo) => (
                  <AnexoRow key={a.id} anexo={a} processoId={selected.id} />
                ))}
                {(detalhe.anexos ?? []).length === 0 && (
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>Nenhum anexo</p>
                )}
                <AddAnexoForm processoId={selected.id} />
              </div>
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
      <span style={{ color: '#6b7280', width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value ?? '—'}</span>
    </div>
  )
}

// Lista um anexo do processo, com opção de anotar (req 206 — gera cópia anotada do PDF) e remover
function AnexoRow({ anexo, processoId }: { anexo: Anexo; processoId: string }) {
  const qc = useQueryClient()
  const [anotando, setAnotando] = useState(false)
  const [texto, setTexto] = useState('')
  const ehPdf = anexo.tipo_mime === 'application/pdf' || anexo.nome.toLowerCase().endsWith('.pdf')

  const invalidar = () => qc.invalidateQueries({ queryKey: ['processo-detalhe', processoId] })

  const remover = useMutation({
    mutationFn: () => api.delete(`/processos/${processoId}/anexos/${anexo.id}`),
    onSuccess: invalidar,
    onError: () => toast.error('Erro ao remover anexo'),
  })

  const anotar = useMutation({
    mutationFn: () => api.post(`/processos/${processoId}/anexos/${anexo.id}/anotar`, { texto }),
    onSuccess: () => {
      toast.success('Anotação adicionada — uma cópia do PDF foi criada')
      setTexto('')
      setAnotando(false)
      invalidar()
    },
    onError: () => toast.error('Erro ao adicionar anotação'),
  })

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <a href={anexo.url} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', textDecoration: 'none', wordBreak: 'break-all' }}>
          {anexo.anexo_original_id ? '↳ ' : ''}{anexo.nome}
        </a>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {ehPdf && (
            <button
              onClick={() => setAnotando(v => !v)}
              style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}
            >
              Anotar
            </button>
          )}
          <button onClick={() => remover.mutate()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
        </div>
      </div>
      {anotando && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Texto da anotação"
            style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}
          />
          <button
            onClick={() => anotar.mutate()}
            disabled={!texto.trim() || anotar.isPending}
            style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          >
            Salvar
          </button>
        </div>
      )}
    </div>
  )
}

// Envia um novo anexo para o Storage e registra no processo
function AddAnexoForm({ processoId }: { processoId: string }) {
  const qc = useQueryClient()
  const [enviando, setEnviando] = useState(false)

  const upload = useMutation({
    mutationFn: async (arquivo: File) => {
      setEnviando(true)
      const path = `processos/${processoId}/anexos/${Date.now()}_${arquivo.name.replace(/\s+/g, '_')}`
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, arquivo)
      if (uploadError) throw uploadError
      const { data: signed, error: signError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, 10 * 365 * 24 * 60 * 60)
      if (signError) throw signError
      await api.post(`/processos/${processoId}/anexos`, {
        nome: arquivo.name, storagePath: path, url: signed.signedUrl, tipoMime: arquivo.type, tamanhoBytes: arquivo.size,
      })
    },
    onSuccess: () => {
      toast.success('Anexo adicionado')
      setEnviando(false)
      qc.invalidateQueries({ queryKey: ['processo-detalhe', processoId] })
    },
    onError: () => { toast.error('Erro ao enviar anexo'); setEnviando(false) },
  })

  return (
    <div style={{ marginTop: 6 }}>
      <input
        type="file"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }}
        disabled={upload.isPending}
        style={{ fontSize: 12 }}
      />
      {enviando && <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>Enviando...</p>}
    </div>
  )
}
