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

console.log('Using URL:', url.replace(/:([^:@]+)@/, ':***@'));

const client = new Client({ connectionString: url });

async function run() {
  await client.connect();
  
  const res = await client.query(`SELECT id, nome FROM sigweb.camadas_vetoriais WHERE nome ILIKE '%bairro%' OR nome ILIKE '%tupar%'`);
  console.log('Found layers:', res.rows);
  
  for (const row of res.rows) {
    if (row.nome.toLowerCase().includes('bairro')) {
      console.log(`Deleting layer: ${row.nome} (id: ${row.id})`);
      await client.query('DELETE FROM sigweb.parcelas WHERE camada_id = $1', [row.id]);
      await client.query('DELETE FROM sigweb.camadas_vetoriais WHERE id = $1', [row.id]);
      console.log(`Deleted successfully: ${row.nome}`);
    }
  }

  await client.end();
}

run().catch(console.error);
