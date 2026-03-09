const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.*,
        json_build_object(
          'nome', a.nome,
          'empreendimentos', json_build_object('nome', e.nome)
        ) as acessos
      FROM usuarios u
      JOIN acessos a ON u.acesso_id = a.id
      JOIN empreendimentos e ON a.empreendimento_id = e.id
      ORDER BY u.nome
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nome, acesso_id, userp_id, data_inicio, data_fim } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, acesso_id, userp_id, data_inicio, data_fim)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nome, acesso_id, userp_id || null, data_inicio || null, data_fim || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nome, acesso_id, userp_id, data_inicio, data_fim } = req.body;
    const { rows } = await pool.query(
      `UPDATE usuarios SET nome=$1, acesso_id=$2, userp_id=$3, data_inicio=$4, data_fim=$5
       WHERE id = $6 RETURNING *`,
      [nome, acesso_id, userp_id || null, data_inicio || null, data_fim || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
