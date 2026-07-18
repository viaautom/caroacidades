import { useState, useEffect, useRef } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/auth.store'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePermissionsStore, type PerfilKey } from '../store/permissions.store'
import { GestaoSIGPage } from './GestaoSIGPage'
import api from '../lib/api'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  { path: '/mapa',       label: 'Mapa',                  moduloId: 'mapa' },
  { path: '/cadastro',   label: 'Cadastro Imobiliário',  moduloId: 'cadastro_imobiliario' },
  { path: '/edificacoes',label: 'Edificações',           moduloId: 'cadastro_imobiliario' },
  { path: '/viabilidade',label: 'Viabilidade',           moduloId: 'viabilidade' },
  { path: '/iluminacao', label: 'Iluminação Pública',    moduloId: 'iluminacao_publica' },
  { path: '/estoque',    label: 'Estoque IP',            moduloId: 'iluminacao_publica' },
  { path: '/arborizacao',label: 'Arborização',           moduloId: 'arborizacao' },
  { path: '/pgv',        label: 'PGV',                   moduloId: 'pgv' },
  { path: '/processos',  label: 'Aprovação de Projetos', moduloId: 'aprovacao_projetos' },
  { path: '/habite-se',  label: 'Habite-se',             moduloId: 'habite_se' },
  { path: '/reurb',      label: 'REURB',                 moduloId: 'reurb' },
  { path: '/social',     label: 'Cadastro Social',       moduloId: 'cadastro_social' },
  { path: '/numeracao',  label: 'Numeração Predial',     moduloId: 'numeracao_predial' },
  { path: '/app-mobile', label: 'App de Chamados',       moduloId: 'app_chamados' },
  { path: '/patrimonio', label: 'Patrimônio',            moduloId: 'patrimonio' },
  { path: '/cemiterio',  label: 'Cemitério',             moduloId: 'cemiterio' },
  { path: '/nuvem-pontos',label: 'Nuvem 3D',             moduloId: 'nuvem_3d' },
  { path: '/banco-dados', label: 'Banco de Dados',       moduloId: 'banco_dados' },
  { path: '/sinter',      label: 'SINTER (RFB)',          moduloId: 'sinter' },
]

const PERFIL_LABEL: Record<string, string> = {
  ADMIN: 'Administrador', FISCAL_TRIBUTARIO: 'Fiscal Tributário',
  SETOR_PROJETOS: 'Setor de Projetos', FISCAL_CAMPO: 'Fiscal de Campo', CIDADAO: 'Cidadão',
}

type Notificacao = {
  id: string
  tipo: string
  titulo: string
  conteudo: string | null
  lida: boolean
  created_at: string
}

