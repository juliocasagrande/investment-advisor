const pool = require('../config/database');
const axios = require('axios');

// ── Auto-healing: garante colunas necessárias ─────────────────────────────────
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
  'PETR4','VALE3','ITUB4','BBDC4','ABEV3','B3SA3','WEGE3','RENT3',
  'EQTL3','SUZB3','RADL3','RAIL3','JBSS3','GGBR4','BBAS3','SANB11',
  'ITSA4','BPAC11','BBSE3','PRIO3','FLRY3','HYPE3','KLBN11','EMBR3',
  'VIVT3','CMIG4','ELET3','SBSP3','CPLE6','TAEE11','CPFE3','EGIE3',
  'TOTS3','HAPV3','RDOR3','QUAL3','CSAN3','ARZZ3','LREN3','MGLU3',
  'CMIN3','CSNA3','USIM5','GOAU4','PETZ3','POSI3','LWSA3','AZUL4',
  'ALPA4','ALSO3','BEEF3','BRFS3','BRKM5','CARD3','CASH3','CCRO3',
  'CRFB3','CVCB3','DIRR3','DXCO3','ECOR3','ENEV3','ENGI11','EVEN3',
  'EZTC3','FIQE3','GGPS3','GRND3','IRBR3','JHSF3','JSLG3','KEPL3',
  'LAVV3','LEVE3','LOGG3','MDNE3','MDIA3','MELK3','MOVI3','MRFG3',
  'MRVE3','MULT3','NATU3','NEOE3','NTCO3','PARD3','POMO4','RAIZ4',
  'RLOG3','ROMI3','SAPR11','SEER3','SLCE3','SQIA3','STBP3','SULA11',
  'TASA4','TEND3','TIMS3','TOTS3','TUPY3','UGPA3','UNIP6','VAMO3',
  'VBBR3','VLID3','WEST3','YDUQ3','ZAMP3','CCRO3','RDOR3','CMIN3'
];

const FII_LIST = [
  'MXRF11','XPML11','HGLG11','KNRI11','CPTS11','VISC11','BTLG11',
  'RBRP11','HSML11','GGRC11','RECT11','TGAR11','VRTA11','KFOF11',
  'HGBS11','BCFF11','RBRD11','XPLG11','BRCR11','VILG11','ALZR11',
  'BCRI11','BRCO11','CVBI11','DEVA11','EDGA11','GARE11','GTWR11',
  'HABT11','HCTR11','HFOF11','HGCR11','HGRE11','HGRU11','HLOG11',
  'IRDM11','JSRE11','KNCR11','KNHY11','KNIP11','KNSC11','MALL11',
  'MGFF11','PVBI11','RBCO11','RBHG11','RBRF11','RBVA11','RCRB11',
  'RECR11','RELG11','RZTR11','STRE11','TEPP11','TRXB11','VCJR11',
  'VCRA11','VGIP11','VGHF11','VGIR11','VIUR11','WPLZ11','XPCA11',
  'XPCI11','XPCO11','XPIN11','XPLB11','XPPR11','XPVG11','YUFI11'
];

