import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import path from 'path'
import { parcelasRoutes } from './routes/cadastro/parcelas'
import { edificacoesRoutes } from './routes/cadastro/edificacoes'
import { bairrosRoutes } from './routes/cadastro/bairros'
import { quadrasRoutes } from './routes/cadastro/quadras'
import { loteamentosRoutes } from './routes/cadastro/loteamentos'
import { logradourosRoutes } from './routes/cadastro/logradouros'
import { pessoasRoutes } from './routes/cadastro/pessoas'
import { cartografiaRoutes } from './routes/cartografia/index'
import { MIGRATION_PROCESSOS_FIX, MIGRATION_FORMULARIOS_PROCESSO } from './routes/processos/index'
import { viabilidadeRoutes } from './routes/viabilidade/index'
import { iluminacaoRoutes, MIGRATION_ITENS_POSTE } from './routes/iluminacao/index'
import { arborizacaoRoutes, MIGRATION_ARVORES_SITUACAO } from './routes/arborizacao/index'
import { pgvRoutes, MIGRATION_PGV_DEMO } from './routes/pgv/index'
import { processosRoutes } from './routes/processos/index'
import { reurbRoutes, MIGRATION_REURB_BPMN } from './routes/reurb/index'
import { socialRoutes, MIGRATION_SOCIAL_V2 } from './routes/social/index'
import { socialCatalogosRoutes, MIGRATION_SOCIAL_CATALOGOS } from './routes/social/catalogos'
import { mobileRoutes, MIGRATION_MOBILE_CATEGORIAS, MIGRATION_CHAMADOS_HISTORICO } from './routes/mobile/index'
import { numeracaoRoutes } from './routes/numeracao/index'
import { patrimonioRoutes } from './routes/patrimonio/index'
import { cemiterioRoutes } from './routes/cemiterio/index'
import { imagens360Routes, MIGRATION_IMAGENS_360 } from './routes/imagens360/index'
import { camadasRoutes, MIGRATION_CAMADAS } from './routes/cadastro/camadas'
import { zonasRoutes } from './routes/cadastro/zonas'
import { notificacoesRoutes, MIGRATION_NOTIFICACOES } from './routes/notificacoes/index'
import { usuariosRoutes } from './routes/cadastro/usuarios'
import { permissoesRoutes, MIGRATION_PERMISSOES } from './routes/admin/permissoes'
import { sinterRoutes } from './routes/admin/sinter'
import { devRoutes } from './routes/admin/dev'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  },
})

