const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT eq.*,
        json_build_object(
          'nome', a.nome,
          'empreendimentos', json_build_object('nome', e.nome)
        ) as acessos
      FROM equipamentos eq
      JOIN acessos a ON eq.acesso_id = a.id
      JOIN empreendimentos e ON a.empreendimento_id = e.id
      ORDER BY eq.nome
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nome, ip_vpn, acesso_id, modelo, firmware, serial } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO equipamentos (nome, ip_vpn, acesso_id, modelo, firmware, serial)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nome, ip_vpn, acesso_id, modelo || null, firmware || null, serial || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nome, ip_vpn, acesso_id, modelo, firmware, serial } = req.body;
    const { rows } = await pool.query(
      `UPDATE equipamentos SET nome=$1, ip_vpn=$2, acesso_id=$3, modelo=$4, firmware=$5, serial=$6
       WHERE id = $7 RETURNING *`,
      [nome, ip_vpn, acesso_id, modelo || null, firmware || null, serial || null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM equipamentos WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
