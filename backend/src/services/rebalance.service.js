const pool = require('../config/database');

class RebalanceService {
  async calculateAllocation(userId) {
    try {
      const classesResult = await pool.query(`
        SELECT ac.*, 
          COALESCE(SUM(a.quantity * COALESCE(a.current_price, a.average_price)), 0) as current_value,
          COALESCE(SUM(a.quantity * a.average_price), 0) as invested_value
        FROM asset_classes ac
        LEFT JOIN assets a ON a.asset_class_id = ac.id AND a.user_id = ac.user_id AND a.quantity > 0
        WHERE ac.user_id = $1
        GROUP BY ac.id
        ORDER BY ac.target_percentage DESC
      `, [userId]);

      const classes = classesResult.rows;
      const totalValue = classes.reduce((sum, c) => sum + parseFloat(c.current_value || 0), 0);
      const totalInvested = classes.reduce((sum, c) => sum + parseFloat(c.invested_value || 0), 0);

      const allocation = classes.map(c => {
        const currentValue = parseFloat(c.current_value) || 0;
        const investedValue = parseFloat(c.invested_value) || 0;
        const targetPercentage = parseFloat(c.target_percentage) || 0;
        const currentPercentage = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
        const difference = currentPercentage - targetPercentage;
        
        return {
          id: c.id,
          name: c.name,
          color: c.color,
          category: c.category,
          icon: c.icon,
          targetPercentage,
          currentValue,
          investedValue,
          currentPercentage,
          expectedYield: parseFloat(c.expected_yield) || 0,
          difference: Math.round(difference * 10) / 10
        };
      });

      return {
        totalValue,
        totalInvested,
        totalGain: totalValue - totalInvested,
        gainPercentage: totalInvested > 0 ? ((totalValue / totalInvested) - 1) * 100 : 0,
        allocation
      };
    } catch (error) {
      console.error('Erro ao calcular alocação:', error);
      return { totalValue: 0, totalInvested: 0, totalGain: 0, gainPercentage: 0, allocation: [] };
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
        SELECT ac.id, ac.name, ac.expected_yield, ac.color,
          COALESCE(SUM(a.quantity * COALESCE(a.current_price, a.average_price)), 0) as value
        FROM asset_classes ac
        LEFT JOIN assets a ON a.asset_class_id = ac.id AND a.user_id = ac.user_id AND a.quantity > 0
        WHERE ac.user_id = $1
        GROUP BY ac.id, ac.name, ac.expected_yield, ac.color
      `, [userId]);

      let estimatedAnnual = 0;
      const breakdown = [];

      for (const cls of classesResult.rows) {
        const value = parseFloat(cls.value) || 0;
        // Usar expected_yield se existir, senão usar um default baseado no tipo de ativo
        let yieldPercent = parseFloat(cls.expected_yield) || 0;
        
        // Se não tem yield configurado mas tem valor, estimar baseado em médias de mercado
        if (yieldPercent === 0 && value > 0) {
          const name = (cls.name || '').toLowerCase();
          if (name.includes('renda fixa') || name.includes('tesouro') || name.includes('cdb')) {
            yieldPercent = 10; // ~10% para renda fixa
          } else if (name.includes('fii') || name.includes('imobiliário')) {
            yieldPercent = 8; // ~8% para FIIs
          } else if (name.includes('ação') || name.includes('ações') || name.includes('dividendo')) {
            yieldPercent = 6; // ~6% para ações dividendos
          } else if (name.includes('reit') || name.includes('eua') || name.includes('internacional')) {
            yieldPercent = 4; // ~4% para REITs/internacional
          } else if (name.includes('cripto') || name.includes('crypto')) {
            yieldPercent = 0; // Cripto não gera renda passiva
          } else if (name.includes('metal') || name.includes('ouro')) {
            yieldPercent = 0; // Metais não geram renda
          } else {
            yieldPercent = 5; // Default 5%
          }
        }
        
        const estimated = value * (yieldPercent / 100);
        estimatedAnnual += estimated;
        
        if (value > 0) {
          breakdown.push({
            name: cls.name,
            color: cls.color,
            value,
            yieldPercent,
            estimatedAnnual: estimated,
            estimatedMonthly: estimated / 12
          });
        }
      }

      // Se há dividendos reais registrados, usar eles; caso contrário usar estimativa
      const finalAnnual = annualDividends > 0 ? annualDividends : estimatedAnnual;

      return {
        totalMonthly: Math.round(finalAnnual / 12 * 100) / 100,
        totalAnnual: Math.round(finalAnnual * 100) / 100,
        realizedLast12Months: annualDividends,
        estimatedAnnual: Math.round(estimatedAnnual * 100) / 100,
        breakdown
      };
    } catch (error) {
      console.error('Erro ao calcular renda passiva:', error.message, error.stack);
      return { totalMonthly: 0, totalAnnual: 0, realizedLast12Months: 0, estimatedAnnual: 0, breakdown: [] };
    }
  }

  async generateRebalanceSuggestions(userId) {
    try {
      const allocation = await this.calculateAllocation(userId);
      const suggestions = [];
      const threshold = 3; // Limiar de 3% para sugestões

      for (const cls of allocation.allocation) {
        if (cls.targetPercentage <= 0) continue;
        
        const diff = cls.currentPercentage - cls.targetPercentage;
        
        if (diff > threshold) {
          suggestions.push({
            type: 'REDUCE',
            classId: cls.id,
            className: cls.name,
            color: cls.color,
            currentPercentage: Math.round(cls.currentPercentage * 10) / 10,
            targetPercentage: cls.targetPercentage,
            difference: Math.round(diff * 10) / 10,
            message: cls.name + ' está ' + Math.abs(diff).toFixed(1) + '% acima do target. Considere não aportar nesta classe.',
            priority: diff > 10 ? 'high' : 'medium'
          });
        }
        
        if (diff < -threshold) {
          suggestions.push({
            type: 'INCREASE',
            classId: cls.id,
            className: cls.name,
            color: cls.color,
            currentPercentage: Math.round(cls.currentPercentage * 10) / 10,
            targetPercentage: cls.targetPercentage,
            difference: Math.round(diff * 10) / 10,
            message: cls.name + ' está ' + Math.abs(diff).toFixed(1) + '% abaixo do target. Priorize aportes nesta classe.',
            priority: diff < -10 ? 'high' : 'medium'
          });
        }
      }

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
      const newTotal = allocation.totalValue + amount;

      for (const cls of allocation.allocation) {
        if (cls.targetPercentage <= 0) continue;
        
        const targetValue = (cls.targetPercentage / 100) * newTotal;
        const needed = targetValue - cls.currentValue;
        
        if (needed > 0) {
          const toInvest = Math.min(needed, amount);
          const percentage = (toInvest / amount) * 100;
          
          if (percentage > 1) {
            targets.push({
              classId: cls.id,
              className: cls.name,
              color: cls.color,
              currentPercentage: Math.round(cls.currentPercentage * 10) / 10,
              targetPercentage: cls.targetPercentage,
              amount: Math.round(toInvest * 100) / 100,
              percentage: Math.round(percentage * 10) / 10
            });
          }
        }
      }

      targets.sort((a, b) => b.percentage - a.percentage);
      return targets;
    } catch (error) {
      console.error('Erro ao calcular contribuição:', error);
      return [];
    }
  }
}

module.exports = new RebalanceService();
