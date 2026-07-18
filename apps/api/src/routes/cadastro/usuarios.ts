import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'
import { query } from '../../db/pool'
import { supabaseAdmin } from '../../services/supabase.service'

const PERFIS = ['ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO'] as const
const perfilSchema = z.enum(PERFIS)

export async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Listar usuários do banco de dados
  app.get('/usuarios', { preHandler: requireRole('ADMIN') }, async () => {
    const rows = await query<{
      firebase_uid: string
      email: string | null
      nome: string | null
      perfil: string
      ativo: boolean
    }>(
      `SELECT firebase_uid, email, nome, perfil, ativo
       FROM sigweb.usuarios
       ORDER BY nome`)
    return rows.map(u => ({
      id: u.firebase_uid,
      firebase_uid: u.firebase_uid,
      email: u.email ?? '',
      nome: u.nome ?? '',
      perfil: u.perfil,
      ativo: u.ativo,
    }))
  })

  // Criar usuário com senha temporária e persistir no banco
  app.post('/usuarios', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      nome: z.string().min(2),
      senha: z.string().min(6),
      perfil: perfilSchema.default('FISCAL_CAMPO'),
    }).parse(request.body)

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.senha,
      email_confirm: false,
      user_metadata: { nome: body.nome },
    })
    if (error || !data.user) {
      return reply.code(400).send({ error: 'Não foi possível criar a conta' })
    }

    await query(
      `INSERT INTO sigweb.usuarios (firebase_uid, email, nome, perfil, ativo)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (firebase_uid) DO UPDATE
         SET email = EXCLUDED.email,
             nome = EXCLUDED.nome,
             perfil = EXCLUDED.perfil,
             ativo = true,
             updated_at = now()`,
      [data.user.id, body.email, body.nome, body.perfil]
    )

    reply.code(201)
    return { id: data.user.id }
  })

  // Alterar perfil (fonte da verdade fica em sigweb.usuarios.perfil — o Custom
  // Access Token Hook injeta o valor atual no token a cada login/refresh)
  app.patch('/usuarios/:uid/perfil', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { uid } = request.params as { uid: string }
    const { perfil } = z.object({ perfil: perfilSchema }).parse(request.body)
    await query(
      `UPDATE sigweb.usuarios SET perfil = $2, updated_at = now() WHERE firebase_uid = $1`,
      [uid, perfil]
    )
    return { ok: true }
  })

  // Ativar / desativar acesso
  app.patch('/usuarios/:uid/ativo', { preHandler: requireRole('ADMIN') }, async (request) => {
    const { uid } = request.params as { uid: string }
    const { ativo } = z.object({ ativo: z.boolean() }).parse(request.body)
    await supabaseAdmin.auth.admin.updateUserById(uid, { ban_duration: ativo ? 'none' : '876000h' })
    await query(
      `UPDATE sigweb.usuarios SET ativo = $2, updated_at = now() WHERE firebase_uid = $1`,
      [uid, ativo]
    )
    return { ok: true }
  })

  // Excluir permanentemente
  app.delete('/usuarios/:uid', { preHandler: requireRole('ADMIN') }, async (request, reply) => {
    const { uid } = request.params as { uid: string }
    await supabaseAdmin.auth.admin.deleteUser(uid)
    await query(`DELETE FROM sigweb.usuarios WHERE firebase_uid = $1`, [uid])
    reply.code(204)
  })
}
