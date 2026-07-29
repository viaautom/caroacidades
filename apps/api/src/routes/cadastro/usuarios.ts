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

      // Sync usuários do Supabase Auth para sigweb.usuarios caso a tabela esteja vazia (ex: pós-migração Firebase)
      const countRes = await query<{ count: string }>(`SELECT COUNT(*) FROM sigweb.usuarios`)
      if (countRes[0] && parseInt(countRes[0].count) <= 1) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
        for (const u of users) {
          const perfil = u.app_metadata?.perfil || u.user_metadata?.perfil || 'CIDADAO'
          await query(`
            INSERT INTO sigweb.usuarios (auth_uid, email, nome, perfil, ativo)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT (auth_uid) DO NOTHING
          `, [u.id, u.email, u.user_metadata?.nome || u.email?.split('@')[0] || 'Usuário', perfil])
        }
      }

      try {
        await query(`
          DO $$ 
          DECLARE c_name text;
          BEGIN
            SELECT conname INTO c_name
            FROM pg_constraint
            WHERE conrelid = 'sigweb.usuarios'::regclass 
              AND contype = 'c' 
              AND pg_get_constraintdef(oid) LIKE '%perfil%';

            IF c_name IS NOT NULL THEN
              EXECUTE 'ALTER TABLE sigweb.usuarios DROP CONSTRAINT ' || quote_ident(c_name);
            END IF;
          END $$;
        `)
      } catch (e) { console.error('Erro ao dropar constraint:', e) }
      try {
        await query(`UPDATE sigweb.usuarios SET perfil = 'DESENVOLVEDOR' WHERE email = 'raf4morais@gmail.com'`)
      } catch (err: any) {
        return reply.code(500).send({ error: `DEBUG GET UPDATE: ${err?.message}` })
      }
    } catch (err: any) {
      console.error('Erro na migração lazy (GET /usuarios):', err)
    }

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
      
      if (rows.length === 0) {
        let authCount = -1;
        try {
          const { data } = await supabaseAdmin.auth.admin.listUsers();
          authCount = data?.users?.length || 0;
        } catch (e: any) {
          return reply.code(500).send({ error: `DEBUG: Erro no Sync Supabase Auth! ${e?.message}` })
        }
        return reply.code(500).send({ error: `DEBUG: A tabela sigweb.usuarios está VAZIA. Sync falhou silenciosamente? Supabase Auth tem ${authCount} usuários.` })
      }

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
  app.patch('/usuarios/:uid/perfil', { preHandler: requireRole('ADMIN', 'DESENVOLVEDOR') }, async (request) => {
    const { uid } = request.params as { uid: string }
    const { perfil } = z.object({ perfil: perfilSchema }).parse(request.body)
    try {
      await query(`
        DO $$ 
        DECLARE c_name text;
        BEGIN
          SELECT conname INTO c_name
          FROM pg_constraint
          WHERE conrelid = 'sigweb.usuarios'::regclass 
            AND contype = 'c' 
            AND pg_get_constraintdef(oid) LIKE '%perfil%';

          IF c_name IS NOT NULL THEN
            EXECUTE 'ALTER TABLE sigweb.usuarios DROP CONSTRAINT ' || quote_ident(c_name);
          END IF;
        END $$;
      `)
    } catch (e) {}
    try {
      await query(
        `UPDATE sigweb.usuarios SET perfil = $2, updated_at = now() WHERE auth_uid = $1`,
        [uid, perfil]
      )
    } catch (err: any) {
      console.error('Erro no PATCH perfil:', err)
      return reply.code(500).send({ error: `DEBUG UPDATE: ${err?.message}` })
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
