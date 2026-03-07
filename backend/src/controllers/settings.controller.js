const pool = require('../config/database');
const quotesService = require('../services/quotes.service');

class SettingsController {

  // Obter configurações
  async getSettings(req, res) {
    try {
      let settings = await pool.query(
        'SELECT * FROM user_settings WHERE user_id = $1',
        [req.userId]
      );

      if (settings.rows.length === 0) {
        // Criar configurações padrão
        await pool.query(`
          INSERT INTO user_settings (user_id) VALUES ($1)
        `, [req.userId]);

        settings = await pool.query(
          'SELECT * FROM user_settings WHERE user_id = $1',
          [req.userId]
        );
      }

      const data = settings.rows[0];

      // Mascarar API keys
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

  // Atualizar configurações
  async updateSettings(req, res) {
    try {
      const {
        rebalanceThreshold,
        investmentHorizon,
        riskProfile,
        monthlyContribution,
        brapiToken,
        alphavantageKey,
        grokApiKey
      } = req.body;

      const result = await pool.query(`
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
        RETURNING *
      `, [
        rebalanceThreshold,
        investmentHorizon,
        riskProfile,
        monthlyContribution,
        brapiToken,
        alphavantageKey,
        grokApiKey,
        req.userId
      ]);

      if (result.rows.length === 0) {
        // Se não existe, criar
        await pool.query(`
          INSERT INTO user_settings (user_id, rebalance_threshold, investment_horizon, risk_profile, monthly_contribution, brapi_token, alphavantage_key, groq_api_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [req.userId, rebalanceThreshold || 5, investmentHorizon || 10, riskProfile || 'moderate', monthlyContribution || 0, brapiToken, alphavantageKey, grokApiKey]);
      }

      return res.json({ message: 'Configurações atualizadas', settings: result.rows[0] });

    } catch (error) {
      console.error('Erro ao atualizar configurações:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Testar conexão com API
  async testApiConnection(req, res) {
    try {
      const { api, token } = req.body;
      let result = { success: false, message: 'API não reconhecida' };

      if (api === 'brapi') {
        const quote = await quotesService.getBRQuote('PETR4', token);
        if (quote && quote.price) {
          result = { success: true, message: `Conexão OK. PETR4: R$ ${quote.price}` };
        } else {
          result = { success: false, message: 'Não foi possível obter cotação. Verifique o token.' };
        }
      } else if (api === 'alphavantage') {
        const quote = await quotesService.getGlobalQuote('AAPL', token);
        if (quote && quote.price) {
          result = { success: true, message: `Conexão OK. AAPL: $ ${quote.price}` };
        } else {
          result = { success: false, message: 'Não foi possível obter cotação. Verifique a API key.' };
        }
      } else if (api === 'groq') {
        // Testar Groq API
        try {
          const fetch = (await import('node-fetch')).default;
          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama3-8b-8192',
              messages: [{ role: 'user', content: 'Responda apenas: OK' }],
              max_tokens: 10
            })
          });
          
          if (response.ok) {
            result = { success: true, message: 'Conexão com Groq OK!' };
          } else {
            const errorData = await response.json();
            console.error('Groq API Error:', errorData);
            result = { success: false, message: errorData.error?.message || 'Erro na autenticação' };
          }
        } catch (e) {
          console.error('Groq connection error:', e);
          result = { success: false, message: 'Erro ao conectar com Groq API: ' + e.message };
        }
      }

      return res.json(result);

    } catch (error) {
      console.error('Erro ao testar API:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // Exportar dados
  async exportData(req, res) {
    try {
      // Buscar classes
      const classes = await pool.query(
        'SELECT * FROM asset_classes WHERE user_id = $1',
        [req.userId]
      );

      // Buscar ativos
      const assets = await pool.query(
        'SELECT * FROM assets WHERE user_id = $1',
        [req.userId]
      );

      // Buscar transações
      const transactions = await pool.query(
        'SELECT * FROM transactions WHERE user_id = $1',
        [req.userId]
      );

      // Buscar dividendos
      const dividends = await pool.query(
        'SELECT * FROM dividends WHERE user_id = $1',
        [req.userId]
      );

      // Buscar metas
      const goals = await pool.query(
        'SELECT * FROM goals WHERE user_id = $1',
        [req.userId]
      );

      // Buscar configurações
      const settings = await pool.query(
        'SELECT rebalance_threshold, investment_horizon, risk_profile, monthly_contribution FROM user_settings WHERE user_id = $1',
        [req.userId]
      );

      const exportData = {
        exportDate: new Date().toISOString(),
        version: '2.0',
        classes: classes.rows,
        assets: assets.rows,
        transactions: transactions.rows,
        dividends: dividends.rows,
        goals: goals.rows,
        settings: settings.rows[0]
      };

      return res.json(exportData);

    } catch (error) {
      console.error('Erro ao exportar dados:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Importar dados
  async importData(req, res) {
    const client = await pool.connect();
    
    try {
      const { data, overwrite } = req.body;
      
      await client.query('BEGIN');

      if (overwrite) {
        // Limpar dados existentes
        await client.query('DELETE FROM transactions WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM dividends WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM goals WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM assets WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM asset_classes WHERE user_id = $1', [req.userId]);
      }

      const classIdMap = {};
      const assetIdMap = {};

      // Importar classes
      if (data.classes) {
        for (const cls of data.classes) {
          const result = await client.query(`
            INSERT INTO asset_classes (user_id, name, target_percentage, color, description, expected_yield, icon, category)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
          `, [req.userId, cls.name, cls.target_percentage, cls.color, cls.description, cls.expected_yield, cls.icon, cls.category]);
          
          classIdMap[cls.id] = result.rows[0].id;
        }
      }

      // Importar ativos
      if (data.assets) {
        for (const asset of data.assets) {
          const newClassId = classIdMap[asset.asset_class_id];
          if (!newClassId) continue;

          const result = await client.query(`
            INSERT INTO assets (user_id, asset_class_id, ticker, name, type, market, quantity, average_price, current_price, notes,
              fixed_income_type, indexer, rate, maturity_date, issuer, sector, wallet_address, network, present_value)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING id
          `, [
            req.userId, newClassId, asset.ticker, asset.name, asset.type, asset.market || 'BR',
            asset.quantity, asset.average_price, asset.current_price, asset.notes,
            asset.fixed_income_type, asset.indexer, asset.rate, asset.maturity_date,
            asset.issuer, asset.sector, asset.wallet_address, asset.network, asset.present_value
          ]);
          
          assetIdMap[asset.id] = result.rows[0].id;
        }
      }

      // Importar transações
      if (data.transactions) {
        for (const tx of data.transactions) {
          const newAssetId = assetIdMap[tx.asset_id];
          if (!newAssetId) continue;

          await client.query(`
            INSERT INTO transactions (user_id, asset_id, type, quantity, price, total, date, notes, average_cost_at_sale, realized_gain, realized_gain_percent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            req.userId, newAssetId, tx.type, tx.quantity, tx.price, tx.total, tx.date, tx.notes,
            tx.average_cost_at_sale, tx.realized_gain, tx.realized_gain_percent
          ]);
        }
      }

      // Importar dividendos
      if (data.dividends) {
        for (const div of data.dividends) {
          const newAssetId = assetIdMap[div.asset_id];
          if (!newAssetId) continue;

          await client.query(`
            INSERT INTO dividends (user_id, asset_id, type, amount, payment_date, ex_date, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [req.userId, newAssetId, div.type, div.amount, div.payment_date, div.ex_date, div.notes]);
        }
      }

      // Importar metas
      if (data.goals) {
        for (const goal of data.goals) {
          await client.query(`
            INSERT INTO goals (user_id, name, target_value, target_date, monthly_contribution, expected_yield, color, is_completed)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [req.userId, goal.name, goal.target_value, goal.target_date, goal.monthly_contribution, goal.expected_yield, goal.color, goal.is_completed]);
        }
      }

      // Importar configurações
      if (data.settings) {
        await client.query(`
          UPDATE user_settings SET
            rebalance_threshold = COALESCE($1, rebalance_threshold),
            investment_horizon = COALESCE($2, investment_horizon),
            risk_profile = COALESCE($3, risk_profile),
            monthly_contribution = COALESCE($4, monthly_contribution)
          WHERE user_id = $5
        `, [
          data.settings.rebalance_threshold,
          data.settings.investment_horizon,
          data.settings.risk_profile,
          data.settings.monthly_contribution,
          req.userId
        ]);
      }

      await client.query('COMMIT');

      return res.json({
        message: 'Dados importados com sucesso',
        imported: {
          classes: Object.keys(classIdMap).length,
          assets: Object.keys(assetIdMap).length,
          transactions: data.transactions?.length || 0,
          dividends: data.dividends?.length || 0,
          goals: data.goals?.length || 0
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao importar dados:', error);
      return res.status(500).json({ error: 'Erro ao importar dados: ' + error.message });
    } finally {
      client.release();
    }
  }
}

module.exports = new SettingsController();
