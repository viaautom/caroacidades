import { FastifyInstance } from 'fastify'
import { db } from '../../db/pool'
import { requireAuth } from '../../middleware/auth.middleware'

export default async function anotacoesRoutes(app: FastifyInstance) {
  // Aplicar middleware de autenticação em todas as rotas de anotações
  app.addHook('onRequest', requireAuth)

  app.get('/', async (request, reply) => {
    const { rows } = await db.query('SELECT * FROM sigweb.anotacoes ORDER BY created_at DESC')
    return rows
  })

  app.post('/', async (request, reply) => {
    const { topico } = request.body as { topico: string }
    const user = request.user // preenchido pelo requireAuth

    if (!topico) {
      return reply.code(400).send({ error: 'Tópico é obrigatório' })
    }

    const { rows } = await db.query(
      `INSERT INTO sigweb.anotacoes (topico, auth_uid, nome_autor) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [topico, user.auth_uid || user.id, user.nome || user.email]
    )

    return reply.code(201).send(rows[0])
  })

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { implementado } = request.body as { implementado: boolean }
    const user = request.user

    // Apenas ADMIN ou DESENVOLVEDOR podem alterar o status
    if (user.perfil !== 'ADMIN' && user.perfil !== 'DESENVOLVEDOR') {
      return reply.code(403).send({ error: 'Permissão negada. Apenas Administradores ou Desenvolvedores podem marcar como implementado.' })
    }

    const { rows } = await db.query(
      'UPDATE sigweb.anotacoes SET implementado = $1 WHERE id = $2 RETURNING *',
      [implementado, id]
    )

    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Anotação não encontrada' })
    }

    return rows[0]
  })
}
