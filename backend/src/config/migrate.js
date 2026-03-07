const pool = require('./database');

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Iniciando migrações...');

    // Tabela de usuários
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabela de configurações do usuário
    await client.query(`
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
    `);

    // Tabela de classes de ativos
    await client.query(`
      CREATE TABLE IF NOT EXISTS asset_classes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        target_percentage DECIMAL(5,2) DEFAULT 0,
        color VARCHAR(20) DEFAULT '#3B82F6',
        icon VARCHAR(50),
        category VARCHAR(50),
        description TEXT,
        expected_yield DECIMAL(5,2) DEFAULT 10,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, name)
      )
    `);

    // Tabela de ativos
    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        asset_class_id INTEGER REFERENCES asset_classes(id) ON DELETE CASCADE,
        ticker VARCHAR(20) NOT NULL,
        name VARCHAR(255),
        type VARCHAR(50),
        market VARCHAR(10) DEFAULT 'BR',
        quantity DECIMAL(20,8) DEFAULT 0,
        average_price DECIMAL(20,8) DEFAULT 0,
        current_price DECIMAL(20,8),
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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, ticker)
      )
    `);

    // Tabela de transações
    await client.query(`
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
    `);

    // Tabela de dividendos
    await client.query(`
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
    `);

    // Tabela de metas
    await client.query(`
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
    `);

    // Tabela de histórico do portfólio
    await client.query(`
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
    `);

    // Tabela de cache de análise macro
    await client.query(`
      CREATE TABLE IF NOT EXISTS macro_analysis (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        analysis_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Migrações incrementais - adicionar colunas se não existirem
    console.log('📦 Verificando colunas adicionais...');

    const alterations = [
      // user_settings
      "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS groq_api_key TEXT",
      
      // asset_classes
      "ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS icon VARCHAR(50)",
      "ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS category VARCHAR(50)",
      
      // assets
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS fixed_income_type VARCHAR(50)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS indexer VARCHAR(20)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS rate DECIMAL(10,4)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS maturity_date DATE",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS issuer VARCHAR(100)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS sector VARCHAR(100)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS wallet_address TEXT",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS network VARCHAR(50)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS present_value DECIMAL(20,2)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS present_value_date DATE",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS extra_data JSONB",
      
      // transactions
      "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS average_cost_at_sale DECIMAL(20,8)",
      "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS realized_gain DECIMAL(20,2)",
      "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS realized_gain_percent DECIMAL(10,4)",
      
      // portfolio_history
      "ALTER TABLE portfolio_history ADD COLUMN IF NOT EXISTS realized_gains DECIMAL(20,2)"
    ];

    for (const sql of alterations) {
      try {
        await client.query(sql);
      } catch (e) {
        // Ignora erros de coluna já existente
        if (!e.message.includes('already exists')) {
          console.warn('Aviso:', e.message);
        }
      }
    }

    // Criar índices
    console.log('📇 Criando índices...');
    
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_assets_class ON assets(asset_class_id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset_id)",
      "CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)",
      "CREATE INDEX IF NOT EXISTS idx_dividends_user ON dividends(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_dividends_date ON dividends(payment_date)",
      "CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id)",
      "CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_date ON portfolio_history(user_id, date)",
      "CREATE INDEX IF NOT EXISTS idx_macro_analysis_user ON macro_analysis(user_id, created_at)"
    ];

    for (const sql of indexes) {
      try {
        await client.query(sql);
      } catch (e) {
        // Ignora erros de índice já existente
      }
    }

    console.log('✅ Migrações concluídas com sucesso!');

  } catch (error) {
    console.error('❌ Erro nas migrações:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { migrate };
