import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store'
import { supabase } from '../lib/supabase'
import api from '../lib/api'
import toast from 'react-hot-toast'

type Usuario = { id: string; firebase_uid?: string; email: string; nome: string; perfil: string; ativo: boolean }

const ROLES = ['ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO'] as const

const PERFIL_LABEL: Record<string, string> = {
  ADMIN:             'Administrador',
  FISCAL_TRIBUTARIO: 'Fiscal Tributário',
  SETOR_PROJETOS:    'Setor de Projetos',
  FISCAL_CAMPO:      'Fiscal de Campo',
  CIDADAO:           'Cidadão',
}

const PERFIL_COR: Record<string, { bg: string; color: string }> = {
  ADMIN:             { bg: '#eff6ff', color: '#1d4ed8' },
  FISCAL_TRIBUTARIO: { bg: '#f0fdf4', color: '#16a34a' },
  SETOR_PROJETOS:    { bg: '#fdf4ff', color: '#9333ea' },
  FISCAL_CAMPO:      { bg: '#fff7ed', color: '#ea580c' },
  CIDADAO:           { bg: '#f9fafb', color: '#6b7280' },
}

export function PainelUsuarios({ onClose }: { onClose: () => void }) {
  const { perfil } = useAuthStore()
  const qc = useQueryClient()
  const [bootstrapping, setBootstrapping] = useState(false)
  const [criando, setCriando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ email: '', nome: '', senha: '', perfil: 'FISCAL_CAMPO' })

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
      toast.success('Perfil atualizado — usuário deve fazer logout e entrar novamente.')
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
      toast.error('Erro ao alterar situação')
    }
  }

  async function criarUsuario() {
    if (!form.email || !form.nome || !form.senha) { toast.error('Preencha todos os campos'); return }
    setSalvando(true)
    try {
      await api.post('/usuarios', form)
      toast.success(`Usuário ${form.email} criado.`)
      setForm({ email: '', nome: '', senha: '', perfil: 'FISCAL_CAMPO' })
      setCriando(false)
      qc.invalidateQueries({ queryKey: ['usuarios'] })
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Erro ao criar usuário')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400 }}
      />

      {/* Painel lateral */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
        background: 'white', zIndex: 500,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {/* Cabeçalho */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#1e3a5f', color: 'white', flexShrink: 0,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Administração
            </p>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Gerenciar Usuários</h2>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white',
            width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Conteúdo com scroll */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Bootstrap (setup inicial) */}
          {perfil !== 'ADMIN' && (
            <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: 14 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#92400e', fontSize: 13 }}>
                Configuração inicial
              </p>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#78350f' }}>
                Seu perfil é <strong>{PERFIL_LABEL[perfil ?? ''] ?? 'Cidadão'}</strong>. Se não há ADMIN no sistema,
                clique abaixo para se tornar administrador.
              </p>
              <button
                disabled={bootstrapping} onClick={bootstrap}
                style={{ padding: '7px 14px', background: '#d97706', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                {bootstrapping ? 'Aguarde...' : 'Tornar-me Administrador'}
              </button>
            </div>
          )}

          {/* Botão novo usuário */}
          {perfil === 'ADMIN' && !criando && (
            <button
              onClick={() => setCriando(true)}
              style={{
                padding: '10px', background: '#1e3a5f', color: 'white',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              + Novo usuário
            </button>
          )}

          {/* Formulário de criação */}
          {criando && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 14 }}>
              <p style={{ margin: '0 0 12px', fontWeight: 600, color: '#14532d', fontSize: 13 }}>Novo Usuário</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="E-mail *">
                  <input
                    type="email" placeholder="servidor@prefeitura.rs.gov.br"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    style={inputSt}
                  />
                </Field>
                <Field label="Nome completo *">
                  <input
                    placeholder="Nome do servidor"
                    value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    style={inputSt}
                  />
                </Field>
                <Field label="Senha temporária *">
                  <input
                    type="password" placeholder="Mínimo 6 caracteres"
                    value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                    style={inputSt}
                  />
                </Field>
                <Field label="Perfil">
                  <select value={form.perfil} onChange={e => setForm(f => ({ ...f, perfil: e.target.value }))} style={inputSt}>
                    {ROLES.map(r => <option key={r} value={r}>{PERFIL_LABEL[r]}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  disabled={salvando} onClick={criarUsuario}
                  style={{ flex: 1, padding: '9px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {salvando ? 'Criando...' : 'Criar usuário'}
                </button>
                <button
                  onClick={() => setCriando(false)}
                  style={{ padding: '9px 16px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Lista de usuários */}
          {isLoading && (
            <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center' }}>Carregando...</p>
          )}

          {!isLoading && usuarios.length === 0 && (
            <p style={{ color: '#9ca3af', textAlign: 'center', fontSize: 13, padding: 24 }}>
              Nenhum usuário cadastrado.
            </p>
          )}

          {!isLoading && usuarios.map((u: any) => {
            const cor = PERFIL_COR[u.perfil] ?? PERFIL_COR.CIDADAO
            return (
              <div key={u.id} style={{
                border: '1px solid #e5e7eb', borderRadius: 8, padding: 14,
                opacity: u.ativo === false ? 0.55 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#111' }}>{u.nome || '—'}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>{u.email}</p>
                  </div>
                  <span style={{
                    background: cor.bg, color: cor.color,
                    padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  }}>
                    {PERFIL_LABEL[u.perfil] ?? u.perfil}
                  </span>
                </div>

                {perfil === 'ADMIN' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      defaultValue={u.perfil}
                      onChange={e => setPerfil(u.firebase_uid ?? u.id, e.target.value)}
                      style={{ ...inputSt, flex: 1, fontSize: 12, padding: '5px 8px' }}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{PERFIL_LABEL[r]}</option>)}
                    </select>
                    <button
                      onClick={() => setAtivo(u.firebase_uid ?? u.id, !u.ativo)}
                      style={{
                        padding: '5px 10px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                        background: u.ativo !== false ? '#fee2e2' : '#dcfce7',
                        color:      u.ativo !== false ? '#dc2626' : '#16a34a',
                      }}
                    >
                      {u.ativo !== false ? 'Suspender' : 'Reativar'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none',
}
