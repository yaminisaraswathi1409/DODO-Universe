async function main() {
  const res = await fetch('http://localhost:8080/api/v1/categories');
  const json = await res.json();
  const cats = json.data;
  console.log(`TOTAL CATEGORIES: ${cats.length}`);
  cats.forEach((c, i) => {
    console.log(`${i+1}. [${c.id}]`);
    console.log(`   slug: '${c.slug}'`);
    console.log(`   name: '${c.name}'`);
    console.log(`   desc: '${c.description}'`);
    console.log(`   opp_fields (${c.opportunity_fields?.length || 0}):`, (c.opportunity_fields || []).map(f => f.key).join(', '));
    console.log(`   resources (${c.resources?.length || 0}):`, (c.resources || []).map(r => r.key || r.id).join(', '));
    console.log(`   resource_requirements:`, JSON.stringify(c.resource_requirements));
    console.log('---');
  });
}
main().catch(console.error);
