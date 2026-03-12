const { pool } = require('./db');

async function syslog(level, origem, mensagem, detalhes = null) {
  try {
    await pool.query(
      'INSERT INTO system_logs (level, origem, mensagem, detalhes) VALUES ($1, $2, $3, $4)',
      [level, origem, mensagem, detalhes ? JSON.stringify(detalhes) : null]
    );
  } catch (e) {
    console.error('[syslog] Falha ao gravar log:', e.message);
  }
  // Sempre logar no console também
  const prefix = `[${level.toUpperCase()}][${origem}]`;
  if (level === 'error') console.error(prefix, mensagem, detalhes || '');
  else console.log(prefix, mensagem, detalhes || '');
}

module.exports = { syslog };
