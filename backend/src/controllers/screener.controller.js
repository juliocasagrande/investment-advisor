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
    try { await pool.query(sql); } catch (e) { /* ignora */ }
  }
}
ensureColumns().catch(e => console.error('screener ensureColumns:', e.message));

// ── Listas de ativos ──────────────────────────────────────────────────────────
const STOCK_LIST = [
  'PETR4','PETR3','VALE3','ITUB4','BBDC4','ABEV3','B3SA3','WEGE3','RENT3',
  'EQTL3','SUZB3','RADL3','RAIL3','JBSS3','GGBR4','BBAS3','SANB11','ITSA4',
  'BPAC11','BBSE3','PRIO3','FLRY3','HYPE3','KLBN11','EMBR3','VIVT3','CMIG4',
  'ELET3','ELET6','SBSP3','TAEE11','CPFE3','EGIE3','RDOR3','QUAL3','HAPV3',
  'TOTS3','LREN3','CSAN3','ARZZ3','MGLU3','SOMA3','BRFS3','MRFG3','SLCE3',
  'MRVE3','EVEN3','EZTC3','CCRO3','ECOR3','NTCO3','MULT3','GRND3','PSSA3',
];

const FII_LIST = [
  'MXRF11','CPTS11','KNCR11','KNIP11','HGLG11','BTLG11','XPLG11','VILG11',
  'XPML11','VISC11','HSML11','HGBS11','KNRI11','HGRE11','BRCR11','RBHG11',
  'RBRF11','KFOF11','MGFF11','HFOF11',
];

// ── Helper: configurações do usuário ─────────────────────────────────────────
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

// Categorias de classes que têm fundamentos analisáveis via Brapi
const ANALYZABLE_CATEGORIES = new Set(['stocks_br', 'fiis', 'etfs', 'acoes_br']);

class ScreenerController {

  // ── Buscar ações com filtros ──────────────────────────────────────────────
  async search(req, res) {
    try {
      const userId = req.userId;
      const { filters = {}, assetClass = 'stocks' } = req.body;
      const settings = await getUserSettings(userId);
      const token = settings.brapi_token;
      const groqKey = settings.groq_api_key || process.env.GROQ_API_KEY;

      if (!token) {
        return res.status(400).json({ error: 'Configure seu token Brapi nas configurações para usar o Screener.' });
      }

      const listToSearch = [...new Set(assetClass === 'fiis' ? FII_LIST : STOCK_LIST)];
      const results = [];
      const batchSize = 8;

      for (let i = 0; i < listToSearch.length; i += batchSize) {
        const batch = listToSearch.slice(i, i + batchSize).join(',');
        try {
          const response = await axios.get(
            `https://brapi.dev/api/quote/${batch}?token=${token}&fundamental=true`,
            { timeout: 20000 }
          );
          if (response.data?.results) {
            for (const stock of response.data.results) {
              const fundamentals = this.extractFundamentals(stock);
              const passesFilter = this.applyFilters(fundamentals, filters);
              const score = this.calculateScore(fundamentals, filters);
              results.push({
                ticker: stock.symbol,
                name: stock.longName || stock.shortName || stock.symbol,
                price: stock.regularMarketPrice,
                change: stock.regularMarketChangePercent,
                ...fundamentals,
                score,
                passFilters: passesFilter,
                recommendation: score >= 70 ? 'COMPRAR' : score >= 50 ? 'MANTER' : 'AVALIAR'
              });
            }
          }
        } catch (e) {
          console.error(`Erro batch ${batch}:`, e.message);
        }
        if (i + batchSize < listToSearch.length) await new Promise(r => setTimeout(r, 400));
      }

      results.sort((a, b) => (b.score || 0) - (a.score || 0));
      const passed = results.filter(r => r.passFilters);

      let aiAnalysis = null;
      if (groqKey && passed.length > 0) {
        try {
          aiAnalysis = await this.getAIRecommendation(groqKey, passed.slice(0, 10), filters);
        } catch (e) {
          console.error('Groq error:', e.message);
        }
      }

      return res.json({ total: results.length, passed: passed.length, stocks: results, aiAnalysis });
    } catch (error) {
      console.error('Erro no screener search:', error);
      return res.status(500).json({ error: 'Erro ao buscar ações: ' + error.message });
    }
  }