// Sino de notificações (req 27) — contagem de não lidas + lista + marcar como lida
function NotificationBell() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery<{ data: Notificacao[]; naoLidas: number }>({
    queryKey: ['notificacoes'],
    queryFn: () => api.get('/notificacoes').then(r => r.data),
    refetchInterval: 60_000,
  })

  const marcarLida = useMutation({
    mutationFn: (id: string) => api.patch(`/notificacoes/${id}/lida`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificacoes'] }),
  })

  const marcarTodasLidas = useMutation({
    mutationFn: () => api.patch('/notificacoes/marcar-todas-lidas'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificacoes'] }),
  })

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const notificacoes = data?.data ?? []
  const naoLidas = data?.naoLidas ?? 0

  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 'auto' }}>
      <button onClick={() => setOpen(o => !o)} title="Notificações"
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}>
        🔔
        {naoLidas > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, background: '#ef4444', color: 'white',
            borderRadius: 9, minWidth: 16, height: 16, fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>{naoLidas > 9 ? '9+' : naoLidas}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 320,
          background: 'white', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          zIndex: 500, overflow: 'hidden', maxHeight: 400, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13, color: '#1e3a5f' }}>Notificações</strong>
            {naoLidas > 0 && (
              <button onClick={() => marcarTodasLidas.mutate()}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer' }}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notificacoes.length === 0 && (
              <p style={{ padding: 16, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>Nenhuma notificação</p>
            )}
            {notificacoes.map(n => (
              <div key={n.id}
                onClick={() => { if (!n.lida) marcarLida.mutate(n.id) }}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: n.lida ? 'default' : 'pointer',
                  background: n.lida ? 'white' : '#eff6ff',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 12.5, color: '#1f2937' }}>{n.titulo}</strong>
                  {!n.lida && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', flexShrink: 0, marginTop: 4 }} />}
                </div>
                {n.conteudo && <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>{n.conteudo}</p>}
                <p style={{ margin: '3px 0 0', fontSize: 11, color: '#9ca3af' }}>{new Date(n.created_at).toLocaleString('pt-BR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function MainLayout() {
  const { user, perfil } = useAuthStore()
  const { isHabilitado, previewPerfil, setPreviewPerfil, initOverrides, loaded } = usePermissionsStore()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [painelAberto, setPainelAberto] = useState(false)

  // Carrega permissões customizadas do banco uma vez
  useEffect(() => {
    if (loaded) return
    api.get('/permissoes').then(r => initOverrides(r.data)).catch(() => initOverrides([]))
  }, [loaded, initOverrides])

  // ESC sai do modo preview
  useEffect(() => {
    if (!previewPerfil) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewPerfil(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewPerfil, setPreviewPerfil])

  const effectivePerfil = (previewPerfil ?? perfil) as string

  const visibleItems = NAV_ITEMS.filter(item =>
    isHabilitado(item.moduloId, effectivePerfil)
  )

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
    toast.success('Saiu da sessão')
  }

  function handleNavClick() {
    if (isMobile) setSidebarOpen(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 220, background: '#1e3a5f', color: 'white',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        } : {
          position: 'relative',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-220px)',
          marginLeft: sidebarOpen ? 0 : -220,
          transition: 'transform 0.2s, margin-left 0.2s',
        }),
      }}>
        {/* Logo + engrenagem */}
        <div style={{
          padding: '14px 12px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <img src="/logo.png" alt="Caroá"
            style={{ width: 130, height: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          {perfil === 'ADMIN' && (
            <button onClick={() => setPainelAberto(true)} title="Gestão do SIG"
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none',
                color: 'rgba(255,255,255,0.75)', width: 30, height: 30, borderRadius: 6,
                cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'white' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
            >⚙</button>
          )}
        </div>

        {/* Navegação */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {visibleItems.map(item => (
            <Link key={item.path} to={item.path} onClick={handleNavClick} style={{
              display: 'block', padding: '11px 16px', fontSize: 14,
              color: location.pathname.startsWith(item.path) ? '#93c5fd' : 'rgba(255,255,255,0.8)',
              textDecoration: 'none',
              background: location.pathname.startsWith(item.path) ? 'rgba(255,255,255,0.1)' : 'transparent',
              borderLeft: location.pathname.startsWith(item.path) ? '3px solid #3b82f6' : '3px solid transparent',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Rodapé */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 12 }}>
          <p style={{ margin: '0 0 2px', opacity: 0.6, fontSize: 11 }}>
            {PERFIL_LABEL[perfil ?? ''] ?? perfil}
          </p>
          <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.user_metadata?.nome ?? user?.email}
          </p>
          <button onClick={handleLogout}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 13, width: '100%' }}>
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Banner de preview */}
        {previewPerfil && (
          <div style={{
            background: '#f59e0b', color: '#1c1917', padding: '8px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 13, fontWeight: 600, flexShrink: 0,
          }}>
            <span>👁 Visualizando como: {PERFIL_LABEL[previewPerfil]} — pressione ESC ou clique para sair</span>
            <button onClick={() => setPreviewPerfil(null)}
              style={{ background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              Sair do preview
            </button>
          </div>
        )}

        <header style={{
          height: 48, background: 'white', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0,
        }}>
          <button onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, flexShrink: 0 }}>
            ☰
          </button>
          <span style={{ fontSize: 13, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Sistema Multifinalitário de Gestão Territorial Urbana
          </span>
          <div id="map-search-slot" style={{ flex: 1, minWidth: 0, display: 'flex' }} />
          <NotificationBell />
        </header>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Outlet />
        </div>
      </main>

      {/* Drawer Gestão do SIG */}
      {painelAberto && (
        <>
          <div onClick={() => setPainelAberto(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 'min(960px, 90vw)', background: '#f9fafb', zIndex: 500,
            boxShadow: '-8px 0 32px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '14px 20px', background: '#1e3a5f', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>⚙ Gestão do SIG</span>
              <button onClick={() => setPainelAberto(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <GestaoSIGPage onPreview={(p: PerfilKey) => { setPreviewPerfil(p); setPainelAberto(false) }} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
