const fs = require('fs');
let file = 'src/controllers/tableController.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/\\`/g, '`');
fs.writeFileSync(file, content);
console.log('Fixed tables');
