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
        LEFT JOIN assets a ON a.asset_class_id = ac.id AND a.user_id = $1 AND a.quantity > 0
        WHERE ac.user_id = $1
        GROUP BY ac.id, ac.name, ac.expected_yield, ac.color
      `, [userId]);

      // Fallback: se não encontrou classes com valor, buscar ativos direto
      const totalFromClasses = classesResult.rows.reduce((sum, r) => sum + parseFloat(r.value || 0), 0);
      
      let assetsDirectResult = { rows: [] };
      if (totalFromClasses === 0) {
        assetsDirectResult = await pool.query(`
          SELECT 
            COALESCE(ac.name, a.asset_type, 'Outros') as class_name,
            COALESCE(ac.color, '#3B82F6') as color,
            COALESCE(ac.expected_yield, 8) as expected_yield,
            SUM(a.quantity * COALESCE(a.current_price, a.average_price)) as value
          FROM assets a
          LEFT JOIN asset_classes ac ON ac.id = a.asset_class_id
          WHERE a.user_id = $1 AND a.quantity > 0
          GROUP BY COALESCE(ac.name, a.asset_type, 'Outros'), COALESCE(ac.color, '#3B82F6'), COALESCE(ac.expected_yield, 8)
        `, [userId]);
      }

      let estimatedAnnual = 0;
      const breakdown = [];

      // Usar classes se tiver valor, senão usar fallback direto de ativos
      const rowsToProcess = totalFromClasses > 0 
        ? classesResult.rows 
        : assetsDirectResult.rows.map(r => ({
            name: r.class_name,
            color: r.color,
            expected_yield: r.expected_yield,
            value: r.value
          }));

      for (const cls of rowsToProcess) {
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

  async calculateContributionTarget(userId, amount, macroContext = null) {
    try {
      const allocation = await this.calculateAllocation(userId);
      const newTotal = allocation.totalValue + amount;

      // Calcular o quanto cada classe precisa para atingir o target
      const classNeeds = [];
      for (const cls of allocation.allocation) {
        if (cls.targetPercentage <= 0) continue;
        const targetValue = (cls.targetPercentage / 100) * newTotal;
        const needed = Math.max(0, targetValue - cls.currentValue);
        if (needed > 0) {
          classNeeds.push({
            classId: cls.id,
            className: cls.name,
            color: cls.color,
            currentPercentage: Math.round(cls.currentPercentage * 10) / 10,
            targetPercentage: cls.targetPercentage,
            currentValue: cls.currentValue,
            targetValue,
            needed,
            isMacroBoosted: false,
            macroReason: null
          });
        }
      }

      // Aplicar boost macro se disponível
      if (macroContext) {
        const { recommendedClasses = [] } = macroContext;
        // recommendedClasses: array de nomes de classes favorecidas (ordem de prioridade)
        for (const need of classNeeds) {
          const matchIdx = recommendedClasses.findIndex(rc =>
            need.className.toLowerCase().includes(rc.toLowerCase()) ||
            rc.toLowerCase().includes(need.className.toLowerCase())
          );
          if (matchIdx !== -1) {
            need.isMacroBoosted = true;
            need.macroBoostRank = matchIdx; // menor = maior prioridade
          }
        }
      }

      // Ordenar: classes macro-favorecidas primeiro (por rank), depois por maior necessidade
      classNeeds.sort((a, b) => {
        if (a.isMacroBoosted && !b.isMacroBoosted) return -1;
        if (!a.isMacroBoosted && b.isMacroBoosted) return 1;
        if (a.isMacroBoosted && b.isMacroBoosted) {
          return (a.macroBoostRank ?? 99) - (b.macroBoostRank ?? 99);
        }
        return b.needed - a.needed;
      });

      // Distribuir o aporte respeitando o cap de cada classe
      let remaining = amount;
      const targets = [];

      for (const cls of classNeeds) {
        if (remaining <= 0) break;
        const toInvest = Math.min(cls.needed, remaining);
        if (toInvest < 0.01) continue;
        remaining -= toInvest;
        targets.push({
          classId: cls.classId,
          className: cls.className,
          color: cls.color,
          currentPercentage: cls.currentPercentage,
          targetPercentage: cls.targetPercentage,
          amount: Math.round(toInvest * 100) / 100,
          percentage: Math.round((toInvest / amount) * 1000) / 10,
          isMacroBoosted: cls.isMacroBoosted,
          willReachTarget: toInvest >= cls.needed - 0.01
        });
      }

      // Se sobrou dinheiro (todos os targets atingidos), distribuir proporcionalmente pelas classes macro-favorecidas ou todas
      if (remaining > 0.01 && targets.length > 0) {
        const distributeTo = targets.filter(t => t.isMacroBoosted).length > 0
          ? targets.filter(t => t.isMacroBoosted)
          : targets;
        const totalPct = distributeTo.reduce((s, t) => s + t.targetPercentage, 0);
        for (const t of distributeTo) {
          const extra = remaining * (t.targetPercentage / totalPct);
          t.amount = Math.round((t.amount + extra) * 100) / 100;
          t.percentage = Math.round((t.amount / amount) * 1000) / 10;
        }
      }

      return targets;
    } catch (error) {
      console.error('Erro ao calcular contribuição:', error);
      return [];
    }
  }
}

module.exports = new RebalanceService();