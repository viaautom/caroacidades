import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { createClient } from '@supabase/supabase-js'
import { jwtDecode } from 'jwt-decode'
import Constants from 'expo-constants'

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string

export const STORAGE_BUCKET = (Constants.expoConfig?.extra?.supabaseStorageBucket as string | undefined) ?? 'sigweb'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Supabase recomenda pausar/retomar o auto-refresh do token conforme o app
// vai para background/foreground (setInterval não roda com o app suspenso).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})

// O Custom Access Token Hook (database/migrations/V019__supabase_auth.sql) injeta
// o claim "perfil" no JWT a cada login/refresh — substitui o antigo custom claim do Firebase.
export function decodePerfil(accessToken: string): string {
  try {
    const payload = jwtDecode<{ perfil?: string }>(accessToken)
    return payload.perfil ?? 'CIDADAO'
  } catch {
    return 'CIDADAO'
  }
}
