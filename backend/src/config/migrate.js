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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      );
    `);
    console.log('✅ Tabela asset_classes criada');

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
        quantity DECIMAL(15,6) NOT NULL DEFAULT 0,
        average_price DECIMAL(15,2) NOT NULL DEFAULT 0,
        current_price DECIMAL(15,2),
        last_dividend DECIMAL(15,4),
        dividend_yield DECIMAL(5,2),
        last_update TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, ticker)
      );
    `);
    console.log('✅ Tabela assets criada');

    // Tabela de transações
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabela transactions criada');

    // Tabela de histórico de portfólio (snapshots diários)
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

    console.log('\n🎉 Migração concluída com sucesso!');

  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrate;
