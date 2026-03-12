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
        acesso_id UUID REFERENCES acessos(id) ON DELETE SET NULL,
        userp_id TEXT,
        matricula TEXT,
        data_inicio TIMESTAMPTZ,
        data_fim TIMESTAMPTZ,
        foto_base64 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS usuario_acessos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        acesso_id UUID NOT NULL REFERENCES acessos(id) ON DELETE CASCADE,
        data_inicio TIMESTAMPTZ,
        data_fim TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(usuario_id, acesso_id)
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

      CREATE TABLE IF NOT EXISTS equipamentos_config (
        id INT PRIMARY KEY DEFAULT 1,
        logotipo TEXT,
        ntp_enabled BOOLEAN NOT NULL DEFAULT true,
        ntp_timezone TEXT NOT NULL DEFAULT 'UTC-3',
        admin_login TEXT NOT NULL DEFAULT 'admin',
        admin_password TEXT,
        menu_password TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
        role app_role NOT NULL DEFAULT 'operador',
        UNIQUE(user_id, role)
      );
    `);

    // Migrar colunas que podem não existir em bancos antigos
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS matricula TEXT;
        ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_base64 TEXT;
        ALTER TABLE usuarios ALTER COLUMN acesso_id DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;

      ALTER TABLE empreendimentos ADD COLUMN IF NOT EXISTS userp_id INTEGER;
      CREATE UNIQUE INDEX IF NOT EXISTS empreendimentos_userp_id_idx ON empreendimentos(userp_id) WHERE userp_id IS NOT NULL;

      ALTER TABLE acessos ADD COLUMN IF NOT EXISTS userp_id INTEGER;
      CREATE UNIQUE INDEX IF NOT EXISTS acessos_userp_id_idx ON acessos(userp_id) WHERE userp_id IS NOT NULL;

      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS userp_id INTEGER;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fone TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS vigencia_inicio DATE;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS vigencia_fim DATE;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deleted_by_sync BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS deleted_by_sync_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS usuario_acessos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        acesso_id UUID NOT NULL REFERENCES acessos(id) ON DELETE CASCADE,
        data_inicio TIMESTAMPTZ,
        data_fim TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(usuario_id, acesso_id)
      );

      INSERT INTO usuario_acessos (usuario_id, acesso_id, data_inicio, data_fim)
        SELECT id, acesso_id, data_inicio, data_fim FROM usuarios
        WHERE acesso_id IS NOT NULL
        ON CONFLICT (usuario_id, acesso_id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS system_logs (
        id BIGSERIAL PRIMARY KEY,
        level TEXT NOT NULL DEFAULT 'info',
        origem TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        detalhes JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS funcionarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL,
        userp_id INTEGER UNIQUE,
        foto_base64 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS funcionario_acessos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        funcionario_id UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
        acesso_id UUID NOT NULL REFERENCES acessos(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(funcionario_id, acesso_id)
      );

      INSERT INTO equipamentos_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

      DO $$ BEGIN
        ALTER TABLE equipamentos_config ADD COLUMN IF NOT EXISTS admin_login TEXT NOT NULL DEFAULT 'admin';
        ALTER TABLE equipamentos_config ADD COLUMN IF NOT EXISTS admin_password TEXT;
        ALTER TABLE equipamentos_config ADD COLUMN IF NOT EXISTS menu_password TEXT;
      END $$;
    `);

    // Criar trigger updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = now(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;
    `);

    const tables = ['empreendimentos', 'acessos', 'equipamentos', 'usuarios', 'profiles', 'funcionarios'];
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
