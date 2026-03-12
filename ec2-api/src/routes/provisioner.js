const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { pool } = require('../db');
const router = express.Router();

const PROVISIONER_TOKEN = process.env.PROVISIONER_TOKEN || 'youdo-provisioner-2024';

function provisionerAuth(req, res, next) {
  const token = req.headers['x-provisioner-token'] || req.query.token;
  if (token !== PROVISIONER_TOKEN) return res.status(401).json({ error: 'Token inválido' });
  next();
}

// GET /api/provisioner/acessos - lista acessos disponíveis
router.get('/acessos', provisionerAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id, a.nome, e.nome AS empreendimento
      FROM acessos a
      LEFT JOIN empreendimentos e ON e.id = a.empreendimento_id
      ORDER BY e.nome, a.nome
    `);
    res.json({ acessos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/provisioner/register
// Body: { client_name, acesso_id, ip_vpn, modelo, serial, firmware }
// 1. Cria certificado VPN via easyrsa
// 2. Cadastra equipamento no banco
// 3. Retorna arquivo .ovpn
router.post('/register', provisionerAuth, async (req, res) => {
  const { client_name, acesso_id, ip_vpn, modelo, serial, firmware } = req.body;
  if (!client_name) {
    return res.status(400).json({ error: 'client_name é obrigatório' });
  }

  const safeName = client_name.replace(/[^a-zA-Z0-9_-]/g, '-');

  try {
    const PKI = '/etc/openvpn/easy-rsa/pki';
    const EASYRSA = '/etc/openvpn/easy-rsa';

    // 1. Verificar se cert já existe
    let certExists = false;
    try {
      await execAsync(`sudo ls ${PKI}/issued/${safeName}.crt 2>/dev/null`);
      certExists = true;
    } catch (_) {}

    // 2. Criar certificado se não existir
    if (!certExists) {
      await execAsync(`cd ${EASYRSA} && sudo ./easyrsa --batch build-client-full "${safeName}" nopass`);
    }

    // 3. Buscar cert, key, ca, ta usando a PKI correta do servidor
    const { stdout: ca }       = await execAsync(`sudo cat ${PKI}/ca.crt`);
    const { stdout: certFull } = await execAsync(`sudo cat ${PKI}/issued/${safeName}.crt`);
    const { stdout: key }      = await execAsync(`sudo cat ${PKI}/private/${safeName}.key`);
    let ta = '';
    try { ({ stdout: ta } = await execAsync('sudo cat /etc/openvpn/ta.key')); } catch (_) {}

    // Extrair apenas o bloco PEM do .crt (ignorar texto descritivo antes do BEGIN CERTIFICATE)
    const certMatch = certFull.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
    const cert = certMatch ? certMatch[0] : certFull;

    // Montar .conf no formato aceito pelo leitor ControlID
    const ovpn = [
      'client',
      'dev tun',
      'proto udp',
      'remote 52.205.23.149 1194',
      'resolv-retry infinite',
      'nobind',
      'persist-key',
      'persist-tun',
      'comp-lzo',
      'cipher AES-256-CBC',
      ta ? 'key-direction 1' : '',
      '<ca>',
      ca.trim(),
      '</ca>',
      '<cert>',
      cert.trim(),
      '</cert>',
      '<key>',
      key.trim(),
      '</key>',
      ta ? `<tls-auth>\n${ta.trim()}\n</tls-auth>` : '',
    ].filter(Boolean).join('\n');

    // 4. Cadastrar ou atualizar equipamento no banco (sem ip_vpn — será preenchido quando conectar)
    try {
      const { rows: existing } = await pool.query('SELECT id FROM equipamentos WHERE nome = $1', [safeName]);
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO equipamentos (nome, modelo, serial) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [safeName, modelo || null, serial || null]
        );
      }
    } catch (_) {}

    res.json({
      success: true,
      client_name: safeName,
      cert_created: !certExists,
      ovpn,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
