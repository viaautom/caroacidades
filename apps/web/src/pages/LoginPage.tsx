import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import api from '../lib/api'
import toast from 'react-hot-toast'

// Aplica máscara de telefone: (XX) XXXX-XXXX ou (XX) XXXXX-XXXX (req 11)
function maskTelefone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  const ddd = d.slice(0, 2)
  const rest = d.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
}

export function LoginPage() {
  const [cadastro, setCadastro] = useState(false)
  const [nome, setNome]         = useState('')
  const [email, setEmail]       = useState('')
  const [celular, setCelular]   = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuthStore()

  useEffect(() => {
    if (!authLoading && user) navigate('/mapa', { replace: true })
  }, [user, authLoading, navigate])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      // navegação disparada pelo useEffect acima quando o auth state confirmar
    } catch (err: any) {
      const msg = err.code === 'invalid_credentials'
        ? 'E-mail ou senha inválidos'
        : 'Erro ao fazer login'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Auto-cadastro de cidadão (req 11): cria a conta com perfil CIDADAO no
  // backend, efetua o login normalmente e dispara o e-mail de verificação
  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\(\d{2}\) \d{4,5}-\d{4}$/.test(celular)) {
      toast.error('Informe um telefone válido com DDD')
      return
    }
    setLoading(true)
    try {
      await api.post('/auto-cadastro', { nome, email, celular, senha: password })
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await supabase.auth.resend({ type: 'signup', email })
      toast.success('Conta criada! Verifique seu e-mail para confirmar o cadastro.')
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao criar a conta')
    } finally {
      setLoading(false)
    }
  }

  function alternarModo() {
    setCadastro((atual) => !atual)
    setNome('')
    setCelular('')
    setPassword('')
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(150deg, #1a2e4a 0%, #1e3a5f 50%, #0f4c81 100%)',
    }}>
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: '44px 48px 36px',
        width: 400,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/logo.png"
            alt="Caroá Cidades Inteligentes"
            style={{ height: 120, width: 'auto', objectFit: 'contain' }}
          />
          <p style={{ color: '#6b7280', fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Sistema Multifinalitário de Gestão Territorial
          </p>
        </div>

        <form onSubmit={cadastro ? handleCadastro : handleLogin}>
          {cadastro && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Nome
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                autoFocus
                placeholder="Seu nome completo"
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '1.5px solid #e5e7eb', borderRadius: 8,
                  fontSize: 14, boxSizing: 'border-box', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#2563eb')}
                onBlur={e  => (e.target.style.borderColor = '#e5e7eb')}
              />
            </div>
          )}

          {cadastro && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Telefone
              </label>
              <input
                type="tel"
                value={celular}
                onChange={(e) => setCelular(maskTelefone(e.target.value))}
                required
                placeholder="(00) 00000-0000"
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '1.5px solid #e5e7eb', borderRadius: 8,
                  fontSize: 14, boxSizing: 'border-box', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#2563eb')}
                onBlur={e  => (e.target.style.borderColor = '#e5e7eb')}
              />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={!cadastro}
              placeholder="seu@email.com"
              style={{
                width: '100%', padding: '10px 12px',
                border: '1.5px solid #e5e7eb', borderRadius: 8,
                fontSize: 14, boxSizing: 'border-box', outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e  => (e.target.style.borderColor = '#e5e7eb')}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px',
                border: '1.5px solid #e5e7eb', borderRadius: 8,
                fontSize: 14, boxSizing: 'border-box', outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e  => (e.target.style.borderColor = '#e5e7eb')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: loading ? '#9ca3af' : '#1e3a5f',
              color: 'white', border: 'none', borderRadius: 8,
              fontSize: 15, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.03em',
              transition: 'background 0.15s',
            }}
          >
            {loading ? (cadastro ? 'Criando conta…' : 'Entrando…') : (cadastro ? 'Criar conta' : 'Entrar')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
          {cadastro ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}{' '}
          <button
            type="button"
            onClick={alternarModo}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: '#2563eb', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {cadastro ? 'Entrar' : 'Cadastre-se'}
          </button>
        </p>

        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
          Caroá Tecnologia © 2026
        </p>
      </div>
    </div>
  )
}
