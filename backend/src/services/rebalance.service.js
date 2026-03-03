const pool = require('../config/database');

class RebalanceService {
  
  // Calcular alocação atual vs target
  async calculateAllocation(userId) {
    const client = await pool.connect();
    
    try {
      // Buscar classes com seus targets
      const classesResult = await client.query(`
        SELECT 
          ac.id,
          ac.name,
          ac.target_percentage,
          ac.color,
          ac.expected_yield,
          COALESCE(SUM(a.quantity * a.current_price), 0) as current_value,
          COALESCE(SUM(a.quantity * a.average_price), 0) as invested_value
        FROM asset_classes ac
        LEFT JOIN assets a ON a.asset_class_id = ac.id
        WHERE ac.user_id = $1
        GROUP BY ac.id
        ORDER BY ac.target_percentage DESC
      `, [userId]);

      const classes = classesResult.rows;
      
      // Calcular totais
      const totalValue = classes.reduce((sum, c) => sum + parseFloat(c.current_value || 0), 0);
      const totalInvested = classes.reduce((sum, c) => sum + parseFloat(c.invested_value || 0), 0);

      // Calcular porcentagens atuais e desvios
      const allocation = classes.map(c => {
        const currentValue = parseFloat(c.current_value || 0);
        const currentPercentage = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
        const targetPercentage = parseFloat(c.target_percentage || 0);
        const deviation = currentPercentage - targetPercentage;
        const targetValue = (targetPercentage / 100) * totalValue;
        const adjustmentNeeded = targetValue - currentValue;

        return {
          id: c.id,
          name: c.name,
          color: c.color,
          expectedYield: parseFloat(c.expected_yield || 0),
          currentValue,
          investedValue: parseFloat(c.invested_value || 0),
          currentPercentage: Math.round(currentPercentage * 100) / 100,
          targetPercentage,
          deviation: Math.round(deviation * 100) / 100,
          targetValue: Math.round(targetValue * 100) / 100,
          adjustmentNeeded: Math.round(adjustmentNeeded * 100) / 100,
          status: Math.abs(deviation) <= 2 ? 'ok' : deviation > 0 ? 'over' : 'under'
        };
      });

      return {
        totalValue,
        totalInvested,
        totalGain: totalValue - totalInvested,
        gainPercentage: totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0,
        allocation
      };
      
    } finally {
      client.release();
    }
  }

  // Gerar sugestões de rebalanceamento
  async generateRebalanceSuggestions(userId) {
    const client = await pool.connect();
    
    try {
      // Buscar threshold do usuário
      const settingsResult = await client.query(
        'SELECT rebalance_threshold, monthly_contribution FROM user_settings WHERE user_id = $1',
        [userId]
      );
      const settings = settingsResult.rows[0] || { rebalance_threshold: 5, monthly_contribution: 0 };
      const threshold = parseFloat(settings.rebalance_threshold);
      const monthlyContribution = parseFloat(settings.monthly_contribution || 0);

      // Calcular alocação atual
      const { allocation, totalValue } = await this.calculateAllocation(userId);

      const suggestions = [];

      // Identificar classes fora do threshold
      const overAllocated = allocation.filter(a => a.deviation > threshold);
      const underAllocated = allocation.filter(a => a.deviation < -threshold);

      // Sugestões de venda (classes acima do target)
      for (const over of overAllocated) {
        suggestions.push({
          type: 'SELL',
          priority: 'high',
          assetClassId: over.id,
          assetClassName: over.name,
          title: `Reduzir ${over.name}`,
          description: `Está ${over.deviation.toFixed(1)}% acima do target. Considere vender R$ ${Math.abs(over.adjustmentNeeded).toFixed(2)} para rebalancear.`,
          amount: Math.abs(over.adjustmentNeeded),
          currentPercentage: over.currentPercentage,
          targetPercentage: over.targetPercentage
        });
      }

      // Sugestões de compra (classes abaixo do target)
      for (const under of underAllocated) {
        suggestions.push({
          type: 'BUY',
          priority: 'high',
          assetClassId: under.id,
          assetClassName: under.name,
          title: `Aumentar ${under.name}`,
          description: `Está ${Math.abs(under.deviation).toFixed(1)}% abaixo do target. Considere comprar R$ ${under.adjustmentNeeded.toFixed(2)} para rebalancear.`,
          amount: under.adjustmentNeeded,
          currentPercentage: under.currentPercentage,
          targetPercentage: under.targetPercentage
        });
      }

      // Sugestão de aporte mensal
      if (monthlyContribution > 0 && underAllocated.length > 0) {
        // Ordenar por maior desvio negativo
        const sortedUnder = [...underAllocated].sort((a, b) => a.deviation - b.deviation);
        const topUnder = sortedUnder[0];

        suggestions.push({
          type: 'CONTRIBUTION',
          priority: 'medium',
          assetClassId: topUnder.id,
          assetClassName: topUnder.name,
          title: `Aporte do mês em ${topUnder.name}`,
          description: `Para rebalancear mais rápido, direcione seu aporte de R$ ${monthlyContribution.toFixed(2)} para ${topUnder.name}, que está mais defasado.`,
          amount: monthlyContribution
        });
      }

      // Salvar sugestões no banco
      await this.saveSuggestions(userId, suggestions);

      return suggestions;
      
    } finally {
      client.release();
    }
  }

