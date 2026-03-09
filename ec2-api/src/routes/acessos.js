const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, json_build_object('nome', e.nome) as empreendimentos
      FROM acessos a
      JOIN empreendimentos e ON a.empreendimento_id = e.id
      ORDER BY a.nome
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nome, empreendimento_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO acessos (nome, empreendimento_id) VALUES ($1, $2) RETURNING *',
      [nome, empreendimento_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nome, empreendimento_id } = req.body;
    const { rows } = await pool.query(
      'UPDATE acessos SET nome = $1, empreendimento_id = $2 WHERE id = $3 RETURNING *',
      [nome, empreendimento_id, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM acessos WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