  // ── Analisar posições do usuário ──────────────────────────────────────────
  async analyzePositions(req, res) {
    try {
      const userId = req.userId;
      // Aceitar filtros do body (POST) — se não enviados, usa DEFAULT_FILTERS
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
        SELECT 
          a.*,
          ac.category as class_category,
          ac.name as class_name
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
      const token = settings.brapi_token;
      const groqKey = settings.groq_api_key || process.env.GROQ_API_KEY;

      // Determinar quais ativos têm fundamentos analisáveis:
      // 1. Classe com categoria analisável, OU
      // 2. Ativo com ticker que parece ação BR (letras + número, sem ponto — ex: PETR4, MXRF11)
      //    e mercado BR
      const isAnalyzable = (asset) => {
        if (ANALYZABLE_CATEGORIES.has(asset.class_category)) return true;
        // fallback: ticker BR típico (4 letras + 1-2 dígitos, ou FII com 11)
        if (/^[A-Z]{3,6}\d{1,2}$/.test(asset.ticker) && asset.market !== 'US') return true;
        return false;
      };

      const brEquityAssets = assetsResult.rows.filter(isAnalyzable);
      const otherAssets    = assetsResult.rows.filter(a => !isAnalyzable(a));

      const analysis = [];
      let manter = 0, avaliarTroca = 0, totalScore = 0, scoredCount = 0;

      // ── Analisar com fundamentos (Brapi) ──────────────────────────────────
      if (brEquityAssets.length > 0) {
        if (!token) {
          // Sem token: inclui todos sem fundamentals
          for (const asset of brEquityAssets) {
            this.pushBasicPosition(analysis, asset,
              'Configure token Brapi nas Configurações para análise fundamentalista');
          }
        } else {
          for (const asset of brEquityAssets) {
            try {
              const response = await axios.get(
                `https://brapi.dev/api/quote/${asset.ticker}?token=${token}&fundamental=true`,
                { timeout: 12000 }
              );
              const stockData = response.data?.results?.[0];
              if (!stockData) {
                this.pushBasicPosition(analysis, asset, 'Dados não disponíveis na Brapi');
                continue;
              }

              const fundamentals = this.extractFundamentals(stockData);
              const score        = this.calculateScore(fundamentals, filters);
              const passFilters  = this.applyFilters(fundamentals, filters);

              // Decisão: MANTER se passa nos filtros E score >= 55
              //          AVALIAR_TROCA se falha em qualquer um dos critérios
              const action = (passFilters && score >= 55) ? 'MANTER' : 'AVALIAR_TROCA';

              if (action === 'MANTER') manter++;
              else avaliarTroca++;
              totalScore += score;
              scoredCount++;

              const avgPrice    = parseFloat(asset.average_price) || 0;
              const qty         = parseFloat(asset.quantity) || 0;
              const currentPx   = stockData.regularMarketPrice || parseFloat(asset.current_price) || avgPrice;
              const invested     = qty * avgPrice;
              const currentValue = qty * currentPx;
              const gainPercent  = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;

              // Quais filtros o ativo violou
              const violations = this.getFilterViolations(fundamentals, filters);

              analysis.push({
                ticker: asset.ticker,
                name: stock.longName || asset.name || asset.ticker,
                quantity:     asset.quantity,
                averagePrice: asset.average_price,
                currentPrice: currentPx,
                currentValue,
                gainPercent,
                qualityScore: score,
                passFilters,
                violations,        // lista de filtros violados
                recommendation: {
                  action,
                  reason: this.getRecommendationReason(fundamentals, score, passFilters, violations)
                },
                fundamentals,
                assetClass: asset.class_name
              });
            } catch (e) {
              console.error(`Erro ao buscar ${asset.ticker}:`, e.message);
              this.pushBasicPosition(analysis, asset, 'Erro ao buscar dados');
            }
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }

      // ── Outros ativos (sem fundamentals) ─────────────────────────────────
      for (const asset of otherAssets) {
        const avgPrice     = parseFloat(asset.average_price) || 0;
        const qty          = parseFloat(asset.quantity) || 0;
        const currentPx    = parseFloat(asset.current_price) || avgPrice;
        const invested      = qty * avgPrice;
        const currentValue  = qty * currentPx;
        const gainPercent   = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;
        analysis.push({
          ticker: asset.ticker,
          name:   asset.name || asset.ticker,
          quantity:     asset.quantity,
          averagePrice: avgPrice,
          currentPrice: currentPx,
          currentValue,
          gainPercent,
          qualityScore: null,
          passFilters: true,
          violations: [],
          recommendation: { action: 'MANTER', reason: 'Fora do escopo fundamentalista' },
          fundamentals: null,
          assetClass: asset.class_name,
          noFundamentals: true
        });
      }

      // Ordenar: com fundamentos primeiro, depois por valor
      analysis.sort((a, b) => {
        if (a.noFundamentals !== b.noFundamentals) return a.noFundamentals ? 1 : -1;
        return (b.currentValue || 0) - (a.currentValue || 0);
      });

      const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

      // ── Análise IA do portfólio ───────────────────────────────────────────
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
        filtersApplied: filters   // devolver filtros usados para o frontend exibir
      });
    } catch (error) {
      console.error('Erro analyzePositions:', error);
      return res.status(500).json({ error: 'Erro ao analisar posições: ' + error.message });
    }
  }

