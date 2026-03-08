const pool = require('../config/database');
const axios = require('axios');

const STOCK_LIST = [
  'PETR4','VALE3','ITUB4','BBDC4','ABEV3','B3SA3','WEGE3','RENT3',
  'EQTL3','SUZB3','RADL3','RAIL3','JBSS3','GGBR4','BBAS3','SANB11',
  'ITSA4','BPAC11','BBSE3','PRIO3','FLRY3','HYPE3','KLBN11','EMBR3',
  'VIVT3','CMIG4','ELET3','SBSP3','CPLE6','TAEE11','CPFE3','EGIE3',
  'TOTS3','HAPV3','RDOR3','QUAL3','CSAN3','ARZZ3','LREN3','MGLU3',
  'CMIN3','CSNA3','USIM5','GOAU4','PETZ3','POSI3','LWSA3','AZUL4'
];

const FII_LIST = [
  'MXRF11','XPML11','HGLG11','KNRI11','CPTS11','VISC11','BTLG11',
  'RBRP11','HSML11','GGRC11','RECT11','TGAR11','VRTA11','KFOF11',
  'HGBS11','BCFF11','RBRD11','XPLG11','BRCR11','VILG11'
];

class ScreenerController {

  // ── Buscar ações com filtros ──────────────────────────────────────────────
  async search(req, res) {
    try {
      const userId = req.userId;
      const { filters = {}, assetClass = 'stocks' } = req.body;

      const settings = await pool.query('SELECT brapi_token, groq_api_key FROM user_settings WHERE user_id = $1', [userId]);
      const token = settings.rows[0]?.brapi_token;
      const groqKey = settings.rows[0]?.groq_api_key || process.env.GROQ_API_KEY;

      if (!token) {
        return res.status(400).json({ error: 'Configure seu token Brapi nas configurações para usar o Screener.' });
      }

      const listToSearch = assetClass === 'fiis' ? FII_LIST : STOCK_LIST;
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
        if (i + batchSize < listToSearch.length) await new Promise(r => setTimeout(r, 400));
      }

      results.sort((a, b) => (b.score || 0) - (a.score || 0));
      const passed = results.filter(r => r.passFilters);

      // IA recommendation se Groq disponível
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
      return res.status(500).json({ error: 'Erro ao buscar ações' });
    }
  }

  // ── Analisar posições do usuário ─────────────────────────────────────────
  async analyzePositions(req, res) {
    try {
      const userId = req.userId;
      const filters = req.body.filters || {};

      const assetsResult = await pool.query(`
        SELECT a.*, ac.category, ac.name as class_name
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1 AND a.quantity > 0
      `, [userId]);

      if (assetsResult.rows.length === 0) {
        return res.json({
          analysis: [],
          summary: { manter: 0, avaliarTroca: 0, totalPositions: 0, avgQualityScore: 0 }
        });
      }

      const settings = await pool.query('SELECT brapi_token, groq_api_key FROM user_settings WHERE user_id = $1', [userId]);
      const token = settings.rows[0]?.brapi_token;
      const groqKey = settings.rows[0]?.groq_api_key || process.env.GROQ_API_KEY;

      if (!token) {
        return res.status(400).json({ error: 'Configure seu token Brapi nas configurações.' });
      }

      // Only BR equities can be analyzed with fundamentals
      const brAssets = assetsResult.rows.filter(a =>
        a.market === 'BR' && ['stocks_br', 'fiis', 'acoes_br'].includes(a.category)
      );

      const allAssets = assetsResult.rows;
      const analysis = [];
      let manter = 0, avaliarTroca = 0, totalScore = 0, scoredCount = 0;

      // For BR stocks, fetch fundamentals
      for (const asset of brAssets) {
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

            const invested = parseFloat(asset.quantity) * parseFloat(asset.average_price);
            const currentValue = parseFloat(asset.quantity) * (stock.regularMarketPrice || parseFloat(asset.average_price));
            const gainPercent = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;

            analysis.push({
              ticker: asset.ticker,
              name: stock.longName || asset.name || asset.ticker,
              quantity: asset.quantity,
              averagePrice: asset.average_price,
              currentPrice: stock.regularMarketPrice,
              currentValue,
              gainPercent,
              qualityScore: score,
              passFilters,
              recommendation: { action, reason: this.getRecommendationReason(fundamentals, score) },
              fundamentals,
              assetClass: asset.class_name
            });
          }
        } catch (e) {
          const invested = parseFloat(asset.quantity) * parseFloat(asset.average_price);
          analysis.push({
            ticker: asset.ticker,
            name: asset.name || asset.ticker,
            quantity: asset.quantity,
            averagePrice: asset.average_price,
            currentValue: invested,
            gainPercent: 0,
            qualityScore: 0,
            passFilters: false,
            recommendation: { action: 'ERRO', reason: 'Não foi possível obter dados' },
            fundamentals: {},
            assetClass: asset.class_name,
            error: true
          });
        }
        await new Promise(r => setTimeout(r, 300));
      }

      // For non-BR or fixed income assets, add basic info without fundamentals
      const nonBrAssets = allAssets.filter(a =>
        !['stocks_br', 'fiis', 'acoes_br'].includes(a.category) || a.market !== 'BR'
      );
      for (const asset of nonBrAssets) {
        const invested = parseFloat(asset.quantity) * parseFloat(asset.average_price);
        const currentPrice = asset.current_price || asset.average_price;
        const currentValue = parseFloat(asset.quantity) * parseFloat(currentPrice);
        const gainPercent = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;

        analysis.push({
          ticker: asset.ticker,
          name: asset.name || asset.ticker,
          quantity: asset.quantity,
          averagePrice: asset.average_price,
          currentPrice,
          currentValue,
          gainPercent,
          qualityScore: null,
          passFilters: true,
          recommendation: { action: 'MANTER', reason: 'Ativo fora do escopo de análise fundamentalista' },
          fundamentals: null,
          assetClass: asset.class_name,
          noFundamentals: true
        });
      }

      const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

      // AI analysis
      let aiAnalysis = null;
      const scoredPositions = analysis.filter(a => !a.noFundamentals && !a.error);
      if (groqKey && scoredPositions.length > 0) {
        try {
          aiAnalysis = await this.getAIPortfolioAnalysis(groqKey, scoredPositions);
        } catch (e) {
          console.error('Groq portfolio analysis error:', e.message);
        }
      }

      return res.json({
        analysis,
        summary: { manter, avaliarTroca, totalPositions: analysis.length, avgQualityScore: avgScore },
        aiAnalysis
      });
    } catch (error) {
      console.error('Erro analyzePositions:', error);
      return res.status(500).json({ error: 'Erro ao analisar posições' });
    }
  }

  // ── Sugestões de troca ────────────────────────────────────────────────────
  async getSuggestions(req, res) {
    try {
      const { ticker, classId, filters = {} } = req.body;
      const userId = req.userId;

      const settings = await pool.query('SELECT brapi_token FROM user_settings WHERE user_id = $1', [userId]);
      const token = settings.rows[0]?.brapi_token;
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
              suggestions.push({ ticker: stock, name: data.longName || stock, price: data.regularMarketPrice, ...fundamentals, score });
            }
          }
        } catch (e) { /* ignore */ }
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
      const settings = await pool.query('SELECT brapi_token FROM user_settings WHERE user_id = $1', [userId]);
      const token = settings.rows[0]?.brapi_token;
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
      `${s.ticker}: Score=${s.score}, P/L=${s.pl?.toFixed(1) ?? '-'}, P/VP=${s.pvp?.toFixed(2) ?? '-'}, DY=${s.dy?.toFixed(1) ?? '-'}%, ROE=${s.roe?.toFixed(1) ?? '-'}%, Preço=R$${s.price?.toFixed(2) ?? '-'}`
    ).join('\n');

    const prompt = `Você é um analista de investimentos em ações brasileiras.
Com base nos dados abaixo, forneça recomendações de compra para investidores de longo prazo.

Ações filtradas (score fundamentalista 0-100):
${stocksSummary}

Retorne APENAS JSON válido (sem markdown):
{
  "topPicks": [
    {
      "ticker": "XXXX3",
      "reason": "Motivo em 1 frase",
      "conviction": "alta|media|baixa",
      "horizon": "curto|medio|longo prazo"
    }
  ],
  "marketComment": "Comentário geral em 2-3 frases sobre o momento para compra",
  "riskWarning": "Aviso de risco em 1 frase"
}
Inclua no máximo 3 topPicks. Seja objetivo.`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Analista financeiro. Responda APENAS com JSON válido.' },
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
    const positionsSummary = positions.map(p =>
      `${p.ticker}: Score=${p.qualityScore}, Ganho=${p.gainPercent?.toFixed(1)}%, Ação=${p.recommendation?.action}`
    ).join('\n');

    const prompt = `Analise este portfólio de ações brasileiras e dê um parecer:

${positionsSummary}

Retorne APENAS JSON válido:
{
  "portfolioScore": 75,
  "summary": "Resumo do portfólio em 2 frases",
  "strengths": ["Ponto forte 1", "Ponto forte 2"],
  "weaknesses": ["Ponto fraco 1"],
  "suggestion": "Principal sugestão de melhoria em 1-2 frases"
}`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Analista financeiro. Responda APENAS com JSON válido.' },
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
    const map = {
      pl: { min: filters.plMin, max: filters.plMax },
      pvp: { min: filters.pvpMin, max: filters.pvpMax },
      psr: { min: filters.psrMin, max: filters.psrMax },
      dy: { min: filters.dyMin, max: filters.dyMax },
      evEbitda: { min: filters.evEbitdaMin, max: filters.evEbitdaMax },
      margemEbit: { min: filters.margemEbitMin, max: null },
      margemLiquida: { min: filters.margemLiquidaMin, max: null },
      liquidezCorrente: { min: filters.liquidezCorrenteMin, max: null },
      roic: { min: filters.roicMin, max: null },
      roe: { min: filters.roeMin, max: null },
      dividaPl: { min: null, max: filters.dividaPatrimonioMax },
      crescReceita: { min: filters.crescimentoReceitaMin, max: null }
    };

    for (const [field, { min, max }] of Object.entries(map)) {
      const val = data[field];
      if (val == null) continue;
      if (min != null && val < parseFloat(min)) return false;
      if (max != null && val > parseFloat(max)) return false;
    }
    return true;
  }

  calculateScore(data) {
    let score = 50;
    if (data.pl != null) {
      if (data.pl >= 5 && data.pl <= 15) score += 10;
      else if (data.pl > 0 && data.pl < 5) score += 5;
      else if (data.pl > 25) score -= 10;
    }
    if (data.pvp != null) {
      if (data.pvp < 1) score += 10;
      else if (data.pvp < 1.5) score += 5;
      else if (data.pvp > 3) score -= 10;
    }
    if (data.dy != null) {
      if (data.dy > 6) score += 10;
      else if (data.dy > 4) score += 5;
    }
    if (data.roe != null) {
      if (data.roe > 20) score += 10;
      else if (data.roe > 15) score += 5;
      else if (data.roe < 5) score -= 5;
    }
    if (data.margemLiquida != null) {
      if (data.margemLiquida > 15) score += 5;
      else if (data.margemLiquida > 10) score += 3;
    }
    if (data.dividaPl != null) {
      if (data.dividaPl < 0.5) score += 5;
      else if (data.dividaPl > 2) score -= 10;
    }
    if (data.roic != null) {
      if (data.roic > 15) score += 5;
    }
    return Math.max(0, Math.min(100, score));
  }

  getRecommendationReason(f, score) {
    const issues = [];
    const positives = [];
    if (f.pl != null && (f.pl < 5 || f.pl > 20)) issues.push(`P/L ${f.pl?.toFixed(1)}`);
    if (f.pvp != null && f.pvp > 2) issues.push(`P/VP alto (${f.pvp?.toFixed(2)})`);
    if (f.roe != null && f.roe > 15) positives.push(`ROE forte (${f.roe?.toFixed(1)}%)`);
    if (f.dy != null && f.dy > 5) positives.push(`DY atrativo (${f.dy?.toFixed(1)}%)`);
    if (score >= 60 && positives.length) return positives[0];
    if (issues.length) return `Atenção: ${issues.join(', ')}`;
    return score >= 60 ? 'Indicadores dentro dos parâmetros' : 'Indicadores abaixo dos parâmetros';
  }
}

module.exports = new ScreenerController();