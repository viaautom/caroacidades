import { create } from 'zustand'
import { User } from '@supabase/supabase-js'
import { UserRole } from '@sigweb/shared'

interface AuthState {
  user: User | null
  perfil: UserRole | null
  loading: boolean
  setUser: (user: User | null, perfil?: UserRole) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  perfil: null,
  loading: true,
  setUser: (user, perfil) => set({ user, perfil: perfil ?? null, loading: false }),
  setLoading: (loading) => set({ loading }),
}))
