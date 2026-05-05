const fs = require('fs');

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\\`/g, '`');
  fs.writeFileSync(file, content);
  console.log("Fixed " + file);
}

fixFile('src/components/garden/management/InventoryTab.tsx');
fixFile('src/components/garden/management/LogsTab.tsx');
