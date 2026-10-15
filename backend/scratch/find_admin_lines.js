const fs = require('fs');
const content = fs.readFileSync('c:/DODO-Universe/frontend/src/app/admin/users/page.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes("activeTab === 'categories'") || l.includes('updateCategoryResources') || l.includes('updateCategoryOpportunityFields')) {
    console.log(`${i+1}: ${l.trim()}`);
  }
});
