const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { syslog } = require('../syslog');
const router = express.Router();
router.use(authMiddleware);

async function deviceLogin(ip, login = 'admin', password = 'admin', timeoutMs = 5000) {
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
    const session = data?.session || null;
    // Capturar cookie de sessão (alguns endpoints exigem Cookie em vez de query string)
    const setCookie = res.headers.get('set-cookie') || '';
    const cookieMatch = setCookie.match(/session=([^;]+)/);
    const sessionCookie = cookieMatch ? cookieMatch[1] : session;
    return session ? { session, cookie: sessionCookie || session } : null;
  } finally { clearTimeout(t); }
}

async function devicePost(ip, path, body, timeoutMs = 8000, cookie = null) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = `session=${cookie}`;
    const res = await fetch(`http://${ip}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { raw: text }; }
  } finally { clearTimeout(t); }
}

async function devicePostBinary(ip, path, buffer, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${ip}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer,
      signal: ctrl.signal,
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { raw: text }; }
  } finally { clearTimeout(t); }
}

// GET /api/equipamentos/config — carrega configurações salvas no banco
router.get('/config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, logotipo, ntp_enabled, ntp_timezone, admin_login, admin_password, menu_password, updated_at FROM equipamentos_config WHERE id = 1');
    const cfg = rows[0] || { logotipo: null, ntp_enabled: true, ntp_timezone: 'UTC-3', admin_login: 'admin', admin_password: null, menu_password: null };
    res.json(cfg);
  } catch (err) {
    res.json({ logotipo: null, ntp_enabled: true, ntp_timezone: 'UTC-3', admin_login: 'admin', menu_password: null });
  }
});

// GET /api/equipamentos/device-config/:ip — lê config atual do leitor (NTP etc.)
router.get('/device-config/:ip', async (req, res) => {
  const ip = req.params.ip;
  try {
    const auth = await deviceLogin(ip);
    if (!auth) return res.json({ online: false, ip });
    const { session, cookie } = auth;

    const cfg = await devicePost(ip, `/get_configuration.fcgi?session=${session}`, {}, 5000, cookie);
    res.json({ online: true, ip, ntp: cfg?.ntp || null, raw: cfg });
  } catch (err) {
    res.json({ online: false, ip, error: err.message });
  }
});

// POST /api/equipamentos/apply-config
router.post('/apply-config', async (req, res) => {
  try {
    const { logotipo, ntp_enabled, ntp_timezone, admin_login, admin_password, menu_password } = req.body;

    // Buscar credenciais atuais do banco (para fazer login antes de trocar)
    const { rows: cfgRows } = await pool.query('SELECT admin_login, admin_password, menu_password FROM equipamentos_config WHERE id = 1');
    const currentLogin = cfgRows[0]?.admin_login || 'admin';
    const currentPassword = cfgRows[0]?.admin_password || 'admin';

    // Salvar configurações no banco (sem expor passwords no GET)
    await pool.query(
      `INSERT INTO equipamentos_config (id, logotipo, ntp_enabled, ntp_timezone, admin_login, admin_password, menu_password, updated_at)
       VALUES (1, $1, $2, $3, COALESCE($4, 'admin'), $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET logotipo=$1, ntp_enabled=$2, ntp_timezone=$3,
         admin_login=COALESCE($4, equipamentos_config.admin_login),
         admin_password=COALESCE($5, equipamentos_config.admin_password),
         menu_password=COALESCE($6, equipamentos_config.menu_password),
         updated_at=now()`,
      [logotipo || null, ntp_enabled !== false, ntp_timezone || 'UTC-3',
       admin_login || null, admin_password || null, menu_password || null]
    );

    const { rows: equipamentos } = await pool.query(`
      SELECT e.id, e.nome, e.ip_vpn, a.nome AS acesso_nome
      FROM equipamentos e
      LEFT JOIN acessos a ON a.id = e.acesso_id
      ORDER BY e.nome
    `);
    if (equipamentos.length === 0) {
      return res.json({ success: true, success_count: 0, error_count: 0, message: 'Nenhum equipamento cadastrado' });
    }

    let successCount = 0;
    let errorCount = 0;
    const details = [];

    for (const eq of equipamentos) {
      const result = { reader: eq.nome, ip: eq.ip_vpn, logotipo: null, ntp: null, login: null, errors: [] };

      try {
        if (!eq.ip_vpn) {
          result.errors.push('IP VPN não cadastrado');
          errorCount++; details.push(result); continue;
        }
        // Tentar credenciais do banco e admin/admin — aceitar o que funcionar primeiro
        let auth = await deviceLogin(eq.ip_vpn, currentLogin, currentPassword);
        if (!auth) auth = await deviceLogin(eq.ip_vpn, 'admin', 'admin');
        if (!auth) {
          result.errors.push('Offline ou falha de autenticação');
          await syslog('error', `apply-config/${eq.nome}`, 'Falha de autenticação no leitor', { ip: eq.ip_vpn });
          errorCount++; details.push(result); continue;
        }
        const { session, cookie } = auth;

        // 0. Usuário admin local (id=1) com senha hasheada para bloquear o menu físico
        // user_roles.role=1 = administrador (acessa menu na tela touch)
        const effectiveMenuPwd = menu_password || cfgRows[0]?.menu_password;
        if (effectiveMenuPwd) {
          try {
            // 0a. Gerar hash da senha via API do próprio leitor
            const hashResp = await devicePost(eq.ip_vpn, `/user_hash_password.fcgi?session=${session}`,
              { password: effectiveMenuPwd }, 5000);
            if (!hashResp?.password) throw new Error('Falha ao gerar hash da senha');
            const hashedPwd = hashResp.password;
            const salt      = hashResp.salt;

            // 0b. Remover user_roles e user id=1 anteriores
            await devicePost(eq.ip_vpn, `/destroy_objects.fcgi?session=${session}`,
              { object: 'user_roles', where: { user_roles: { user_id: 1 } } }, 5000);
            await devicePost(eq.ip_vpn, `/destroy_objects.fcgi?session=${session}`,
              { object: 'users', where: { users: { id: 1 } } }, 5000);

            // 0c. Criar user id=1 com hash da senha
            const userPayload = { id: 1, name: 'Administrador', registration: '1', password: hashedPwd };
            if (salt) userPayload.salt = salt;
            const ru = await devicePost(eq.ip_vpn, `/create_objects.fcgi?session=${session}`, {
              object: 'users',
              values: [userPayload]
            }, 5000);

            if (ru?.error) throw new Error(ru.error);

            // 0d. Criar user_roles: role=1 (administrador — acessa menu touch)
            const rr = await devicePost(eq.ip_vpn, `/create_objects.fcgi?session=${session}`, {
              object: 'user_roles',
              values: [{ user_id: 1, role: 1 }]
            }, 5000);

            result.menu_password = (rr?.error) ? `ERRO roles: ${rr.error}` : 'OK';
            if (rr?.error) {
              result.errors.push(`Senha menu (roles): ${rr.error}`);
              await syslog('warn', `apply-config/${eq.nome}`, `Erro ao criar user_roles admin`, { ip: eq.ip_vpn, response: rr });
            }
          } catch (err) {
            result.menu_password = 'ERRO';
            result.errors.push(`Senha menu: ${err.message}`);
            await syslog('error', `apply-config/${eq.nome}`, `Erro ao criar admin local no leitor`, { ip: eq.ip_vpn, error: err.message });
          }
        }

        // 0b. Alterar login/senha admin API via change_login.fcgi
        if (admin_login || admin_password) {
          try {
            const newLogin = admin_login || currentLogin;
            const newPass = admin_password || currentPassword;
            await devicePost(eq.ip_vpn, `/change_login.fcgi?session=${session}`,
              { login: newLogin, password: newPass }, 5000, cookie);
            result.login = `OK (login: ${newLogin})`;
          } catch (err) {
            result.login = 'ERRO';
            result.errors.push(`Login API: ${err.message}`);
            await syslog('error', `apply-config/${eq.nome}`, `Erro ao alterar login/senha API`, { ip: eq.ip_vpn, error: err.message });
          }
        }

        // 1b. Nome do equipamento na tela (mensagem permanente)
        try {
          const msgTela = eq.acesso_nome ? `${eq.nome} - ${eq.acesso_nome}` : eq.nome;
          await devicePost(eq.ip_vpn, `/message_to_screen.fcgi?session=${session}`,
            { message: msgTela, timeout: 0 }, 5000, cookie);
          result.mensagem = 'OK';
        } catch (err) {
          result.mensagem = 'ERRO';
          result.errors.push(`Mensagem tela: ${err.message}`);
        }

        // 2. NTP via set_configuration.fcgi
        if (ntp_enabled !== undefined) {
          try {
            const ntpPayload = { ntp: { enabled: ntp_enabled ? '1' : '0', timezone: ntp_timezone || 'UTC-3' } };
            const r = await devicePost(eq.ip_vpn, `/set_configuration.fcgi?session=${session}`, ntpPayload, 8000, cookie);
            result.ntp = (r?.error) ? `ERRO: ${r.error}` : `OK (NTP ${ntp_enabled ? 'ativado' : 'desativado'}, ${ntp_timezone || 'UTC-3'})`;
            if (r?.error) result.errors.push(`NTP: ${r.error}`);
          } catch (err) {
            result.ntp = 'ERRO';
            result.errors.push(`NTP: ${err.message}`);
            await syslog('error', `apply-config/${eq.nome}`, `Erro ao configurar NTP`, { ip: eq.ip_vpn, error: err.message });
          }
        }

        if (result.errors.length === 0) successCount++;
        else errorCount++;

      } catch (err) {
        result.errors.push(`Offline ou erro: ${err.message}`);
        await syslog('error', `apply-config/${eq.nome}`, `Erro geral no leitor`, { ip: eq.ip_vpn, error: err.message });
        errorCount++;
      }

      details.push(result);
    }

    res.json({
      success: true,
      success_count: successCount,
      error_count: errorCount,
      total_readers: equipamentos.length,
      details,
      message: `Configurações aplicadas em ${successCount}/${equipamentos.length} leitor(es)`,
    });

  } catch (err) {
    await syslog('error', 'apply-config', 'Erro crítico ao aplicar configurações', { error: err.message });
    res.status(500).json({ error: 'Erro ao aplicar configurações: ' + err.message });
  }
});

module.exports = router;
