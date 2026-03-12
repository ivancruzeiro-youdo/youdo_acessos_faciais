const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();
router.use(authMiddleware);

// POST /api/proxy - Proxy para leitores ControlID na VPN
// Body: { ip: "10.8.0.5", endpoint: "/device_status.fcgi", payload: {} }
router.post('/', async (req, res) => {
  try {
    const { ip, endpoint, payload } = req.body;
    if (!ip || !endpoint) {
      return res.status(400).json({ error: 'ip e endpoint são obrigatórios' });
    }

    const url = `http://${ip}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await response.json();
      res.json(data);
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return res.status(504).json({ error: `Timeout ao acessar leitor ${ip}` });
      }
      return res.status(502).json({ error: `Não foi possível conectar ao leitor ${ip}: ${fetchErr.message}` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proxy/scan - Varrer range de IPs na VPN procurando leitores
router.post('/scan', async (req, res) => {
  try {
    const { start, end, subnet } = req.body;
    const base = subnet || '10.8.0';
    const startIp = start || 2;
    const endIp = end || 254;
    const results = [];

    const promises = [];
    for (let i = startIp; i <= endIp; i++) {
      const ip = `${base}.${i}`;
      promises.push(
        fetch(`http://${ip}/device_status.fcgi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(3000),
        })
          .then(r => r.json())
          .then(data => ({
            ip,
            online: true,
            model: data?.device_status?.general?.model || null,
            serial: data?.device_status?.general?.serial || null,
            firmware: data?.device_status?.general?.fw_version || null,
          }))
          .catch(() => null)
      );
    }

    const all = await Promise.all(promises);
    const found = all.filter(Boolean);

    res.json({ devices: found, scanned: endIp - startIp + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proxy/status/:ip - Status de um leitor específico
router.get('/status/:ip', async (req, res) => {
  const ip = req.params.ip;
  try {
    // Buscar credenciais do banco
    const { rows: cfg } = await pool.query('SELECT admin_login, admin_password FROM equipamentos_config WHERE id=1');
    const adminLogin = cfg[0]?.admin_login || 'admin';
    const adminPassword = cfg[0]?.admin_password || 'admin';

    // Login no leitor
    const loginRes = await fetch(`http://${ip}/login.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: adminLogin, password: adminPassword }),
      signal: AbortSignal.timeout(5000),
    });
    const loginData = await loginRes.json();
    const session = loginData?.session;
    if (!session) return res.json({ online: false, ip, error: 'Falha no login' });

    const fetchObj = (obj) => fetch(`http://${ip}/load_objects.fcgi?session=${session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: obj }),
      signal: AbortSignal.timeout(5000),
    }).then(r => r.json()).catch(() => null);

    const fetchPost = (endpoint, body = {}) => fetch(`http://${ip}${endpoint}?session=${session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    }).then(r => r.json()).catch(() => null);

    const [portals, accessRules, groups, userGroups, users, deviceStatus, deviceCfg] = await Promise.all([
      fetchObj('portals'),
      fetchObj('access_rules'),
      fetchObj('groups'),
      fetchObj('user_groups'),
      fetchObj('users'),
      fetchPost('/device_status.fcgi'),
      fetchPost('/get_configuration.fcgi'),
    ]);

    const ds = deviceStatus?.device_status?.general || {};
    const net = deviceCfg?.network || {};
    const snmp = deviceCfg?.snmp_agent || {};

    res.json({
      online: true,
      ip,
      session,
      device: {
        modelo: ds.model || null,
        firmware: ds.fw_version || null,
        serial: ds.serial || null,
        mac: net.mac || null,
        ip_local: net.ip || null,
        gateway: net.gateway || null,
        dns: net.dns1 || null,
        snmp_enabled: snmp.snmp_enabled === '1' || snmp.snmp_enabled === 1,
      },
      summary: {
        portals: (portals?.portals || []).length,
        access_rules: (accessRules?.access_rules || []).length,
        groups: (groups?.groups || []).length,
        user_groups: (userGroups?.user_groups || []).length,
        users: (users?.users || []).length,
      },
      portals: portals?.portals || [],
      access_rules: accessRules?.access_rules || [],
      groups: groups?.groups || [],
    });
  } catch (err) {
    res.json({ online: false, ip, error: err.message });
  }
});

// POST /api/proxy/device-users - Lista usuários cadastrados no leitor
router.post('/device-users', async (req, res) => {
  try {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'ip obrigatório' });

    // Buscar credenciais do banco
    const { rows: cfg } = await pool.query('SELECT admin_login, admin_password FROM equipamentos_config WHERE id=1');
    const adminLogin = cfg[0]?.admin_login || 'admin';
    const adminPassword = cfg[0]?.admin_password || 'admin';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Login no leitor via VPN
    const loginRes = await fetch(`http://${ip}/login.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: adminLogin, password: adminPassword }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const loginData = await loginRes.json();
    const session = loginData?.session;
    if (!session) return res.status(401).json({ error: 'Falha ao autenticar no leitor' });

    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 10000);
    const usersRes = await fetch(`http://${ip}/load_objects.fcgi?session=${session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'users' }),
      signal: controller2.signal,
    });
    clearTimeout(timeout2);
    const usersData = await usersRes.json();
    const users = usersData?.users || [];

    // Buscar foto de cada usuário
    const usersWithPhotos = await Promise.all(users.map(async (u) => {
      try {
        const imgRes = await fetch(`http://${ip}/user_get_image.fcgi?user_id=${u.id}&session=${session}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          if (contentType.startsWith('image/')) {
            const buf = await imgRes.arrayBuffer();
            const b64 = Buffer.from(buf).toString('base64');
            return { ...u, foto_base64: `data:${contentType};base64,${b64}` };
          }
        }
      } catch (_) {}
      return { ...u, foto_base64: null };
    }));

    res.json({ users: usersWithPhotos, session });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/proxy/device-users/delete - Deleta usuários do leitor
router.post('/device-users/delete', async (req, res) => {
  try {
    const { ip, user_ids } = req.body;
    if (!ip || !user_ids?.length) return res.status(400).json({ error: 'ip e user_ids obrigatórios' });

    // Buscar credenciais do banco
    const { rows: cfg } = await pool.query('SELECT admin_login, admin_password FROM equipamentos_config WHERE id=1');
    const adminLogin = cfg[0]?.admin_login || 'admin';
    const adminPassword = cfg[0]?.admin_password || 'admin';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const loginRes = await fetch(`http://${ip}/login.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: adminLogin, password: adminPassword }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const loginData = await loginRes.json();
    const session = loginData?.session;
    if (!session) return res.status(401).json({ error: 'Falha ao autenticar no leitor' });

    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 15000);
    const delRes = await fetch(`http://${ip}/destroy_objects.fcgi?session=${session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: 'users', where: { users: { id: user_ids } } }),
      signal: controller2.signal,
    });
    clearTimeout(timeout2);
    const delData = await delRes.json();
    res.json({ success: true, result: delData });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
