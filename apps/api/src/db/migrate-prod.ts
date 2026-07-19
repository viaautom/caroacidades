/**
 * Aplicador de migrações idempotente para produção.
 * Detecta quais tabelas já existem e marca as migrações correspondentes como aplicadas.
 * Uso: DATABASE_URL=postgresql://... tsx src/db/migrate-prod.ts
 */
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations')

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10_000,
})

// Mapeamento de quais tabelas indicam que a migration foi aplicada
const MIGRATION_MARKERS: Record<string, string> = {
  'V001__extensions_and_schemas': `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'sigweb'`,
  'V002__usuarios': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='usuarios'`,
  'V003__cadastro_imobiliario': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='parcelas'`,
  'V004__iluminacao_arborizacao': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='postes'`,
  'V005__viabilidade_plano_diretor': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='zonas_uso'`,
  'V006__pgv': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='setores_pgv'`,
  'V007__processos_digitais': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='processos'`,
  'V008__cadastro_social': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='familias'`,
  'V009__seeds_dados_base': `SELECT 1 FROM sigweb.tipos_defeito LIMIT 1`,
  'V010__numeracao_predial': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='numeracao_predial'`,
  'V011__reurb_bpmn': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='fluxos_bpmn'`,
  'V012__patrimonio_cemiterio': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='patrimonios'`,
  'V013__sinter': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='sinter_lotes'`,
  'V014__auditoria': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='historico_cartografico'`,
  'inline_imagens360': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='imagens_360'`,
  'inline_camadas_vetoriais': `SELECT 1 FROM information_schema.tables WHERE table_schema='sigweb' AND table_name='camadas_vetoriais'`,
}

async function run() {
  await client.connect()
  console.log('✓ Conectado ao banco de dados')

  // Criar tabela de controle
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Detectar migrações já aplicadas pelo conteúdo do banco
  console.log('\n📋 Verificando estado atual do banco...')
  for (const [version, checkSql] of Object.entries(MIGRATION_MARKERS)) {
    try {
      const { rows } = await client.query(checkSql)
      if (rows.length > 0) {
        await client.query(
          `INSERT INTO public.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
          [version]
        )
        console.log(`  ✓ ${version} (já existia)`)
      }
    } catch {
      // Tabela/schema referenciado pelo marcador ainda não existe — banco novo, nada a detectar.
    }
  }

  // Aplicar migrações de arquivo que faltam
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  console.log('\n🚀 Aplicando migrações pendentes...')
  let pendentes = 0
  for (const file of files) {
    const version = file.replace('.sql', '')
    const { rows } = await client.query(
      'SELECT 1 FROM public.schema_migrations WHERE version = $1', [version]
    )
    if (rows.length > 0) { console.log(`  ↳ ${version} já aplicada`); continue }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    console.log(`  → Aplicando ${version}...`)
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [version])
      await client.query('COMMIT')
      console.log(`  ✓ ${version} OK`)
      pendentes++
    } catch (err: any) {
      await client.query('ROLLBACK')
      console.error(`  ✗ ${version} FALHOU: ${err.message}`)
      throw err
    }
  }

  // Aplicar migrações inline que faltam
  const extras = [
    {
      version: 'inline_imagens360',
      sql: `
        CREATE TABLE IF NOT EXISTS sigweb.imagens_360 (
          id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          titulo       TEXT NOT NULL,
          url_panorama TEXT NOT NULL,
          lat          FLOAT8 NOT NULL,
          lng          FLOAT8 NOT NULL,
          heading      FLOAT4 NOT NULL DEFAULT 0,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      version: 'inline_camadas_vetoriais',
      sql: `
        CREATE TABLE IF NOT EXISTS sigweb.camadas_vetoriais (
          id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
          nome       TEXT        NOT NULL,
          descricao  TEXT,
          cor        TEXT        NOT NULL DEFAULT '#2563eb',
          colunas    JSONB       NOT NULL DEFAULT '[]',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE sigweb.parcelas
          ADD COLUMN IF NOT EXISTS camada_id UUID REFERENCES sigweb.camadas_vetoriais(id),
          ADD COLUMN IF NOT EXISTS atributos JSONB NOT NULL DEFAULT '{}';
      `,
    },
  ]

  for (const { version, sql } of extras) {
    const { rows } = await client.query(
      'SELECT 1 FROM public.schema_migrations WHERE version = $1', [version]
    )
    if (rows.length > 0) { console.log(`  ↳ ${version} já aplicada`); continue }
    console.log(`  → Aplicando ${version}...`)
    try {
      await client.query(sql)
      await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [version])
      console.log(`  ✓ ${version} OK`)
      pendentes++
    } catch (err: any) {
      console.warn(`  ⚠ ${version}: ${err.message}`)
    }
  }

  // Seed dos bairros se a tabela estiver vazia
  const { rows: bairrosExistentes } = await client.query('SELECT COUNT(*) FROM sigweb.bairros')
  if (Number(bairrosExistentes[0].count) === 0) {
    console.log('\n🗺  Sem bairros — verificando seed...')
    const seedPath = path.resolve(__dirname, '../../bairros_tupariceta.geojson')
    if (fs.existsSync(seedPath)) {
      const geojson = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
      let inserted = 0
      for (const feat of geojson.features) {
        const nome = feat.properties.NM_BAIRRO
        const codigo = feat.properties.CD_BAIRRO
        try {
          await client.query(
            `INSERT INTO sigweb.bairros (nome, codigo, geometry)
             VALUES ($1, $2, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 31982))
             ON CONFLICT (codigo) DO NOTHING`,
            [nome, codigo, JSON.stringify(feat.geometry)]
          )
          inserted++
        } catch (e: any) {
          console.warn(`  ⚠ Bairro ${nome}: ${e.message}`)
        }
      }
      console.log(`  ✓ ${inserted} bairros inseridos`)
    }
  } else {
    console.log(`\n🗺  Bairros já existem (${bairrosExistentes[0].count})`)
  }

  console.log(`\n✅ Concluído. ${pendentes} migrações novas aplicadas.`)
  await client.end()
}

run().catch(async err => {
  console.error('\nERRO FATAL:', err.message)
  await client.end().catch(() => {})
  process.exit(1)
})