  // Helper: push básico sem fundamentals
  pushBasicPosition(analysis, asset, reason) {
    const avgPrice     = parseFloat(asset.average_price) || 0;
    const qty          = parseFloat(asset.quantity) || 0;
    const currentPx    = parseFloat(asset.current_price) || avgPrice;
    const invested      = qty * avgPrice;
    const currentValue  = qty * currentPx;
    const gainPercent   = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;
    analysis.push({
      ticker: asset.ticker,
      name:   asset.name || asset.ticker,
      quantity: asset.quantity,
      averagePrice: avgPrice,
      currentPrice: currentPx,
      currentValue,
      gainPercent,
      qualityScore: null,
      passFilters: false,
      violations: [],
      recommendation: { action: 'AVALIAR', reason },
      fundamentals: {},
      assetClass: asset.class_name,
      noFundamentals: true
    });
  }

  // ── Sugestões de troca ────────────────────────────────────────────────────
  async getSuggestions(req, res) {
    try {
      const { ticker, filters = {} } = req.body;
      const userId = req.userId;
      const settings = await getUserSettings(userId);
      const token = settings.brapi_token;
      if (!token) return res.status(400).json({ error: 'Configure seu token Brapi' });

      const suggestions = [];
      const candidates = STOCK_LIST.filter(s => s !== ticker).slice(0, 20);

      for (const stock of candidates) {
        try {
          const response = await axios.get(
            `https://brapi.dev/api/quote/${stock}?token=${token}&fundamental=true`,
            { timeout: 10000 }
          );
          if (response.data?.results?.[0]) {
            const data = response.data.results[0];
            const fundamentals = this.extractFundamentals(data);
            const score = this.calculateScore(fundamentals, filters);
            const passes = this.applyFilters(fundamentals, filters);
            if (passes) {
              suggestions.push({
                ticker: stock,
                name: data.longName || stock,
                price: data.regularMarketPrice,
                ...fundamentals,
                score
              });
            }
          }
        } catch (e) { /* ignora individual */ }
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
      const fundamentals = this.extractFundamentals(stock);
      const score = this.calculateScore(fundamentals, {});

      return res.json({ ticker: stock.symbol, name: stock.longName, price: stock.regularMarketPrice, ...fundamentals, score });
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

  // ── AI ────────────────────────────────────────────────────────────────────
  async getAIRecommendation(apiKey, stocks, filters) {
    const stocksSummary = stocks.slice(0, 8).map(s =>
      `${s.ticker}: Score=${s.score}, P/L=${s.pl?.toFixed(1) ?? '-'}, P/VP=${s.pvp?.toFixed(2) ?? '-'}, DY=${s.dy?.toFixed(1) ?? '-'}%, ROE=${s.roe?.toFixed(1) ?? '-'}%`
    ).join('\n');

    const filtersDesc = Object.entries(filters)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

    const prompt = `Você é um analista de ações brasileiras. O investidor usa estes filtros: ${filtersDesc || 'padrão'}.

Ações que passaram nos filtros:
${stocksSummary}

Retorne APENAS JSON válido:
{
  "topPicks": [{"ticker":"XX","reason":"motivo objetivo","conviction":"alta|media|baixa","horizon":"curto|medio|longo prazo"}],
  "marketComment": "comentário 2-3 frases sobre o conjunto",
  "riskWarning": "aviso 1 frase"
}
Máximo 3 topPicks. Base a análise nos filtros do investidor.`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Analista financeiro brasileiro. Responda APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800, temperature: 0.5
      },
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    const clean = content.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const match = clean.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : clean);
  }

  async getAIPortfolioAnalysis(apiKey, positions, filters) {
    const positionsSummary = positions.slice(0, 12).map(p => {
      const violations = p.violations?.length > 0 ? ` | Viola: ${p.violations.join(', ')}` : '';
      return `${p.ticker}: Score=${p.qualityScore}, Ganho=${p.gainPercent?.toFixed(1)}%, Ação=${p.recommendation?.action}${violations}`;
    }).join('\n');

    const filtersDesc = [
      filters.plMin || filters.plMax ? `P/L ${filters.plMin ?? '?'}–${filters.plMax ?? '?'}` : null,
      filters.pvpMin || filters.pvpMax ? `P/VP ${filters.pvpMin ?? '?'}–${filters.pvpMax ?? '?'}` : null,
      filters.dyMin ? `DY mín ${filters.dyMin}%` : null,
      filters.roeMin ? `ROE mín ${filters.roeMin}%` : null,
      filters.roicMin ? `ROIC mín ${filters.roicMin}%` : null,
      filters.dividaPatrimonioMax ? `Dívida/PL máx ${filters.dividaPatrimonioMax}` : null,
    ].filter(Boolean).join(', ');

    const prompt = `Analise este portfólio de ações brasileiras com base nos critérios do investidor (${filtersDesc || 'critérios padrão'}):

${positionsSummary}

Retorne APENAS JSON válido:
{
  "portfolioScore": 75,
  "summary": "resumo 2 frases considerando os critérios do investidor",
  "strengths": ["ponto forte 1", "ponto forte 2"],
  "weaknesses": ["ponto fraco 1 com ticker", "ponto fraco 2 com ticker"],
  "suggestion": "sugestão principal de ação imediata"
}`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Analista financeiro brasileiro sênior. Responda APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 700, temperature: 0.5
      },
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    const clean = content.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const match = clean.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : clean);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  extractFundamentals(stock) {
    return {
      pl:               stock.priceEarnings ?? null,
      pvp:              stock.priceToBook ?? null,
      psr:              stock.priceToSalesTrailing12Months ?? null,
      dy:               stock.dividendYield != null ? stock.dividendYield * 100 : null,
      evEbitda:         stock.enterpriseToEbitda ?? null,
      margemEbit:       stock.ebitdaMargins != null ? stock.ebitdaMargins * 100 : null,
      margemLiquida:    stock.profitMargins != null ? stock.profitMargins * 100 : null,
      liquidezCorrente: stock.currentRatio ?? null,
      roic:             stock.returnOnAssets != null ? stock.returnOnAssets * 100 : null,
      roe:              stock.returnOnEquity != null ? stock.returnOnEquity * 100 : null,
      dividaPl:         stock.debtToEquity ?? null,
      crescReceita:     stock.revenueGrowth != null ? stock.revenueGrowth * 100 : null
    };
  }

