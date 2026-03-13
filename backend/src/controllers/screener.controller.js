const pool = require('../config/database');
const axios = require('axios');

// ── Auto-healing ──────────────────────────────────────────────────────────────
async function ensureColumns() {
  const stmts = [
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS groq_api_key TEXT",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS brapi_token TEXT",
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS alphavantage_key TEXT",
    `CREATE TABLE IF NOT EXISTS screener_filters (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      filters JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, name)
    )`
  ];
  for (const sql of stmts) {
    try { await pool.query(sql); } catch (e) { }
  }
}
ensureColumns().catch(e => console.error('screener ensureColumns:', e.message));

// ── Listas de ativos ──────────────────────────────────────────────────────────
const STOCKS_BR = [
  'PETR4','VALE3','ITUB4','BBDC4','ABEV3','B3SA3','WEGE3','RENT3','EQTL3',
  'SUZB3','RADL3','RAIL3','JBSS3','BBAS3','SANB11','ITSA4','BPAC11','BBSE3',
  'PRIO3','FLRY3','HYPE3','KLBN11','EMBR3','VIVT3','CMIG4','ELET3','SBSP3',
  'TAEE11','CPFE3','EGIE3','RDOR3','QUAL3','HAPV3','TOTS3','LREN3','CSAN3',
  'ARZZ3','BRFS3','MRFG3','MRVE3','EVEN3','EZTC3','CCRO3','NTCO3','MULT3',
  'GRND3','PSSA3','GGBR4','CMIN3','CSNA3','USIM5',
];

const FIIS = [
  'MXRF11','CPTS11','KNCR11','KNIP11','HGLG11','BTLG11','XPLG11','VILG11',
  'XPML11','VISC11','HSML11','HGBS11','KNRI11','HGRE11','BRCR11','RBHG11',
  'RBRF11','KFOF11','MGFF11','HFOF11','IRDM11','VGIP11','RECR11','RBRP11',
];

const STOCKS_US = [
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','BRK-B','JPM','JNJ',
  'V','PG','UNH','HD','MA','DIS','BAC','XOM','PFE','KO',
  'WMT','CSCO','VZ','INTC','NFLX','ADBE','CRM','AMD','PYPL','QCOM',
];

