const pool = require('../config/database');
const axios = require('axios');

class SettingsController {
  async getSettings(req, res) {
    try {
      let settings = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);

      if (settings.rows.length === 0) {
        await pool.query('INSERT INTO user_settings (user_id) VALUES ($1)', [req.userId]);
        settings = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);
      }

      const data = { ...settings.rows[0] };
      
      // Mascarar tokens
      if (data.brapi_token) {
        data.brapi_token_masked = '****' + data.brapi_token.slice(-4);
      }
      if (data.alphavantage_key) {
        data.alphavantage_key_masked = '****' + data.alphavantage_key.slice(-4);
      }
      if (data.groq_api_key) {
        data.groq_api_key_masked = '****' + data.groq_api_key.slice(-4);
      }

      return res.json({ settings: data });
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
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
          brapiToken, 
          alphavantageKey, 
          groqApiKey
        ]);
      } else {
        await pool.query(`
          UPDATE user_settings SET
            rebalance_threshold = COALESCE($1, rebalance_threshold),
            investment_horizon = COALESCE($2, investment_horizon),
            risk_profile = COALESCE($3, risk_profile),
            monthly_contribution = COALESCE($4, monthly_contribution),
            brapi_token = COALESCE($5, brapi_token),
            alphavantage_key = COALESCE($6, alphavantage_key),
            groq_api_key = COALESCE($7, groq_api_key),
            updated_at = NOW()
          WHERE user_id = $8
        `, [
          rebalanceThreshold, 
          investmentHorizon, 
          riskProfile, 
          monthlyContribution, 
          brapiToken, 
          alphavantageKey, 
          groqApiKey, 
          req.userId
        ]);
      }

      return res.json({ message: 'Configurações atualizadas com sucesso' });
    } catch (error) {
      console.error('Erro ao atualizar configurações:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
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
              model: 'llama3-8b-8192',
              messages: [{ role: 'user', content: 'Diga apenas: OK' }],
              max_tokens: 10,
              temperature: 0
            },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 20000
            }
          );
          
          if (response.data?.choices?.[0]?.message) {
            result = { success: true, message: 'Conexão com Groq OK!' };
          } else {
            result = { success: false, message: 'Resposta inesperada do Groq' };
          }
        } catch (e) {
          const errorMsg = e.response?.data?.error?.message || e.message;
          result = { success: false, message: `Erro Groq: ${errorMsg}` };
        }
      }

      return res.json(result);
    } catch (error) {
      console.error('Erro ao testar API:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async exportData(req, res) {
    try {
      const [classes, assets, transactions, dividends, goals, settings] = await Promise.all([
        pool.query('SELECT * FROM asset_classes WHERE user_id = $1', [req.userId]),
        pool.query('SELECT * FROM assets WHERE user_id = $1', [req.userId]),
        pool.query('SELECT * FROM transactions WHERE user_id = $1', [req.userId]),
        pool.query('SELECT * FROM dividends WHERE user_id = $1', [req.userId]),
        pool.query('SELECT * FROM goals WHERE user_id = $1', [req.userId]),
        pool.query('SELECT rebalance_threshold, investment_horizon, risk_profile, monthly_contribution FROM user_settings WHERE user_id = $1', [req.userId])
      ]);

      return res.json({
        exportDate: new Date().toISOString(),
        version: '2.0',
        classes: classes.rows,
        assets: assets.rows,
        transactions: transactions.rows,
        dividends: dividends.rows,
        goals: goals.rows,
        settings: settings.rows[0] || {}
      });
    } catch (error) {
      console.error('Erro ao exportar dados:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async importData(req, res) {
    const client = await pool.connect();
    try {
      const { data, overwrite } = req.body;
      
      if (!data) {
        return res.status(400).json({ error: 'Dados não fornecidos' });
      }

      await client.query('BEGIN');

      if (overwrite) {
        await client.query('DELETE FROM transactions WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM dividends WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM goals WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM assets WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM asset_classes WHERE user_id = $1', [req.userId]);
      }

      // Importar dados aqui se necessário...

      await client.query('COMMIT');
      return res.json({ message: 'Dados importados com sucesso' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao importar dados:', error);
      return res.status(500).json({ error: 'Erro ao importar dados' });
    } finally {
      client.release();
    }
  }
}

module.exports = new SettingsController();
