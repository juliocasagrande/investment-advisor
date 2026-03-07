const pool = require('../config/database');
const rebalanceService = require('../services/rebalance.service');
const macroService = require('../services/macro.service');
const quotesService = require('../services/quotes.service');

class PortfolioController {
  async getDashboard(req, res) {
    try {
      const userId = req.userId;
      
      // Calcular alocação
      const allocation = await rebalanceService.calculateAllocation(userId);
      
      // Calcular renda passiva
      const passiveIncome = await rebalanceService.calculatePassiveIncome(userId);
      
      // Última atualização
      const lastUpdateResult = await pool.query(
        'SELECT MAX(updated_at) as last_update FROM assets WHERE user_id = $1',
        [userId]
      );

      // Histórico
      const historyResult = await pool.query(`
        SELECT date, total_value, total_invested FROM portfolio_history 
        WHERE user_id = $1 ORDER BY date DESC LIMIT 30
      `, [userId]);

      // Gerar sugestões de rebalanceamento
      const suggestions = await rebalanceService.generateRebalanceSuggestions(userId);

      return res.json({
        summary: {
          totalValue: allocation.totalValue || 0,
          totalInvested: allocation.totalInvested || 0,
          totalGain: allocation.totalGain || 0,
          gainPercentage: Math.round((allocation.gainPercentage || 0) * 100) / 100,
          monthlyIncome: passiveIncome.totalMonthly || 0,
          annualIncome: passiveIncome.totalAnnual || 0,
          lastUpdate: lastUpdateResult.rows[0]?.last_update
        },
        allocation: allocation.allocation || [],
        passiveIncome: passiveIncome.breakdown || [],
        suggestions: suggestions || [],
        history: historyResult.rows.reverse()
      });
    } catch (error) {
      console.error('Erro ao buscar dashboard:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getAllocation(req, res) {
    try {
      const allocation = await rebalanceService.calculateAllocation(req.userId);
      return res.json(allocation);
    } catch (error) {
      console.error('Erro ao buscar alocação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async syncQuotes(req, res) {
    const startTime = Date.now();
    try {
      const userId = req.userId;
      
      // Buscar tokens do usuário
      const settings = await pool.query(
        'SELECT brapi_token, alphavantage_key FROM user_settings WHERE user_id = $1',
        [userId]
      );
      
      const brapiToken = settings.rows[0]?.brapi_token;
      const alphaKey = settings.rows[0]?.alphavantage_key;
      
      if (!brapiToken && !alphaKey) {
        return res.status(400).json({ 
          error: 'Configure suas API keys em Configurações para sincronizar cotações' 
        });
      }

      const results = { success: 0, failed: 0, details: [] };
      
      // Buscar todos os ativos
      const assets = await pool.query('SELECT * FROM assets WHERE user_id = $1 AND quantity > 0', [userId]);
      
      for (const asset of assets.rows) {
        try {
          let newPrice = null;
          
          // Ativos BR
          if (asset.market === 'BR' && brapiToken && asset.ticker) {
            const quote = await quotesService.getBRQuote(asset.ticker, brapiToken);
            newPrice = quote?.price;
          }
          // Ativos US
          else if (asset.market === 'US' && alphaKey && asset.ticker) {
            const quote = await quotesService.getGlobalQuote(asset.ticker, alphaKey);
            newPrice = quote?.price;
          }

          if (newPrice && newPrice > 0) {
            await pool.query(
              'UPDATE assets SET current_price = $1, updated_at = NOW() WHERE id = $2',
              [newPrice, asset.id]
            );
            results.success++;
            results.details.push({ ticker: asset.ticker, price: newPrice, status: 'ok' });
          } else {
            // Se não conseguiu atualizar, manter o preço médio como atual
            if (!asset.current_price) {
              await pool.query(
                'UPDATE assets SET current_price = average_price, updated_at = NOW() WHERE id = $1',
                [asset.id]
              );
            }
            results.failed++;
            results.details.push({ ticker: asset.ticker || asset.name, status: 'no_price' });
          }
        } catch (e) {
          results.failed++;
          results.details.push({ ticker: asset.ticker || asset.name, status: 'error', message: e.message });
        }
        
        // Delay entre requisições
        await new Promise(r => setTimeout(r, 300));
      }

      // Salvar snapshot no histórico
      const allocation = await rebalanceService.calculateAllocation(userId);
      
      await pool.query(`
        INSERT INTO portfolio_history (user_id, date, total_value, total_invested, total_gain, gain_percentage, snapshot)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, date) DO UPDATE SET
          total_value = EXCLUDED.total_value,
          total_invested = EXCLUDED.total_invested,
          total_gain = EXCLUDED.total_gain,
          gain_percentage = EXCLUDED.gain_percentage,
          snapshot = EXCLUDED.snapshot
      `, [
        userId,
        allocation.totalValue,
        allocation.totalInvested,
        allocation.totalGain,
        allocation.gainPercentage,
        JSON.stringify(allocation)
      ]);

      return res.json({
        success: true,
        message: 'Sincronização concluída',
        duration: `${Date.now() - startTime}ms`,
        results
      });
    } catch (error) {
      console.error('Erro na sincronização:', error);
      return res.status(500).json({ error: 'Erro na sincronização: ' + error.message });
    }
  }

  async getRebalance(req, res) {
    try {
      const suggestions = await rebalanceService.generateRebalanceSuggestions(req.userId);
      const allocation = await rebalanceService.calculateAllocation(req.userId);
      return res.json({ allocation, suggestions });
    } catch (error) {
      console.error('Erro ao buscar sugestões:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async calculateContribution(req, res) {
    try {
      const { amount } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Informe um valor válido' });
      }
      
      const targets = await rebalanceService.calculateContributionTarget(req.userId, parseFloat(amount));
      return res.json({ amount: parseFloat(amount), targets });
    } catch (error) {
      console.error('Erro ao calcular aporte:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getProjection(req, res) {
    try {
      const { months = 60, monthlyContribution } = req.query;
      const allocation = await rebalanceService.calculateAllocation(req.userId);
      const passiveIncome = await rebalanceService.calculatePassiveIncome(req.userId);

      // Buscar contribuição mensal das configurações
      const settingsResult = await pool.query(
        'SELECT monthly_contribution FROM user_settings WHERE user_id = $1',
        [req.userId]
      );
      
      const contribution = parseFloat(monthlyContribution) || 
                          parseFloat(settingsResult.rows[0]?.monthly_contribution) || 0;

      const weightedYield = 10; // Yield médio estimado
      const projection = [];
      let currentValue = allocation.totalValue || 0;
      const monthlyReturn = Math.pow(1 + weightedYield / 100, 1/12) - 1;
      const incomeYield = passiveIncome.totalAnnual / (allocation.totalValue || 1) / 12;

      for (let i = 0; i <= parseInt(months); i++) {
        projection.push({
          month: i,
          value: Math.round(currentValue),
          monthlyIncome: Math.round(currentValue * incomeYield),
          totalContributed: allocation.totalInvested + (contribution * i)
        });
        currentValue = currentValue * (1 + monthlyReturn) + contribution;
      }

      return res.json({ currentValue: allocation.totalValue, projection });
    } catch (error) {
      console.error('Erro na projeção:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getHistory(req, res) {
    try {
      const { limit = 365 } = req.query;
      
      const result = await pool.query(`
        SELECT * FROM portfolio_history 
        WHERE user_id = $1 
        ORDER BY date DESC 
        LIMIT $2
      `, [req.userId, parseInt(limit)]);
      
      return res.json({ history: result.rows.reverse() });
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async dismissRecommendation(req, res) {
    try {
      return res.json({ success: true });
    } catch (error) {
      console.error('Erro ao dispensar recomendação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getMacroAnalysis(req, res) {
    try {
      const analysis = await macroService.getOrCreateAnalysis(req.userId);
      return res.json(analysis);
    } catch (error) {
      console.error('Erro ao buscar análise macro:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async refreshMacroAnalysis(req, res) {
    try {
      const analysis = await macroService.refreshAnalysis(req.userId);
      return res.json(analysis);
    } catch (error) {
      console.error('Erro ao atualizar análise macro:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new PortfolioController();
