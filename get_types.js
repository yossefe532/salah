import pkg from 'pg';
const { Client } = pkg;
const connectionString = "postgresql://postgres.cwftlzaibboszcrukhig:P@ssw0rd123!@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
async function getTypes() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='seats'");
    console.table(res.rows);
  } finally {
    await client.end();
  }
}
getTypes();