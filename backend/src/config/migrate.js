const pool = require('./database');

async function runQuery(sql, label) {
  try {
    await pool.query(sql);
    // silent success
  } catch (e) {
    // Ignora "already exists" — são seguros
    if (e.message && (e.message.includes('already exists') || e.message.includes('duplicate'))) return;
    console.warn(`⚠️  [migrate] ${label || 'query'}: ${e.message}`);
  }
}

async function migrate() {
  console.log('🚀 Iniciando migrações...');

  // ─── Tabelas principais ────────────────────────────────────────────────────

  await runQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `, 'CREATE users');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      rebalance_threshold DECIMAL(5,2) DEFAULT 5,
      investment_horizon INTEGER DEFAULT 10,
      risk_profile VARCHAR(50) DEFAULT 'moderate',
      monthly_contribution DECIMAL(15,2) DEFAULT 0,
      brapi_token TEXT,
      alphavantage_key TEXT,
      groq_api_key TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `, 'CREATE user_settings');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS asset_classes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      target_percentage DECIMAL(5,2) DEFAULT 0,
      color VARCHAR(20) DEFAULT '#3B82F6',
      icon VARCHAR(50),
      category VARCHAR(50),
      description TEXT,
      expected_yield DECIMAL(5,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, name)
    )
  `, 'CREATE asset_classes');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      asset_class_id INTEGER REFERENCES asset_classes(id) ON DELETE CASCADE,
      ticker VARCHAR(20) NOT NULL,
      name VARCHAR(255),
      type VARCHAR(50),
      market VARCHAR(10) DEFAULT 'BR',
      currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
      quantity DECIMAL(20,8) DEFAULT 0,
      average_price DECIMAL(20,8) DEFAULT 0,
      current_price DECIMAL(20,8),
      dividend_yield DECIMAL(10,4),
      notes TEXT,
      fixed_income_type VARCHAR(50),
      indexer VARCHAR(20),
      rate DECIMAL(10,4),
      maturity_date DATE,
      issuer VARCHAR(100),
      sector VARCHAR(100),
      wallet_address TEXT,
      network VARCHAR(50),
      present_value DECIMAL(20,2),
      present_value_date DATE,
      extra_data JSONB,
      last_update TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, ticker)
    )
  `, 'CREATE assets');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
      type VARCHAR(10) NOT NULL,
      quantity DECIMAL(20,8) NOT NULL,
      price DECIMAL(20,8) NOT NULL,
      total DECIMAL(20,2) NOT NULL,
      date DATE NOT NULL,
      notes TEXT,
      average_cost_at_sale DECIMAL(20,8),
      realized_gain DECIMAL(20,2),
      realized_gain_percent DECIMAL(10,4),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `, 'CREATE transactions');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS dividends (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL DEFAULT 'DIVIDEND',
      amount DECIMAL(15,2) NOT NULL,
      payment_date DATE NOT NULL,
      ex_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `, 'CREATE dividends');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      target_value DECIMAL(20,2) NOT NULL,
      target_date DATE,
      monthly_contribution DECIMAL(15,2) DEFAULT 0,
      expected_yield DECIMAL(5,2) DEFAULT 10,
      color VARCHAR(20) DEFAULT '#10B981',
      is_completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `, 'CREATE goals');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS portfolio_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      total_value DECIMAL(20,2),
      total_invested DECIMAL(20,2),
      total_gain DECIMAL(20,2),
      gain_percentage DECIMAL(10,4),
      realized_gains DECIMAL(20,2),
      snapshot JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, date)
    )
  `, 'CREATE portfolio_history');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS macro_analysis (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      analysis_data JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `, 'CREATE macro_analysis');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS screener_filters (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      filters JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, name)
    )
  `, 'CREATE screener_filters');

  await runQuery(`
    CREATE TABLE IF NOT EXISTS quotes_cache (
      id SERIAL PRIMARY KEY,
      ticker VARCHAR(20) UNIQUE NOT NULL,
      market VARCHAR(10),
      price DECIMAL(20,8),
      change_percent DECIMAL(10,4),
      dividend_yield DECIMAL(10,4),
      data JSONB,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `, 'CREATE quotes_cache');

  // ─── Migrações incrementais (ADD COLUMN IF NOT EXISTS) ────────────────────
  console.log('📦 Verificando colunas adicionais...');

  const alterations = [
    // user_settings
    ["ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS groq_api_key TEXT", "user_settings.groq_api_key"],
    ["ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS brapi_token TEXT", "user_settings.brapi_token"],
    ["ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS alphavantage_key TEXT", "user_settings.alphavantage_key"],
    ["ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS rebalance_threshold DECIMAL(5,2) DEFAULT 5", "user_settings.rebalance_threshold"],
    ["ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS investment_horizon INTEGER DEFAULT 10", "user_settings.investment_horizon"],
    ["ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS risk_profile VARCHAR(50) DEFAULT 'moderate'", "user_settings.risk_profile"],
    ["ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS monthly_contribution DECIMAL(15,2) DEFAULT 0", "user_settings.monthly_contribution"],

    // asset_classes
    ["ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS icon VARCHAR(50)", "asset_classes.icon"],
    ["ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS category VARCHAR(50)", "asset_classes.category"],
    ["ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS description TEXT", "asset_classes.description"],
    ["ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#3B82F6'", "asset_classes.color"],
    ["ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS expected_yield DECIMAL(5,2) DEFAULT 0", "asset_classes.expected_yield"],

    // assets
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'BRL'", "assets.currency"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS fixed_income_type VARCHAR(50)", "assets.fixed_income_type"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS indexer VARCHAR(20)", "assets.indexer"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS rate DECIMAL(10,4)", "assets.rate"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS maturity_date DATE", "assets.maturity_date"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS issuer VARCHAR(100)", "assets.issuer"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS sector VARCHAR(100)", "assets.sector"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS wallet_address TEXT", "assets.wallet_address"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS network VARCHAR(50)", "assets.network"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS present_value DECIMAL(20,2)", "assets.present_value"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS present_value_date DATE", "assets.present_value_date"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS extra_data JSONB", "assets.extra_data"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS dividend_yield DECIMAL(10,4)", "assets.dividend_yield"],
    ["ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_update TIMESTAMP", "assets.last_update"],

    // transactions
    ["ALTER TABLE transactions ADD COLUMN IF NOT EXISTS average_cost_at_sale DECIMAL(20,8)", "transactions.average_cost_at_sale"],
    ["ALTER TABLE transactions ADD COLUMN IF NOT EXISTS realized_gain DECIMAL(20,2)", "transactions.realized_gain"],
    ["ALTER TABLE transactions ADD COLUMN IF NOT EXISTS realized_gain_percent DECIMAL(10,4)", "transactions.realized_gain_percent"],

    // dividends
    ["ALTER TABLE dividends ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'DIVIDEND'", "dividends.type"],
    ["ALTER TABLE dividends ADD COLUMN IF NOT EXISTS ex_date DATE", "dividends.ex_date"],
    ["ALTER TABLE dividends ADD COLUMN IF NOT EXISTS notes TEXT", "dividends.notes"],

    // portfolio_history
    ["ALTER TABLE portfolio_history ADD COLUMN IF NOT EXISTS realized_gains DECIMAL(20,2)", "portfolio_history.realized_gains"],

    // macro_analysis — coluna que pode não existir em bancos antigos
    ["ALTER TABLE macro_analysis ADD COLUMN IF NOT EXISTS analysis_data JSONB", "macro_analysis.analysis_data"],
  ];

  for (const [sql, label] of alterations) {
    await runQuery(sql, label);
  }

  // ─── Populações de dados padrão ───────────────────────────────────────────
  console.log('📊 Aplicando defaults de expected_yield...');
  await runQuery(`
    UPDATE asset_classes SET expected_yield = CASE
      WHEN category = 'fixed_income' AND (expected_yield IS NULL OR expected_yield = 0) THEN 11
      WHEN category = 'stocks_br'    AND (expected_yield IS NULL OR expected_yield = 0) THEN 6
      WHEN category = 'fiis'         AND (expected_yield IS NULL OR expected_yield = 0) THEN 8
      WHEN category = 'stocks_us'    AND (expected_yield IS NULL OR expected_yield = 0) THEN 3
      WHEN category = 'reits'        AND (expected_yield IS NULL OR expected_yield = 0) THEN 5
      WHEN category = 'crypto'       THEN 0
      ELSE expected_yield
    END
    WHERE expected_yield IS NULL OR (expected_yield = 0 AND category != 'crypto')
  `, 'UPDATE asset_classes expected_yield defaults');

  // ─── Índices ───────────────────────────────────────────────────────────────
  console.log('📇 Criando índices...');

  const indexes = [
    ["CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id)", "idx_assets_user"],
    ["CREATE INDEX IF NOT EXISTS idx_assets_class ON assets(asset_class_id)", "idx_assets_class"],
    ["CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)", "idx_transactions_user"],
    ["CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset_id)", "idx_transactions_asset"],
    ["CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)", "idx_transactions_date"],
    ["CREATE INDEX IF NOT EXISTS idx_dividends_user ON dividends(user_id)", "idx_dividends_user"],
    ["CREATE INDEX IF NOT EXISTS idx_dividends_date ON dividends(payment_date)", "idx_dividends_date"],
    ["CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id)", "idx_goals_user"],
    ["CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_date ON portfolio_history(user_id, date)", "idx_portfolio_history"],
    ["CREATE INDEX IF NOT EXISTS idx_macro_analysis_user ON macro_analysis(user_id, created_at)", "idx_macro_analysis"],
  ];

  for (const [sql, label] of indexes) {
    await runQuery(sql, label);
  }

  console.log('✅ Migrações concluídas com sucesso!');
}

module.exports = { migrate };