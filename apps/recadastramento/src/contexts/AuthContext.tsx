import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, decodePerfil } from '../lib/supabase'

type AuthContextValue = {
  user: User | null
  perfil: string | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, perfil: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setPerfil(session ? decodePerfil(session.access_token) : null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setPerfil(session ? decodePerfil(session.access_token) : null)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, perfil, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

// O app é restrito a fiscais responsáveis pelo recadastramento imobiliário —
// credenciais configuradas pelo sistema (req 169-equivalente)
export function isFiscalRecadastramento(perfil: string | null) {
  return perfil === 'ADMIN' || perfil === 'FISCAL_CAMPO' || perfil === 'FISCAL_TRIBUTARIO'
}