// ── Helper: buscar configurações do usuário com segurança ─────────────────────
async function getUserSettings(userId) {
  try {
    const r = await pool.query(
      'SELECT brapi_token, alphavantage_key, groq_api_key FROM user_settings WHERE user_id = $1',
      [userId]
    );
    return r.rows[0] || {};
  } catch (e) {
    console.error('getUserSettings error:', e.message);
    return {};
  }
}

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

      const listToSearch = assetClass === 'fiis' ? FII_LIST : STOCK_LIST;
      // Remove duplicatas
      const uniqueList = [...new Set(listToSearch)];
      const results = [];
      const batchSize = 8;

      for (let i = 0; i < uniqueList.length; i += batchSize) {
        const batch = uniqueList.slice(i, i + batchSize).join(',');
        try {
          const response = await axios.get(
            `https://brapi.dev/api/quote/${batch}?token=${token}&fundamental=true`,
            { timeout: 20000 }
          );
          if (response.data?.results) {
            for (const stock of response.data.results) {
              const fundamentals = this.extractFundamentals(stock);
              const passesFilter = this.applyFilters(fundamentals, filters);
              const score = this.calculateScore(fundamentals);
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
        if (i + batchSize < uniqueList.length) await new Promise(r => setTimeout(r, 400));
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

  // ── Analisar posições do usuário ─────────────────────────────────────────
  async analyzePositions(req, res) {
    try {
      const userId = req.userId;
      const filters = req.body?.filters || {};

      const assetsResult = await pool.query(`
        SELECT 
          a.*,
          ac.category,
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

      // Categorias de ações BR analisáveis por fundamentals
      const BR_EQUITY_CATEGORIES = ['stocks_br', 'fiis', 'acoes_br', 'etfs'];

      const brEquityAssets = assetsResult.rows.filter(a =>
        a.market === 'BR' && BR_EQUITY_CATEGORIES.includes(a.category) && a.ticker
      );
      const otherAssets = assetsResult.rows.filter(a =>
        !(a.market === 'BR' && BR_EQUITY_CATEGORIES.includes(a.category))
      );

      const analysis = [];
      let manter = 0, avaliarTroca = 0, totalScore = 0, scoredCount = 0;

      // Analisar ações BR com fundamentals (se tiver token)
      if (token && brEquityAssets.length > 0) {
        for (const asset of brEquityAssets) {
          try {
            const response = await axios.get(
              `https://brapi.dev/api/quote/${asset.ticker}?token=${token}&fundamental=true`,
              { timeout: 12000 }
            );
            if (response.data?.results?.[0]) {
              const stock = response.data.results[0];
              const fundamentals = this.extractFundamentals(stock);
              const score = this.calculateScore(fundamentals);
              const passFilters = this.applyFilters(fundamentals, filters);
              const action = score >= 60 ? 'MANTER' : 'AVALIAR_TROCA';

              if (action === 'MANTER') manter++;
              else avaliarTroca++;
              totalScore += score;
              scoredCount++;

              const avgPrice = parseFloat(asset.average_price) || 0;
              const qty = parseFloat(asset.quantity) || 0;
              const currentPx = stock.regularMarketPrice || parseFloat(asset.current_price) || avgPrice;
              const invested = qty * avgPrice;
              const currentValue = qty * currentPx;
              const gainPercent = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;

              analysis.push({
                ticker: asset.ticker,
                name: stock.longName || asset.name || asset.ticker,
                quantity: asset.quantity,
                averagePrice: asset.average_price,
                currentPrice: currentPx,
                currentValue,
                gainPercent,
                qualityScore: score,
                passFilters,
                recommendation: { action, reason: this.getRecommendationReason(fundamentals, score) },
                fundamentals,
                assetClass: asset.class_name
              });
            } else {
              // Brapi retornou mas sem dados
              this.pushBasicPosition(analysis, asset, 'Dados não disponíveis');
            }
          } catch (e) {
            console.error(`Erro ao buscar ${asset.ticker}:`, e.message);
            this.pushBasicPosition(analysis, asset, 'Erro ao buscar dados');
          }
          await new Promise(r => setTimeout(r, 300));
        }
      } else if (brEquityAssets.length > 0) {
        // Sem token — inclui sem fundamentals
        for (const asset of brEquityAssets) {
          this.pushBasicPosition(analysis, asset, 'Configure token Brapi para análise fundamentalista');
        }
      }

      // Outros ativos (renda fixa, cripto, EUA, etc.)
      for (const asset of otherAssets) {
        const avgPrice = parseFloat(asset.average_price) || 0;
        const qty = parseFloat(asset.quantity) || 0;
        const currentPx = parseFloat(asset.current_price) || avgPrice;
        const invested = qty * avgPrice;
        const currentValue = qty * currentPx;
        const gainPercent = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;

        analysis.push({
          ticker: asset.ticker,
          name: asset.name || asset.ticker,
          quantity: asset.quantity,
          averagePrice: avgPrice,
          currentPrice: currentPx,
          currentValue,
          gainPercent,
          qualityScore: null,
          passFilters: true,
          recommendation: { action: 'MANTER', reason: 'Fora do escopo fundamentalista' },
          fundamentals: null,
          assetClass: asset.class_name,
          noFundamentals: true
        });
      }

      // Ordena: com fundamentals primeiro, depois por valor
      analysis.sort((a, b) => {
        if (a.noFundamentals !== b.noFundamentals) return a.noFundamentals ? 1 : -1;
        return (b.currentValue || 0) - (a.currentValue || 0);
      });

      const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

      // Análise IA do portfólio
      let aiAnalysis = null;
      const scoredPositions = analysis.filter(a => !a.noFundamentals && a.qualityScore != null);
      if (groqKey && scoredPositions.length > 0) {
        try {
          aiAnalysis = await this.getAIPortfolioAnalysis(groqKey, scoredPositions);
        } catch (e) {
          console.error('Groq portfolio analysis error:', e.message);
        }
      }

      return res.json({
        analysis,
        summary: {
          manter,
          avaliarTroca,
          totalPositions: analysis.length,
          avgQualityScore: avgScore
        },
        aiAnalysis
      });
    } catch (error) {
      console.error('Erro analyzePositions:', error);
      return res.status(500).json({ error: 'Erro ao analisar posições: ' + error.message });
    }
  }

  // Helper para posições sem fundamentals
  pushBasicPosition(analysis, asset, reason) {
    const avgPrice = parseFloat(asset.average_price) || 0;
    const qty = parseFloat(asset.quantity) || 0;
    const currentPx = parseFloat(asset.current_price) || avgPrice;
    const invested = qty * avgPrice;
    const currentValue = qty * currentPx;
    const gainPercent = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;
    analysis.push({
      ticker: asset.ticker,
      name: asset.name || asset.ticker,
      quantity: asset.quantity,
      averagePrice: avgPrice,
      currentPrice: currentPx,
      currentValue,
      gainPercent,
      qualityScore: 0,
      passFilters: false,
      recommendation: { action: 'ERRO', reason },
      fundamentals: {},
      assetClass: asset.class_name,
      error: true
    });
  }

  // ── Sugestões de troca ────────────────────────────────────────────────────
  async getSuggestions(req, res) {
    try {
      const { ticker, classId, filters = {} } = req.body;
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
            const score = this.calculateScore(fundamentals);
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
        } catch (e) { /* ignore individual failures */ }
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
      const userId = req.userId;
      const settings = await getUserSettings(userId);
      const token = settings.brapi_token;
      if (!token) return res.status(400).json({ error: 'Configure seu token Brapi' });

      const response = await axios.get(
        `https://brapi.dev/api/quote/${ticker}?token=${token}&fundamental=true`,
        { timeout: 10000 }
      );
      if (!response.data?.results?.[0]) return res.status(404).json({ error: 'Ação não encontrada' });

      const stock = response.data.results[0];
      const fundamentals = this.extractFundamentals(stock);
      const score = this.calculateScore(fundamentals);

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

  // ── AI Helpers ────────────────────────────────────────────────────────────
  async getAIRecommendation(apiKey, stocks, filters) {
    const stocksSummary = stocks.slice(0, 8).map(s =>
      `${s.ticker}: Score=${s.score}, P/L=${s.pl?.toFixed(1) ?? '-'}, P/VP=${s.pvp?.toFixed(2) ?? '-'}, DY=${s.dy?.toFixed(1) ?? '-'}%, ROE=${s.roe?.toFixed(1) ?? '-'}%`
    ).join('\n');

    const prompt = `Você é um analista de ações brasileiras. Analise:\n\n${stocksSummary}\n\nRetorne APENAS JSON válido:\n{\n  "topPicks": [{"ticker":"XX","reason":"motivo","conviction":"alta|media|baixa","horizon":"curto|medio|longo prazo"}],\n  "marketComment": "comentário 2-3 frases",\n  "riskWarning": "aviso 1 frase"\n}\nMáximo 3 topPicks.`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Analista financeiro. Responda APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800, temperature: 0.5
      },
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    const clean = content.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
    return JSON.parse(clean);
  }

  async getAIPortfolioAnalysis(apiKey, positions) {
    const positionsSummary = positions.slice(0, 10).map(p =>
      `${p.ticker}: Score=${p.qualityScore}, Ganho=${p.gainPercent?.toFixed(1)}%, Ação=${p.recommendation?.action}`
    ).join('\n');

    const prompt = `Analise este portfólio de ações brasileiras:\n\n${positionsSummary}\n\nRetorne APENAS JSON válido:\n{\n  "portfolioScore": 75,\n  "summary": "resumo 2 frases",\n  "strengths": ["ponto forte 1"],\n  "weaknesses": ["ponto fraco 1"],\n  "suggestion": "sugestão principal"\n}`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Analista financeiro. Responda APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600, temperature: 0.5
      },
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    const clean = content.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
    return JSON.parse(clean);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  extractFundamentals(stock) {
    return {
      pl: stock.priceEarnings ?? null,
      pvp: stock.priceToBook ?? null,
      psr: stock.priceToSalesTrailing12Months ?? null,
      dy: stock.dividendYield != null ? stock.dividendYield * 100 : null,
      evEbitda: stock.enterpriseToEbitda ?? null,
      margemEbit: stock.ebitdaMargins != null ? stock.ebitdaMargins * 100 : null,
      margemLiquida: stock.profitMargins != null ? stock.profitMargins * 100 : null,
      liquidezCorrente: stock.currentRatio ?? null,
      roic: stock.returnOnAssets != null ? stock.returnOnAssets * 100 : null,
      roe: stock.returnOnEquity != null ? stock.returnOnEquity * 100 : null,
      dividaPl: stock.debtToEquity ?? null,
      crescReceita: stock.revenueGrowth != null ? stock.revenueGrowth * 100 : null
    };
  }

  applyFilters(data, filters) {
    if (!filters || Object.keys(filters).length === 0) return true;
    const map = {
      pl:               { min: filters.plMin,                max: filters.plMax },
      pvp:              { min: filters.pvpMin,               max: filters.pvpMax },
      psr:              { min: filters.psrMin,               max: filters.psrMax },
      dy:               { min: filters.dyMin,                max: filters.dyMax },
      evEbitda:         { min: filters.evEbitdaMin,          max: filters.evEbitdaMax },
      margemEbit:       { min: filters.margemEbitMin,        max: filters.margemEbitMax },
      margemLiquida:    { min: filters.margemLiquidaMin,     max: filters.margemLiquidaMax },
      liquidezCorrente: { min: filters.liquidezCorrenteMin,  max: filters.liquidezCorrenteMax },
      roic:             { min: filters.roicMin,              max: filters.roicMax },
      roe:              { min: filters.roeMin,               max: filters.roeMax },
      dividaPl:         { min: filters.dividaPatrimonioMin,  max: filters.dividaPatrimonioMax },
      crescReceita:     { min: filters.crescimentoReceitaMin,max: filters.crescimentoReceitaMax }
    };
    for (const [field, { min, max }] of Object.entries(map)) {
      const val = data[field];
      if (val == null) continue;
      if (min != null && !isNaN(min) && val < parseFloat(min)) return false;
      if (max != null && !isNaN(max) && val > parseFloat(max)) return false;
    }
    return true;
  }

  calculateScore(data) {
    let score = 50;
    if (data.pl != null && data.pl > 0) {
      if (data.pl >= 5 && data.pl <= 15)  score += 10;
      else if (data.pl < 5)               score += 5;
      else if (data.pl > 25)              score -= 10;
    }
    if (data.pvp != null) {
      if (data.pvp < 1)    score += 10;
      else if (data.pvp < 1.5) score += 5;
      else if (data.pvp > 3)   score -= 10;
    }
    if (data.dy != null) {
      if (data.dy > 6)  score += 10;
      else if (data.dy > 4) score += 5;
    }
    if (data.roe != null) {
      if (data.roe > 20)      score += 10;
      else if (data.roe > 15) score += 5;
      else if (data.roe < 5)  score -= 5;
    }
    if (data.margemLiquida != null) {
      if (data.margemLiquida > 15)     score += 5;
      else if (data.margemLiquida > 10) score += 3;
    }
    if (data.dividaPl != null) {
      if (data.dividaPl < 0.5)  score += 5;
      else if (data.dividaPl > 2) score -= 10;
    }
    if (data.roic != null && data.roic > 15) score += 5;
    return Math.max(0, Math.min(100, score));
  }

  getRecommendationReason(f, score) {
    const issues = [];
    const positives = [];
    if (f.pl != null && (f.pl < 5 || f.pl > 20)) issues.push(`P/L ${f.pl?.toFixed(1)}`);
    if (f.pvp != null && f.pvp > 2) issues.push(`P/VP alto (${f.pvp?.toFixed(2)})`);
    if (f.roe != null && f.roe > 15) positives.push(`ROE forte (${f.roe?.toFixed(1)}%)`);
    if (f.dy != null && f.dy > 5)   positives.push(`DY atrativo (${f.dy?.toFixed(1)}%)`);
    if (score >= 60 && positives.length) return positives[0];
    if (issues.length) return `Atenção: ${issues.join(', ')}`;
    return score >= 60 ? 'Indicadores dentro dos parâmetros' : 'Indicadores abaixo dos parâmetros';
  }
}

module.exports = new ScreenerController();
