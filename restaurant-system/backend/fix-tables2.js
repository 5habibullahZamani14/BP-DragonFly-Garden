const fs = require('fs');
let file = 'src/controllers/tableController.js';
let content = fs.readFileSync(file, 'utf8');

// The file literally has /\\/$/ right now which is causing SyntaxError.
// Let's just do a string replacement.
content = content.replace('replace(/\\\\/$/, "")', 'replace(/\\/$/, "")');
content = content.replace(/\\\${/g, '${');

fs.writeFileSync(file, content);
console.log('Fixed syntax correctly!');
