const pool = require('../config/database');
const currencyService = require('./currency.service');

class RebalanceService {
  async calculateAllocation(userId) {
    try {
      // Garante coluna currency — aguarda conclusão antes de qualquer query
      try {
        await pool.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'BRL'`);
      } catch (_) { /* coluna já existe */ }

      // Busca cotação do dólar (cache 30min; fallback 1 para não quebrar cálculo)
      let usdRate = 1;
      try {
        usdRate = (await currencyService.getUsdToBrl()) || 1;
      } catch (_) { /* sem cotação, usa 1 (sem conversão) */ }

      // Query principal: converte USD → BRL diretamente no SQL
      const classesResult = await pool.query(`
        SELECT 
          ac.*,
          COALESCE(SUM(
            a.quantity
            * COALESCE(a.current_price, a.average_price)
            * CASE WHEN a.currency = 'USD' THEN $2::numeric ELSE 1 END
          ), 0) AS current_value,
          COALESCE(SUM(
            a.quantity
            * a.average_price
            * CASE WHEN a.currency = 'USD' THEN $2::numeric ELSE 1 END
          ), 0) AS invested_value
        FROM asset_classes ac
        LEFT JOIN assets a
          ON a.asset_class_id = ac.id
         AND a.user_id = ac.user_id
         AND a.quantity > 0
        WHERE ac.user_id = $1
        GROUP BY ac.id
        ORDER BY ac.target_percentage DESC
      `, [userId, usdRate]);

      const classes = classesResult.rows;
      const totalValue    = classes.reduce((s, c) => s + parseFloat(c.current_value  || 0), 0);
      const totalInvested = classes.reduce((s, c) => s + parseFloat(c.invested_value || 0), 0);

      const allocation = classes.map(c => {
        const currentValue      = parseFloat(c.current_value)   || 0;
        const investedValue     = parseFloat(c.invested_value)  || 0;
        const targetPercentage  = parseFloat(c.target_percentage) || 0;
        const currentPercentage = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
        const difference        = currentPercentage - targetPercentage;

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
        allocation,
        usdRate: usdRate === 1 ? null : usdRate
      };
    } catch (error) {
      console.error('Erro ao calcular alocação:', error);
      return { totalValue: 0, totalInvested: 0, totalGain: 0, gainPercentage: 0, allocation: [], usdRate: null };
    }
  }

  async calculatePassiveIncome(userId) {
    try {
      // 1. Dividendos reais recebidos nos últimos 12 meses
      const dividendsResult = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM dividends
        WHERE user_id = $1 AND payment_date >= NOW() - INTERVAL '12 months'
      `, [userId]);
      const annualDividends = parseFloat(dividendsResult.rows[0]?.total || 0);

      // Cotação do dólar para conversão (fallback 1 = sem conversão)
      let usdRate = 1;
      try {
        usdRate = (await currencyService.getUsdToBrl()) || 1;
      } catch (_) { /* sem cotação */ }

      // 2. Buscar todos os ativos com preço atual, DY e classe
      const assetsResult = await pool.query(`
        SELECT 
          a.id, a.ticker, a.quantity,
          COALESCE(a.current_price, a.average_price) as price,
          COALESCE(a.currency, 'BRL') as currency,
          a.dividend_yield,
          ac.name as class_name,
          ac.color,
          ac.expected_yield
        FROM assets a
        LEFT JOIN asset_classes ac ON ac.id = a.asset_class_id
        WHERE a.user_id = $1 AND a.quantity > 0
        ORDER BY (a.quantity * COALESCE(a.current_price, a.average_price)) DESC
      `, [userId]);

      let estimatedAnnual = 0;
      const breakdown = [];
      // Agrupar por classe para o breakdown
      const classMap = {};

      for (const asset of assetsResult.rows) {
        const priceOrig = parseFloat(asset.price || 0);
        // Converte para BRL se ativo em USD e temos cotação
        const priceBrl = (asset.currency === 'USD' && usdRate > 1) ? priceOrig * usdRate : priceOrig;
        const value = parseFloat(asset.quantity) * priceBrl;
        if (value <= 0) continue;

        // Prioridade: 1) dividend_yield do ativo (salvo no sync) 
        //             2) expected_yield da classe
        //             3) estimativa por nome da classe
        let yieldPercent = 0;

        if (asset.dividend_yield && parseFloat(asset.dividend_yield) > 0) {
          yieldPercent = parseFloat(asset.dividend_yield);
        } else if (asset.expected_yield && parseFloat(asset.expected_yield) > 0) {
          yieldPercent = parseFloat(asset.expected_yield);
        } else {
          // Estimativa por tipo de ativo baseada no nome da classe
          const name = (asset.class_name || '').toLowerCase();
          if (name.includes('renda fixa') || name.includes('tesouro') || name.includes('cdb') || name.includes('lci') || name.includes('lca')) {
            yieldPercent = 11;
          } else if (name.includes('fii') || name.includes('imobiliário') || name.includes('real estate')) {
            yieldPercent = 8;
          } else if (name.includes('dividendo') || name.includes('dividend')) {
            yieldPercent = 6;
          } else if (name.includes('ação') || name.includes('ações') || name.includes('br')) {
            yieldPercent = 4;
          } else if (name.includes('reit')) {
            yieldPercent = 5;
          } else if (name.includes('eua') || name.includes('us') || name.includes('internacional')) {
            yieldPercent = 3;
          } else if (name.includes('cripto') || name.includes('crypto') || name.includes('metal') || name.includes('ouro')) {
            yieldPercent = 0;
          } else {
            yieldPercent = 5;
          }
        }

        const estimated = value * (yieldPercent / 100);
        estimatedAnnual += estimated;

        // Agrupar por classe para o breakdown
        const cls = asset.class_name || 'Outros';
        if (!classMap[cls]) {
          classMap[cls] = {
            name: cls,
            color: asset.color || '#3B82F6',
            value: 0,
            yieldPercent,
            estimatedAnnual: 0,
          };
        }
        classMap[cls].value += value;
        classMap[cls].estimatedAnnual += estimated;
        // Média ponderada do yield da classe
        classMap[cls].yieldPercent = (classMap[cls].estimatedAnnual / classMap[cls].value) * 100;
      }

      for (const cls of Object.values(classMap)) {
        if (cls.value > 0) {
          breakdown.push({
            ...cls,
            estimatedMonthly: cls.estimatedAnnual / 12,
          });
        }
      }

      // Se há dividendos reais registrados (> estimativa), usar os reais
      const finalAnnual = annualDividends > estimatedAnnual * 0.5 ? annualDividends : estimatedAnnual;

      return {
        totalMonthly: Math.round(finalAnnual / 12 * 100) / 100,
        totalAnnual: Math.round(finalAnnual * 100) / 100,
        realizedLast12Months: annualDividends,
        estimatedAnnual: Math.round(estimatedAnnual * 100) / 100,
        breakdown,
      };
    } catch (error) {
      console.error('Erro ao calcular renda passiva:', error.message, error.stack);
      return { totalMonthly: 0, totalAnnual: 0, realizedLast12Months: 0, estimatedAnnual: 0, breakdown: [] };
    }
  }

