const pool = require('../config/database');

class RebalanceService {
  async calculateAllocation(userId) {
    try {
      // Buscar classes com targets
      const classesResult = await pool.query(`
        SELECT ac.*, 
          COALESCE(SUM(a.quantity * COALESCE(a.current_price, a.average_price)), 0) as current_value,
          COALESCE(SUM(a.quantity * a.average_price), 0) as invested_value
        FROM asset_classes ac
        LEFT JOIN assets a ON a.asset_class_id = ac.id AND a.user_id = ac.user_id
        WHERE ac.user_id = $1
        GROUP BY ac.id
        ORDER BY ac.target_percentage DESC
      `, [userId]);

      const classes = classesResult.rows;
      const totalValue = classes.reduce((sum, c) => sum + parseFloat(c.current_value || 0), 0);
      const totalInvested = classes.reduce((sum, c) => sum + parseFloat(c.invested_value || 0), 0);

      const allocation = classes.map(c => ({
        id: c.id,
        name: c.name,
        color: c.color,
        category: c.category,
        targetPercentage: parseFloat(c.target_percentage) || 0,
        currentValue: parseFloat(c.current_value) || 0,
        investedValue: parseFloat(c.invested_value) || 0,
        currentPercentage: totalValue > 0 ? (parseFloat(c.current_value) / totalValue) * 100 : 0,
        expectedYield: parseFloat(c.expected_yield) || 10,
        difference: 0
      }));

      // Calcular diferença
      for (const a of allocation) {
        a.difference = a.currentPercentage - a.targetPercentage;
      }

      return {
        totalValue,
        totalInvested,
        totalGain: totalValue - totalInvested,
        gainPercentage: totalInvested > 0 ? ((totalValue / totalInvested) - 1) * 100 : 0,
        allocation
      };
    } catch (error) {
      console.error('Erro ao calcular alocação:', error);
      return {
        totalValue: 0,
        totalInvested: 0,
        totalGain: 0,
        gainPercentage: 0,
        allocation: []
      };
    }
  }

  async calculatePassiveIncome(userId) {
    try {
      // Buscar dividendos dos últimos 12 meses
      const dividendsResult = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM dividends
        WHERE user_id = $1 AND payment_date >= NOW() - INTERVAL '12 months'
      `, [userId]);

      const annualDividends = parseFloat(dividendsResult.rows[0]?.total || 0);

      // Estimar com base no yield das classes
      const classesResult = await pool.query(`
        SELECT ac.name, ac.expected_yield, ac.color,
          COALESCE(SUM(a.quantity * COALESCE(a.current_price, a.average_price)), 0) as value
        FROM asset_classes ac
        LEFT JOIN assets a ON a.asset_class_id = ac.id
        WHERE ac.user_id = $1
        GROUP BY ac.id
      `, [userId]);

      let estimatedAnnual = 0;
      const breakdown = [];

      for (const cls of classesResult.rows) {
        const value = parseFloat(cls.value) || 0;
        const yieldPercent = parseFloat(cls.expected_yield) || 0;
        const estimated = value * (yieldPercent / 100);
        
        estimatedAnnual += estimated;
        
        if (value > 0) {
          breakdown.push({
            name: cls.name,
            color: cls.color,
            value,
            estimatedAnnual: estimated,
            estimatedMonthly: estimated / 12
          });
        }
      }

      return {
        totalMonthly: estimatedAnnual / 12,
        totalAnnual: estimatedAnnual,
        realizedLast12Months: annualDividends,
        breakdown
      };
    } catch (error) {
      console.error('Erro ao calcular renda passiva:', error);
      return { totalMonthly: 0, totalAnnual: 0, realizedLast12Months: 0, breakdown: [] };
    }
  }

  async generateRebalanceSuggestions(userId) {
    try {
      const allocation = await this.calculateAllocation(userId);
      const suggestions = [];
      const threshold = 5; // Limiar de 5%

      // Verificar cada classe
      for (const cls of allocation.allocation) {
        const diff = cls.currentPercentage - cls.targetPercentage;
        
        // Se a classe está acima do target (vender/não comprar)
        if (diff > threshold) {
          suggestions.push({
            type: 'REDUCE',
            className: cls.name,
            color: cls.color,
            currentPercentage: cls.currentPercentage,
            targetPercentage: cls.targetPercentage,
            difference: diff,
            message: `${cls.name} está ${diff.toFixed(1)}% acima do target. Considere não aportar ou reduzir.`,
            priority: diff > 10 ? 'high' : 'medium'
          });
        }
        
        // Se a classe está abaixo do target (comprar mais)
        if (diff < -threshold) {
          suggestions.push({
            type: 'INCREASE',
            className: cls.name,
            color: cls.color,
            currentPercentage: cls.currentPercentage,
            targetPercentage: cls.targetPercentage,
            difference: diff,
            message: `${cls.name} está ${Math.abs(diff).toFixed(1)}% abaixo do target. Priorize aportes nesta classe.`,
            priority: diff < -10 ? 'high' : 'medium'
          });
        }
      }

      // Ordenar por prioridade e diferença
      suggestions.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (b.priority === 'high' && a.priority !== 'high') return 1;
        return Math.abs(b.difference) - Math.abs(a.difference);
      });

      return suggestions;
    } catch (error) {
      console.error('Erro ao gerar sugestões:', error);
      return [];
    }
  }

  async calculateContributionTarget(userId, amount) {
    try {
      const allocation = await this.calculateAllocation(userId);
      const targets = [];

      // Ordenar por quem está mais abaixo do target
      const sortedClasses = [...allocation.allocation]
        .filter(c => c.targetPercentage > 0)
        .sort((a, b) => a.difference - b.difference);

      let remaining = amount;

      for (const cls of sortedClasses) {
        if (remaining <= 0) break;
        if (cls.difference >= 0) continue; // Já está no target ou acima

        // Calcular quanto falta para atingir o target
        const targetValue = (cls.targetPercentage / 100) * (allocation.totalValue + amount);
        const needed = targetValue - cls.currentValue;

        if (needed > 0) {
          const toInvest = Math.min(needed, remaining);
          targets.push({
            className: cls.name,
            color: cls.color,
            amount: toInvest,
            percentage: (toInvest / amount) * 100
          });
          remaining -= toInvest;
        }
      }

      // Se sobrou, distribuir proporcionalmente
      if (remaining > 0) {
        for (const cls of allocation.allocation) {
          if (cls.targetPercentage > 0) {
            const proportional = (cls.targetPercentage / 100) * remaining;
            const existing = targets.find(t => t.className === cls.name);
            if (existing) {
              existing.amount += proportional;
              existing.percentage = (existing.amount / amount) * 100;
            } else {
              targets.push({
                className: cls.name,
                color: cls.color,
                amount: proportional,
                percentage: (proportional / amount) * 100
              });
            }
          }
        }
      }

      return targets.filter(t => t.amount > 0);
    } catch (error) {
      console.error('Erro ao calcular contribuição:', error);
      return [];
    }
  }
}

module.exports = new RebalanceService();
