const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

    const result = await pool.query('SELECT * FROM profiles WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const roles = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [user.user_id]);
    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.user_id,
        email: user.email,
        display_name: user.display_name,
        roles: roles.rows.map(r => r.role),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register
router.post('/register', authMiddleware, async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO profiles (user_id, email, display_name, password_hash)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING user_id, email, display_name`,
      [email, display_name || email, hash]
    );
    const user = result.rows[0];
    await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [user.user_id, 'operador']);

    res.json({ user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT user_id, email, display_name FROM profiles WHERE user_id = $1', [req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    const roles = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.userId]);
    res.json({ ...result.rows[0], roles: roles.rows.map(r => r.role) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
