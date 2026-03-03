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
        // Criar configurações padrão se não existir
        const newSettings = await pool.query(`
          INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *
        `, [req.userId]);
        return res.json({ settings: newSettings.rows[0] });
      }

      // Ocultar tokens parcialmente
      const settings = result.rows[0];
      if (settings.brapi_token) {
        settings.brapi_token_masked = '****' + settings.brapi_token.slice(-4);
      }
      if (settings.alphavantage_key) {
        settings.alphavantage_key_masked = '****' + settings.alphavantage_key.slice(-4);
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
        alphavantageKey
      } = req.body;

      const result = await pool.query(`
        UPDATE user_settings SET
          rebalance_threshold = COALESCE($1, rebalance_threshold),
          investment_horizon = COALESCE($2, investment_horizon),
          risk_profile = COALESCE($3, risk_profile),
          monthly_contribution = COALESCE($4, monthly_contribution),
          brapi_token = COALESCE($5, brapi_token),
          alphavantage_key = COALESCE($6, alphavantage_key),
          updated_at = NOW()
        WHERE user_id = $7
        RETURNING *
      `, [
        rebalanceThreshold,
        investmentHorizon,
        riskProfile,
        monthlyContribution,
        brapiToken,
        alphavantageKey,
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
      const { format = 'json' } = req.query;

      // Buscar todos os dados do usuário
      const [classes, assets, transactions, history] = await Promise.all([
        pool.query('SELECT * FROM asset_classes WHERE user_id = $1', [req.userId]),
        pool.query('SELECT * FROM assets WHERE user_id = $1', [req.userId]),
        pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC', [req.userId]),
        pool.query('SELECT * FROM portfolio_history WHERE user_id = $1 ORDER BY date DESC', [req.userId])
      ]);

      const data = {
        exportDate: new Date().toISOString(),
        assetClasses: classes.rows,
        assets: assets.rows,
        transactions: transactions.rows,
        portfolioHistory: history.rows
      };

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=investment-advisor-export.json');
        return res.json(data);
      }

      // TODO: Implementar CSV se necessário

      return res.json(data);

    } catch (error) {
      console.error('Erro ao exportar dados:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Importar dados (backup)
  async importData(req, res) {
    const client = await pool.connect();
    
    try {
      const { data, overwrite = false } = req.body;

      if (!data || !data.assetClasses || !data.assets) {
        return res.status(400).json({ error: 'Dados de importação inválidos' });
      }

      await client.query('BEGIN');

      if (overwrite) {
        // Limpar dados existentes
        await client.query('DELETE FROM transactions WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM assets WHERE user_id = $1', [req.userId]);
        await client.query('DELETE FROM asset_classes WHERE user_id = $1', [req.userId]);
      }

      // Mapear IDs antigos para novos
      const classIdMap = {};

      // Importar classes
      for (const cls of data.assetClasses) {
        const result = await client.query(`
          INSERT INTO asset_classes (user_id, name, target_percentage, color, description, expected_yield)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (user_id, name) DO UPDATE SET
            target_percentage = EXCLUDED.target_percentage,
            color = EXCLUDED.color
          RETURNING id
        `, [req.userId, cls.name, cls.target_percentage, cls.color, cls.description, cls.expected_yield]);
        
        classIdMap[cls.id] = result.rows[0].id;
      }

      // Importar ativos
      const assetIdMap = {};
      for (const asset of data.assets) {
        const newClassId = classIdMap[asset.asset_class_id];
        if (!newClassId) continue;

        const result = await client.query(`
          INSERT INTO assets (user_id, asset_class_id, ticker, name, type, market, quantity, average_price, current_price, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (user_id, ticker) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            average_price = EXCLUDED.average_price
          RETURNING id
        `, [
          req.userId, newClassId, asset.ticker, asset.name, asset.type, asset.market,
          asset.quantity, asset.average_price, asset.current_price, asset.notes
        ]);

        assetIdMap[asset.id] = result.rows[0].id;
      }

      // Importar transações
      if (data.transactions) {
        for (const tx of data.transactions) {
          const newAssetId = assetIdMap[tx.asset_id];
          if (!newAssetId) continue;

          await client.query(`
            INSERT INTO transactions (user_id, asset_id, type, quantity, price, total, date, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [req.userId, newAssetId, tx.type, tx.quantity, tx.price, tx.total, tx.date, tx.notes]);
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
