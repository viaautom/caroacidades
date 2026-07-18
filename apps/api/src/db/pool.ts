import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err)
})

export default pool

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(sql, params)
  return result.rows as T[]
}

export async function queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
  const result = await pool.query(sql, params)
  return result.rows[0] ?? null
}
