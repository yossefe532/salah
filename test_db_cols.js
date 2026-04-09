import pkg from 'pg';
const { Client } = pkg;

const connectionString = "postgresql://postgres.cwftlzaibboszcrukhig:P@ssw0rd123!@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";

async function test() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='seats'");
    console.log(res.rows.map(r => r.column_name).join(', '));
  } finally {
    await client.end();
  }
}
test();