  async generateRebalanceSuggestions(userId) {
    try {
      // Buscar threshold configurado pelo usuário (default 5%)
      let threshold = 5;
      try {
        const settingsRes = await pool.query(
          'SELECT rebalance_threshold FROM user_settings WHERE user_id = $1',
          [userId]
        );
        const raw = parseFloat(settingsRes.rows[0]?.rebalance_threshold);
        if (!isNaN(raw) && raw > 0) threshold = raw;
      } catch (_) {}

      const allocation = await this.calculateAllocation(userId);
      const suggestions = [];

      const overweight  = [];
      const underweight = [];

      for (const cls of allocation.allocation) {
        if (cls.targetPercentage <= 0) continue;
        const diff = cls.currentPercentage - cls.targetPercentage;
        if (diff > threshold) {
          overweight.push({ cls, diff });
        } else if (diff < 0) {
          underweight.push({ cls, diff });
        }
      }

      for (const { cls, diff } of overweight) {
        suggestions.push({
          type: 'REDUCE',
          classId: cls.id,
          className: cls.name,
          color: cls.color,
          currentPercentage: Math.round(cls.currentPercentage * 10) / 10,
          targetPercentage: cls.targetPercentage,
          difference: Math.round(diff * 10) / 10,
          message: cls.name + ' está ' + Math.abs(diff).toFixed(1) + '% acima do target. Evite aportar nesta classe.',
          priority: diff > threshold * 2 ? 'high' : 'medium'
        });
      }

      const hasOverweight = overweight.length > 0;
      for (const { cls, diff } of underweight) {
        const aboveThreshold = Math.abs(diff) > threshold;
        if (!hasOverweight && !aboveThreshold) continue;
        suggestions.push({
          type: 'INCREASE',
          classId: cls.id,
          className: cls.name,
          color: cls.color,
          currentPercentage: Math.round(cls.currentPercentage * 10) / 10,
          targetPercentage: cls.targetPercentage,
          difference: Math.round(diff * 10) / 10,
          message: cls.name + ' está ' + Math.abs(diff).toFixed(1) + '% abaixo do target. Priorize aportes nesta classe.',
          priority: Math.abs(diff) > threshold * 2 ? 'high' : 'medium'
        });
      }

      suggestions.sort((a, b) => {
        if (a.type === 'REDUCE' && b.type !== 'REDUCE') return -1;
        if (b.type === 'REDUCE' && a.type !== 'REDUCE') return 1;
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

  async generateIntraClassSuggestions(userId) {
    try {
      let threshold = 5;
      try {
        const settingsRes = await pool.query(
          'SELECT rebalance_threshold FROM user_settings WHERE user_id = $1',
          [userId]
        );
        const raw = parseFloat(settingsRes.rows[0]?.rebalance_threshold);
        if (!isNaN(raw) && raw > 0) threshold = raw;
      } catch (_) {}

      let usdRate = 1;
      try { usdRate = (await currencyService.getUsdToBrl()) || 1; } catch (_) {}

      const assetsRes = await pool.query(`
        SELECT
          a.id, a.ticker, a.name, a.quantity,
          COALESCE(a.current_price, a.average_price) AS price,
          COALESCE(a.currency, 'BRL') AS currency,
          a.average_price,
          ac.id   AS class_id,
          ac.name AS class_name,
          ac.color
        FROM assets a
        JOIN asset_classes ac ON ac.id = a.asset_class_id
        WHERE a.user_id = $1 AND a.quantity > 0
        ORDER BY ac.id, a.ticker
      `, [userId]);

      const classMap = {};
      for (const row of assetsRes.rows) {
        const priceBrl = (row.currency === 'USD' && usdRate > 1)
          ? parseFloat(row.price) * usdRate
          : parseFloat(row.price);
        const value = parseFloat(row.quantity) * priceBrl;

        if (!classMap[row.class_id]) {
          classMap[row.class_id] = {
            classId: row.class_id,
            className: row.class_name,
            color: row.color,
            assets: []
          };
        }
        classMap[row.class_id].assets.push({
          id: row.id,
          ticker: row.ticker || row.name,
          name: row.name,
          value
        });
      }

      const result = [];

      for (const cls of Object.values(classMap)) {
        const { assets } = cls;
        if (assets.length < 2) continue;

        const totalClassValue = assets.reduce((s, a) => s + a.value, 0);
        if (totalClassValue <= 0) continue;

        const idealPct   = 100 / assets.length;
        const idealValue = totalClassValue / assets.length;

        const assetsWithPct = assets.map(a => ({
          ...a,
          currentPct:   (a.value / totalClassValue) * 100,
          idealPct,
          deviation:    ((a.value / totalClassValue) * 100) - idealPct,
          surplusValue: a.value - idealValue
        }));

        const hasDeviation = assetsWithPct.some(a => Math.abs(a.deviation) > threshold);
        if (!hasDeviation) continue;

        const overweight  = assetsWithPct.filter(a => a.deviation >  threshold).sort((a, b) => b.deviation - a.deviation);
        const underweight = assetsWithPct.filter(a => a.deviation < -threshold).sort((a, b) => a.deviation - b.deviation);

        const transfers = [];
        const surplus = overweight.map(a => ({ ...a, available: a.surplusValue }));
        const deficit  = underweight.map(a => ({ ...a, needed: Math.abs(a.surplusValue) }));

        let si = 0, di = 0;
        while (si < surplus.length && di < deficit.length) {
          const move = Math.min(surplus[si].available, deficit[di].needed);
          if (move > 0.01) {
            transfers.push({
              from:  surplus[si].ticker,
              to:    deficit[di].ticker,
              value: Math.round(move * 100) / 100
            });
          }
          surplus[si].available -= move;
          deficit[di].needed    -= move;
          if (surplus[si].available < 0.01) si++;
          if (deficit[di].needed   < 0.01) di++;
        }

        result.push({
          classId:   cls.classId,
          className: cls.className,
          color:     cls.color,
          threshold,
          idealPct:  Math.round(idealPct * 10) / 10,
          assets: assetsWithPct.map(a => ({
            id:         a.id,
            ticker:     a.ticker,
            name:       a.name,
            value:      Math.round(a.value * 100) / 100,
            currentPct: Math.round(a.currentPct * 10) / 10,
            idealPct:   Math.round(a.idealPct * 10) / 10,
            deviation:  Math.round(a.deviation * 10) / 10,
            status:     a.deviation >  threshold ? 'over'
                      : a.deviation < -threshold ? 'under'
                      : 'ok'
          })),
          transfers,
          contributions: underweight.map(a => ({
            ticker:     a.ticker,
            name:       a.name,
            value:      Math.round(Math.abs(a.surplusValue) * 100) / 100,
            currentPct: Math.round(a.currentPct * 10) / 10,
            idealPct:   Math.round(a.idealPct * 10) / 10
          }))
        });
      }

      return result;
    } catch (error) {
      console.error('Erro ao gerar sugestões intra-classe:', error);
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