const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: 'apps/api/.env' });

const client = new Client({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'sigweb',
  ssl: false
});

client.connect().then(async () => {
  const res = await client.query(`
    SELECT cv.nome, ST_Extent(ST_Transform(p.geometry, 4674))::text AS bounds_4674, ST_Extent(p.geometry)::text as bounds_raw
    FROM sigweb.camadas_vetoriais cv
    JOIN sigweb.parcelas p ON p.camada_id = cv.id
    GROUP BY cv.nome
    ORDER BY cv.nome
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  client.end();
}).catch(console.error);