  applyFilters(data, filters) {
    if (!filters || Object.keys(filters).length === 0) return true;
    const map = {
      pl:               { min: filters.plMin,                 max: filters.plMax },
      pvp:              { min: filters.pvpMin,                max: filters.pvpMax },
      psr:              { min: filters.psrMin,                max: filters.psrMax },
      dy:               { min: filters.dyMin,                 max: filters.dyMax },
      evEbitda:         { min: filters.evEbitdaMin,           max: filters.evEbitdaMax },
      margemEbit:       { min: filters.margemEbitMin,         max: filters.margemEbitMax },
      margemLiquida:    { min: filters.margemLiquidaMin,      max: filters.margemLiquidaMax },
      liquidezCorrente: { min: filters.liquidezCorrenteMin,   max: filters.liquidezCorrenteMax },
      roic:             { min: filters.roicMin,               max: filters.roicMax },
      roe:              { min: filters.roeMin,                max: filters.roeMax },
      dividaPl:         { min: filters.dividaPatrimonioMin,   max: filters.dividaPatrimonioMax },
      crescReceita:     { min: filters.crescimentoReceitaMin, max: filters.crescimentoReceitaMax }
    };
    for (const [field, { min, max }] of Object.entries(map)) {
      const val = data[field];
      if (val == null) continue;  // sem dado = não penaliza
      if (min != null && !isNaN(min) && val < parseFloat(min)) return false;
      if (max != null && !isNaN(max) && val > parseFloat(max)) return false;
    }
    return true;
  }

