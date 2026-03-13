const pool = require('../config/database');
const axios = require('axios');

// Garante que todas as colunas necessárias existem (auto-healing)
async function ensureColumns() {
  const alterations = [
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS groq_api_key TEXT",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS brapi_token TEXT",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS alphavantage_key TEXT",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS rebalance_threshold DECIMAL(5,2) DEFAULT 5",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS investment_horizon INTEGER DEFAULT 10",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS risk_profile VARCHAR(50) DEFAULT 'moderate'",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS monthly_contribution DECIMAL(15,2) DEFAULT 0",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS dividend_yield DECIMAL(10,4)",
    "ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_update TIMESTAMP",
    // Corrigir typo histórico: copiar grok_api_key -> groq_api_key onde groq está null
    `UPDATE user_settings SET groq_api_key = grok_api_key 
     WHERE grok_api_key IS NOT NULL AND grok_api_key != '' 
     AND (groq_api_key IS NULL OR groq_api_key = '')`,
    `CREATE TABLE IF NOT EXISTS quotes_cache (
      id SERIAL PRIMARY KEY,
      ticker VARCHAR(20) UNIQUE NOT NULL,
      market VARCHAR(10),
      price DECIMAL(20,8),
      change_percent DECIMAL(10,4),
      dividend_yield DECIMAL(10,4),
      data JSONB,
      updated_at TIMESTAMP DEFAULT NOW()
    )`
  ];
  for (const sql of alterations) {
    try { await pool.query(sql); } catch (e) { /* ignora */ }
  }
}

// Executa ao inicializar o módulo — corrige o banco automaticamente
ensureColumns().catch(e => console.error('ensureColumns error:', e.message));


class SettingsController {
  async getSettings(req, res) {
    try {
      let settings = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);

      if (settings.rows.length === 0) {
        await pool.query('INSERT INTO user_settings (user_id) VALUES ($1)', [req.userId]);
        settings = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);
      }

      const data = { ...settings.rows[0] };
      
      if (data.brapi_token) {
        data.brapi_token_masked = '••••' + data.brapi_token.slice(-4);
      }
      if (data.alphavantage_key) {
        data.alphavantage_key_masked = '••••' + data.alphavantage_key.slice(-4);
      }
      if (data.groq_api_key) {
        data.groq_api_key_masked = '••••' + data.groq_api_key.slice(-4);
      }

