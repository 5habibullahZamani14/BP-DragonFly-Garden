const fs = require('fs');

function fixJSX(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\\\$\\{/g, '${');
  content = content.replace(/\\\\\`/g, '\`');
  fs.writeFileSync(file, content);
  console.log('Fixed ' + file);
}

fixJSX('src/components/garden/management/EmployeesTab.tsx');
fixJSX('src/components/garden/management/InventoryTab.tsx');
