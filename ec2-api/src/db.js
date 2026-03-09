const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'youdodb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function initDb() {
  const client = await pool.connect();
  try {
    // Criar enum se não existir
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE app_role AS ENUM ('admin', 'operador');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // Criar tabelas
    await client.query(`
      CREATE TABLE IF NOT EXISTS empreendimentos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL,
        fase TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS acessos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL,
        empreendimento_id UUID NOT NULL REFERENCES empreendimentos(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS equipamentos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL,
        ip_vpn TEXT NOT NULL,
        modelo TEXT,
        firmware TEXT,
        serial TEXT,
        acesso_id UUID NOT NULL REFERENCES acessos(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL,
        acesso_id UUID NOT NULL REFERENCES acessos(id) ON DELETE CASCADE,
        userp_id TEXT,
        data_inicio TIMESTAMPTZ,
        data_fim TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE,
        email TEXT,
        display_name TEXT,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
        role app_role NOT NULL DEFAULT 'operador',
        UNIQUE(user_id, role)
      );
    `);

    // Criar trigger updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);

    const tables = ['empreendimentos', 'acessos', 'equipamentos', 'usuarios', 'profiles'];
    for (const t of tables) {
      await client.query(`
        DO $$ BEGIN
          CREATE TRIGGER update_${t}_updated_at
            BEFORE UPDATE ON ${t}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
      `);
    }

    // Criar admin se não existir
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const existing = await client.query('SELECT id FROM profiles WHERE email = $1', [adminEmail]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(adminPass, 10);
      const userId = (await client.query(
        `INSERT INTO profiles (user_id, email, display_name, password_hash)
         VALUES (gen_random_uuid(), $1, 'Admin', $2) RETURNING user_id`,
        [adminEmail, hash]
      )).rows[0].user_id;
      await client.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`,
        [userId]
      );
      console.log(`✅ Admin criado: ${adminEmail}`);
    }

    console.log('✅ Banco inicializado com sucesso');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
