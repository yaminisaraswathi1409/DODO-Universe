const { Client } = require('../../frontend/node_modules/pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const dbURL = "postgresql://postgres.qnnpgryyilwenigawarv:DODO-Universe2026@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
  const client = new Client({ 
    connectionString: dbURL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log("Connected to Supabase PostgreSQL database via pg client.");

  const migrationFile = path.join(__dirname, '../migrations/000021_consolidate_cement_categories.up.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log("Executing Migration 000021...");
  await client.query(sql);
  console.log("Migration 000021 executed successfully!\n");

  // Verify
  const catRes = await client.query("SELECT id, slug, name, jsonb_array_length(required_documents) as req_docs, jsonb_array_length(opportunity_fields) as opp_fields FROM categories WHERE slug IN ('cement-services', 'cement-construction')");
  console.log("Categories after migration:");
  console.table(catRes.rows);

  const assetRes = await client.query(`
    SELECT usa.id, usa.title, usa.asset_type, c.slug, c.name, u.full_name, u.phone
    FROM user_skills_assets usa
    JOIN categories c ON usa.category_id = c.id
    JOIN users u ON usa.user_id = u.id
    WHERE c.slug = 'cement-construction'
  `);
  console.log("Assets linked to 'cement-construction':");
  console.table(assetRes.rows);

  await client.end();
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
