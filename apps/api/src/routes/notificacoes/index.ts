import { FastifyInstance } from 'fastify'
import { query } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'

export const MIGRATION_NOTIFICACOES = `
  CREATE TABLE IF NOT EXISTS sigweb.notificacoes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id    UUID NOT NULL REFERENCES sigweb.usuarios(id) ON DELETE CASCADE,
    tipo          VARCHAR(50) NOT NULL,
    titulo        VARCHAR(200) NOT NULL,
    conteudo      TEXT,
    referencia_id UUID,
    lida          BOOLEAN NOT NULL DEFAULT false,
    criado_por    VARCHAR(128),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON sigweb.notificacoes (usuario_id, lida, created_at DESC);
`

export async function notificacoesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Lista as notificações do usuário autenticado (mais recentes primeiro)
  app.get('/notificacoes', async (request) => {
    const { apenas_nao_lidas } = request.query as Record<string, string>
    const where = apenas_nao_lidas === 'true' ? 'AND n.lida = false' : ''
    const rows = await query(
      `SELECT n.id, n.tipo, n.titulo, n.conteudo, n.referencia_id, n.lida, n.created_at
       FROM sigweb.notificacoes n
       JOIN sigweb.usuarios u ON u.id = n.usuario_id
       WHERE u.auth_uid = $1 ${where}
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [request.user.uid]
    )
    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*) FROM sigweb.notificacoes n
       JOIN sigweb.usuarios u ON u.id = n.usuario_id
       WHERE u.auth_uid = $1 AND n.lida = false`,
      [request.user.uid]
    )
    return { data: rows, naoLidas: Number(count) }
  })

  // Marca uma notificação como lida
  app.patch('/notificacoes/:id/lida', async (request) => {
    const { id } = request.params as { id: string }
    await query(
      `UPDATE sigweb.notificacoes n SET lida = true
       FROM sigweb.usuarios u
       WHERE n.usuario_id = u.id AND n.id = $1 AND u.auth_uid = $2`,
      [id, request.user.uid]
    )
    return { ok: true }
  })

  // Marca todas como lidas
  app.patch('/notificacoes/marcar-todas-lidas', async (request) => {
    await query(
      `UPDATE sigweb.notificacoes n SET lida = true
       FROM sigweb.usuarios u
       WHERE n.usuario_id = u.id AND u.auth_uid = $1 AND n.lida = false`,
      [request.user.uid]
    )
    return { ok: true }
  })
}
