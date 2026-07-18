import { FastifyRequest, FastifyReply } from 'fastify'
import { verifySupabaseToken } from '../services/supabase.service'
import { UserRole } from '@sigweb/shared'

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      uid: string
      email: string
      perfil: UserRole
    }
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Token não fornecido' })
  }

  const idToken = authHeader.slice(7)
  try {
    request.user = verifySupabaseToken(idToken)
  } catch {
    return reply.code(401).send({ error: 'Token inválido ou expirado' })
  }
}
