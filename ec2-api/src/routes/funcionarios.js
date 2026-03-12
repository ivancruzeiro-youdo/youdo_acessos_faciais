const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/funcionarios — lista funcionários locais com acessos vinculados
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.id, f.nome, f.userp_id, f.foto_base64 IS NOT NULL AS tem_foto, f.created_at,
             COALESCE(json_agg(
               json_build_object('id', a.id, 'nome', a.nome, 'empreendimento', e.nome)
               ORDER BY e.nome, a.nome
             ) FILTER (WHERE a.id IS NOT NULL), '[]') AS acessos
      FROM funcionarios f
      LEFT JOIN funcionario_acessos fa ON fa.funcionario_id = f.id
      LEFT JOIN acessos a ON a.id = fa.acesso_id
      LEFT JOIN empreendimentos e ON e.id = a.empreendimento_id
      GROUP BY f.id
      ORDER BY f.nome
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/funcionarios/import — importa/atualiza funcionário do Userp
router.post('/import', async (req, res) => {
  try {
    const { userp_id, nome, foto_base64 } = req.body;
    if (!userp_id || !nome) return res.status(400).json({ error: 'userp_id e nome obrigatórios' });

    const { rows } = await pool.query('SELECT id FROM funcionarios WHERE userp_id = $1', [userp_id]);
    if (rows.length > 0) {
      const updateFields = foto_base64
        ? 'nome=$1, foto_base64=$2, updated_at=now()'
        : 'nome=$1, updated_at=now()';
      const params = foto_base64 ? [nome, foto_base64, rows[0].id] : [nome, rows[0].id];
      await pool.query(`UPDATE funcionarios SET ${updateFields} WHERE id=$${params.length}`, params);
      return res.json({ action: 'updated', id: rows[0].id });
    }
    const { rows: ins } = await pool.query(
      'INSERT INTO funcionarios (nome, userp_id, foto_base64) VALUES ($1,$2,$3) RETURNING id',
      [nome, userp_id, foto_base64 || null]
    );
    res.json({ action: 'inserted', id: ins[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/funcionarios/:id — remove funcionário local
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM funcionarios WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/funcionarios/:id/foto — retorna foto base64
router.get('/:id/foto', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT foto_base64 FROM funcionarios WHERE id=$1', [req.params.id]);
    if (!rows.length || !rows[0].foto_base64) return res.status(404).json({ error: 'Foto não encontrada' });
    res.json({ foto_base64: rows[0].foto_base64 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/funcionarios/:id/foto — salva foto localmente
router.put('/:id/foto', async (req, res) => {
  try {
    const { foto_base64 } = req.body;
    if (!foto_base64) return res.status(400).json({ error: 'foto_base64 obrigatório' });
    await pool.query('UPDATE funcionarios SET foto_base64=$1, updated_at=now() WHERE id=$2', [foto_base64, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/funcionarios/:id/acessos — vincula acesso
router.post('/:id/acessos', async (req, res) => {
  try {
    const { acesso_id } = req.body;
    if (!acesso_id) return res.status(400).json({ error: 'acesso_id obrigatório' });
    await pool.query(
      'INSERT INTO funcionario_acessos (funcionario_id, acesso_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.params.id, acesso_id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/funcionarios/:id/acessos/:acesso_id — desvincula acesso
router.delete('/:id/acessos/:acesso_id', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM funcionario_acessos WHERE funcionario_id=$1 AND acesso_id=$2',
      [req.params.id, req.params.acesso_id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
