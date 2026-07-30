import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'
import { query } from '../../db/pool'
import { supabaseAdmin } from '../../services/supabase.service'

const PERFIS = ['DESENVOLVEDOR', 'ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO'] as const
const perfilSchema = z.enum(PERFIS)

export const MIGRATION_USUARIOS = `
  ALTER TABLE sigweb.usuarios ADD COLUMN IF NOT EXISTS cpf TEXT;
`

export async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Retornar perfil real do banco (usado pelo MainLayout para desviar do token estático)
  app.get('/auth/me', async (request, reply) => {
    const rows = await query<{ perfil: string }>(
      `SELECT perfil FROM sigweb.usuarios WHERE auth_uid = $1`,
      [request.user.uid]
    )
    if (rows.length === 0) return reply.code(404).send({ error: 'User not found in db' })
    return { perfil: rows[0].perfil }
  })

  // Listar usuários do banco de dados
  app.get('/usuarios', { preHandler: requireRole('ADMIN', 'DESENVOLVEDOR') }, async (request, reply) => {
    try {

      const rows = await query<{
        auth_uid: string
        email: string | null
        nome: string | null
        perfil: string
        ativo: boolean
      }>(
        `SELECT auth_uid, email, nome, perfil, ativo
         FROM sigweb.usuarios
         ORDER BY nome`
      )
      

      return rows.map(u => ({
        id: u.auth_uid,
        auth_uid: u.auth_uid,
        email: u.email ?? '',
        nome: u.nome ?? '',
        perfil: u.perfil,
        ativo: u.ativo,
      }))
    } catch (err: any) {
      console.error('Erro ao listar usuários:', err)
      return reply.code(500).send({ error: `Erro banco de dados: ${err?.message}` })
    }
  })

  // Criar usuário com senha temporária e persistir no banco
  app.post('/usuarios', { preHandler: requireRole('ADMIN', 'DESENVOLVEDOR') }, async (request, reply) => {
    try {
      const body = z.object({
        email: z.string().email(),
        nome: z.string().min(2),
        senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
        perfil: perfilSchema.default('FISCAL_CAMPO'),
      }).parse(request.body)

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: body.email,
        password: body.senha,
        email_confirm: true,
        user_metadata: { nome: body.nome },
      })
      
      if (error || !data?.user) {
        return reply.code(400).send({ error: error?.message || 'Não foi possível criar a conta no Auth' })
      }

      await query(
        `INSERT INTO sigweb.usuarios (auth_uid, email, nome, perfil, ativo)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (auth_uid) DO UPDATE
           SET email = EXCLUDED.email,
               nome = EXCLUDED.nome,
               perfil = EXCLUDED.perfil,
               ativo = true,
               updated_at = now()`,
        [data.user.id, body.email, body.nome, body.perfil]
      )

      reply.code(201)
      return { id: data.user.id }
    } catch (err: any) {
      console.error('Erro em POST /usuarios:', err)
      // Se for erro do Zod (validação), envia as mensagens de erro
      if (err instanceof z.ZodError) {
        const errorMessages = err.errors.map(e => e.message).join(', ')
        return reply.code(400).send({ error: `Dados inválidos: ${errorMessages}` })
      }
      return reply.code(400).send({ error: err?.message || 'Erro interno ao criar usuário' })
    }
  })

  // Alterar perfil (fonte da verdade fica em sigweb.usuarios.perfil — o Custom
  // Access Token Hook injeta o valor atual no token a cada login/refresh)
  app.patch('/usuarios/:uid/perfil', { preHandler: requireRole('ADMIN', 'DESENVOLVEDOR') }, async (request, reply) => {
    const { uid } = request.params as { uid: string }
    const { perfil } = z.object({ perfil: perfilSchema }).parse(request.body)
    let dropError = ''
    let constraintList: any[] = []
    try {
      const constraints = await query<{ conname: string, def: string }>(`
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = 'sigweb.usuarios'::regclass AND contype = 'c'
      `)
      constraintList = constraints
      
      const c_name = constraints.find((c) => c.def.includes('perfil'))?.conname
      if (c_name) {
        await query(`ALTER TABLE sigweb.usuarios DROP CONSTRAINT "${c_name}"`)
      }
    } catch (e: any) {
      dropError = e?.message
    }

    try {
      await query(
        `UPDATE sigweb.usuarios SET perfil = $2, updated_at = now() WHERE auth_uid = $1`,
        [uid, perfil]
      )
    } catch (err: any) {
      console.error('Erro no PATCH perfil:', err)
      return reply.code(400).send({ error: `DEBUG UPDATE: ${err?.message} | DROP ERR: ${dropError} | CONSTRAINTS: ${JSON.stringify(constraintList)}` })
    }
    return { ok: true }
  })

  // Ativar / desativar acesso
  app.patch('/usuarios/:uid/ativo', { preHandler: requireRole('ADMIN', 'DESENVOLVEDOR') }, async (request) => {
    const { uid } = request.params as { uid: string }
    const { ativo } = z.object({ ativo: z.boolean() }).parse(request.body)
    await supabaseAdmin.auth.admin.updateUserById(uid, { ban_duration: ativo ? 'none' : '876000h' })
    await query(
      `UPDATE sigweb.usuarios SET ativo = $2, updated_at = now() WHERE auth_uid = $1`,
      [uid, ativo]
    )
    return { ok: true }
  })

  // Excluir permanentemente
  app.delete('/usuarios/:uid', { preHandler: requireRole('ADMIN', 'DESENVOLVEDOR') }, async (request, reply) => {
    const { uid } = request.params as { uid: string }
    await supabaseAdmin.auth.admin.deleteUser(uid)
    await query(`DELETE FROM sigweb.usuarios WHERE auth_uid = $1`, [uid])
    reply.code(204)
  })
}
