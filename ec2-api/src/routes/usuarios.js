const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function getUserpBase() {
  return process.env.USERP_BASE_URL || 'https://homologa.userpweb.youdobrasil.com.br';
}

// GET /api/usuarios — lista usuários com todos os seus acessos
// Query params: ?status=active (padrão) | deleted | all
router.get('/', async (req, res) => {
  try {
    const status = req.query.status || 'active';
    let whereClause = '';
    if (status === 'active')  whereClause = 'WHERE u.deleted_by_sync = false';
    if (status === 'deleted') whereClause = 'WHERE u.deleted_by_sync = true';
    // 'all' = sem filtro

    const { rows } = await pool.query(`
      SELECT u.id, u.nome, u.matricula, u.foto_base64, u.created_at,
             u.deleted_by_sync, u.deleted_by_sync_at, u.userp_id,
        COALESCE(
          json_agg(
            json_build_object(
              'id', a.id,
              'nome', a.nome,
              'data_inicio', ua.data_inicio,
              'data_fim', ua.data_fim,
              'empreendimento', e.nome
            ) ORDER BY a.nome
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'
        ) AS acessos
      FROM usuarios u
      LEFT JOIN usuario_acessos ua ON ua.usuario_id = u.id
      LEFT JOIN acessos a ON a.id = ua.acesso_id
      LEFT JOIN empreendimentos e ON e.id = a.empreendimento_id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.nome
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/usuarios — cria usuário com N acessos
// Body: { nome, matricula, foto_base64, acessos: [{acesso_id, data_inicio, data_fim}] }
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { nome, matricula, foto_base64, acessos = [] } = req.body;
    const { rows } = await client.query(
      `INSERT INTO usuarios (nome, matricula, foto_base64) VALUES ($1, $2, $3) RETURNING *`,
      [nome, matricula || null, foto_base64 || null]
    );
    const usuario = rows[0];
    for (const a of acessos) {
      await client.query(
        `INSERT INTO usuario_acessos (usuario_id, acesso_id, data_inicio, data_fim) VALUES ($1, $2, $3, $4)
         ON CONFLICT (usuario_id, acesso_id) DO UPDATE SET data_inicio=$3, data_fim=$4`,
        [usuario.id, a.acesso_id, a.data_inicio || null, a.data_fim || null]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(usuario);
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// PUT /api/usuarios/:id — atualiza usuário (patch parcial: só atualiza campos enviados)
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { nome, matricula, foto_base64, acessos } = req.body;

    // Construir SET dinâmico — só atualiza campos presentes no body
    const sets = ['updated_at=now()'];
    const vals = [];
    let idx = 1;
    if (nome !== undefined)        { sets.push(`nome=$${idx++}`);        vals.push(nome); }
    if (matricula !== undefined)   { sets.push(`matricula=$${idx++}`);   vals.push(matricula || null); }
    if (foto_base64 !== undefined) { sets.push(`foto_base64=$${idx++}`); vals.push(foto_base64 || null); }
    vals.push(req.params.id);

    const { rows } = await client.query(
      `UPDATE usuarios SET ${sets.join(', ')} WHERE id=$${idx} RETURNING *`,
      vals
    );
    if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Não encontrado' }); }

    // Só substitui acessos se o campo foi enviado explicitamente
    if (acessos !== undefined) {
      const novosIds = acessos.map(a => a.acesso_id);
      if (novosIds.length > 0) {
        await client.query(
          `DELETE FROM usuario_acessos WHERE usuario_id=$1 AND acesso_id != ALL($2::uuid[])`,
          [req.params.id, novosIds]
        );
      } else {
        await client.query(`DELETE FROM usuario_acessos WHERE usuario_id=$1`, [req.params.id]);
      }
      for (const a of acessos) {
        await client.query(
          `INSERT INTO usuario_acessos (usuario_id, acesso_id, data_inicio, data_fim) VALUES ($1, $2, $3, $4)
           ON CONFLICT (usuario_id, acesso_id) DO UPDATE SET data_inicio=$3, data_fim=$4`,
          [req.params.id, a.acesso_id, a.data_inicio || null, a.data_fim || null]
        );
      }
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

// POST /api/usuarios/:id/sync-foto — envia foto para o sistema Userp-Satélite
router.post('/:id/sync-foto', async (req, res) => {
  const { email, senha, userp_base_url } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email e senha obrigatórios' });

  try {
    // Buscar usuário local
    const { rows } = await pool.query(
      `SELECT userp_id, matricula, foto_base64 FROM usuarios WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { foto_base64 } = rows[0];
    // userp_id é a matrícula — usar userp_id se existir, senão matricula
    const userp_id = rows[0].userp_id || rows[0].matricula;
    if (!userp_id) return res.status(400).json({ error: 'Usuário não possui matrícula/userp_id — não é possível identificar no Userp' });
    if (!foto_base64) return res.status(400).json({ error: 'Usuário não possui foto cadastrada' });

    // Remover prefixo data URI se existir — API aceita apenas base64 pura
    const base64Pura = foto_base64.replace(/^data:image\/[a-z]+;base64,/i, '');

    const USERP_BASE = getUserpBase(userp_base_url);

    // Obter token
    const authRes = await fetch(`${USERP_BASE}/api/userp-satelite/auth/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
      signal: AbortSignal.timeout(10000),
    });
    const authData = await authRes.json();
    if (!authRes.ok) throw new Error(authData.message || 'Falha na autenticação');

    // Enviar foto
    const fotoRes = await fetch(`${USERP_BASE}/api/userp-satelite/usuarios/update-foto.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ usuario_id: userp_id, usuario_foto: base64Pura }),
      signal: AbortSignal.timeout(15000),
    });
    const fotoData = await fotoRes.json();
    if (!fotoRes.ok) throw new Error(fotoData.message || 'Erro ao enviar foto para o Userp');

    res.json({ success: true, message: 'Foto sincronizada com sucesso no sistema Userp' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