const REITS = [
  'O','SPG','PLD','AMT','CCI','EQIX','PSA','DLR','VICI','WP',
  'NNN','EXR','AVB','EQR','MAA','UDR','CPT','AIR','KIM','REG',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getUserSettings(userId) {
  try {
    const r = await pool.query(
      'SELECT brapi_token, alphavantage_key, groq_api_key FROM user_settings WHERE user_id = $1',
      [userId]
    );
    return r.rows[0] || {};
  } catch (e) {
    return {};
  }
}

const ANALYZABLE_CATEGORIES = new Set(['stocks_br', 'fiis', 'etfs', 'acoes_br']);
const US_CATEGORIES = new Set(['stocks_us', 'reits']);

class ScreenerController {

  // ── Buscar ativos com filtros ─────────────────────────────────────────────
  async search(req, res) {
    try {
      const userId = req.userId;
      const { filters = {}, assetClass = 'stocks_br' } = req.body;
      const settings = await getUserSettings(userId);
      const groqKey = settings.groq_api_key || process.env.GROQ_API_KEY;

      let stocks = [];

      if (assetClass === 'stocks_us' || assetClass === 'reits') {
        // ── Ações EUA / REITs via AlphaVantage ───────────────────────────
        const alphaKey = settings.alphavantage_key || process.env.ALPHAVANTAGE_KEY;
        if (!alphaKey) {
          return res.status(400).json({
            error: 'Configure sua chave AlphaVantage nas configurações para buscar ações dos EUA.'
          });
        }
        const list = assetClass === 'reits' ? REITS : STOCKS_US;
        stocks = await this.fetchUSStocks(list, alphaKey, filters);

      } else {
        // ── Ações BR / FIIs via Brapi ─────────────────────────────────────
        const token = settings.brapi_token;
        if (!token) {
          return res.status(400).json({
            error: 'Configure seu token Brapi nas configurações para usar o Screener.'
          });
        }
        const list = assetClass === 'fiis' ? FIIS : STOCKS_BR;
        stocks = await this.fetchBRStocks(list, token, filters);
      }

      stocks.sort((a, b) => (b.score || 0) - (a.score || 0));
      const passed = stocks.filter(r => r.passFilters);

      let aiAnalysis = null;
      if (groqKey && passed.length > 0) {
        try {
          aiAnalysis = await this.getAIRecommendation(groqKey, passed.slice(0, 10), filters);
        } catch (e) {
          console.error('Groq error:', e.message);
        }
      }

      return res.json({ total: stocks.length, passed: passed.length, stocks, aiAnalysis });
    } catch (error) {
      console.error('Erro no screener search:', error);
      return res.status(500).json({ error: 'Erro ao buscar ações: ' + error.message });
    }
  }

  // ── Buscar ações BR/FII em lote via Brapi ─────────────────────────────────
  async fetchBRStocks(list, token, filters) {
    const unique = [...new Set(list)];
    const results = [];
    const batchSize = 8;

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize).join(',');
      try {
        const response = await axios.get(
          `https://brapi.dev/api/quote/${batch}?token=${token}&fundamental=true`,
          { timeout: 20000 }
        );
        if (response.data?.results) {
          for (const stock of response.data.results) {
            const fundamentals = this.extractBRFundamentals(stock);
            const passFilters = this.applyFilters(fundamentals, filters);
            const score = this.calculateScore(fundamentals, filters);
            results.push({
              ticker: stock.symbol,
              name: stock.longName || stock.shortName || stock.symbol,
              price: stock.regularMarketPrice,
              change: stock.regularMarketChangePercent,
              market: 'BR',
              ...fundamentals,
              score,
              passFilters,
              recommendation: score >= 70 ? 'COMPRAR' : score >= 50 ? 'MANTER' : 'AVALIAR'
            });
          }
        }
      } catch (e) {
        console.error(`Erro batch BR ${batch}:`, e.message);
      }
      if (i + batchSize < unique.length) await new Promise(r => setTimeout(r, 400));
    }
    return results;
  }

  // ── Buscar ações US via AlphaVantage ──────────────────────────────────────
  async fetchUSStocks(list, alphaKey, filters) {
    const results = [];
    // AlphaVantage free tier: 5 req/min — processar com delay
    for (const ticker of list) {
      try {
        const [quoteRes, overviewRes] = await Promise.allSettled([
          axios.get('https://www.alphavantage.co/query', {
            params: { function: 'GLOBAL_QUOTE', symbol: ticker, apikey: alphaKey },
            timeout: 10000
          }),
          axios.get('https://www.alphavantage.co/query', {
            params: { function: 'OVERVIEW', symbol: ticker, apikey: alphaKey },
            timeout: 10000
          })
        ]);

        const quote = quoteRes.status === 'fulfilled' ? quoteRes.value.data?.['Global Quote'] : null;
        const overview = overviewRes.status === 'fulfilled' ? overviewRes.value.data : null;

        if (!quote?.['05. price'] && !overview?.Symbol) continue;

        const fundamentals = this.extractUSFundamentals(quote, overview);
        const passFilters = this.applyFilters(fundamentals, filters);
        const score = this.calculateScore(fundamentals, filters);

        results.push({
          ticker,
          name: overview?.Name || ticker,
          price: parseFloat(quote?.['05. price'] || 0),
          change: parseFloat(quote?.['10. change percent']?.replace('%', '') || 0),
          market: 'US',
          sector: overview?.Sector,
          ...fundamentals,
          score,
          passFilters,
          recommendation: score >= 70 ? 'COMPRAR' : score >= 50 ? 'MANTER' : 'AVALIAR'
        });
      } catch (e) {
        console.error(`Erro US ${ticker}:`, e.message);
      }
      // AlphaVantage free: máx 5 req/min → 2 chamadas por ticker = delay
      await new Promise(r => setTimeout(r, 13000));
    }
    return results;
  }

  // ── Analisar posições do usuário ──────────────────────────────────────────
  async analyzePositions(req, res) {
    try {
      const userId = req.userId;
      const filters = req.body?.filters && Object.keys(req.body.filters).length > 0
        ? req.body.filters
        : {
            plMin: 5,      plMax: 15,
            pvpMin: 0.7,   pvpMax: 1.8,
            dyMin: 4,
            roicMin: 8,
            roeMin: 10,
            dividaPatrimonioMax: 2,
          };

      const assetsResult = await pool.query(`
        SELECT a.*, ac.category as class_category, ac.name as class_name
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1 AND a.quantity > 0
        ORDER BY (a.quantity * COALESCE(a.current_price, a.average_price)) DESC
      `, [userId]);

      if (assetsResult.rows.length === 0) {
        return res.json({
          analysis: [],
          summary: { manter: 0, avaliarTroca: 0, totalPositions: 0, avgQualityScore: 0 },
          aiAnalysis: null
        });
      }

      const settings = await getUserSettings(userId);
      const brapiToken = settings.brapi_token;
      const alphaKey   = settings.alphavantage_key || process.env.ALPHAVANTAGE_KEY;
      const groqKey    = settings.groq_api_key || process.env.GROQ_API_KEY;

      // Classificar ativos por tipo de análise
      const isBRAnalyzable = (a) =>
        ANALYZABLE_CATEGORIES.has(a.class_category) ||
        /^[A-Z]{3,6}\d{1,2}$/.test(a.ticker);

      const isUSAnalyzable = (a) =>
        US_CATEGORIES.has(a.class_category) ||
        /^[A-Z]{1,5}(-[A-Z])?$/.test(a.ticker);

      const brAssets  = assetsResult.rows.filter(isBRAnalyzable);
      const usAssets  = assetsResult.rows.filter(a => !isBRAnalyzable(a) && isUSAnalyzable(a));
      const other     = assetsResult.rows.filter(a => !isBRAnalyzable(a) && !isUSAnalyzable(a));

      const analysis = [];
      let manter = 0, avaliarTroca = 0, totalScore = 0, scoredCount = 0;

      // ── Análise BR ────────────────────────────────────────────────────────
      if (brAssets.length > 0) {
        if (!brapiToken) {
          brAssets.forEach(a => this.pushBasicPosition(analysis, a,
            'Configure token Brapi nas Configurações para análise fundamentalista'));
        } else {
          for (const asset of brAssets) {
            try {
              const resp = await axios.get(
                `https://brapi.dev/api/quote/${asset.ticker}?token=${brapiToken}&fundamental=true`,
                { timeout: 12000 }
              );
              const stockData = resp.data?.results?.[0];
              if (!stockData) {
                this.pushBasicPosition(analysis, asset, 'Dados não disponíveis na Brapi');
                continue;
              }

              const fundamentals = this.extractBRFundamentals(stockData);
              const score       = this.calculateScore(fundamentals, filters);
              const passFilters = this.applyFilters(fundamentals, filters);
              const violations  = this.getFilterViolations(fundamentals, filters);
              const action      = (passFilters && score >= 55) ? 'MANTER' : 'AVALIAR_TROCA';

              if (action === 'MANTER') manter++; else avaliarTroca++;
              totalScore += score; scoredCount++;

              const { currentValue, gainPercent } = this.calcPosition(asset, stockData.regularMarketPrice);

              analysis.push({
                ticker: asset.ticker,
                name: stockData.longName || stockData.shortName || asset.name || asset.ticker,
                quantity: asset.quantity,
                averagePrice: asset.average_price,
                currentPrice: stockData.regularMarketPrice || parseFloat(asset.current_price),
                currentValue, gainPercent,
                qualityScore: score, passFilters, violations,
                recommendation: {
                  action,
                  reason: this.getRecommendationReason(fundamentals, score, passFilters, violations)
                },
                fundamentals,
                assetClass: asset.class_name,
                market: 'BR'
              });
            } catch (e) {
              console.error(`Erro ao buscar ${asset.ticker}:`, e.message);
              this.pushBasicPosition(analysis, asset, 'Erro ao buscar dados na Brapi');
            }
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }

      // ── Análise EUA ───────────────────────────────────────────────────────
      if (usAssets.length > 0) {
        if (!alphaKey) {
          usAssets.forEach(a => this.pushBasicPosition(analysis, a,
            'Configure AlphaVantage nas Configurações para analisar ações dos EUA'));
        } else {
          for (const asset of usAssets) {
            try {
              const [quoteRes, overviewRes] = await Promise.allSettled([
                axios.get('https://www.alphavantage.co/query', {
                  params: { function: 'GLOBAL_QUOTE', symbol: asset.ticker, apikey: alphaKey },
                  timeout: 10000
                }),
                axios.get('https://www.alphavantage.co/query', {
                  params: { function: 'OVERVIEW', symbol: asset.ticker, apikey: alphaKey },
                  timeout: 10000
                })
              ]);

              const quote    = quoteRes.status === 'fulfilled' ? quoteRes.value.data?.['Global Quote'] : null;
              const overview = overviewRes.status === 'fulfilled' ? overviewRes.value.data : null;

              if (!quote?.['05. price'] && !overview?.Symbol) {
                this.pushBasicPosition(analysis, asset, 'Dados não disponíveis na AlphaVantage');
                continue;
              }

              const currentPx   = parseFloat(quote?.['05. price'] || asset.current_price || asset.average_price);
              const fundamentals = this.extractUSFundamentals(quote, overview);
              const score        = this.calculateScore(fundamentals, filters);
              const passFilters  = this.applyFilters(fundamentals, filters);
              const violations   = this.getFilterViolations(fundamentals, filters);
              const action       = (passFilters && score >= 55) ? 'MANTER' : 'AVALIAR_TROCA';

              if (action === 'MANTER') manter++; else avaliarTroca++;
              totalScore += score; scoredCount++;

              const { currentValue, gainPercent } = this.calcPosition(asset, currentPx);

              analysis.push({
                ticker: asset.ticker,
                name: overview?.Name || asset.name || asset.ticker,
                quantity: asset.quantity,
                averagePrice: asset.average_price,
                currentPrice: currentPx,
                currentValue, gainPercent,
                qualityScore: score, passFilters, violations,
                recommendation: {
                  action,
                  reason: this.getRecommendationReason(fundamentals, score, passFilters, violations)
                },
                fundamentals,
                assetClass: asset.class_name,
                market: 'US',
                sector: overview?.Sector
              });
            } catch (e) {
              console.error(`Erro ao buscar US ${asset.ticker}:`, e.message);
              this.pushBasicPosition(analysis, asset, 'Erro ao buscar dados na AlphaVantage');
            }
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      // ── Outros (renda fixa, cripto, etc.) ────────────────────────────────
      for (const asset of other) {
        const { currentValue, gainPercent } = this.calcPosition(asset, null);
        analysis.push({
          ticker: asset.ticker,
          name: asset.name || asset.ticker,
          quantity: asset.quantity,
          averagePrice: parseFloat(asset.average_price) || 0,
          currentPrice: parseFloat(asset.current_price) || parseFloat(asset.average_price) || 0,
          currentValue, gainPercent,
          qualityScore: null, passFilters: true, violations: [],
          recommendation: { action: 'MANTER', reason: 'Fora do escopo fundamentalista' },
          fundamentals: null,
          assetClass: asset.class_name,
          noFundamentals: true
        });
      }

      // Ordenar: com fundamentos primeiro, depois por valor
      analysis.sort((a, b) => {
        if (!!a.noFundamentals !== !!b.noFundamentals) return a.noFundamentals ? 1 : -1;
        return (b.currentValue || 0) - (a.currentValue || 0);
      });

      const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

      let aiAnalysis = null;
      const scoredPositions = analysis.filter(a => !a.noFundamentals && a.qualityScore != null);
      if (groqKey && scoredPositions.length > 0) {
        try {
          aiAnalysis = await this.getAIPortfolioAnalysis(groqKey, scoredPositions, filters);
        } catch (e) {
          console.error('Groq portfolio analysis error:', e.message);
        }
      }

      return res.json({
        analysis,
        summary: { manter, avaliarTroca, totalPositions: analysis.length, avgQualityScore: avgScore },
        aiAnalysis,
        filtersApplied: filters
      });
    } catch (error) {
      console.error('Erro analyzePositions:', error);
      return res.status(500).json({ error: 'Erro ao analisar posições: ' + error.message });
    }
  }

  // ── Sugestões de troca ────────────────────────────────────────────────────
  async getSuggestions(req, res) {
    try {
      const { ticker, filters = {} } = req.body;
      const userId = req.userId;
      const settings = await getUserSettings(userId);
      const token = settings.brapi_token;
      if (!token) return res.status(400).json({ error: 'Configure seu token Brapi' });

      const candidates = STOCKS_BR.filter(s => s !== ticker).slice(0, 20);
      const suggestions = [];

      for (const stock of candidates) {
        try {
          const response = await axios.get(
            `https://brapi.dev/api/quote/${stock}?token=${token}&fundamental=true`,
            { timeout: 10000 }
          );
          if (response.data?.results?.[0]) {
            const data = response.data.results[0];
            const fundamentals = this.extractBRFundamentals(data);
            const score = this.calculateScore(fundamentals, filters);
            if (this.applyFilters(fundamentals, filters)) {
              suggestions.push({
                ticker: stock,
                name: data.longName || stock,
                price: data.regularMarketPrice,
                ...fundamentals,
                score
              });
            }
          }
        } catch (e) { }
        await new Promise(r => setTimeout(r, 200));
      }

      suggestions.sort((a, b) => b.score - a.score);
      return res.json({ suggestions: suggestions.slice(0, 5) });
    } catch (error) {
      console.error('Erro getSuggestions:', error);
      return res.status(500).json({ error: 'Erro ao buscar sugestões' });
    }
  }

  async getFundamentals(req, res) {
    try {
      const { ticker } = req.params;
      const settings = await getUserSettings(req.userId);
      const token = settings.brapi_token;
      if (!token) return res.status(400).json({ error: 'Configure seu token Brapi' });

      const response = await axios.get(
        `https://brapi.dev/api/quote/${ticker}?token=${token}&fundamental=true`,
        { timeout: 10000 }
      );
      if (!response.data?.results?.[0]) return res.status(404).json({ error: 'Ação não encontrada' });

      const stock = response.data.results[0];
      const fundamentals = this.extractBRFundamentals(stock);
      return res.json({
        ticker: stock.symbol, name: stock.longName,
        price: stock.regularMarketPrice,
        ...fundamentals,
        score: this.calculateScore(fundamentals, {})
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  }

  async saveFilters(req, res) {
    try {
      const { name, filters } = req.body;
      await pool.query(`
        INSERT INTO screener_filters (user_id, name, filters)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, name) DO UPDATE SET filters = $3, updated_at = NOW()
      `, [req.userId, name, JSON.stringify(filters)]);
      return res.json({ message: 'Filtros salvos' });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao salvar' });
    }
  }

  async listFilters(req, res) {
    try {
      const result = await pool.query('SELECT * FROM screener_filters WHERE user_id = $1', [req.userId]);
      return res.json({ filters: result.rows });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao listar' });
    }
  }

  // ── Extração de fundamentals ──────────────────────────────────────────────

  // Brapi: campos corretos com conversões certas
  extractBRFundamentals(stock) {
    return {
      pl:               stock.priceEarnings ?? null,
      pvp:              stock.priceToBook ?? null,
      psr:              stock.priceToSalesTrailing12Months ?? null,
      // Brapi retorna dividendYield como decimal (ex: 0.065 = 6.5%) — multiplicar por 100
      dy:               stock.dividendYield != null ? stock.dividendYield * 100 : null,
      evEbitda:         stock.enterpriseToEbitda ?? null,
      // ebitMargins (não ebitdaMargins!) para Margem EBIT
      margemEbit:       stock.ebitMargins != null ? stock.ebitMargins * 100 : null,
      margemLiquida:    stock.profitMargins != null ? stock.profitMargins * 100 : null,
      liquidezCorrente: stock.currentRatio ?? null,
      // returnOnAssets é usado como proxy de ROIC (Brapi não tem ROIC direto)
      roic:             stock.returnOnAssets != null ? stock.returnOnAssets * 100 : null,
      roe:              stock.returnOnEquity != null ? stock.returnOnEquity * 100 : null,
      // debtToEquity na Brapi já vem em percentual (ex: 150 = 1.5x) — dividir por 100
      dividaPl:         stock.debtToEquity != null ? stock.debtToEquity / 100 : null,
      crescReceita:     stock.revenueGrowth != null ? stock.revenueGrowth * 100 : null,
    };
  }

  // AlphaVantage: campos do OVERVIEW endpoint
  extractUSFundamentals(quote, overview) {
    const safe = (v) => {
      const n = parseFloat(v);
      return isNaN(n) || !isFinite(n) ? null : n;
    };
    return {
      pl:               safe(overview?.PERatio),
      pvp:              safe(overview?.PriceToBookRatio),
      psr:              safe(overview?.PriceToSalesRatioTTM),
      // AlphaVantage DividendYield já vem como decimal (ex: 0.015 = 1.5%)
      dy:               overview?.DividendYield ? safe(overview.DividendYield) * 100 : null,
      evEbitda:         safe(overview?.EVToEBITDA),
      margemEbit:       safe(overview?.OperatingMarginTTM) != null
                          ? safe(overview.OperatingMarginTTM) * 100 : null,
      margemLiquida:    safe(overview?.ProfitMargin) != null
                          ? safe(overview.ProfitMargin) * 100 : null,
      liquidezCorrente: safe(overview?.CurrentRatio),
      roic:             safe(overview?.ReturnOnAssetsTTM) != null
                          ? safe(overview.ReturnOnAssetsTTM) * 100 : null,
      roe:              safe(overview?.ReturnOnEquityTTM) != null
                          ? safe(overview.ReturnOnEquityTTM) * 100 : null,
      dividaPl:         safe(overview?.DebtToEquityRatio),
      crescReceita:     safe(overview?.QuarterlyRevenueGrowthYOY) != null
                          ? safe(overview.QuarterlyRevenueGrowthYOY) * 100 : null,
    };
  }

  // ── Filtros ───────────────────────────────────────────────────────────────
  applyFilters(data, filters) {
    if (!filters || Object.keys(filters).length === 0) return true;
    const map = {
      pl:               [filters.plMin,                 filters.plMax],
      pvp:              [filters.pvpMin,                filters.pvpMax],
      psr:              [filters.psrMin,                filters.psrMax],
      dy:               [filters.dyMin,                 filters.dyMax],
      evEbitda:         [filters.evEbitdaMin,           filters.evEbitdaMax],
      margemEbit:       [filters.margemEbitMin,         filters.margemEbitMax],
      margemLiquida:    [filters.margemLiquidaMin,      filters.margemLiquidaMax],
      liquidezCorrente: [filters.liquidezCorrenteMin,   filters.liquidezCorrenteMax],
      roic:             [filters.roicMin,               filters.roicMax],
      roe:              [filters.roeMin,                filters.roeMax],
      dividaPl:         [filters.dividaPatrimonioMin,   filters.dividaPatrimonioMax],
      crescReceita:     [filters.crescimentoReceitaMin, filters.crescimentoReceitaMax],
    };
    for (const [field, [min, max]] of Object.entries(map)) {
      const val = data[field];
      if (val == null) continue;
      if (min != null && !isNaN(min) && val < parseFloat(min)) return false;
      if (max != null && !isNaN(max) && val > parseFloat(max)) return false;
    }
    return true;
  }

  getFilterViolations(data, filters) {
    const violations = [];
    const checks = [
      ['P/L',      'pl',               filters.plMin,                 filters.plMax],
      ['P/VP',     'pvp',              filters.pvpMin,                filters.pvpMax],
      ['PSR',      'psr',              filters.psrMin,                filters.psrMax],
      ['DY',       'dy',               filters.dyMin,                 filters.dyMax],
      ['EV/EBITDA','evEbitda',         filters.evEbitdaMin,           filters.evEbitdaMax],
      ['M.EBIT',   'margemEbit',       filters.margemEbitMin,         filters.margemEbitMax],
      ['M.Líq',    'margemLiquida',    filters.margemLiquidaMin,      filters.margemLiquidaMax],
      ['Liq.Cor',  'liquidezCorrente', filters.liquidezCorrenteMin,   filters.liquidezCorrenteMax],
      ['ROIC',     'roic',             filters.roicMin,               filters.roicMax],
      ['ROE',      'roe',              filters.roeMin,                filters.roeMax],
      ['Dív/PL',   'dividaPl',        filters.dividaPatrimonioMin,   filters.dividaPatrimonioMax],
      ['Cresc.',   'crescReceita',     filters.crescimentoReceitaMin, filters.crescimentoReceitaMax],
    ];
    for (const [label, field, min, max] of checks) {
      const val = data[field];
      if (val == null) continue;
      if (min != null && !isNaN(min) && val < parseFloat(min))
        violations.push(`${label} baixo (${val.toFixed(1)})`);
      else if (max != null && !isNaN(max) && val > parseFloat(max))
        violations.push(`${label} alto (${val.toFixed(1)})`);
    }
    return violations;
  }

  calculateScore(data, filters = {}) {
    let score = 50;
    const inRange = (val, min, max) =>
      val != null &&
      (min == null || val >= parseFloat(min)) &&
      (max == null || val <= parseFloat(max));

    // P/L
    if (data.pl != null && data.pl > 0) {
      if (inRange(data.pl, filters.plMin, filters.plMax)) score += 10;
      else if (data.pl > 0 && data.pl <= 10) score += 3;
      else score -= 10;
    }
    // P/VP
    if (data.pvp != null) {
      if (inRange(data.pvp, filters.pvpMin, filters.pvpMax)) score += 8;
      else if (data.pvp < 1) score += 3;
      else if (data.pvp > 3) score -= 10;
    }
    // DY
    if (data.dy != null) {
      if (inRange(data.dy, filters.dyMin, filters.dyMax)) score += 10;
      else if (data.dy > 6) score += 6;
      else if (data.dy > 4) score += 3;
      else if (filters.dyMin && data.dy < filters.dyMin) score -= 5;
    }
    // ROE
    if (data.roe != null) {
      if (inRange(data.roe, filters.roeMin, filters.roeMax)) score += 10;
      else if (data.roe > 20) score += 6;
      else if (data.roe > 15) score += 3;
      else if (filters.roeMin && data.roe < filters.roeMin) score -= 8;
    }
    // ROIC
    if (data.roic != null) {
      if (inRange(data.roic, filters.roicMin, filters.roicMax)) score += 7;
      else if (data.roic > 15) score += 4;
      else if (filters.roicMin && data.roic < filters.roicMin) score -= 5;
    }
    // Margem Líquida
    if (data.margemLiquida != null) {
      if (inRange(data.margemLiquida, filters.margemLiquidaMin, filters.margemLiquidaMax)) score += 5;
      else if (data.margemLiquida > 15) score += 3;
      else if (filters.margemLiquidaMin && data.margemLiquida < filters.margemLiquidaMin) score -= 5;
    }
    // Dívida/PL
    if (data.dividaPl != null) {
      if (inRange(data.dividaPl, filters.dividaPatrimonioMin, filters.dividaPatrimonioMax)) score += 5;
      else if (data.dividaPl < 0.5) score += 3;
      else if (filters.dividaPatrimonioMax && data.dividaPl > filters.dividaPatrimonioMax) score -= 12;
      else if (data.dividaPl > 2) score -= 8;
    }
    // Crescimento
    if (data.crescReceita != null) {
      if (inRange(data.crescReceita, filters.crescimentoReceitaMin, filters.crescimentoReceitaMax)) score += 5;
      else if (data.crescReceita > 10) score += 3;
      else if (filters.crescimentoReceitaMin && data.crescReceita < filters.crescimentoReceitaMin) score -= 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  getRecommendationReason(f, score, passFilters, violations) {
    if (!passFilters && violations?.length > 0)
      return `Fora dos filtros: ${violations.slice(0, 2).join('; ')}`;
    const positives = [];
    if (f.roe != null && f.roe > 15)  positives.push(`ROE forte (${f.roe.toFixed(1)}%)`);
    if (f.dy  != null && f.dy  > 5)   positives.push(`DY atrativo (${f.dy.toFixed(1)}%)`);
    if (f.pvp != null && f.pvp < 1)   positives.push(`P/VP < 1 (${f.pvp.toFixed(2)})`);
    if (score >= 55 && positives.length) return positives[0];
    if (score < 55) return 'Indicadores abaixo dos parâmetros definidos';
    return 'Indicadores dentro dos parâmetros';
  }

  // ── Helpers de posição ────────────────────────────────────────────────────
  calcPosition(asset, currentPx) {
    const avgPrice     = parseFloat(asset.average_price) || 0;
    const qty          = parseFloat(asset.quantity) || 0;
    const px           = currentPx || parseFloat(asset.current_price) || avgPrice;
    const invested     = qty * avgPrice;
    const currentValue = qty * px;
    const gainPercent  = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;
    return { currentValue, gainPercent };
  }

  pushBasicPosition(analysis, asset, reason) {
    const { currentValue, gainPercent } = this.calcPosition(asset, null);
    analysis.push({
      ticker: asset.ticker,
      name: asset.name || asset.ticker,
      quantity: asset.quantity,
      averagePrice: parseFloat(asset.average_price) || 0,
      currentPrice: parseFloat(asset.current_price) || parseFloat(asset.average_price) || 0,
      currentValue, gainPercent,
      qualityScore: null, passFilters: false, violations: [],
      recommendation: { action: 'AVALIAR', reason },
      fundamentals: {},
      assetClass: asset.class_name,
      noFundamentals: true
    });
  }

  // ── IA ────────────────────────────────────────────────────────────────────
  async getAIRecommendation(apiKey, stocks, filters) {
    const summary = stocks.slice(0, 8).map(s =>
      `${s.ticker}(${s.market||'BR'}): Score=${s.score}, P/L=${s.pl?.toFixed(1)??'-'}, DY=${s.dy?.toFixed(1)??'-'}%, ROE=${s.roe?.toFixed(1)??'-'}%`
    ).join('\n');

    const filtersDesc = Object.entries(filters).filter(([,v])=>v!=null)
      .map(([k,v])=>`${k}=${v}`).join(', ');

    const prompt = `Analista de ações. Filtros do investidor: ${filtersDesc||'padrão'}.
Ativos que passaram:
${summary}
Retorne APENAS JSON:
{"topPicks":[{"ticker":"XX","reason":"motivo","conviction":"alta|media|baixa","horizon":"curto|medio|longo prazo"}],"marketComment":"2-3 frases","riskWarning":"1 frase"}
Máximo 3 topPicks.`;

    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions',
      { model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Analista financeiro. Responda APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: prompt }
        ], max_tokens: 800, temperature: 0.5 },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );
    const content = resp.data?.choices?.[0]?.message?.content || '';
    const clean = content.trim().replace(/```json\s*/g,'').replace(/```\s*/g,'');
    const match = clean.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : clean);
  }

  async getAIPortfolioAnalysis(apiKey, positions, filters) {
    const summary = positions.slice(0, 12).map(p => {
      const v = p.violations?.length > 0 ? ` | Viola: ${p.violations.join(', ')}` : '';
      return `${p.ticker}(${p.market||'BR'}): Score=${p.qualityScore}, Ganho=${p.gainPercent?.toFixed(1)}%, Ação=${p.recommendation?.action}${v}`;
    }).join('\n');

    const filtersDesc = [
      filters.plMin||filters.plMax ? `P/L ${filters.plMin??'?'}–${filters.plMax??'?'}` : null,
      filters.dyMin ? `DY mín ${filters.dyMin}%` : null,
      filters.roeMin ? `ROE mín ${filters.roeMin}%` : null,
      filters.dividaPatrimonioMax ? `Dív/PL máx ${filters.dividaPatrimonioMax}` : null,
    ].filter(Boolean).join(', ');

    const prompt = `Analise o portfólio (critérios: ${filtersDesc||'padrão'}):
${summary}
Retorne APENAS JSON:
{"portfolioScore":75,"summary":"2 frases","strengths":["ponto1"],"weaknesses":["ponto1 com ticker"],"suggestion":"ação imediata"}`;

    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions',
      { model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Analista financeiro brasileiro sênior. Responda APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: prompt }
        ], max_tokens: 700, temperature: 0.5 },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );
    const content = resp.data?.choices?.[0]?.message?.content || '';
    const clean = content.trim().replace(/```json\s*/g,'').replace(/```\s*/g,'');
    const match = clean.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : clean);
  }
}

module.exports = new ScreenerController();