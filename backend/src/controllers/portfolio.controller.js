const pool = require('../config/database');
const quotesService = require('../services/quotes.service');
const rebalanceService = require('../services/rebalance.service');
const macroService = require('../services/macro.service');

class PortfolioController {

  // Dashboard completo com análise macro
  async getDashboard(req, res) {
    try {
      const userId = req.userId;

      // Buscar alocação e totais
      const allocation = await rebalanceService.calculateAllocation(userId);

      // Buscar renda passiva estimada
      const passiveIncome = await rebalanceService.calculatePassiveIncome(userId);

      // Buscar recomendações ativas
      const recommendationsResult = await pool.query(`
        SELECT * FROM recommendations 
        WHERE user_id = $1 AND is_dismissed = FALSE
        ORDER BY 
          CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          created_at DESC
        LIMIT 10
      `, [userId]);

      // Buscar última atualização
      const lastUpdateResult = await pool.query(
        'SELECT MAX(last_update) as last_update FROM assets WHERE user_id = $1',
        [userId]
      );

      // Buscar histórico recente do portfolio
      const historyResult = await pool.query(`
        SELECT date, total_value, total_invested, monthly_income
        FROM portfolio_history 
        WHERE user_id = $1 
        ORDER BY date DESC 
        LIMIT 30
      `, [userId]);

      // Buscar análise macro
      let macroAnalysis = null;
      try {
        macroAnalysis = await macroService.getOrCreateAnalysis(userId);
      } catch (e) {
        console.error('Erro ao buscar análise macro:', e);
        macroAnalysis = macroService.getDefaultAnalysis();
      }

      return res.json({
        summary: {
          totalValue: allocation.totalValue,
          totalInvested: allocation.totalInvested,
          totalGain: allocation.totalGain,
          gainPercentage: Math.round(allocation.gainPercentage * 100) / 100,
          monthlyIncome: passiveIncome.totalMonthly,
          annualIncome: passiveIncome.totalAnnual,
          lastUpdate: lastUpdateResult.rows[0]?.last_update
        },
        allocation: allocation.allocation,
        passiveIncome: passiveIncome.breakdown,
        recommendations: recommendationsResult.rows,
        history: historyResult.rows.reverse(),
        macroAnalysis
      });

    } catch (error) {
      console.error('Erro ao buscar dashboard:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Obter análise macro
  async getMacroAnalysis(req, res) {
    try {
      const analysis = await macroService.getOrCreateAnalysis(req.userId);
      return res.json(analysis);
    } catch (error) {
      console.error('Erro ao buscar análise macro:', error);
      return res.json(macroService.getDefaultAnalysis());
    }
  }

  // Atualizar análise macro (forçar nova geração)
  async refreshMacroAnalysis(req, res) {
    try {
      const analysis = await macroService.refreshAnalysis(req.userId);
      return res.json(analysis);
    } catch (error) {
      console.error('Erro ao atualizar análise macro:', error);
      return res.status(500).json({ error: 'Erro ao atualizar análise' });
    }
  }

  // Atualizar tudo (botão de sincronização)
  async syncAll(req, res) {
    const startTime = Date.now();
    
    try {
      const userId = req.userId;
      const results = {
        quotes: { success: 0, failed: 0, details: [] },
        rebalance: { suggestions: [] },
        snapshot: null
      };

      // 1. Atualizar cotações
      console.log(`[${userId}] Iniciando atualização de cotações...`);
      const quotesResult = await quotesService.updateAllQuotes(userId);
      results.quotes.success = quotesResult.success.length;
      results.quotes.failed = quotesResult.failed.length;
      results.quotes.details = [...quotesResult.success.slice(0, 5), ...quotesResult.failed];

      // 2. Gerar sugestões de rebalanceamento
      console.log(`[${userId}] Gerando sugestões de rebalanceamento...`);
      results.rebalance.suggestions = await rebalanceService.generateRebalanceSuggestions(userId);

      // 3. Salvar snapshot do portfolio
      console.log(`[${userId}] Salvando snapshot do portfolio...`);
      const allocation = await rebalanceService.calculateAllocation(userId);
      const passiveIncome = await rebalanceService.calculatePassiveIncome(userId);

      await pool.query(`
        INSERT INTO portfolio_history (user_id, date, total_value, total_invested, total_gain, gain_percentage, monthly_income, snapshot)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, date) DO UPDATE SET
          total_value = EXCLUDED.total_value,
          total_invested = EXCLUDED.total_invested,
          total_gain = EXCLUDED.total_gain,
          gain_percentage = EXCLUDED.gain_percentage,
          monthly_income = EXCLUDED.monthly_income,
          snapshot = EXCLUDED.snapshot
      `, [
        userId,
        allocation.totalValue,
        allocation.totalInvested,
        allocation.totalGain,
        allocation.gainPercentage,
        passiveIncome.totalMonthly,
        JSON.stringify({ allocation: allocation.allocation, income: passiveIncome })
      ]);

      results.snapshot = {
        totalValue: allocation.totalValue,
        totalGain: allocation.totalGain,
        monthlyIncome: passiveIncome.totalMonthly
      };

      const duration = Date.now() - startTime;
      console.log(`[${userId}] Sincronização concluída em ${duration}ms`);

      return res.json({
        success: true,
        message: 'Sincronização concluída',
        duration: `${duration}ms`,
        results
      });

    } catch (error) {
      console.error('Erro na sincronização:', error);
      return res.status(500).json({ error: 'Erro na sincronização', details: error.message });
    }
  }

  // Buscar sugestões de rebalanceamento
  async getRebalanceSuggestions(req, res) {
    try {
      const suggestions = await rebalanceService.generateRebalanceSuggestions(req.userId);
      const allocation = await rebalanceService.calculateAllocation(req.userId);

      return res.json({
        allocation,
        suggestions
      });

    } catch (error) {
      console.error('Erro ao buscar sugestões:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Calcular onde aportar
  async calculateContribution(req, res) {
    try {
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Informe um valor válido' });
      }

      const targets = await rebalanceService.calculateContributionTarget(req.userId, amount);

      return res.json({ 
        amount,
        targets,
        message: targets.length > 0 
          ? 'Distribua seu aporte conforme sugerido para otimizar o rebalanceamento'
          : 'Distribua proporcionalmente conforme seus targets'
      });

    } catch (error) {
      console.error('Erro ao calcular aporte:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Projeção de patrimônio
  async getProjection(req, res) {
    try {
      const { months = 60, monthlyContribution } = req.query;
      
      // Buscar dados atuais
      const allocation = await rebalanceService.calculateAllocation(req.userId);
      const passiveIncome = await rebalanceService.calculatePassiveIncome(req.userId);

      // Buscar configuração de aporte
      const settingsResult = await pool.query(
        'SELECT monthly_contribution FROM user_settings WHERE user_id = $1',
        [req.userId]
      );
      const contribution = monthlyContribution || settingsResult.rows[0]?.monthly_contribution || 0;

      // Calcular yield médio ponderado
      let weightedYield = 0;
      for (const cls of allocation.allocation) {
        if (cls.currentValue > 0 && allocation.totalValue > 0) {
          weightedYield += (cls.expectedYield * cls.currentValue / allocation.totalValue);
        }
      }
      weightedYield = weightedYield || 10;

      // Gerar projeção
      const projection = [];
      let currentValue = allocation.totalValue || 0;
      const monthlyReturn = Math.pow(1 + weightedYield / 100, 1/12) - 1;
      const incomeYield = passiveIncome.totalMonthly / (allocation.totalValue || 1);

      for (let i = 0; i <= parseInt(months); i++) {
        const monthlyIncome = currentValue * incomeYield;
        
        projection.push({
          month: i,
          value: Math.round(currentValue),
          monthlyIncome: Math.round(monthlyIncome),
          totalContributed: allocation.totalInvested + (contribution * i)
        });

        currentValue = currentValue * (1 + monthlyReturn) + parseFloat(contribution);
      }

      return res.json({
        currentValue: allocation.totalValue,
        projectedValue: projection[projection.length - 1].value,
        projectedIncome: projection[projection.length - 1].monthlyIncome,
        averageYield: Math.round(weightedYield * 100) / 100,
        monthlyContribution: parseFloat(contribution),
        projection
      });

    } catch (error) {
      console.error('Erro na projeção:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Histórico do portfolio
  async getHistory(req, res) {
    try {
      const { startDate, endDate, limit = 365 } = req.query;

      let query = `
        SELECT * FROM portfolio_history 
        WHERE user_id = $1
      `;
      const params = [req.userId];
      let paramIndex = 2;

      if (startDate) {
        query += ` AND date >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND date <= $${paramIndex++}`;
        params.push(endDate);
      }

      query += ` ORDER BY date DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit));

      const result = await pool.query(query, params);

      return res.json({ history: result.rows.reverse() });

    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Marcar recomendação como lida
  async dismissRecommendation(req, res) {
    try {
      const { id } = req.params;

      await pool.query(
        'UPDATE recommendations SET is_dismissed = TRUE WHERE id = $1 AND user_id = $2',
        [id, req.userId]
      );

      return res.json({ success: true });

    } catch (error) {
      console.error('Erro ao dispensar recomendação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new PortfolioController();
