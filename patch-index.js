const fs = require('fs');
const path = '/home/ubuntu/youdo-facial-v3-api/src/index.js';
let c = fs.readFileSync(path, 'utf8');
if (c.includes('funcionariosRoutes')) { console.log('ALREADY_PATCHED'); process.exit(0); }
const insert = "const funcionariosRoutes = require('./routes/funcionarios');\napp.use('/api/funcionarios', funcionariosRoutes);\n";
c = c.replace("app.use('/api/userp/sync'", insert + "app.use('/api/userp/sync'");
fs.writeFileSync(path, c);
console.log('OK');
