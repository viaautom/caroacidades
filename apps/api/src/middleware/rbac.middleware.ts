import { FastifyRequest, FastifyReply } from 'fastify'
import { UserRole } from '@sigweb/shared'

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Não autenticado' })
    }
    if (request.user.perfil === 'DESENVOLVEDOR') {
      return // Bypassa qualquer restrição (nível máximo)
    }

    if (!roles.includes(request.user.perfil)) {
      return reply.code(403).send({ error: 'Acesso negado para este perfil' })
    }
  }
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRole('ADMIN')(request, reply)
}