  // Retorna lista de violações de filtro (para exibir ao usuário)
  getFilterViolations(data, filters) {
    const violations = [];
    const checks = [
      ['P/L',     'pl',               filters.plMin,                 filters.plMax],
      ['P/VP',    'pvp',              filters.pvpMin,                filters.pvpMax],
      ['PSR',     'psr',              filters.psrMin,                filters.psrMax],
      ['DY',      'dy',               filters.dyMin,                 filters.dyMax],
      ['EV/EBITDA','evEbitda',        filters.evEbitdaMin,           filters.evEbitdaMax],
      ['M.EBIT',  'margemEbit',       filters.margemEbitMin,         filters.margemEbitMax],
      ['M.Líq',   'margemLiquida',    filters.margemLiquidaMin,      filters.margemLiquidaMax],
      ['Liq.Cor', 'liquidezCorrente', filters.liquidezCorrenteMin,   filters.liquidezCorrenteMax],
      ['ROIC',    'roic',             filters.roicMin,               filters.roicMax],
      ['ROE',     'roe',              filters.roeMin,                filters.roeMax],
      ['Dív/PL',  'dividaPl',        filters.dividaPatrimonioMin,   filters.dividaPatrimonioMax],
      ['Cresc.',  'crescReceita',     filters.crescimentoReceitaMin, filters.crescimentoReceitaMax],
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

  // Score considera os filtros do usuário: viola filtro = penalidade maior
  calculateScore(data, filters = {}) {
    let score = 50;

    // P/L
    if (data.pl != null && data.pl > 0) {
      const inRange = (!filters.plMin || data.pl >= filters.plMin) &&
                      (!filters.plMax || data.pl <= filters.plMax);
      if (inRange)          score += 10;
      else if (data.pl > 0 && data.pl <= 10) score += 3;
      else                  score -= 10;
    }
    // P/VP
    if (data.pvp != null) {
      const inRange = (!filters.pvpMin || data.pvp >= filters.pvpMin) &&
                      (!filters.pvpMax || data.pvp <= filters.pvpMax);
      if (inRange)      score += 8;
      else if (data.pvp < 1) score += 3;
      else if (data.pvp > 3) score -= 10;
    }
    // DY
    if (data.dy != null) {
      if (filters.dyMin && data.dy >= filters.dyMin) score += 10;
      else if (data.dy > 6)  score += 8;
      else if (data.dy > 4)  score += 4;
      else if (filters.dyMin && data.dy < filters.dyMin) score -= 5;
    }
    // ROE
    if (data.roe != null) {
      if (filters.roeMin && data.roe >= filters.roeMin) score += 10;
      else if (data.roe > 20) score += 8;
      else if (data.roe > 15) score += 4;
      else if (filters.roeMin && data.roe < filters.roeMin) score -= 8;
      else if (data.roe < 5)  score -= 5;
    }
    // ROIC
    if (data.roic != null) {
      if (filters.roicMin && data.roic >= filters.roicMin) score += 8;
      else if (data.roic > 15) score += 5;
      else if (filters.roicMin && data.roic < filters.roicMin) score -= 5;
    }
    // Margem Líquida
    if (data.margemLiquida != null) {
      if (filters.margemLiquidaMin && data.margemLiquida >= filters.margemLiquidaMin) score += 5;
      else if (data.margemLiquida > 15) score += 4;
      else if (data.margemLiquida > 10) score += 2;
      else if (filters.margemLiquidaMin && data.margemLiquida < filters.margemLiquidaMin) score -= 5;
    }
    // Dívida/PL
    if (data.dividaPl != null) {
      if (filters.dividaPatrimonioMax && data.dividaPl <= filters.dividaPatrimonioMax) score += 5;
      else if (data.dividaPl < 0.5) score += 4;
      else if (filters.dividaPatrimonioMax && data.dividaPl > filters.dividaPatrimonioMax) score -= 12;
      else if (data.dividaPl > 2)   score -= 8;
    }
    // Crescimento receita
    if (data.crescReceita != null) {
      if (filters.crescimentoReceitaMin && data.crescReceita >= filters.crescimentoReceitaMin) score += 5;
      else if (data.crescReceita > 10) score += 3;
      else if (filters.crescimentoReceitaMin && data.crescReceita < filters.crescimentoReceitaMin) score -= 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  getRecommendationReason(f, score, passFilters, violations) {
    if (!passFilters && violations?.length > 0) {
      return `Fora dos filtros: ${violations.slice(0, 2).join('; ')}`;
    }
    const positives = [];
    if (f.roe != null && f.roe > 15)  positives.push(`ROE forte (${f.roe.toFixed(1)}%)`);
    if (f.dy  != null && f.dy  > 5)   positives.push(`DY atrativo (${f.dy.toFixed(1)}%)`);
    if (f.pvp != null && f.pvp < 1)   positives.push(`P/VP abaixo de 1 (${f.pvp.toFixed(2)})`);
    if (score >= 55 && positives.length) return positives[0];
    if (score < 55) return 'Indicadores abaixo dos parâmetros definidos';
    return 'Indicadores dentro dos parâmetros';
  }
}

module.exports = new ScreenerController();