async function bootstrap() {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  })

  await app.register(helmet, {
    contentSecurityPolicy: false,
  })

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  })

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  })

  // Health check (sem auth — usado pelo Cloud Run e Cloud Monitoring)
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Rotas da API
  const prefix = '/api'
  await app.register(parcelasRoutes,    { prefix })
  await app.register(edificacoesRoutes, { prefix })
  await app.register(bairrosRoutes,     { prefix })
  await app.register(quadrasRoutes,     { prefix })
  await app.register(loteamentosRoutes, { prefix })
  await app.register(logradourosRoutes, { prefix })
  await app.register(pessoasRoutes,     { prefix })
  await app.register(cartografiaRoutes, { prefix })
  await app.register(viabilidadeRoutes, { prefix })
  await app.register(iluminacaoRoutes,  { prefix })
  await app.register(arborizacaoRoutes, { prefix })
  await app.register(pgvRoutes,         { prefix })
  await app.register(processosRoutes,   { prefix })
  await app.register(reurbRoutes,       { prefix })
  await app.register(socialRoutes,      { prefix })
  await app.register(socialCatalogosRoutes, { prefix })
  await app.register(mobileRoutes,      { prefix })
  await app.register(numeracaoRoutes,   { prefix })
  await app.register(patrimonioRoutes,  { prefix })
  await app.register(cemiterioRoutes,   { prefix })
  await app.register(imagens360Routes,  { prefix })
  await app.register(camadasRoutes,     { prefix })
  await app.register(zonasRoutes,       { prefix })
  await app.register(notificacoesRoutes,{ prefix })
  await app.register(usuariosRoutes,    { prefix })
  await app.register(permissoesRoutes,  { prefix })
  await app.register(sinterRoutes,      { prefix })
  await app.register(devRoutes,         { prefix })

  // Auto-cadastro de cidadão (req 11): qualquer pessoa pode criar sua própria
  // conta com perfil CIDADAO — sem depender de um ADMIN para provisioná-la.
  // O perfil é fixado em CIDADAO via custom claim ANTES do primeiro login.
  app.post('/api/auto-cadastro', async (request, reply) => {
    const { z } = await import('zod')
    const { supabaseAdmin } = await import('./services/supabase.service')
    const { query: dbQuery } = await import('./db/pool')

    const body = z.object({
      email: z.string().email(),
      nome: z.string().min(2),
      celular: z.string().regex(/^\(\d{2}\) \d{4,5}-\d{4}$/, 'Telefone inválido'),
      senha: z.string().min(6),
    }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'Dados inválidos' })

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: body.data.email,
      password: body.data.senha,
      email_confirm: false,
      user_metadata: { nome: body.data.nome },
    })
    if (error || !data.user) {
      const mensagem = error?.code === 'email_exists'
        ? 'Este e-mail já está cadastrado'
        : 'Não foi possível criar a conta'
      return reply.code(400).send({ error: mensagem })
    }

    await dbQuery(
      `INSERT INTO sigweb.usuarios (firebase_uid, email, nome, celular, perfil, ativo)
       VALUES ($1, $2, $3, $4, 'CIDADAO', true)
       ON CONFLICT (firebase_uid) DO UPDATE
         SET email = EXCLUDED.email, nome = EXCLUDED.nome, celular = EXCLUDED.celular`,
      [data.user.id, body.data.email, body.data.nome, body.data.celular]
    )

    reply.code(201)
    return { ok: true }
  })

  // Bootstrap admin: qualquer usuário autenticado pode virar ADMIN
  // se não existir nenhum ADMIN ainda no sistema (setup inicial).
  app.post('/api/admin/bootstrap', async (request, reply) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'Token não fornecido' })
    const { verifySupabaseToken } = await import('./services/supabase.service')
    const { query: dbQuery } = await import('./db/pool')

    let decoded: ReturnType<typeof verifySupabaseToken>
    try { decoded = verifySupabaseToken(authHeader.slice(7)) }
    catch { return reply.code(401).send({ error: 'Token inválido' }) }

    const [{ count }] = await dbQuery<{ count: string }>(
      `SELECT COUNT(*) FROM sigweb.usuarios WHERE perfil = 'ADMIN'`
    )
    if (Number(count) > 0) {
      return reply.code(403).send({ error: 'Já existe um administrador. Peça a ele para gerenciar usuários.' })
    }

    await dbQuery(
      `INSERT INTO sigweb.usuarios (firebase_uid, email, nome, perfil)
       VALUES ($1, $2, $3, 'ADMIN')
       ON CONFLICT (firebase_uid) DO UPDATE SET perfil = 'ADMIN'`,
      [decoded.uid, decoded.email, decoded.email]
    )
    return { ok: true, mensagem: 'Você agora é ADMIN. Faça logout e login novamente.' }
  })

  // Estatísticas do banco de dados (somente ADMIN)
  app.get('/api/admin/db-stats', async (request, reply) => {
    const { verifySupabaseToken } = await import('./services/supabase.service')
    const { query: dbQuery } = await import('./db/pool')

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'Token não fornecido' })
    try {
      const decoded = verifySupabaseToken(authHeader.slice(7))
      if (decoded.perfil !== 'ADMIN') return reply.code(403).send({ error: 'Requer perfil ADMIN' })
    } catch { return reply.code(401).send({ error: 'Token inválido' }) }

    const tabelasRaw = await dbQuery<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'sigweb' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )

    const tabelas = await Promise.all(
      tabelasRaw.map(async ({ table_name }) => {
        const [row] = await dbQuery<{ count: string }>(
          `SELECT COUNT(*) AS count FROM sigweb.${table_name}`
        )
        return { tabela: table_name, registros: Number(row.count) }
      })
    )

    const [{ tamanho_banco, tamanho_banco_bytes }] = await dbQuery<{ tamanho_banco: string; tamanho_banco_bytes: number }>(
      `SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho_banco,
              pg_database_size(current_database()) AS tamanho_banco_bytes`
    )

    return { tabelas, tamanho_banco, tamanho_banco_bytes }
  })

  // Servir frontend (SPA) em produção — arquivos copiados pelo Dockerfile
  const fs = require('fs') as typeof import('fs')
  const publicDir = path.join(__dirname, 'public')
  if (fs.existsSync(publicDir)) {
    await app.register(staticFiles, { root: publicDir, wildcard: false })
    // SPA fallback — rotas não-API retornam index.html para o React Router
    const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf-8')
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api') || request.url === '/health') {
        return reply.code(404).send({ error: 'Not found' })
      }
      return reply.type('text/html; charset=utf-8').send(indexHtml)
    })
  }

  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`SIGWEB API rodando na porta ${port}`)

  // Migrações executadas após o servidor subir (pool já aquecido)
  const { query: dbQuery } = await import('./db/pool')
  dbQuery(MIGRATION_IMAGENS_360).catch(err =>
    app.log.warn({ err }, 'Migration imagens_360 skipped')
  )
  dbQuery(MIGRATION_CAMADAS).catch(err =>
    app.log.warn({ err }, 'Migration camadas_vetoriais skipped')
  )
  dbQuery(MIGRATION_PROCESSOS_FIX).catch(err =>
    app.log.warn({ err }, 'Migration processos_fix skipped')
  )
  dbQuery(MIGRATION_FORMULARIOS_PROCESSO).catch(err =>
    app.log.warn({ err }, 'Migration formularios_processo skipped')
  )
  dbQuery(MIGRATION_PERMISSOES).catch(err =>
    app.log.warn({ err }, 'Migration permissoes_modulo skipped')
  )
  dbQuery(MIGRATION_ITENS_POSTE).catch(err =>
    app.log.warn({ err }, 'Migration itens_poste skipped')
  )
  dbQuery(MIGRATION_REURB_BPMN).catch(err =>
    app.log.warn({ err }, 'Migration reurb_bpmn skipped')
  )
  dbQuery(MIGRATION_NOTIFICACOES).catch(err =>
    app.log.warn({ err }, 'Migration notificacoes skipped')
  )
  dbQuery(MIGRATION_MOBILE_CATEGORIAS).catch(err =>
    app.log.warn({ err }, 'Migration mobile_categorias skipped')
  )
  dbQuery(MIGRATION_ARVORES_SITUACAO).catch(err =>
    app.log.warn({ err }, 'Migration arvores_situacao skipped')
  )
  dbQuery(MIGRATION_CHAMADOS_HISTORICO).catch(err =>
    app.log.warn({ err }, 'Migration chamados_historico skipped')
  )
  dbQuery(MIGRATION_SOCIAL_V2).catch(err =>
    app.log.warn({ err }, 'Migration social_v2 skipped')
  )
  dbQuery(MIGRATION_SOCIAL_CATALOGOS).catch(err =>
    app.log.warn({ err }, 'Migration social_catalogos skipped')
  )
  dbQuery(MIGRATION_PGV_DEMO).catch(err =>
    app.log.warn({ err }, 'Migration pgv_demo skipped')
  )
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
