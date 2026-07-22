import { createClient } from '@supabase/supabase-js'
import { jwtDecode } from 'jwt-decode'
import { UserRole } from '@sigweb/shared'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'sigweb'

// O Custom Access Token Hook (V019__supabase_auth.sql) injeta o claim
// "perfil" no JWT a cada login/refresh — substitui o antigo custom claim
// do Firebase, lido da mesma forma pelo backend em verifySupabaseToken().
export function decodePerfil(accessToken: string): UserRole {
  try {
    const payload = jwtDecode<{ perfil?: UserRole, app_metadata?: { perfil?: UserRole } }>(accessToken)
    return payload.perfil ?? payload.app_metadata?.perfil ?? 'CIDADAO'
  } catch {
    return 'CIDADAO'
  }
}
