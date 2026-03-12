const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { pool } = require('../db');
const { syslog } = require('../syslog');
const router = express.Router();

async function devicePost(ip, path, body, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${ip}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function devicePostBinary(ip, path, buffer, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${ip}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer,
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Converte UUID para ID numérico ControlID
function toNumericId(uuid) {
  return parseInt(uuid.toString().replace(/-/g, '').substring(0, 8), 16) % 2000000000;
}

// POST /api/vpn/sync-reader — sync completo de um leitor (assíncrono)
router.post('/sync-reader', authMiddleware, (req, res) => {
  const { reader_ip, acesso_id } = req.body;
  if (!reader_ip || !acesso_id) return res.status(400).json({ error: 'reader_ip e acesso_id são obrigatórios' });
  if (!reader_ip.match(/^10\.8\.0\.\d{1,3}$/)) return res.status(400).json({ error: 'IP VPN inválido' });

  // Responder imediatamente — processar em background para evitar timeout do Nginx
  res.json({ success: true, message: `Sincronização iniciada para ${reader_ip}`, async: true });

  // Processar em background
  setImmediate(async () => {
  try {

    // Buscar credenciais salvas do banco
    const { rows: cfgRows } = await pool.query('SELECT admin_login, admin_password FROM equipamentos_config WHERE id = 1');
    const adminLogin = cfgRows[0]?.admin_login || 'admin';
    const adminPassword = cfgRows[0]?.admin_password || 'admin';

    // Login no leitor — fallback admin/admin para leitores recém-provisionados
    let loginData = await devicePost(reader_ip, '/login.fcgi', { login: adminLogin, password: adminPassword }, 5000);
    if (!loginData?.session && (adminLogin !== 'admin' || adminPassword !== 'admin')) {
      loginData = await devicePost(reader_ip, '/login.fcgi', { login: 'admin', password: 'admin' }, 5000);
      if (loginData?.session) await syslog('warn', `sync-reader/${reader_ip}`, 'Login com fallback admin/admin', { ip: reader_ip });
    }
    const session = loginData?.session;
    if (!session) {
      await syslog('error', `sync-reader/${reader_ip}`, 'Falha de autenticação no leitor', { ip: reader_ip, login: adminLogin }); return;
    }

    // Enviar nome do leitor + acesso na tela (mensagem permanente)
    try {
      const { rows: eqRows } = await pool.query(`
        SELECT e.nome, a.nome AS acesso_nome
        FROM equipamentos e
        LEFT JOIN acessos a ON a.id = e.acesso_id
        WHERE e.ip_vpn = $1
      `, [reader_ip]);
      const eq = eqRows[0];
      if (eq) {
        const msgTela = eq.acesso_nome ? `${eq.nome} - ${eq.acesso_nome}` : eq.nome;
        await devicePost(reader_ip, `/message_to_screen.fcgi?session=${session}`, { message: msgTela, timeout: 0 }, 5000);
      }
    } catch (_) {}

    // Buscar usuários válidos do banco para este acesso (via usuario_acessos)
    const { rows: dbUsers } = await pool.query(`
      SELECT u.id, u.nome, u.matricula, ua.data_inicio, ua.data_fim, u.foto_base64
      FROM usuarios u
      JOIN usuario_acessos ua ON ua.usuario_id = u.id
      WHERE ua.acesso_id = $1
    `, [acesso_id]);

    const toUnix = (d) => { if (!d) return 0; const t = Math.floor(new Date(d).getTime() / 1000); return isNaN(t) ? 0 : t; };
    const validNumericIds = new Set(dbUsers.map(u => toNumericId(u.id)));

    // Buscar usuários atualmente no leitor
    const readerUsersData = await devicePost(reader_ip, `/load_objects.fcgi?session=${session}`, { object: 'users' }, 10000);
    const readerUsers = readerUsersData?.users || [];

    // Deletar usuários indevidos no leitor
    const toDelete = readerUsers.filter(ru => !validNumericIds.has(ru.id));
    let deleted = 0;
    for (const ru of toDelete) {
      await devicePost(reader_ip, `/destroy_objects.fcgi?session=${session}`,
        { object: 'users', where: { users: { id: ru.id } } }, 5000
      ).catch(() => {});
      deleted++;
    }

    // Buscar regra de acesso padrão (cache por sessão)
    const accessRulesData = await devicePost(reader_ip, `/load_objects.fcgi?session=${session}`, { object: 'access_rules' }, 5000);
    const accessRules = accessRulesData?.access_rules || [];
    const defaultRule = accessRules.find(r => r.type === 1) || accessRules[0];

    // Upsert cada usuário válido
    let synced = 0;
    let photoErrors = [];
    for (const u of dbUsers) {
      const numericId = toNumericId(u.id);
      const registration = u.matricula ? u.matricula.toString() : numericId.toString();
      const userData = { id: numericId, name: u.nome, registration, begin_time: toUnix(u.data_inicio), end_time: toUnix(u.data_fim) };

      const exists = readerUsers.some(ru => ru.id === numericId);
      if (exists) {
        await devicePost(reader_ip, `/destroy_objects.fcgi?session=${session}`,
          { object: 'users', where: { users: { id: numericId } } }, 5000).catch(() => {});
      }
      await devicePost(reader_ip, `/create_objects.fcgi?session=${session}`, { object: 'users', values: [userData] }, 10000)
        .catch(() => {});

      // Garantir vínculo com regra de acesso
      if (defaultRule) {
        const existing = await devicePost(reader_ip, `/load_objects.fcgi?session=${session}`,
          { object: 'user_access_rules', where: { user_access_rules: { user_id: numericId } } }, 5000);
        if (!(existing?.user_access_rules?.length > 0)) {
          await devicePost(reader_ip, `/create_objects.fcgi?session=${session}`,
            { object: 'user_access_rules', values: [{ user_id: numericId, access_rule_id: defaultRule.id }] }, 5000
          ).catch(() => {});
        }
      }

      // Enviar foto
      if (u.foto_base64) {
        try {
          const base64 = u.foto_base64.replace(/^data:image\/[a-z]+;base64,/, '');
          const imgBuffer = Buffer.from(base64, 'base64');
          const ts = Math.floor(Date.now() / 1000);
          const pr = await devicePostBinary(reader_ip,
            `/user_set_image.fcgi?user_id=${numericId}&timestamp=${ts}&match=0&session=${session}`, imgBuffer);
          const erroMsgs = (pr?.errors || []).map(e => e.message).join(', ');
          if (pr?.success === false || erroMsgs) {
            const motivo = erroMsgs || pr?.message || 'foto rejeitada pelo leitor (qualidade insuficiente)';
            photoErrors.push(`${u.nome}: ${motivo}`);
            await syslog('warn', `sync-reader/${reader_ip}`, `Foto rejeitada para ${u.nome}`, { ip: reader_ip, motivo });
          }
        } catch (e) {
          photoErrors.push(`${u.nome}: ${e.message}`);
          await syslog('warn', `sync-reader/${reader_ip}`, `Erro ao enviar foto de ${u.nome}`, { ip: reader_ip, error: e.message });
        }
      }
      synced++;
    }

    await syslog('info', `sync-reader/${reader_ip}`, `Sync concluído: ${synced} usuários, ${deleted} removidos`, { ip: reader_ip, synced, deleted });

  } catch (err) {
    await syslog('error', `sync-reader/${reader_ip}`, 'Erro crítico no sync do leitor', { ip: reader_ip, error: err.message });
  }
  }); // fim setImmediate
});

// POST /api/vpn/sync-user
router.post('/sync-user', authMiddleware, async (req, res) => {
  try {
    const { reader_ip, user } = req.body;

    if (!reader_ip || !user) {
      return res.status(400).json({ error: 'reader_ip e user são obrigatórios' });
    }

    if (!reader_ip.match(/^10\.8\.0\.\d{1,3}$/)) {
      return res.status(400).json({ error: 'IP VPN inválido' });
    }

    // Buscar credenciais salvas no banco
    const { rows: cfgRows } = await pool.query('SELECT admin_login, admin_password FROM equipamentos_config WHERE id = 1');
    const adminLogin = cfgRows[0]?.admin_login || 'admin';
    const adminPassword = cfgRows[0]?.admin_password || 'admin';

    // Login no dispositivo
    const loginData = await devicePost(reader_ip, '/login.fcgi', { login: adminLogin, password: adminPassword }, 5000);
    const sessionId = loginData?.session;
    if (!sessionId) {
      await syslog('error', `sync-user/${reader_ip}`, 'Falha de autenticação no leitor', { ip: reader_ip, login: adminLogin });
      return res.status(401).json({ error: 'Falha ao autenticar no dispositivo' });
    }

    // ControlID exige ID numérico — derivar do UUID via hash simples
    const numericId = parseInt(user.id.toString().replace(/-/g, '').substring(0, 8), 16) % 2000000000;

    // Verificar se usuário já existe
    const checkData = await devicePost(reader_ip, `/load_objects.fcgi?session=${sessionId}`,
      { object: 'users', where: { users: { id: numericId } } }, 10000);
    const userExists = (checkData?.users || []).length > 0;

    // Preparar dados (foto vai via user_set_image.fcgi separadamente)
    const registration = user.matricula ? user.matricula.toString() : numericId.toString();

    // Converter datas para Unix timestamp (segundos). 0 = sem limite.
    const toUnix = (dateStr) => {
      if (!dateStr) return 0;
      const ts = Math.floor(new Date(dateStr).getTime() / 1000);
      return isNaN(ts) ? 0 : ts;
    };
    const beginTime = toUnix(user.data_inicio);
    const endTime = toUnix(user.data_fim);

    const userData = { id: numericId, name: user.name, registration, begin_time: beginTime, end_time: endTime };

    const endpoint = userExists ? '/set_objects.fcgi' : '/create_objects.fcgi';
    await devicePost(reader_ip, `${endpoint}?session=${sessionId}`,
      { object: 'users', values: [userData] }, 15000);

    // Garantir vínculo com regra de acesso padrão (access_rule_id=1 = "Sempre Liberado")
    // Buscar regras de acesso existentes do usuário
    const existingRules = await devicePost(reader_ip, `/load_objects.fcgi?session=${sessionId}`,
      { object: 'user_access_rules', where: { user_access_rules: { user_id: numericId } } }, 5000);
    const hasRule = (existingRules?.user_access_rules || []).length > 0;

    if (!hasRule) {
      // Buscar a primeira regra de acesso disponível no leitor (normalmente id=1)
      const accessRulesData = await devicePost(reader_ip, `/load_objects.fcgi?session=${sessionId}`,
        { object: 'access_rules' }, 5000);
      const accessRules = accessRulesData?.access_rules || [];
      // Usar a primeira regra do tipo liberação (type=1), ou a primeira disponível
      const defaultRule = accessRules.find(r => r.type === 1) || accessRules[0];
      if (defaultRule) {
        await devicePost(reader_ip, `/create_objects.fcgi?session=${sessionId}`,
          { object: 'user_access_rules', values: [{ user_id: numericId, access_rule_id: defaultRule.id }] }, 5000
        ).catch(e => console.warn('Aviso ao vincular regra de acesso:', e.message));
      }
    }

    // Enviar foto via user_set_image.fcgi com octet-stream (API ControlID)
    let photoResult = null;
    if (user.photo) {
      try {
        const base64 = user.photo.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64, 'base64');
        const timestamp = Math.floor(Date.now() / 1000);
        photoResult = await devicePostBinary(
          reader_ip,
          `/user_set_image.fcgi?user_id=${numericId}&timestamp=${timestamp}&match=0&session=${sessionId}`,
          imageBuffer
        );
      } catch (photoErr) {
        console.warn(`Foto não enviada para user ${numericId}:`, photoErr.message);
        photoResult = { success: false, error: photoErr.message };
      }
    }

    const photoOk = !user.photo || (photoResult?.success === true);
    const photoErrors = (photoResult?.errors || []).map(e => e.message).join(', ') || photoResult?.error || null;

    res.json({
      success: true,
      action: userExists ? 'updated' : 'created',
      user_id: user.id,
      numeric_id: numericId,
      photo_success: photoOk,
      photo_errors: photoErrors,
      message: photoOk
        ? `Usuário ${userExists ? 'atualizado' : 'criado'} com sucesso no leitor`
        : `Usuário cadastrado, mas foto rejeitada: ${photoErrors}`,
    });

  } catch (err) {
    console.error('Erro ao sincronizar usuário:', err.message);
    res.status(500).json({ error: 'Erro ao sincronizar usuário: ' + err.message });
  }
});

// POST /api/vpn/sync-funcionarios — sync de funcionários de um leitor (por acesso)
router.post('/sync-funcionarios', authMiddleware, (req, res) => {
  const { reader_ip, acesso_id } = req.body;
  if (!reader_ip || !acesso_id) return res.status(400).json({ error: 'reader_ip e acesso_id são obrigatórios' });
  if (!reader_ip.match(/^10\.8\.0\.\d{1,3}$/)) return res.status(400).json({ error: 'IP VPN inválido' });

  res.json({ success: true, message: `Sincronização de funcionários iniciada para ${reader_ip}`, async: true });

  setImmediate(async () => {
    try {
      const { rows: cfgRows } = await pool.query('SELECT admin_login, admin_password FROM equipamentos_config WHERE id = 1');
      const adminLogin = cfgRows[0]?.admin_login || 'admin';
      const adminPassword = cfgRows[0]?.admin_password || 'admin';

      let loginData = await devicePost(reader_ip, '/login.fcgi', { login: adminLogin, password: adminPassword }, 5000);
      if (!loginData?.session && (adminLogin !== 'admin' || adminPassword !== 'admin')) {
        loginData = await devicePost(reader_ip, '/login.fcgi', { login: 'admin', password: 'admin' }, 5000);
      }
      const session = loginData?.session;
      if (!session) {
        await syslog('error', `sync-func/${reader_ip}`, 'Falha de autenticação no leitor', { ip: reader_ip }); return;
      }

      // Buscar funcionários vinculados a este acesso
      const { rows: dbFuncs } = await pool.query(`
        SELECT f.id, f.nome, f.userp_id, f.foto_base64
        FROM funcionarios f
        JOIN funcionario_acessos fa ON fa.funcionario_id = f.id
        WHERE fa.acesso_id = $1
      `, [acesso_id]);

      const toNumericId = (uuid) => parseInt(uuid.toString().replace(/-/g, '').substring(0, 8), 16) % 2000000000;
      const validNumericIds = new Set(dbFuncs.map(f => toNumericId(f.id)));

      // Buscar usuários no leitor para limpar os que não são mais válidos
      const readerUsersData = await devicePost(reader_ip, `/load_objects.fcgi?session=${session}`, { object: 'users' }, 10000);
      const readerUsers = readerUsersData?.users || [];

      // Buscar regra de acesso padrão
      const accessRulesData = await devicePost(reader_ip, `/load_objects.fcgi?session=${session}`, { object: 'access_rules' }, 5000);
      const accessRules = accessRulesData?.access_rules || [];
      const defaultRule = accessRules.find(r => r.type === 1) || accessRules[0];

      let synced = 0, photoErrors = [];
      for (const f of dbFuncs) {
        const numericId = toNumericId(f.id);
        // Prefixo FUN + userp_id como matrícula
        const registration = f.userp_id ? `FUN${f.userp_id}` : `FUN${numericId}`;
        const userData = { id: numericId, name: f.nome, registration, begin_time: 0, end_time: 0 };

        const exists = readerUsers.some(ru => ru.id === numericId);
        if (exists) {
          await devicePost(reader_ip, `/destroy_objects.fcgi?session=${session}`,
            { object: 'users', where: { users: { id: numericId } } }, 5000).catch(() => {});
        }
        await devicePost(reader_ip, `/create_objects.fcgi?session=${session}`,
          { object: 'users', values: [userData] }, 10000).catch(() => {});

        if (defaultRule) {
          const existing = await devicePost(reader_ip, `/load_objects.fcgi?session=${session}`,
            { object: 'user_access_rules', where: { user_access_rules: { user_id: numericId } } }, 5000);
          if (!(existing?.user_access_rules?.length > 0)) {
            await devicePost(reader_ip, `/create_objects.fcgi?session=${session}`,
              { object: 'user_access_rules', values: [{ user_id: numericId, access_rule_id: defaultRule.id }] }, 5000
            ).catch(() => {});
          }
        }

        if (f.foto_base64) {
          try {
            const base64 = f.foto_base64.replace(/^data:image\/[a-z]+;base64,/, '');
            const imgBuffer = Buffer.from(base64, 'base64');
            const ts = Math.floor(Date.now() / 1000);
            const pr = await devicePostBinary(reader_ip,
              `/user_set_image.fcgi?user_id=${numericId}&timestamp=${ts}&match=0&session=${session}`, imgBuffer);
            const erroMsgs = (pr?.errors || []).map(e => e.message).join(', ');
            if (pr?.success === false || erroMsgs) {
              photoErrors.push(`${f.nome}: ${erroMsgs || 'foto rejeitada'}`);
            }
          } catch (e) {
            photoErrors.push(`${f.nome}: ${e.message}`);
          }
        }
        synced++;
      }

      await syslog('info', `sync-func/${reader_ip}`, `Sync funcionários: ${synced} sincronizados`, { ip: reader_ip, synced });
    } catch (err) {
      await syslog('error', `sync-func/${reader_ip}`, 'Erro crítico no sync de funcionários', { ip: reader_ip, error: err.message });
    }
  });
});

module.exports = router;
