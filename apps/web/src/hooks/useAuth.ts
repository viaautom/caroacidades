import { useEffect } from 'react'
import { supabase, decodePerfil } from '../lib/supabase'
import { useAuthStore } from '../store/auth.store'

export function useAuthInit() {
  const { setUser } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null, session ? decodePerfil(session.access_token) : undefined)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null, session ? decodePerfil(session.access_token) : undefined)
    })
    return () => subscription.unsubscribe()
  }, [setUser])
}
