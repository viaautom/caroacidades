import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query } from '../../db/pool'
import { requireRole } from '../../middleware/rbac.middleware'

export async function configuracoesRoutes(app: FastifyInstance) {
  // Public (or authenticated) route to fetch a specific configuration
  app.get('/:chave', async (request, reply) => {
    const { chave } = z.object({ chave: z.string() }).parse(request.params)
    const result = await query<{ valor: any }>(
      `SELECT valor FROM sigweb.configuracoes WHERE chave = $1`,
      [chave]
    )
    if (result.length === 0) {
      return reply.code(404).send({ error: 'Configuração não encontrada' })
    }
    return reply.send({ valor: result[0].valor })
  })

  // Admin route to update a configuration
  app.put(
    '/:chave',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { chave } = z.object({ chave: z.string() }).parse(request.params)
      const { valor } = z.object({ valor: z.any() }).parse(request.body)

      await query(
        `INSERT INTO sigweb.configuracoes (chave, valor)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
        [chave, JSON.stringify(valor)]
      )
      return reply.send({ success: true })
    }
  )
}
