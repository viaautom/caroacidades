import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'
import { getSignedUrl, deleteFile, uploadFile, downloadFile } from '../../services/supabase.service'

// Garante sequences e converte colunas firebase_uid (TEXT) — idempotente
export const MIGRATION_PROCESSOS_FIX = `
  CREATE SEQUENCE IF NOT EXISTS sigweb.seq_aprovacao_projeto START 1;
  CREATE SEQUENCE IF NOT EXISTS sigweb.seq_habite_se         START 1;
  CREATE SEQUENCE IF NOT EXISTS sigweb.seq_reurb             START 1;

  ALTER TABLE sigweb.processos
    DROP CONSTRAINT IF EXISTS processos_created_by_fkey;
  ALTER TABLE sigweb.processos
    ALTER COLUMN created_by TYPE TEXT USING created_by::text;

  ALTER TABLE sigweb.etapas_processo
    DROP CONSTRAINT IF EXISTS etapas_processo_analista_id_fkey;
  ALTER TABLE sigweb.etapas_processo
    ALTER COLUMN analista_id TYPE TEXT USING analista_id::text;
`

// Campos configuráveis (com obrigatoriedade) do formulário de abertura por
// tipo de processo (Aprovação de Projeto / Habite-se) — req 109/120
export const MIGRATION_FORMULARIOS_PROCESSO = `
  CREATE TABLE IF NOT EXISTS sigweb.formularios_processo (
    tipo_processo VARCHAR(30) PRIMARY KEY,
    campos        JSONB NOT NULL DEFAULT '[]',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`

const processoSchema = z.object({
  tipo: z.enum(['aprovacao_projeto', 'habite_se', 'reurb']),
  parcelaId: z.string().uuid().optional(),
  requerenteId: z.string().uuid().optional(),
  metadados: z.record(z.unknown()).optional(),
})

const anexoSchema = z.object({
  nome: z.string().min(1),
  storagePath: z.string().min(1),
  url: z.string().min(1),
  tipoMime: z.string().optional(),
  tamanhoBytes: z.number().int().nonnegative().optional(),
})

type CampoFormulario = { nome: string; rotulo: string; tipo: string; obrigatorio?: boolean }

const campoFormularioSchema = z.object({
  nome: z.string().min(1),
  rotulo: z.string().min(1),
  tipo: z.enum(['texto', 'checkbox', 'mapa', 'cpf_telefone']),
  obrigatorio: z.boolean().optional(),
})

const formularioProcessoSchema = z.object({
  tipo: z.enum(['aprovacao_projeto', 'habite_se']),
  campos: z.array(campoFormularioSchema),
})

function gerarCodigo(tipo: string, seq: number): string {
  const prefix = { aprovacao_projeto: 'AP', habite_se: 'HS', reurb: 'RU' }[tipo] ?? 'PR'
  const ano = new Date().getFullYear()
  return `${prefix}-${ano}-${String(seq).padStart(5, '0')}`
}

