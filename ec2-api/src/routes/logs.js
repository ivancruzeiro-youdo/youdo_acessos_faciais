const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// GET /api/logs — listar logs com filtros
router.get('/', async (req, res) => {
  try {
    const { level, origem, limit = 200, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (level) { params.push(level); conditions.push(`level = $${params.length}`); }
    if (origem) { params.push(`%${origem}%`); conditions.push(`origem ILIKE $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const { rows } = await pool.query(
      `SELECT id, level, origem, mensagem, detalhes, created_at
       FROM system_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM system_logs ${where}`,
      params.slice(0, -2)
    );
    res.json({ logs: rows, total: parseInt(countRows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/logs — limpar todos os logs
router.delete('/', async (req, res) => {
  try {
    await pool.query('DELETE FROM system_logs');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
