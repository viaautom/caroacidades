const { Client } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('apps/api/.env', 'utf8');
const url = env.match(/DATABASE_URL=(.*)/)[1].trim();
const client = new Client({ connectionString: url, ssl: url.includes('supabase') ? { rejectUnauthorized: false } : false });
client.connect().then(async () => {
  const res = await client.query(`
    SELECT p.codigo, ST_AsText(p.geometry) as geom, c.nome
    FROM sigweb.parcelas p
    JOIN sigweb.camadas_vetoriais c ON p.camada_id = c.id
    ORDER BY p.id DESC
    LIMIT 1
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  client.end();
}).catch(console.error);