      return res.json({ settings: data });
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
      return res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  }

  async updateSettings(req, res) {
    try {
      const { 
        rebalanceThreshold, 
        investmentHorizon, 
        riskProfile, 
        monthlyContribution, 
        brapiToken, 
        alphavantageKey, 
        groqApiKey 
      } = req.body;

      // Verificar se já existe
      const existing = await pool.query('SELECT id FROM user_settings WHERE user_id = $1', [req.userId]);
      
      if (existing.rows.length === 0) {
        await pool.query(`
          INSERT INTO user_settings (user_id, rebalance_threshold, investment_horizon, risk_profile, monthly_contribution, brapi_token, alphavantage_key, groq_api_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          req.userId, 
          rebalanceThreshold || 5, 
          investmentHorizon || 10, 
          riskProfile || 'moderate', 
          monthlyContribution || 0, 
          brapiToken || null, 
          alphavantageKey || null, 
          groqApiKey || null
        ]);
      } else {
        // Update apenas os campos que foram enviados
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (rebalanceThreshold !== undefined) {
          updates.push(`rebalance_threshold = $${paramIndex++}`);
          values.push(rebalanceThreshold);
        }
        if (investmentHorizon !== undefined) {
          updates.push(`investment_horizon = $${paramIndex++}`);
          values.push(investmentHorizon);
        }
        if (riskProfile !== undefined) {
          updates.push(`risk_profile = $${paramIndex++}`);
          values.push(riskProfile);
        }
        if (monthlyContribution !== undefined) {
          updates.push(`monthly_contribution = $${paramIndex++}`);
          values.push(monthlyContribution);
        }
        if (brapiToken !== undefined) {
          updates.push(`brapi_token = $${paramIndex++}`);
          values.push(brapiToken || null);
        }
        if (alphavantageKey !== undefined) {
          updates.push(`alphavantage_key = $${paramIndex++}`);
          values.push(alphavantageKey || null);
        }
        if (groqApiKey !== undefined) {
          updates.push(`groq_api_key = $${paramIndex++}`);
          values.push(groqApiKey || null);
        }

        updates.push('updated_at = NOW()');
        values.push(req.userId);

        const query = `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`;
        await pool.query(query, values);
      }

      return res.json({ message: 'Configurações atualizadas com sucesso' });
    } catch (error) {
      console.error('Erro ao atualizar configurações:', error);
      return res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
  }

  async testApiConnection(req, res) {
    try {
      const { api, token } = req.body;
      
      if (!token) {
        return res.json({ success: false, message: 'Token não fornecido' });
      }

      let result = { success: false, message: 'API não reconhecida' };

      if (api === 'brapi') {
        try {
          const response = await axios.get(
            `https://brapi.dev/api/quote/PETR4?token=${token}`,
            { timeout: 15000 }
          );
          
          if (response.data?.results?.[0]?.regularMarketPrice) {
            const price = response.data.results[0].regularMarketPrice;
            result = { 
              success: true, 
              message: `Conexão OK! PETR4: R$ ${price.toFixed(2)}` 
            };
          } else {
            result = { success: false, message: 'Token inválido ou sem dados' };
          }
        } catch (e) {
          const msg = e.response?.data?.message || e.message;
          result = { success: false, message: `Erro Brapi: ${msg}` };
        }
      } 
      else if (api === 'alphavantage') {
        try {
          const response = await axios.get(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${token}`,
            { timeout: 15000 }
          );
          
          if (response.data?.['Global Quote']?.['05. price']) {
            const price = response.data['Global Quote']['05. price'];
            result = { 
              success: true, 
              message: `Conexão OK! AAPL: $ ${parseFloat(price).toFixed(2)}` 
            };
          } else if (response.data?.Note) {
            result = { success: false, message: 'Limite de requisições excedido' };
          } else {
            result = { success: false, message: 'API key inválida' };
          }
        } catch (e) {
          result = { success: false, message: `Erro Alpha Vantage: ${e.message}` };
        }
      } 
      else if (api === 'groq') {
        try {
          const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model: 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: 'Diga apenas: OK' }],
              max_tokens: 10,
              temperature: 0
            },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 15000
            }
          );
          
          if (response.data?.choices?.[0]?.message) {
            result = { success: true, message: 'Conexão OK! API Groq funcionando' };
          } else {
            result = { success: false, message: 'Resposta inválida' };
          }
        } catch (e) {
          const msg = e.response?.data?.error?.message || e.message;
          result = { success: false, message: `Erro Groq: ${msg}` };
        }
      }

      return res.json(result);
    } catch (error) {
      console.error('Erro ao testar API:', error);
      return res.status(500).json({ success: false, message: 'Erro interno' });
    }
  }

  async exportData(req, res) {
    try {
      const userId = req.userId;

      const [classes, assets, transactions, dividends, goals, settings] = await Promise.all([
        pool.query('SELECT * FROM asset_classes WHERE user_id = $1', [userId]),
        pool.query('SELECT * FROM assets WHERE user_id = $1', [userId]),
        pool.query('SELECT * FROM transactions WHERE user_id = $1', [userId]),
        pool.query('SELECT * FROM dividends WHERE user_id = $1', [userId]),
        pool.query('SELECT * FROM goals WHERE user_id = $1', [userId]),
        pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId])
      ]);

      const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        data: {
          classes: classes.rows,
          assets: assets.rows,
          transactions: transactions.rows,
          dividends: dividends.rows,
          goals: goals.rows,
          settings: settings.rows[0] || {}
        }
      };

      return res.json(exportData);
    } catch (error) {
      console.error('Erro ao exportar:', error);
      return res.status(500).json({ error: 'Erro ao exportar dados' });
    }
  }

  async importData(req, res) {
    const client = await pool.connect();
    
    try {
      const userId = req.userId;
      const { data, merge } = req.body;

      if (!data || !data.data) {
        return res.status(400).json({ error: 'Formato de dados inválido' });
      }

      await client.query('BEGIN');

      if (!merge) {
        await client.query('DELETE FROM dividends WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM assets WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM asset_classes WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM goals WHERE user_id = $1', [userId]);
      }

      const classIdMap = {};
      
      for (const cls of data.data.classes || []) {
        const result = await client.query(`
          INSERT INTO asset_classes (user_id, name, target_percentage, color, icon, category, description, expected_yield)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id, name) DO UPDATE SET
            target_percentage = EXCLUDED.target_percentage,
            color = EXCLUDED.color
          RETURNING id
        `, [userId, cls.name, cls.target_percentage, cls.color, cls.icon, cls.category, cls.description, cls.expected_yield]);
        classIdMap[cls.id] = result.rows[0].id;
      }

      const assetIdMap = {};
      
      for (const asset of data.data.assets || []) {
        const newClassId = classIdMap[asset.asset_class_id];
        if (!newClassId) continue;
        
        const result = await client.query(`
          INSERT INTO assets (user_id, asset_class_id, ticker, name, type, market, quantity, average_price, current_price, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (user_id, ticker) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            average_price = EXCLUDED.average_price,
            current_price = EXCLUDED.current_price
          RETURNING id
        `, [userId, newClassId, asset.ticker, asset.name, asset.type, asset.market, asset.quantity, asset.average_price, asset.current_price, asset.notes]);
        assetIdMap[asset.id] = result.rows[0].id;
      }

      for (const tx of data.data.transactions || []) {
        const newAssetId = assetIdMap[tx.asset_id];
        if (!newAssetId) continue;
        
        await client.query(`
          INSERT INTO transactions (user_id, asset_id, type, quantity, price, total, date, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [userId, newAssetId, tx.type, tx.quantity, tx.price, tx.total, tx.date, tx.notes]);
      }

      for (const div of data.data.dividends || []) {
        const newAssetId = assetIdMap[div.asset_id];
        if (!newAssetId) continue;
        
        await client.query(`
          INSERT INTO dividends (user_id, asset_id, type, amount, payment_date, ex_date, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [userId, newAssetId, div.type, div.amount, div.payment_date, div.ex_date, div.notes]);
      }

      for (const goal of data.data.goals || []) {
        await client.query(`
          INSERT INTO goals (user_id, name, target_value, target_date, monthly_contribution, expected_yield, color, is_completed)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [userId, goal.name, goal.target_value, goal.target_date, goal.monthly_contribution, goal.expected_yield, goal.color, goal.is_completed]);
      }

      await client.query('COMMIT');
      return res.json({ message: 'Dados importados com sucesso' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao importar:', error);
      return res.status(500).json({ error: 'Erro ao importar dados' });
    } finally {
      client.release();
    }
  }
}

module.exports = new SettingsController();