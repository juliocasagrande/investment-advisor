const pool = require('../config/database');

class SettingsController {

  // Obter configurações
  async getSettings(req, res) {
    try {
      const result = await pool.query(
        'SELECT * FROM user_settings WHERE user_id = $1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        const newSettings = await pool.query(`
          INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *
        `, [req.userId]);
        return res.json({ settings: newSettings.rows[0] });
      }

      const settings = result.rows[0];
      if (settings.brapi_token) {
        settings.brapi_token_masked = '****' + settings.brapi_token.slice(-4);
      }
      if (settings.alphavantage_key) {
        settings.alphavantage_key_masked = '****' + settings.alphavantage_key.slice(-4);
      }
      if (settings.groq_api_key) {
        settings.groq_api_key_masked = '****' + settings.groq_api_key.slice(-4);
      }

      return res.json({ settings });

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
        return res.status(404).json({ error: 'Configurações não encontradas' });
      }

      return res.json({ 
        message: 'Configurações atualizadas',
        settings: result.rows[0] 
      });

    } catch (error) {
      console.error('Erro ao atualizar configurações:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Testar conexão com APIs
  async testApiConnection(req, res) {
    try {
      const { api, token } = req.body;
      const quotesService = require('../services/quotes.service');

      let result = { success: false, message: '' };

      if (api === 'brapi') {
        const quote = await quotesService.getBrazilianQuote('PETR4', token);
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
              model: 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: 'Responda apenas: OK' }],
              max_tokens: 10
            })
          });
          
          if (response.ok) {
            result = { success: true, message: 'Conexão com Groq OK!' };
          } else {
            const error = await response.json();
            result = { success: false, message: error.error?.message || 'Erro na autenticação' };
          }
        } catch (e) {
          result = { success: false, message: 'Erro ao conectar com Groq API' };
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
      const [classes, assets, transactions, history, dividends, goals] = await Promise.all([
        pool.query('SELECT * FROM asset_classes WHERE user_id = $1', [req.userId]),
        pool.query('SELECT * FROM assets WHERE user_id = $1', [req.userId]),
        pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC', [req.userId]),
        pool.query('SELECT * FROM portfolio_history WHERE user_id = $1 ORDER BY date DESC', [req.userId]),
        pool.query('SELECT * FROM dividends WHERE user_id = $1 ORDER BY payment_date DESC', [req.userId]).catch(() => ({ rows: [] })),
        pool.query('SELECT * FROM goals WHERE user_id = $1', [req.userId]).catch(() => ({ rows: [] }))
      ]);

      const data = {
        exportDate: new Date().toISOString(),
        assetClasses: classes.rows,
        assets: assets.rows,
        transactions: transactions.rows,
        portfolioHistory: history.rows,
        dividends: dividends.rows,
        goals: goals.rows
      };

      res.setHeader('Content-Type', 'application/json');
      return res.json(data);

    } catch (error) {
      console.error('Erro ao exportar dados:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Importar dados
  async importData(req, res) {
    const client = await pool.connect();
    
    try {
      const { data, overwrite = false } = req.body;

      if (!data || !data.assetClasses || !data.assets) {
        return res.status(400).json({ error: 'Dados de importação inválidos' });
      }

      await client.query('BEGIN');

      if (overwrite) {
        await client.query('DELETE FROM dividends WHERE user_id = $1', [req.userId]).catch(() => {});
        await client.query('DELETE FROM transactions WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM assets WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM asset_classes WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM goals WHERE user_id = $1', [req.userId]).catch(() => {});
      }

      const classIdMap = {};

      for (const cls of data.assetClasses) {
        const result = await client.query(`
          INSERT INTO asset_classes (user_id, name, target_percentage, color, description, expected_yield, icon, category)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (user_id, name) DO UPDATE SET
            target_percentage = EXCLUDED.target_percentage,
            color = EXCLUDED.color
          RETURNING id
        `, [req.userId, cls.name, cls.target_percentage, cls.color, cls.description, cls.expected_yield, cls.icon, cls.category]);
        
        classIdMap[cls.id] = result.rows[0].id;
      }

      const assetIdMap = {};
      for (const asset of data.assets) {
        const newClassId = classIdMap[asset.asset_class_id];
        if (!newClassId) continue;

        const result = await client.query(`
          INSERT INTO assets (user_id, asset_class_id, ticker, name, type, market, quantity, average_price, current_price, notes,
            fixed_income_type, indexer, rate, maturity_date, issuer, sector, wallet_address, network, present_value)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (user_id, ticker) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            average_price = EXCLUDED.average_price
          RETURNING id
        `, [
          req.userId, newClassId, asset.ticker, asset.name, asset.type, asset.market,
          asset.quantity, asset.average_price, asset.current_price, asset.notes,
          asset.fixed_income_type, asset.indexer, asset.rate, asset.maturity_date, asset.issuer,
          asset.sector, asset.wallet_address, asset.network, asset.present_value
        ]);

        assetIdMap[asset.id] = result.rows[0].id;
      }

      if (data.transactions) {
        for (const tx of data.transactions) {
          const newAssetId = assetIdMap[tx.asset_id];
          if (!newAssetId) continue;

          await client.query(`
            INSERT INTO transactions (user_id, asset_id, type, quantity, price, total, date, notes, realized_gain, realized_gain_percent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [req.userId, newAssetId, tx.type, tx.quantity, tx.price, tx.total, tx.date, tx.notes, tx.realized_gain, tx.realized_gain_percent]);
        }
      }

      await client.query('COMMIT');

      return res.json({ 
        success: true, 
        message: 'Dados importados com sucesso',
        imported: {
          classes: Object.keys(classIdMap).length,
          assets: Object.keys(assetIdMap).length,
          transactions: data.transactions?.length || 0
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao importar dados:', error);
      return res.status(500).json({ error: 'Erro ao importar dados', details: error.message });
    } finally {
      client.release();
    }
  }
}

module.exports = new SettingsController();
