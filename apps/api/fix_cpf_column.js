require('dotenv').config()
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function run() {
  try {
    console.log('Adding cpf column...')
    await pool.query('ALTER TABLE sigweb.usuarios ADD COLUMN IF NOT EXISTS cpf TEXT;')
    console.log('Done.')
  } catch(e) {
    console.error(e)
  } finally {
    pool.end()
  }
}
run()
