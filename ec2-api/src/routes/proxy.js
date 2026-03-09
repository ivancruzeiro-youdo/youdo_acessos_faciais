const express = require('express');
const { authMiddleware } = require('../middleware/auth');

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
  try {
    const ip = req.params.ip;
    const response = await fetch(`http://${ip}/device_status.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    res.json({ online: true, ip, ...data });
  } catch (err) {
    res.json({ online: false, ip: req.params.ip, error: err.message });
  }
});

module.exports = router;
