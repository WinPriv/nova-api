const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize database tables
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        auth_provider TEXT NOT NULL DEFAULT 'email',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        name TEXT NOT NULL,
        description TEXT,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
        amount DECIMAL NOT NULL,
        category_id UUID REFERENCES categories(id),
        sub_category_id UUID,
        date TIMESTAMPTZ NOT NULL,
        notes TEXT,
        attachment_url TEXT,
        source TEXT NOT NULL CHECK (source IN ('MANUAL', 'SMS_IMPORT')),
        sms_id UUID,
        version TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        category_id UUID NOT NULL REFERENCES categories(id),
        monthly_limit DECIMAL NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        version TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        data_type TEXT NOT NULL,
        local_id UUID NOT NULL,
        server_id UUID,
        sequence TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'SYNCED', 'CONFLICT')),
        last_attempt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sms_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        parsed_status TEXT NOT NULL CHECK (parsed_status IN ('PENDING', 'PARSED', 'REJECTED')),
        linked_transaction_id UUID REFERENCES transactions(id)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        type TEXT NOT NULL CHECK (type IN ('SYNC', 'REMINDER', 'ALERT')),
        message TEXT NOT NULL,
        read_flag BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
        theme TEXT NOT NULL CHECK (theme IN ('LIGHT', 'DARK')) DEFAULT 'LIGHT',
        notification_preferences JSONB DEFAULT '{"emails": true, "push": true}'::jsonb,
        sync_options JSONB DEFAULT '{"autoSync": true, "syncInterval": 300}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
      CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
      CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
    `);
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };