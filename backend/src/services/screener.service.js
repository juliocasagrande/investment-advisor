const pool = require('../config/database');

class ScreenerService {

  // Buscar dados fundamentalistas de uma ação via Brapi
  async getFundamentals(ticker, brapiToken) {
    try {
      const fetch = (await import('node-fetch')).default;
      
      const url = `https://brapi.dev/api/quote/${ticker}?token=${brapiToken}&fundamental=true`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Erro ao buscar ${ticker}:`, response.status);
        return null;
      }

      const data = await response.json();
      const stock = data.results?.[0];

      if (!stock) return null;

      return {
        ticker: stock.symbol,
        name: stock.longName || stock.shortName,
        price: stock.regularMarketPrice,
        // Indicadores fundamentalistas
        pl: stock.priceEarnings,
        pvp: stock.priceToBook,
        psr: stock.priceToSalesTrailing12Months,
        dividendYield: stock.dividendYield ? stock.dividendYield * 100 : null,
        evEbit: stock.enterpriseToEbit,
        evEbitda: stock.enterpriseToEbitda,
        margemEbit: stock.ebitMargins ? stock.ebitMargins * 100 : null,
        margemLiquida: stock.profitMargins ? stock.profitMargins * 100 : null,
        roe: stock.returnOnEquity ? stock.returnOnEquity * 100 : null,
        roic: stock.returnOnAssets ? stock.returnOnAssets * 100 : null, // Brapi não tem ROIC direto
        liquidezCorrente: stock.currentRatio,
        dividaPatrimonio: stock.debtToEquity ? stock.debtToEquity / 100 : null,
        crescimentoReceita: stock.revenueGrowth ? stock.revenueGrowth * 100 : null,
        valorMercado: stock.marketCap,
        volume: stock.regularMarketVolume,
        setor: stock.sector,
        industria: stock.industry
      };
    } catch (error) {
      console.error(`Erro ao buscar fundamentals de ${ticker}:`, error);
      return null;
    }
  }

  // Buscar lista de ações disponíveis
  async getAvailableStocks(brapiToken) {
    try {
      const fetch = (await import('node-fetch')).default;
      
      const url = `https://brapi.dev/api/quote/list?token=${brapiToken}&type=stock`;
      const response = await fetch(url);
      
      if (!response.ok) return [];

      const data = await response.json();
      return data.stocks || [];
    } catch (error) {
      console.error('Erro ao buscar lista de ações:', error);
      return [];
    }
  }

  // Aplicar filtros aos dados
  applyFilters(stock, filters) {
    const checks = [];

    // P/L
    if (filters.plMin !== undefined && filters.plMin !== null) {
      if (stock.pl === null || stock.pl < filters.plMin) return { pass: false, failed: 'P/L abaixo do mínimo' };
    }
    if (filters.plMax !== undefined && filters.plMax !== null) {
      if (stock.pl === null || stock.pl > filters.plMax) return { pass: false, failed: 'P/L acima do máximo' };
    }

    // P/VP
    if (filters.pvpMin !== undefined && filters.pvpMin !== null) {
      if (stock.pvp === null || stock.pvp < filters.pvpMin) return { pass: false, failed: 'P/VP abaixo do mínimo' };
    }
    if (filters.pvpMax !== undefined && filters.pvpMax !== null) {
      if (stock.pvp === null || stock.pvp > filters.pvpMax) return { pass: false, failed: 'P/VP acima do máximo' };
    }

    // PSR
    if (filters.psrMin !== undefined && filters.psrMin !== null) {
      if (stock.psr === null || stock.psr < filters.psrMin) return { pass: false, failed: 'PSR abaixo do mínimo' };
    }
    if (filters.psrMax !== undefined && filters.psrMax !== null) {
      if (stock.psr === null || stock.psr > filters.psrMax) return { pass: false, failed: 'PSR acima do máximo' };
    }

    // Dividend Yield
    if (filters.dyMin !== undefined && filters.dyMin !== null) {
      if (stock.dividendYield === null || stock.dividendYield < filters.dyMin) return { pass: false, failed: 'DY abaixo do mínimo' };
    }
    if (filters.dyMax !== undefined && filters.dyMax !== null) {
      if (stock.dividendYield === null || stock.dividendYield > filters.dyMax) return { pass: false, failed: 'DY acima do máximo' };
    }

    // EV/EBIT
    if (filters.evEbitMin !== undefined && filters.evEbitMin !== null) {
      if (stock.evEbit === null || stock.evEbit < filters.evEbitMin) return { pass: false, failed: 'EV/EBIT abaixo do mínimo' };
    }
    if (filters.evEbitMax !== undefined && filters.evEbitMax !== null) {
      if (stock.evEbit === null || stock.evEbit > filters.evEbitMax) return { pass: false, failed: 'EV/EBIT acima do máximo' };
    }

    // EV/EBITDA
    if (filters.evEbitdaMin !== undefined && filters.evEbitdaMin !== null) {
      if (stock.evEbitda === null || stock.evEbitda < filters.evEbitdaMin) return { pass: false, failed: 'EV/EBITDA abaixo do mínimo' };
    }
    if (filters.evEbitdaMax !== undefined && filters.evEbitdaMax !== null) {
      if (stock.evEbitda === null || stock.evEbitda > filters.evEbitdaMax) return { pass: false, failed: 'EV/EBITDA acima do máximo' };
    }

    // Margem EBIT
    if (filters.margemEbitMin !== undefined && filters.margemEbitMin !== null) {
      if (stock.margemEbit === null || stock.margemEbit < filters.margemEbitMin) return { pass: false, failed: 'Margem EBIT abaixo do mínimo' };
    }

    // Margem Líquida
    if (filters.margemLiquidaMin !== undefined && filters.margemLiquidaMin !== null) {
      if (stock.margemLiquida === null || stock.margemLiquida < filters.margemLiquidaMin) return { pass: false, failed: 'Margem Líquida abaixo do mínimo' };
    }

    // ROE
    if (filters.roeMin !== undefined && filters.roeMin !== null) {
      if (stock.roe === null || stock.roe < filters.roeMin) return { pass: false, failed: 'ROE abaixo do mínimo' };
    }

    // ROIC
    if (filters.roicMin !== undefined && filters.roicMin !== null) {
      if (stock.roic === null || stock.roic < filters.roicMin) return { pass: false, failed: 'ROIC abaixo do mínimo' };
    }

    // Liquidez Corrente
    if (filters.liquidezCorrenteMin !== undefined && filters.liquidezCorrenteMin !== null) {
      if (stock.liquidezCorrente === null || stock.liquidezCorrente < filters.liquidezCorrenteMin) return { pass: false, failed: 'Liquidez Corrente abaixo do mínimo' };
    }

    // Dívida/Patrimônio
    if (filters.dividaPatrimonioMax !== undefined && filters.dividaPatrimonioMax !== null) {
      if (stock.dividaPatrimonio === null || stock.dividaPatrimonio > filters.dividaPatrimonioMax) return { pass: false, failed: 'Dívida/PL acima do máximo' };
    }

    // Crescimento Receita
    if (filters.crescimentoReceitaMin !== undefined && filters.crescimentoReceitaMin !== null) {
      if (stock.crescimentoReceita === null || stock.crescimentoReceita < filters.crescimentoReceitaMin) return { pass: false, failed: 'Crescimento abaixo do mínimo' };
    }

    // Volume mínimo (liquidez das ações)
    if (filters.volumeMin !== undefined && filters.volumeMin !== null) {
      if (stock.volume === null || stock.volume < filters.volumeMin) return { pass: false, failed: 'Volume abaixo do mínimo' };
    }

    return { pass: true, failed: null };
  }

  // Calcular score de qualidade
  calculateQualityScore(stock) {
    let score = 0;
    let factors = 0;

    // P/L (menor é melhor, ideal entre 5-15)
    if (stock.pl !== null && stock.pl > 0) {
      if (stock.pl <= 10) score += 10;
      else if (stock.pl <= 15) score += 7;
      else if (stock.pl <= 20) score += 4;
      factors++;
    }

    // P/VP (menor é melhor, ideal < 1.5)
    if (stock.pvp !== null && stock.pvp > 0) {
      if (stock.pvp <= 1) score += 10;
      else if (stock.pvp <= 1.5) score += 7;
      else if (stock.pvp <= 2) score += 4;
      factors++;
    }

    // Dividend Yield (maior é melhor, ideal > 4%)
    if (stock.dividendYield !== null) {
      if (stock.dividendYield >= 6) score += 10;
      else if (stock.dividendYield >= 4) score += 7;
      else if (stock.dividendYield >= 2) score += 4;
      factors++;
    }

    // ROE (maior é melhor, ideal > 15%)
    if (stock.roe !== null) {
      if (stock.roe >= 20) score += 10;
      else if (stock.roe >= 15) score += 7;
      else if (stock.roe >= 10) score += 4;
      factors++;
    }

    // Margem Líquida (maior é melhor, ideal > 10%)
    if (stock.margemLiquida !== null) {
      if (stock.margemLiquida >= 15) score += 10;
      else if (stock.margemLiquida >= 10) score += 7;
      else if (stock.margemLiquida >= 5) score += 4;
      factors++;
    }

    // Liquidez Corrente (maior é melhor, ideal > 1.5)
    if (stock.liquidezCorrente !== null) {
      if (stock.liquidezCorrente >= 2) score += 10;
      else if (stock.liquidezCorrente >= 1.5) score += 7;
      else if (stock.liquidezCorrente >= 1) score += 4;
      factors++;
    }

    // Dívida/PL (menor é melhor, ideal < 1)
    if (stock.dividaPatrimonio !== null) {
      if (stock.dividaPatrimonio <= 0.5) score += 10;
      else if (stock.dividaPatrimonio <= 1) score += 7;
      else if (stock.dividaPatrimonio <= 2) score += 4;
      factors++;
    }

    return factors > 0 ? Math.round((score / (factors * 10)) * 100) : 0;
  }

  // Gerar recomendação
  generateRecommendation(stock, filterResult, qualityScore, isOwned) {
    if (!filterResult.pass) {
      return {
        action: isOwned ? 'AVALIAR_TROCA' : 'EVITAR',
        reason: filterResult.failed,
        priority: 'alta'
      };
    }

    if (qualityScore >= 70) {
      return {
        action: isOwned ? 'MANTER' : 'COMPRAR',
        reason: `Excelente score de qualidade (${qualityScore}%)`,
        priority: 'alta'
      };
    }

    if (qualityScore >= 50) {
      return {
        action: isOwned ? 'MANTER' : 'CONSIDERAR',
        reason: `Bom score de qualidade (${qualityScore}%)`,
        priority: 'media'
      };
    }

    return {
      action: isOwned ? 'AVALIAR_TROCA' : 'EVITAR',
      reason: `Score de qualidade baixo (${qualityScore}%)`,
      priority: 'baixa'
    };
  }
}

module.exports = new ScreenerService();
