const pool = require('./database');

const migrate = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Iniciando migração do banco de dados...');

    // Tabela de usuários
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabela users criada');

    // Tabela de classes de ativos
    await client.query(`
      CREATE TABLE IF NOT EXISTS asset_classes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        target_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
        color VARCHAR(7) DEFAULT '#3B82F6',
        description TEXT,
        expected_yield DECIMAL(5,2),
        icon VARCHAR(50) DEFAULT 'Wallet',
        category VARCHAR(50) DEFAULT 'other',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      );
    `);
    console.log('✅ Tabela asset_classes criada');

    // Tabela de ativos com campos expandidos
    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        asset_class_id INTEGER REFERENCES asset_classes(id) ON DELETE CASCADE,
        ticker VARCHAR(20) NOT NULL,
        name VARCHAR(255),
        type VARCHAR(50),
        market VARCHAR(10) DEFAULT 'BR',
        quantity DECIMAL(15,6) NOT NULL DEFAULT 0,
        average_price DECIMAL(15,2) NOT NULL DEFAULT 0,
        current_price DECIMAL(15,2),
        last_dividend DECIMAL(15,4),
        dividend_yield DECIMAL(5,2),
        last_update TIMESTAMP,
        notes TEXT,
        -- Campos específicos para Renda Fixa
        fixed_income_type VARCHAR(50),
        indexer VARCHAR(20),
        rate DECIMAL(8,4),
        maturity_date DATE,
        issuer VARCHAR(255),
        -- Campos específicos para FIIs/REITs
        sector VARCHAR(100),
        -- Campos específicos para Cripto
        wallet_address VARCHAR(255),
        network VARCHAR(50),
        -- Campos para valor presente
        present_value DECIMAL(15,2),
        present_value_date TIMESTAMP,
        -- Metadados
        extra_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, ticker)
      );
    `);
    console.log('✅ Tabela assets criada');

    // Tabela de transações com lucro/prejuízo realizado
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL,
        quantity DECIMAL(15,6) NOT NULL,
        price DECIMAL(15,2) NOT NULL,
        total DECIMAL(15,2) NOT NULL,
        date DATE NOT NULL,
        notes TEXT,
        average_cost_at_sale DECIMAL(15,2),
        realized_gain DECIMAL(15,2),
        realized_gain_percent DECIMAL(8,4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabela transactions criada');

    // Tabela de histórico de portfólio
    await client.query(`
      CREATE TABLE IF NOT EXISTS portfolio_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        total_value DECIMAL(15,2) NOT NULL,
        total_invested DECIMAL(15,2) NOT NULL,
        total_gain DECIMAL(15,2) NOT NULL,
        gain_percentage DECIMAL(8,4),
        monthly_income DECIMAL(15,2),
        realized_gains DECIMAL(15,2) DEFAULT 0,
        snapshot JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      );
    `);
    console.log('✅ Tabela portfolio_history criada');

    // Tabela de configurações do usuário
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        rebalance_threshold DECIMAL(5,2) DEFAULT 5.00,
        investment_horizon INTEGER DEFAULT 10,
        risk_profile VARCHAR(20) DEFAULT 'moderate',
        monthly_contribution DECIMAL(15,2) DEFAULT 0,
        brapi_token VARCHAR(255),
        alphavantage_key VARCHAR(255),
        grok_api_key VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabela user_settings criada');

    // Tabela de sugestões/recomendações
    await client.query(`
      CREATE TABLE IF NOT EXISTS recommendations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        title VARCHAR(255) NOT NULL,
        description TEXT,
        action_data JSONB,
        is_read BOOLEAN DEFAULT FALSE,
        is_dismissed BOOLEAN DEFAULT FALSE,
        source VARCHAR(50) DEFAULT 'system',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      );
    `);
    console.log('✅ Tabela recommendations criada');

    // Tabela de cotações em cache
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotes_cache (
        id SERIAL PRIMARY KEY,
        ticker VARCHAR(20) UNIQUE NOT NULL,
        market VARCHAR(10) NOT NULL,
        price DECIMAL(15,2),
        change_percent DECIMAL(8,4),
        dividend_yield DECIMAL(8,4),
        last_dividend DECIMAL(15,4),
        pe_ratio DECIMAL(10,2),
        market_cap DECIMAL(20,2),
        data JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabela quotes_cache criada');

    // Tabela para análises de cenário macro
    await client.query(`
      CREATE TABLE IF NOT EXISTS macro_analysis (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        analysis_date DATE NOT NULL,
        scenarios JSONB NOT NULL,
        allocation_suggestion JSONB,
        summary TEXT,
        source VARCHAR(50) DEFAULT 'grok',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, analysis_date)
      );
    `);
    console.log('✅ Tabela macro_analysis criada');

    // Índices para performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id);
      CREATE INDEX IF NOT EXISTS idx_assets_ticker ON assets(ticker);
      CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_date ON portfolio_history(user_id, date);
      CREATE INDEX IF NOT EXISTS idx_recommendations_user ON recommendations(user_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_cache_ticker ON quotes_cache(ticker);
    `);
    console.log('✅ Índices criados');

    // Adicionar colunas se não existirem (para migração de bancos existentes)
    const alterStatements = [
      "ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT 'Wallet'",
      "ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'other'",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS fixed_income_type VARCHAR(50)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS indexer VARCHAR(20)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS rate DECIMAL(8,4)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS maturity_date DATE",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS issuer VARCHAR(255)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS sector VARCHAR(100)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(255)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS network VARCHAR(50)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS present_value DECIMAL(15,2)",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS present_value_date TIMESTAMP",
      "ALTER TABLE assets ADD COLUMN IF NOT EXISTS extra_data JSONB",
      "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS average_cost_at_sale DECIMAL(15,2)",
      "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS realized_gain DECIMAL(15,2)",
      "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS realized_gain_percent DECIMAL(8,4)",
      "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS grok_api_key VARCHAR(255)",
      "ALTER TABLE portfolio_history ADD COLUMN IF NOT EXISTS realized_gains DECIMAL(15,2) DEFAULT 0",
      "ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'system'"
    ];

    for (const stmt of alterStatements) {
      try {
        await client.query(stmt);
      } catch (e) {
        // Ignora erros de coluna já existente
      }
    }
    console.log('✅ Colunas adicionais verificadas');

    console.log('\n🎉 Migração concluída com sucesso!');

  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrate;
