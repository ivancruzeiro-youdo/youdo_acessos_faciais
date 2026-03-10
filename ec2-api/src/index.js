require('dotenv').config();

const express = require('express');

const cors = require('cors');

const { pool, initDb } = require('./db');

const authRoutes = require('./routes/auth');

const empreendimentosRoutes = require('./routes/empreendimentos');

const acessosRoutes = require('./routes/acessos');

const equipamentosRoutes = require('./routes/equipamentos');

const usuariosRoutes = require('./routes/usuarios');

const proxyRoutes = require('./routes/proxy');

const syncUsersRoutes = require('./routes/sync-users');

const vpnRoutes = require('./routes/vpn');

const equipamentosConfigRoutes = require('./routes/equipamentos-config');



const app = express();

const PORT = process.env.PORT || 3001;



app.use(cors());

app.use(express.json({ limit: '10mb' }));



// Health check

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));



// Routes

app.use('/api/auth', authRoutes);

app.use('/api/empreendimentos', empreendimentosRoutes);

app.use('/api/acessos', acessosRoutes);

app.use('/api/equipamentos', equipamentosRoutes);

app.use('/api/usuarios', usuariosRoutes);

app.use('/api/proxy', proxyRoutes);

app.use('/api/vpn', syncUsersRoutes);

app.use('/api/vpn', vpnRoutes);

app.use('/api/equipamentos', equipamentosConfigRoutes);



// Serve frontend estático (pasta dist/)

const path = require('path');

app.use(express.static(path.join(__dirname, '..', 'dist'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('*', (req, res) => {

  if (!req.path.startsWith('/api')) {

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));

  }

});



initDb().then(() => {

  app.listen(PORT, () => {

    console.log(`🚀 API rodando em http://localhost:${PORT}`);

  });

}).catch(err => {

  console.error('Erro ao inicializar banco:', err);

  process.exit(1);

});

