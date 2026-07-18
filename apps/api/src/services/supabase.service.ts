import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import { UserRole } from '@sigweb/shared'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? ''
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'sigweb'

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export interface DecodedSupabaseToken {
  uid: string
  email: string
  perfil: UserRole
}

// Verifica localmente o JWT emitido pelo GoTrue (HS256, segredo compartilhado do projeto
// Supabase) — equivalente ao antigo getAuth().verifyIdToken() do Firebase.
// `perfil` chega no claim porque o Custom Access Token Hook (ver V019__supabase_auth.sql)
// injeta o valor de sigweb.usuarios.perfil no token a cada login.
export function verifySupabaseToken(token: string): DecodedSupabaseToken {
  const decoded = jwt.verify(token, SUPABASE_JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload & { perfil?: string }
  return {
    uid: decoded.sub ?? '',
    email: decoded.email ?? '',
    perfil: (decoded.perfil as UserRole) ?? 'CIDADAO',
  }
}

export async function getSignedUrl(storagePath: string, expiresInSeconds = 3_600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

export async function uploadFile(storagePath: string, bytes: Buffer, contentType: string): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true })
  if (error) throw error
}

export async function downloadFile(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(storagePath)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

export async function deleteFile(storagePath: string) {
  await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([storagePath])
}

// Notificação push (Expo Push Service) ao app móvel do cidadão — req 144/146/147.
// Falhas (token inválido/expirado, app sem permissão) não devem interromper o fluxo principal.
export async function sendExpoPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: expoPushToken, title, body, data }),
    })
  } catch (err) {
    console.warn('Falha ao enviar push Expo:', err)
  }
}