  // Salvar sugestões no banco
  async saveSuggestions(userId, suggestions) {
    const client = await pool.connect();
    
    try {
      // Limpar sugestões antigas não lidas
      await client.query(
        'DELETE FROM recommendations WHERE user_id = $1 AND is_read = FALSE AND type IN ($2, $3, $4)',
        [userId, 'SELL', 'BUY', 'CONTRIBUTION']
      );

      // Inserir novas
      for (const suggestion of suggestions) {
        await client.query(`
          INSERT INTO recommendations (user_id, type, priority, title, description, action_data)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          userId,
          suggestion.type,
          suggestion.priority,
          suggestion.title,
          suggestion.description,
          JSON.stringify(suggestion)
        ]);
      }
    } finally {
      client.release();
    }
  }

  // Calcular onde aportar para rebalancear
  async calculateContributionTarget(userId, amount) {
    const { allocation } = await this.calculateAllocation(userId);
    
    // Ordenar por maior desvio negativo (mais abaixo do target)
    const sorted = [...allocation]
      .filter(a => a.targetPercentage > 0)
      .sort((a, b) => a.deviation - b.deviation);

    if (sorted.length === 0) return [];

    const targets = [];
    let remainingAmount = amount;

    for (const asset of sorted) {
      if (asset.deviation >= 0 || remainingAmount <= 0) break;

      const neededToRebalance = Math.min(
        Math.abs(asset.adjustmentNeeded),
        remainingAmount
      );

      if (neededToRebalance > 0) {
        targets.push({
          assetClassId: asset.id,
          assetClassName: asset.name,
          amount: neededToRebalance,
          currentPercentage: asset.currentPercentage,
          targetPercentage: asset.targetPercentage
        });
        remainingAmount -= neededToRebalance;
      }
    }

    // Se sobrou dinheiro, distribuir proporcionalmente
    if (remainingAmount > 0) {
      const totalTarget = allocation.reduce((sum, a) => sum + a.targetPercentage, 0);
      for (const asset of allocation) {
        if (asset.targetPercentage > 0) {
          const proportional = (asset.targetPercentage / totalTarget) * remainingAmount;
          const existing = targets.find(t => t.assetClassId === asset.id);
          if (existing) {
            existing.amount += proportional;
          } else {
            targets.push({
              assetClassId: asset.id,
              assetClassName: asset.name,
              amount: proportional,
              currentPercentage: asset.currentPercentage,
              targetPercentage: asset.targetPercentage
            });
          }
        }
      }
    }

    return targets.map(t => ({
      ...t,
      amount: Math.round(t.amount * 100) / 100
    }));
  }

  // Calcular renda passiva estimada
  async calculatePassiveIncome(userId) {
    const result = await pool.query(`
      SELECT 
        ac.name as class_name,
        ac.expected_yield,
        SUM(a.quantity * a.current_price) as total_value,
        SUM(a.quantity * COALESCE(a.last_dividend, 0)) as monthly_dividends
      FROM asset_classes ac
      LEFT JOIN assets a ON a.asset_class_id = ac.id
      WHERE ac.user_id = $1
      GROUP BY ac.id
    `, [userId]);

    let totalMonthlyIncome = 0;
    const breakdown = [];

    for (const row of result.rows) {
      const value = parseFloat(row.total_value || 0);
      const yieldPercent = parseFloat(row.expected_yield || 0);
      const monthlyIncome = (value * yieldPercent / 100) / 12;
      
      totalMonthlyIncome += monthlyIncome;
      
      if (value > 0) {
        breakdown.push({
          className: row.class_name,
          value,
          yield: yieldPercent,
          monthlyIncome: Math.round(monthlyIncome * 100) / 100
        });
      }
    }

    return {
      totalMonthly: Math.round(totalMonthlyIncome * 100) / 100,
      totalAnnual: Math.round(totalMonthlyIncome * 12 * 100) / 100,
      breakdown
    };
  }
}

module.exports = new RebalanceService();
