const { Client } = require('../../frontend/node_modules/pg');

async function main() {
  const dbURL = "postgresql://postgres.qnnpgryyilwenigawarv:DODO-Universe2026@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
  const client = new Client({ 
    connectionString: dbURL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  await client.query(`
    UPDATE user_skills_assets
    SET title = 'Cement & Construction Supplies'
    WHERE id = 'fa966332-199c-46f8-9c13-636e85e40aec';

    UPDATE user_skills_assets
    SET title = 'Cement & Construction Supplies Service'
    WHERE id = '4cd88fd9-ae68-4273-bde0-f9e0b9fbb389';
  `);
  console.log('Asset titles updated successfully!');
  await client.end();
}

main().catch(console.error);