// Quebra um texto em linhas de até `maxChars` caracteres, sem cortar palavras
function quebrarLinhas(texto: string, maxChars: number): string[] {
  const palavras = texto.split(/\s+/)
  const linhas: string[] = []
  let atual = ''
  for (const palavra of palavras) {
    if ((atual + ' ' + palavra).trim().length > maxChars) {
      if (atual) linhas.push(atual)
      atual = palavra
    } else {
      atual = (atual + ' ' + palavra).trim()
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

export async function processosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/processos', async (request) => {
    const { tipo, situacao, campo, valor, busca, page = '1', limit = '50' } = request.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    let i = 1

    if (tipo)     { conditions.push(`pr.tipo = $${i++}`);     params.push(tipo) }
    if (situacao) { conditions.push(`pr.situacao = $${i++}`); params.push(situacao) }
    // req 115/126: analista filtrar processos por valor de campo configurável do formulário
    if (campo && valor) {
      conditions.push(`pr.metadados ->> $${i++} = $${i++}`)
      params.push(campo, valor)
    }
    // req 114/125/203: consultar por código, requerente, telefone ou email
    if (busca) {
      conditions.push(`(pr.codigo ILIKE $${i} OR pe.nome ILIKE $${i} OR pe.telefone ILIKE $${i} OR pe.email ILIKE $${i})`)
      params.push(`%${busca}%`)
      i++
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (Number(page) - 1) * Number(limit)
    params.push(Number(limit), offset)

    const rows = await query(
      `SELECT pr.*, pe.nome AS requerente_nome, u.nome AS analista_nome
       FROM sigweb.processos pr
       LEFT JOIN sigweb.pessoas pe ON pe.id = pr.requerente_id
       LEFT JOIN sigweb.usuarios u ON u.id = pr.analista_id
       ${where}
       ORDER BY pr.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      params
    )
    return { data: rows }
  })

  app.get('/processos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const processo = await queryOne<{ tipo: string; [key: string]: unknown }>(
      `SELECT pr.*, pe.nome AS requerente_nome, u.nome AS analista_nome,
              p.codigo AS parcela_codigo
       FROM sigweb.processos pr
       LEFT JOIN sigweb.pessoas pe ON pe.id = pr.requerente_id
       LEFT JOIN sigweb.usuarios u ON u.id = pr.analista_id
       LEFT JOIN sigweb.parcelas p ON p.id = pr.parcela_id
       WHERE pr.id = $1`,
      [id]
    )
    if (!processo) return reply.code(404).send({ error: 'Processo não encontrado' })

    // Inclui o formulário (req 194) configurado na fase de cada etapa, para que o
    // requerente possa visualizar/corrigir os campos da etapa reprovada (req 204).
    // Para Aprovação de Projeto/Habite-se (etapa única, sem fase BPMN), usa o
    // formulário de abertura configurado para o tipo de processo (req 107/118).
    const etapas = await query(
      `SELECT e.*, COALESCE(f.formulario, fp.campos) AS formulario
       FROM sigweb.etapas_processo e
       LEFT JOIN sigweb.fases_bpmn f ON f.id = e.fase_id
       LEFT JOIN sigweb.formularios_processo fp ON fp.tipo_processo = $2 AND e.fase_id IS NULL
       WHERE e.processo_id = $1 ORDER BY e.ordem`,
      [id, processo.tipo]
    )
    const anexos = await query(`SELECT * FROM sigweb.anexos_processo WHERE processo_id = $1 ORDER BY created_at`, [id])

    return { ...processo, etapas, anexos }
  })

  // Campos configuráveis (com obrigatoriedade) do formulário de abertura — req 109/120
  app.get('/processos/formulario', async (request) => {
    const { tipo } = request.query as { tipo?: string }
    if (!tipo) return { campos: [] }
    const row = await queryOne<{ campos: CampoFormulario[] }>(
      `SELECT campos FROM sigweb.formularios_processo WHERE tipo_processo = $1`,
      [tipo]
    )
    return { campos: row?.campos ?? [] }
  })

  // Configura os campos (e obrigatoriedade) do formulário de abertura por tipo — req 109/120
  app.put(
    '/processos/formulario',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request) => {
      const { tipo, campos } = formularioProcessoSchema.parse(request.body)
      await query(
        `INSERT INTO sigweb.formularios_processo (tipo_processo, campos, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (tipo_processo) DO UPDATE SET campos = $2, updated_at = now()`,
        [tipo, JSON.stringify(campos)]
      )
      return { ok: true }
    }
  )

  // Solicitante abre processo (rascunho)
  app.post('/processos', async (request, reply) => {
    const body = processoSchema.parse(request.body)

    // req 109/120: valida campos obrigatórios configurados para o tipo de processo
    if (body.tipo === 'aprovacao_projeto' || body.tipo === 'habite_se') {
      const formulario = await queryOne<{ campos: CampoFormulario[] }>(
        `SELECT campos FROM sigweb.formularios_processo WHERE tipo_processo = $1`,
        [body.tipo]
      )
      const metadados = body.metadados ?? {}
      for (const c of formulario?.campos ?? []) {
        if (c.obrigatorio) {
          const v = metadados[c.nome]
          if (v === undefined || v === null || v === '') {
            return reply.code(400).send({ error: `Campo obrigatório não preenchido: ${c.rotulo}` })
          }
        }
      }
    }

    const seqRow = await queryOne<{ nextval: string }>(
      `SELECT nextval('sigweb.seq_${body.tipo}')::text AS nextval`
    )
    const codigo = gerarCodigo(body.tipo, Number(seqRow!.nextval))

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.processos (codigo, tipo, situacao, requerente_id, parcela_id, metadados, created_by)
       VALUES ($1,$2,'rascunho',$3,$4,$5,$6) RETURNING id`,
      [
        codigo, body.tipo, body.requerenteId ?? null,
        body.parcelaId ?? null, JSON.stringify(body.metadados ?? {}),
        request.user.uid,
      ]
    )

    // REURB: gera as etapas do processo a partir das fases do fluxo BPMN ativo,
    // vinculando cada etapa à sua fase (req 204 — formulários por etapa)
    if (body.tipo === 'reurb') {
      const fluxo = await queryOne<{ id: string }>(
        `SELECT id FROM sigweb.fluxos_bpmn WHERE ativo = true ORDER BY updated_at DESC LIMIT 1`
      )
      if (fluxo) {
        const fases = await query<{ id: string; nome: string; ordem: number }>(
          `SELECT id, nome, ordem FROM sigweb.fases_bpmn WHERE fluxo_id = $1 ORDER BY ordem`,
          [fluxo.id]
        )
        for (const fase of fases) {
          await query(
            `INSERT INTO sigweb.etapas_processo (processo_id, nome, ordem, fase_id) VALUES ($1,$2,$3,$4)`,
            [row.id, fase.nome, fase.ordem, fase.id]
          )
        }
        if (fases[0]) {
          await query(`UPDATE sigweb.processos SET fase_atual_id = $2 WHERE id = $1`, [row.id, fases[0].id])
        }
      }
    } else if (body.tipo === 'aprovacao_projeto' || body.tipo === 'habite_se') {
      // Aprovação de Projeto / Habite-se: etapa única de análise (req 107/118 — parecer)
      await query(
        `INSERT INTO sigweb.etapas_processo (processo_id, nome, ordem) VALUES ($1, 'Análise', 1)`,
        [row.id]
      )
    }

    reply.code(201)
    return { id: row.id, codigo }
  })

  // Solicitante envia processo (rascunho → aberto)
  app.patch('/processos/:id/enviar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const processo = await queryOne<{ situacao: string; created_by: string }>(
      `SELECT situacao, created_by FROM sigweb.processos WHERE id = $1`, [id]
    )
    if (!processo) return reply.code(404).send({ error: 'Processo não encontrado' })
    if (processo.situacao !== 'rascunho') return reply.code(400).send({ error: 'Apenas rascunhos podem ser enviados' })

    await query(`UPDATE sigweb.processos SET situacao = 'aberto' WHERE id = $1`, [id])
    return { ok: true }
  })

  // Analista atribui processo
  app.patch(
    '/processos/:id/atribuir',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request) => {
      const { id } = request.params as { id: string }
      const { analistaId } = request.body as { analistaId: string }
      await query(
        `UPDATE sigweb.processos SET analista_id = $2, situacao = 'em_analise' WHERE id = $1`,
        [id, analistaId]
      )
      return { ok: true }
    }
  )

  // Lista de usuários habilitados a atuar como analista (para encaminhamento).
  // req 196: se o processo informado tiver uma fase BPMN atual com `perfis`
  // restritos, a lista é filtrada para quem pode atuar naquela fase.
  app.get(
    '/processos/analistas',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request) => {
      const { processoId } = request.query as { processoId?: string }

      let perfisFase: string[] | null = null
      if (processoId) {
        const fase = await queryOne<{ perfis: string[] }>(
          `SELECT f.perfis FROM sigweb.processos pr
           JOIN sigweb.fases_bpmn f ON f.id = pr.fase_atual_id
           WHERE pr.id = $1`,
          [processoId]
        )
        if (fase?.perfis?.length) perfisFase = fase.perfis
      }

      if (perfisFase) {
        return query<{ id: string; nome: string; email: string; perfil: string }>(
          `SELECT id, nome, email, perfil FROM sigweb.usuarios
           WHERE perfil = ANY($1) AND perfil IN ('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') AND ativo = true
           ORDER BY nome`,
          [perfisFase]
        )
      }

      return query<{ id: string; nome: string; email: string; perfil: string }>(
        `SELECT id, nome, email, perfil FROM sigweb.usuarios
         WHERE perfil IN ('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') AND ativo = true
         ORDER BY nome`
      )
    }
  )

  // Encaminha processo para outro analista
  app.patch(
    '/processos/:id/encaminhar',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { analistaId } = request.body as { analistaId: string }
      const processo = await queryOne<{ situacao: string }>(
        `SELECT situacao FROM sigweb.processos WHERE id = $1`, [id]
      )
      if (!processo) return reply.code(404).send({ error: 'Processo não encontrado' })
      if (!['aberto', 'em_analise'].includes(processo.situacao)) {
        return reply.code(400).send({ error: 'Processo precisa estar aberto ou em análise para ser encaminhado' })
      }
      await query(
        `UPDATE sigweb.processos SET analista_id = $2, situacao = 'em_analise' WHERE id = $1`,
        [id, analistaId]
      )
      return { ok: true }
    }
  )

  // Retira o analista do processo (volta para a fila de abertos)
  app.patch(
    '/processos/:id/retirar-analista',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const processo = await queryOne<{ situacao: string; analista_id: string | null }>(
        `SELECT situacao, analista_id FROM sigweb.processos WHERE id = $1`, [id]
      )
      if (!processo) return reply.code(404).send({ error: 'Processo não encontrado' })
      if (!processo.analista_id) return reply.code(400).send({ error: 'Processo não possui analista atribuído' })
      await query(
        `UPDATE sigweb.processos SET analista_id = NULL, situacao = 'aberto' WHERE id = $1`,
        [id]
      )
      return { ok: true }
    }
  )

  // Solicitante corrige e reenvia processo reprovado
  app.patch('/processos/:id/reenviar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { metadados } = (request.body ?? {}) as { metadados?: Record<string, unknown> }
    const processo = await queryOne<{ situacao: string; created_by: string; analista_id: string | null; metadados: Record<string, unknown> }>(
      `SELECT situacao, created_by, analista_id, metadados FROM sigweb.processos WHERE id = $1`, [id]
    )
    if (!processo) return reply.code(404).send({ error: 'Processo não encontrado' })
    if (processo.created_by !== request.user.uid) {
      return reply.code(403).send({ error: 'Apenas o solicitante pode corrigir e reenviar o processo' })
    }
    if (processo.situacao !== 'reprovado') {
      return reply.code(400).send({ error: 'Apenas processos reprovados podem ser corrigidos e reenviados' })
    }

    await query(
      `UPDATE sigweb.etapas_processo
       SET situacao = 'pendente', parecer = NULL, analista_id = NULL, concluida_em = NULL
       WHERE processo_id = $1 AND situacao = 'reprovado'`,
      [id]
    )

    const novaSituacao = processo.analista_id ? 'em_analise' : 'aberto'
    if (metadados) {
      // req 204: o solicitante só pode alterar campos dos formulários de etapas
      // que NÃO estão aprovadas — campos de etapas já aprovadas são preservados
      const etapas = await query<{ situacao: string; formulario: { nome: string }[] | null }>(
        `SELECT e.situacao, f.formulario
         FROM sigweb.etapas_processo e
         LEFT JOIN sigweb.fases_bpmn f ON f.id = e.fase_id
         WHERE e.processo_id = $1`,
        [id]
      )
      const camposBloqueados = new Set<string>()
      for (const etapa of etapas) {
        if (etapa.situacao === 'aprovado' && Array.isArray(etapa.formulario)) {
          for (const campo of etapa.formulario) camposBloqueados.add(campo.nome)
        }
      }
      const novosMetadados = { ...(processo.metadados ?? {}) }
      for (const [chave, valor] of Object.entries(metadados)) {
        if (!camposBloqueados.has(chave)) novosMetadados[chave] = valor
      }
      await query(
        `UPDATE sigweb.processos SET situacao = $2, metadados = $3 WHERE id = $1`,
        [id, novaSituacao, JSON.stringify(novosMetadados)]
      )
    } else {
      await query(`UPDATE sigweb.processos SET situacao = $2 WHERE id = $1`, [id, novaSituacao])
    }
    return { ok: true }
  })

  // Analista emite parecer em etapa
  app.post(
    '/processos/:processoId/etapas/:etapaId/parecer',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request) => {
      const { processoId, etapaId } = request.params as { processoId: string; etapaId: string }
      const { situacao, parecer } = request.body as { situacao: 'aprovado' | 'reprovado'; parecer: string }

      // $1=etapaId $2=situacao $3=parecer $4=analista(firebase_uid) $5=processoId
      await query(
        `UPDATE sigweb.etapas_processo
         SET situacao = $2, parecer = $3, analista_id = $4, concluida_em = now()
         WHERE id = $1 AND processo_id = $5`,
        [etapaId, situacao, parecer, request.user.uid, processoId]
      )

      // req 130: fase marcada como "encerramento" finaliza o processo
      // imediatamente com o parecer desta etapa, sem aguardar as demais
      const fase = await queryOne<{ encerra_processo: boolean }>(
        `SELECT f.encerra_processo
         FROM sigweb.etapas_processo e
         LEFT JOIN sigweb.fases_bpmn f ON f.id = e.fase_id
         WHERE e.id = $1`,
        [etapaId]
      )
      if (fase?.encerra_processo) {
        await query(`UPDATE sigweb.processos SET situacao = $2 WHERE id = $1`, [processoId, situacao])
        return { ok: true }
      }

      const pendentes = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM sigweb.etapas_processo
         WHERE processo_id = $1 AND situacao = 'pendente'`,
        [processoId]
      )
      if (Number(pendentes[0].count) === 0) {
        const reprovadas = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM sigweb.etapas_processo
           WHERE processo_id = $1 AND situacao = 'reprovado'`,
          [processoId]
        )
        const novaSituacao = Number(reprovadas[0].count) > 0 ? 'reprovado' : 'aprovado'
        await query(`UPDATE sigweb.processos SET situacao = $2 WHERE id = $1`, [processoId, novaSituacao])
      }

      return { ok: true }
    }
  )

  // Dashboard de processos por situação, em tempo real (req 208)
  app.get(
    '/processos/dashboard',
    { preHandler: requireRole('ADMIN', 'SETOR_PROJETOS', 'FISCAL_TRIBUTARIO') },
    async (request) => {
      const { tipo } = request.query as { tipo?: string }
      const where = tipo ? `WHERE tipo = $1` : ''
      const params = tipo ? [tipo] : []

      const porSituacao = await query<{ situacao: string; total: string }>(
        `SELECT situacao, COUNT(*)::text AS total FROM sigweb.processos ${where} GROUP BY situacao`,
        params
      )
      const [{ total }] = await query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM sigweb.processos ${where}`,
        params
      )
      const [{ media_dias }] = await query<{ media_dias: string | null }>(
        `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)::numeric, 1)::text AS media_dias
         FROM sigweb.processos ${where ? where + ' AND' : 'WHERE'} situacao IN ('aprovado','reprovado')`,
        params
      )

      return {
        porSituacao: porSituacao.map(r => ({ situacao: r.situacao, total: Number(r.total) })),
        total: Number(total),
        tempoMedioDiasConclusao: media_dias ? Number(media_dias) : null,
      }
    }
  )

  // Anexa um arquivo (já enviado ao Firebase Storage pelo cliente) ao processo
  app.post('/processos/:id/anexos', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = anexoSchema.parse(request.body)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.anexos_processo (processo_id, nome, tipo_mime, tamanho_bytes, storage_path, url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [id, body.nome, body.tipoMime ?? null, body.tamanhoBytes ?? null, body.storagePath, body.url, request.user.uid]
    )
    reply.code(201)
    return { id: row.id }
  })

  // Remove um anexo do processo (e o arquivo correspondente no Storage)
  app.delete('/processos/:processoId/anexos/:anexoId', async (request, reply) => {
    const { processoId, anexoId } = request.params as { processoId: string; anexoId: string }
    const anexo = await queryOne<{ storage_path: string }>(
      `SELECT storage_path FROM sigweb.anexos_processo WHERE id = $1 AND processo_id = $2`,
      [anexoId, processoId]
    )
    if (!anexo) return reply.code(404).send({ error: 'Anexo não encontrado' })
    await deleteFile(anexo.storage_path)
    await query(`DELETE FROM sigweb.anexos_processo WHERE id = $1`, [anexoId])
    reply.code(204)
  })

  // Insere uma anotação em um anexo PDF, gerando uma CÓPIA (não sobrescreve o original) — req 206
  app.post('/processos/:processoId/anexos/:anexoId/anotar', async (request, reply) => {
    const { processoId, anexoId } = request.params as { processoId: string; anexoId: string }
    const { texto } = z.object({ texto: z.string().min(1) }).parse(request.body)

    const anexo = await queryOne<{ nome: string; storage_path: string; tipo_mime: string | null }>(
      `SELECT nome, storage_path, tipo_mime FROM sigweb.anexos_processo WHERE id = $1 AND processo_id = $2`,
      [anexoId, processoId]
    )
    if (!anexo) return reply.code(404).send({ error: 'Anexo não encontrado' })
    if (anexo.tipo_mime !== 'application/pdf' && !anexo.nome.toLowerCase().endsWith('.pdf')) {
      return reply.code(400).send({ error: 'Anotações só podem ser adicionadas em arquivos PDF' })
    }

    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

    const bytes = await downloadFile(anexo.storage_path)
    const pdfDoc = await PDFDocument.load(bytes)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    const pagina = pdfDoc.addPage()
    const { height } = pagina.getSize()
    const linhas = [
      'Anotação',
      `Adicionada em ${new Date().toLocaleString('pt-BR')}`,
      '',
      ...quebrarLinhas(texto, 90),
    ]
    linhas.forEach((linha, i) => {
      pagina.drawText(linha, { x: 50, y: height - 60 - i * 16, size: 11, font, color: rgb(0, 0, 0) })
    })

    const novosBytes = await pdfDoc.save()
    const novoNome = `Anotado - ${anexo.nome}`
    const novoPath = `processos/${processoId}/anexos/${Date.now()}_anotado_${anexo.nome.replace(/\s+/g, '_')}`
    await uploadFile(novoPath, Buffer.from(novosBytes), 'application/pdf')
    const url = await getSignedUrl(novoPath, 10 * 365 * 24 * 60 * 60)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.anexos_processo (processo_id, nome, tipo_mime, tamanho_bytes, storage_path, url, created_by, anexo_original_id)
       VALUES ($1,$2,'application/pdf',$3,$4,$5,$6,$7) RETURNING id`,
      [processoId, novoNome, novosBytes.byteLength, novoPath, url, request.user.uid, anexoId]
    )
    reply.code(201)
    return { id: row.id, nome: novoNome, url }
  })
}
