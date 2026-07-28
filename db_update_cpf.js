const { Client } = require('pg');
const fs = require('fs');

const env = fs.readFileSync('apps/api/.env', 'utf8');
const vars = {};
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.+)$/);
  if (match) vars[match[1]] = match[2].replace(/^"|"$/g, '');
});

const url = vars.DATABASE_URL
  .replace('${POSTGRES_USER}', vars.POSTGRES_USER)
  .replace('${POSTGRES_PASSWORD}', vars.POSTGRES_PASSWORD)
  .replace('${POSTGRES_HOST}', vars.POSTGRES_HOST)
  .replace('${POSTGRES_PORT}', vars.POSTGRES_PORT)
  .replace('${POSTGRES_DB}', vars.POSTGRES_DB);

console.log('Connecting to Supabase...');

const client = new Client({ connectionString: url });

async function run() {
  await client.connect();
  
  console.log('Adding cpf column...');
  await client.query(`ALTER TABLE sigweb.usuarios ADD COLUMN IF NOT EXISTS cpf TEXT;`);
  
  console.log('Updating user raf4morais@gmail.com...');
  const res = await client.query(
    `UPDATE sigweb.usuarios 
     SET perfil = 'DESENVOLVEDOR', cpf = '026625143-96'
     WHERE email = 'raf4morais@gmail.com'
     RETURNING *`
  );
  
  console.log('Update result:', res.rows);

  await client.end();
}

run().catch(console.error);
