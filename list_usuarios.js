require('dotenv').config({ path: 'apps/api/.env' })
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function run() {
  try {
    const res = await pool.query('SELECT nome, email, perfil, cpf FROM sigweb.usuarios ORDER BY nome')
    console.table(res.rows)
  } catch(e) {
    console.error(e)
  } finally {
    pool.end()
  }
}
run()
