const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { authMiddleware } = require('../middleware/auth');
const { pool } = require('../db');
const router = express.Router();

// Helper: login no leitor tentando credenciais do banco e admin/admin
async function tryDeviceLogin(ip, timeoutMs = 5000) {
  async function doLogin(login, password) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${ip}/login.fcgi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      return data?.session ? { session: data.session } : null;
    } catch { return null; } finally { clearTimeout(t); }
  }
  try {
    const { rows } = await pool.query('SELECT admin_login, admin_password FROM equipamentos_config WHERE id = 1');
    const login = rows[0]?.admin_login || 'admin';
    const password = rows[0]?.admin_password || 'admin';
    let auth = await doLogin(login, password);
    if (!auth) auth = await doLogin('admin', 'admin');
    return auth;
  } catch { return null; }
}

// Helper: aplicar config padrão em um leitor (NTP, logotipo, mensagem tela)
async function applyDefaultConfig(ip, nome) {
  try {
    const auth = await tryDeviceLogin(ip);
    if (!auth) return { ok: false, error: 'login falhou' };
    const { session } = auth;

    const { rows: cfgRows } = await pool.query(
      'SELECT logotipo, ntp_enabled, ntp_timezone, admin_login, admin_password, menu_password FROM equipamentos_config WHERE id = 1'
    );
    const cfg = cfgRows[0] || {};

    // NTP
    await fetch(`http://${ip}/set_configuration.fcgi?session=${session}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ntp: { enabled: cfg.ntp_enabled !== false ? '1' : '0', timezone: cfg.ntp_timezone || 'UTC-3' } }),
    }).catch(() => {});

    // Mensagem na tela
    await fetch(`http://${ip}/message_to_screen.fcgi?session=${session}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: nome, timeout: 0 }),
    }).catch(() => {});

    // Alterar login/senha se configurado (e diferente de admin/admin)
    if (cfg.admin_login && cfg.admin_password && (cfg.admin_login !== 'admin' || cfg.admin_password !== 'admin')) {
      await fetch(`http://${ip}/change_login.fcgi?session=${session}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: cfg.admin_login, password: cfg.admin_password }),
      }).catch(() => {});
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// POST /api/vpn/on-connect — chamado pelo script OpenVPN quando leitor conecta
// Autenticação: x-provisioner-token (sem JWT, chamado localmente pelo OpenVPN)
const PROVISIONER_TOKEN = process.env.PROVISIONER_TOKEN || 'youdo-provisioner-2024';
router.post('/on-connect', async (req, res) => {
  const token = req.headers['x-provisioner-token'] || req.query.token;
  if (token !== PROVISIONER_TOKEN) return res.status(401).json({ error: 'Token inválido' });
  const { client_name, ip_vpn } = req.body;
  if (!client_name || !ip_vpn) return res.status(400).json({ error: 'client_name e ip_vpn obrigatórios' });
  try {
    // Atualizar ip_vpn no banco
    await pool.query(
      'UPDATE equipamentos SET ip_vpn = $1 WHERE nome = $2',
      [ip_vpn, client_name]
    );
    // Aguardar leitor ficar acessível (até 30s) e aplicar config
    let applied = { ok: false, error: 'timeout' };
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 5000));
      applied = await applyDefaultConfig(ip_vpn, client_name);
      if (applied.ok) break;
    }
    res.json({ success: true, client_name, ip_vpn, config_applied: applied });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Todas as rotas abaixo requerem JWT
router.use((req, res, next) => authMiddleware(req, res, next));

// Parse status.log do OpenVPN
async function parseVpnStatus() {
  try {
    const { stdout } = await execAsync('sudo cat /var/log/openvpn/status.log');
    const lines = stdout.split('\n');
    const clients = [];
    const vpnIpMap = {};

    // Seção ROUTING TABLE: Virtual Address,Common Name,...
    let inRouting = false;
    for (const line of lines) {
      if (line.startsWith('Virtual Address,Common Name')) { inRouting = true; continue; }
      if (line.startsWith('GLOBAL STATS') || line.startsWith('END')) { inRouting = false; }
      if (!inRouting || !line.trim()) continue;
      const parts = line.split(',');
      if (parts.length >= 2) vpnIpMap[parts[1]] = parts[0];
    }

    // Seção CLIENT LIST: Common Name,Real Address,Bytes Received,Bytes Sent,Connected Since
    let inClients = false;
    for (const line of lines) {
      if (line.startsWith('Common Name,Real Address')) { inClients = true; continue; }
      if (line.startsWith('ROUTING TABLE') || line.startsWith('Updated,')) { inClients = false; }
      if (!inClients || !line.trim()) continue;
      const parts = line.split(',');
      if (parts.length >= 5) {
        clients.push({
          client_name: parts[0],
          ip_real: parts[1],
          bytes_received: parseInt(parts[2]) || 0,
          bytes_sent: parseInt(parts[3]) || 0,
          connected_since: parts[4] || null,
          ip_vpn: vpnIpMap[parts[0]] || null,
        });
      }
    }
    return clients;
  } catch (err) {
    return [];
  }
}

// GET /api/vpn/status
router.get('/status', async (req, res) => {
  try {
    const clients = await parseVpnStatus();
    let uptime = '—';
    try {
      const { stdout } = await execAsync('systemctl show openvpn@server --property=ActiveEnterTimestamp');
      uptime = stdout.replace('ActiveEnterTimestamp=', '').trim();
    } catch (_) {}
    res.json({
      server: { status: 'running', uptime },
      statistics: { connected_clients: clients.length },
      clients,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vpn/clients
router.get('/clients', async (req, res) => {
  try {
    const clients = await parseVpnStatus();
    res.json({ clients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vpn/logs
router.get('/logs', async (req, res) => {
  try {
    const { stdout } = await execAsync('sudo tail -n 100 /var/log/openvpn/openvpn.log 2>/dev/null || sudo tail -n 100 /var/log/syslog | grep openvpn');
    const logs = stdout.split('\n').filter(Boolean).map((line, i) => ({
      timestamp: null,
      client_name: '—',
      ip_vpn: '—',
      event: 'info',
      message: line,
    }));
    res.json({ logs });
  } catch (err) {
    res.json({ logs: [] });
  }
});

// GET /api/vpn/certificates
router.get('/certificates', async (req, res) => {
  try {
    const { stdout } = await execAsync('sudo ls /etc/openvpn/easy-rsa/pki/issued/ 2>/dev/null || ls ~/easy-rsa/pki/issued/ 2>/dev/null');
    const certs = stdout.split('\n').filter(Boolean).map((f, i) => ({
      id: f.replace('.crt', ''),
      client_name: f.replace('.crt', ''),
      ip_address: '—',
      status: 'active',
      created_at: null,
      expires_at: null,
    }));
    res.json({ certificates: certs });
  } catch (err) {
    res.json({ certificates: [] });
  }
});

// POST /api/vpn/certificates
router.post('/certificates', async (req, res) => {
  const { client_name, ip_address } = req.body;
  if (!client_name) return res.status(400).json({ error: 'client_name obrigatório' });
  try {
    await execAsync(`cd ~/easy-rsa && ./easyrsa --batch build-client-full "${client_name}" nopass`);
    res.json({ success: true, client_name });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar certificado: ' + err.message });
  }
});

// POST /api/vpn/certificates/:id/revoke
router.post('/certificates/:id/revoke', async (req, res) => {
  const { id } = req.params;
  try {
    await execAsync(`cd ~/easy-rsa && ./easyrsa --batch revoke "${id}" && ./easyrsa gen-crl`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao revogar: ' + err.message });
  }
});

// GET /api/vpn/certificates/:id/download
router.get('/certificates/:id/download', async (req, res) => {
  const { id } = req.params;
  try {
    const { stdout: ca } = await execAsync('sudo cat /etc/openvpn/easy-rsa/pki/ca.crt 2>/dev/null || cat ~/easy-rsa/pki/ca.crt');
    const { stdout: cert } = await execAsync(`sudo cat /etc/openvpn/easy-rsa/pki/issued/${id}.crt 2>/dev/null || cat ~/easy-rsa/pki/issued/${id}.crt`);
    const { stdout: key } = await execAsync(`sudo cat /etc/openvpn/easy-rsa/pki/private/${id}.key 2>/dev/null || cat ~/easy-rsa/pki/private/${id}.key`);
    const { stdout: ta } = await execAsync('sudo cat /etc/openvpn/ta.key 2>/dev/null || echo ""').catch(() => ({ stdout: '' }));

    const ovpn = `client\ndev tun\nproto udp\nremote 52.205.23.149 1194\nresolv-retry infinite\nnobind\npersist-key\npersist-tun\nverb 3\n<ca>\n${ca}</ca>\n<cert>\n${cert}</cert>\n<key>\n${key}</key>\n${ta ? `<tls-auth>\n${ta}</tls-auth>\nkey-direction 1` : ''}`;
    res.send(ovpn);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar .ovpn: ' + err.message });
  }
});

module.exports = router;
