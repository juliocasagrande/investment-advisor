const pool = require('../config/database');
const axios = require('axios'); // mantido apenas para Groq (POST)
 
// ── Yahoo Finance — Cookie + Crumb ────────────────────────────────────────────
// O Yahoo Finance exige um fluxo de autenticação de dois passos:
// 1. GET https://fc.yahoo.com  → cookie de sessão
// 2. GET https://query2.finance.yahoo.com/v1/test/getcrumb (com o cookie) → crumb
// 3. Todas as chamadas usam Cookie + &crumb=<valor>
// Cookie/crumb ficam cacheados 55 min e renovam automaticamente.
 
let _yahooCookie = null;
let _yahooCrumb  = null;
let _yahooLastFetch = 0;
const CRUMB_TTL = 55 * 60 * 1000;
 
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};
 
async function getYahooCrumb(force = false) {
  const now = Date.now();
  if (!force && _yahooCrumb && (now - _yahooLastFetch) < CRUMB_TTL) {
    return { cookie: _yahooCookie, crumb: _yahooCrumb };
  }
  const cookieRes = await fetch('https://fc.yahoo.com', { headers: YAHOO_HEADERS, redirect: 'follow' });
  const rawCookies = cookieRes.headers.getSetCookie?.() || [];
  const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...YAHOO_HEADERS, 'Cookie': cookieStr },
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes('<html>') || crumb.includes('Too Many')) {
    throw new Error(`Falha ao obter crumb do Yahoo Finance: ${crumb.substring(0, 80)}`);
  }
  _yahooCookie = cookieStr;
  _yahooCrumb  = crumb;
  _yahooLastFetch = now;
  console.log('[Yahoo] Cookie/crumb renovados.');
  return { cookie: cookieStr, crumb };
}
 
// Busca genérica Yahoo — BR usa sufixo .SA, US sem sufixo
async function yahooGet(symbol) {
  const modules = 'defaultKeyStatistics,financialData,summaryDetail,price,calendarEvents';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { cookie, crumb } = await getYahooCrumb(attempt === 2);
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules}&crumb=${encodeURIComponent(crumb)}&formatted=false&corsDomain=finance.yahoo.com`;
    const res = await fetch(url, { headers: { ...YAHOO_HEADERS, 'Cookie': cookie } });
    if (res.status === 401 && attempt === 1) { console.warn('[Yahoo] 401 — renovando crumb...'); continue; }
    if (!res.ok) { const err = new Error(`Yahoo HTTP ${res.status} para ${symbol}`); err.status = res.status; throw err; }
    const data = await res.json();
    const error = data?.quoteSummary?.error;
    if (error) throw new Error(`Yahoo Finance: ${error.description || error.code}`);
    const result = data?.quoteSummary?.result?.[0];
    if (!result) throw new Error(`Sem dados para ${symbol}`);
    return result;
  }
}
 
const yahooGetBR = (ticker) => yahooGet(ticker.endsWith('.SA') ? ticker : `${ticker}.SA`);
const yahooGetUS = (ticker) => yahooGet(ticker); // US sem sufixo
 
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
  // Bancos e Financeiras
  'ITUB4','BBDC4','BBAS3','SANB11','ITSA4','BPAC11','BBSE3','B3SA3','PSSA3','CIEL3',
  'IRBR3','CARD3','WIZC3','PORT3','CASH3',

  // Petróleo, Gás e Energia
  'PETR4','PETR3','PRIO3','RRRP3','RECV3',
  'CSAN3','RAIZ4','UGPA3','VBBR3',
  'ELET3','ELET6','CMIG4','CPFE3','EGIE3','TAEE11','ENBR3','AESB3','EQTL3','TRPL4',
  'ALUP11','ENGI11','CPLE6','NEOE3','MEGA3',

  // Mineração e Siderurgia
  'VALE3','GGBR4','CSNA3','USIM5','GOAU4','CMIN3','BRAP4',

  // Papel e Celulose
  'SUZB3','KLBN11','RANI3',

  // Indústria e Bens de Capital
  'WEGE3','EMBR3','TUPY3','ROMI3','POMO4','KEPL3',

  // Logística e Transporte
  'RAIL3','CCRO3','ECOR3','LOGG3','JSLG3','MOVI3','SIMH3','HBSA3',

  // Varejo
  'LREN3','ARZZ3','SOMA3','VIVA3','CEAB3','GUAR3',
  'MGLU3','VIIA3','AMER3','BHIA3',
  'PETZ3','GMAT3','CAMB3',

  // Consumo e Alimentos
  'ABEV3','BRFS3','MRFG3','JBSS3','MDIA3','SMTO3','SLCE3',
  'BEEF3','CRFB3','ASAI3','PCAR3','CAML3',

  // Saúde
  'RDOR3','HAPV3','QUAL3','FLRY3','DASA3','ODPV3','HYPE3','VVEO3','MATD3',

  // Tecnologia
  'TOTS3','POSI3','LWSA3','SQIA3',

  // Telecom
  'VIVT3','TIMS3','OIBR3',

  // Construção e Imobiliário
  'MRVE3','EZTC3','EVEN3','CYRE3','DIRR3','TEND3','TRIS3',
  'JHSF3','HBOR3','LAVV3','CURY3','PLPL3',

  // Shoppings
  'MULT3','IGTI11','ALSO3','BRML3','JHSF3',

  // Saneamento
  'SBSP3','SAPR11','CSMG3',

  // Diversificados
  'GRND3','NTCO3','ALPA4','MYPK3','FRAS3','RAPT4'
];

const FIIS = [
  'MXRF11','CPTS11','KNCR11','KNIP11','HGLG11','BTLG11','XPLG11','VILG11',
  'XPML11','VISC11','HSML11','HGBS11','KNRI11','HGRE11','BRCR11','RBHG11',
  'RBRF11','KFOF11','MGFF11','HFOF11','IRDM11','VGIP11','RECR11','RBRP11',

  // Logísticos
  'LVBI11','GGRC11','BTCR11','PATL11','TRXF11','BLMG11','HSLG11',

  // Papel
  'MCCI11','KNHY11','DEVA11','PLCR11','CVBI11','KNSC11','VGIR11',

  // Shoppings
  'MALL11','HSML11','VISC11','XPML11',

  // Escritórios
  'PVBI11','JSRE11','BCRI11','HGPO11','RNGO11',

  // FoFs
  'BCFF11','RBRF11','XPSF11','HFOF11'
];

const STOCKS_US = [
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','BRK-B','JPM','JNJ',
  'V','PG','UNH','HD','MA','DIS','BAC','XOM','PFE','KO',
  'WMT','CSCO','VZ','INTC','NFLX','ADBE','CRM','AMD','PYPL','QCOM',
  'T','PEP','COST','ABBV','AVGO','ORCL','TXN','LIN','ACN','NKE',
  'MCD','DHR','ABT','WFC','LOW','NEE','PM','RTX','HON','IBM',
  'AMAT','SBUX','INTU','ISRG','CAT','GE','NOW','BKNG','MDT'
];

const REITS = [
  'O','SPG','PLD','AMT','CCI','EQIX','PSA','DLR','VICI','WPC',
  'NNN','EXR','AVB','EQR','MAA','UDR','CPT','KIM','REG',

  // Data centers
  'DLR','EQIX',

  // Healthcare
  'WELL','VTR','DOC','HR',

  // Industrial
  'PLD','FR','EGP',

  // Retail
  'FRT','BXP','KRG',

  // Diversified
  'STOR','SRC','ADC'
];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getUserSettings(userId) {
  try {
    const r = await pool.query('SELECT brapi_token, alphavantage_key, groq_api_key FROM user_settings WHERE user_id = $1', [userId]);
    return r.rows[0] || {};
  } catch (e) { return {}; }
}
 
const ANALYZABLE_CATEGORIES = new Set(['stocks_br', 'fiis', 'etfs', 'acoes_br']);
const US_CATEGORIES = new Set(['stocks_us', 'reits']);
 
class ScreenerController {
 
  // ── Buscar ativos com filtros (aba Buscar) ────────────────────────────────
  async search(req, res) {
    try {
      const userId = req.userId;
      const { filters = {}, assetClass = 'stocks_br' } = req.body;
      const settings = await getUserSettings(userId);
      const groqKey = settings.groq_api_key || process.env.GROQ_API_KEY;
 
      // Tudo via Yahoo Finance — sem necessidade de tokens externos
      const listMap = { stocks_br: STOCKS_BR, fiis: FIIS, stocks_us: STOCKS_US, reits: REITS };
      const list = listMap[assetClass] || STOCKS_BR;
      const isUS = assetClass === 'stocks_us' || assetClass === 'reits';
 
      const stocks = await this.fetchStocksYahoo(list, filters, isUS);
      stocks.sort((a, b) => (b.score || 0) - (a.score || 0));
      const passed = stocks.filter(r => r.passFilters);
 
      let aiAnalysis = null;
      if (groqKey && passed.length > 0) {
        try { aiAnalysis = await this.getAIRecommendation(groqKey, passed.slice(0, 10), filters); }
        catch (e) { console.error('Groq error:', e.message); }
      }
      return res.json({ total: stocks.length, passed: passed.length, stocks, aiAnalysis });
    } catch (error) {
      console.error('Erro screener search:', error);
      return res.status(500).json({ error: 'Erro ao buscar ações: ' + error.message });
    }
  }
 
  // ── Buscar lista de ativos via Yahoo Finance (BR ou US) ───────────────────
  // Sequencial com delay — Yahoo Finance rejeita requisições paralelas com mesmo crumb
  async fetchStocksYahoo(list, filters, isUS = false) {
    const unique = [...new Set(list)];
    const results = [];
 
    for (const ticker of unique) {
      try {
        const yData = isUS ? await yahooGetUS(ticker) : await yahooGetBR(ticker);
        const priceModule = yData.price || {};
        const fundamentals = this.extractYahooFundamentals(yData);
        const score = this.calculateScore(fundamentals, filters) ?? 50;
        // passFilters = score >= 80: o score combinado É o critério de compra.
        // applyFilters só é usado para mostrar violations informativas, não para bloquear.
        const passFilters = score >= 80;
        const violations = this.getFilterViolations(fundamentals, filters);
        results.push({
          ticker,
          name: priceModule.longName || priceModule.shortName || ticker,
          price: priceModule.regularMarketPrice ?? null,
          change: priceModule.regularMarketChangePercent ?? null,
          market: isUS ? 'US' : 'BR',
          sector: yData.summaryProfile?.sector || null,
          ...fundamentals,
          score,
          passFilters,
          violations,
          recommendation: score >= 80 ? 'COMPRAR' : score >= 60 ? 'MANTER' : 'AVALIAR'
        });
        console.log(`[Search] ${ticker} — score: ${score}, passFilters: ${passFilters}`);
      } catch (e) {
        console.error(`[Search] Erro ${ticker}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 350));
    }
    return results;
  }
 
  // ── Analisar posições do usuário ──────────────────────────────────────────
  async analyzePositions(req, res) {
    try {
      const userId = req.userId;
      const filters = req.body?.filters && Object.keys(req.body.filters).length > 0
        ? req.body.filters
        : { plMin: 5, plMax: 15, pvpMin: 0.7, pvpMax: 1.8, dyMin: 4, roicMin: 8, roeMin: 10, dividaPatrimonioMax: 2 };
 
      const assetsResult = await pool.query(`
        SELECT a.*, ac.category as class_category, ac.name as class_name
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1 AND a.quantity > 0
        ORDER BY (a.quantity * COALESCE(a.current_price, a.average_price)) DESC
      `, [userId]);
 
      if (assetsResult.rows.length === 0) {
        return res.json({ analysis: [], summary: { manter: 0, avaliarTroca: 0, totalPositions: 0, avgQualityScore: 0 }, aiAnalysis: null });
      }
 
      const settings = await getUserSettings(userId);
      const groqKey = settings.groq_api_key || process.env.GROQ_API_KEY;
 
      const isBRAnalyzable = (a) =>
        ANALYZABLE_CATEGORIES.has(a.class_category) || /^[A-Z]{3,6}\d{1,2}$/.test(a.ticker);
      const isUSAnalyzable = (a) =>
        US_CATEGORIES.has(a.class_category) || /^[A-Z]{1,5}(-[A-Z])?$/.test(a.ticker);
 
      const brAssets = assetsResult.rows.filter(isBRAnalyzable);
      const usAssets = assetsResult.rows.filter(a => !isBRAnalyzable(a) && isUSAnalyzable(a));
      const other    = assetsResult.rows.filter(a => !isBRAnalyzable(a) && !isUSAnalyzable(a));
 
      const analysis = [];
      let manter = 0, avaliarTroca = 0, totalScore = 0, scoredCount = 0;
 
      // ── Análise BR e FIIs via Yahoo Finance ───────────────────────────────
      for (const asset of brAssets) {
        try {
          console.log(`[Screener] Buscando ${asset.ticker} via Yahoo Finance`);
          const yData = await yahooGetBR(asset.ticker);
          const priceModule = yData.price || {};
          const currentPrice = priceModule.regularMarketPrice ?? parseFloat(asset.current_price) ?? parseFloat(asset.average_price);
          const name = priceModule.longName || priceModule.shortName || asset.name || asset.ticker;
          const fundamentals = this.extractYahooFundamentals(yData);
          const hasAnyData = Object.values(fundamentals).some(v => v != null);
 
          if (!hasAnyData) {
            this.pushBasicPosition(analysis, asset, 'Indicadores não disponíveis no Yahoo Finance para este ativo');
            const last = analysis[analysis.length - 1];
            last.currentPrice = currentPrice; last.name = name;
            Object.assign(last, this.calcPosition(asset, currentPrice));
            continue;
          }
 
          const score = this.calculateScore(fundamentals, filters);
          const passFilters = this.applyFilters(fundamentals, filters);
          const violations  = this.getFilterViolations(fundamentals, filters);
          const effectiveScore = score ?? 50;
          const action = (effectiveScore >= 80) ? 'MANTER' : 'AVALIAR_TROCA';
 
          if (action === 'MANTER') manter++; else avaliarTroca++;
          if (score != null) { totalScore += score; scoredCount++; }
 
          const { currentValue, gainPercent } = this.calcPosition(asset, currentPrice);
          analysis.push({
            ticker: asset.ticker, name,
            quantity: asset.quantity, averagePrice: asset.average_price,
            currentPrice, currentValue, gainPercent,
            qualityScore: score, passFilters, violations,
            recommendation: { action, reason: this.getRecommendationReason(fundamentals, effectiveScore, passFilters, violations) },
            fundamentals, assetClass: asset.class_name, market: 'BR'
          });
          console.log(`[Screener] ${asset.ticker} — score: ${score}, action: ${action}`);
        } catch (e) {
          console.error(`[Screener] ERRO ${asset.ticker}:`, e.message);
          const status = e.status;
          const errMsg = status === 404 ? 'Ativo não encontrado no Yahoo Finance'
                       : status === 429 ? 'Rate limit do Yahoo Finance — tente novamente'
                       : `Erro ao buscar dados (${e.message})`;
          this.pushBasicPosition(analysis, asset, errMsg);
        }
        await new Promise(r => setTimeout(r, 400));
      }
 
      // ── Análise EUA via Yahoo Finance (sem precisar de AlphaVantage) ──────
      for (const asset of usAssets) {
        try {
          console.log(`[Screener] Buscando ${asset.ticker} (US) via Yahoo Finance`);
          const yData = await yahooGetUS(asset.ticker);
          const priceModule = yData.price || {};
          const currentPrice = priceModule.regularMarketPrice ?? parseFloat(asset.current_price) ?? parseFloat(asset.average_price);
          const name = priceModule.longName || priceModule.shortName || asset.name || asset.ticker;
          const fundamentals = this.extractYahooFundamentals(yData);
          const hasAnyData = Object.values(fundamentals).some(v => v != null);
 
          if (!hasAnyData) {
            this.pushBasicPosition(analysis, asset, 'Indicadores não disponíveis no Yahoo Finance para este ativo');
            const last = analysis[analysis.length - 1];
            last.currentPrice = currentPrice; last.name = name;
            Object.assign(last, this.calcPosition(asset, currentPrice));
            continue;
          }
 
          const score = this.calculateScore(fundamentals, filters);
          const passFilters = this.applyFilters(fundamentals, filters);
          const violations  = this.getFilterViolations(fundamentals, filters);
          const effectiveScore = score ?? 50;
          const action = (effectiveScore >= 80) ? 'MANTER' : 'AVALIAR_TROCA';
 
          if (action === 'MANTER') manter++; else avaliarTroca++;
          if (score != null) { totalScore += score; scoredCount++; }
 
          const { currentValue, gainPercent } = this.calcPosition(asset, currentPrice);
          analysis.push({
            ticker: asset.ticker, name,
            quantity: asset.quantity, averagePrice: asset.average_price,
            currentPrice, currentValue, gainPercent,
            qualityScore: score, passFilters, violations,
            recommendation: { action, reason: this.getRecommendationReason(fundamentals, effectiveScore, passFilters, violations) },
            fundamentals, assetClass: asset.class_name, market: 'US',
            sector: yData.summaryProfile?.sector || null
          });
        } catch (e) {
          console.error(`[Screener] ERRO US ${asset.ticker}:`, e.message);
          this.pushBasicPosition(analysis, asset, `Erro ao buscar dados (${e.message})`);
        }
        await new Promise(r => setTimeout(r, 400));
      }
 
      // ── Outros (renda fixa, cripto, etc.) ────────────────────────────────
      for (const asset of other) {
        const { currentValue, gainPercent } = this.calcPosition(asset, null);
        analysis.push({
          ticker: asset.ticker, name: asset.name || asset.ticker,
          quantity: asset.quantity,
          averagePrice: parseFloat(asset.average_price) || 0,
          currentPrice: parseFloat(asset.current_price) || parseFloat(asset.average_price) || 0,
          currentValue, gainPercent,
          qualityScore: null, passFilters: true, violations: [],
          recommendation: { action: 'MANTER', reason: 'Fora do escopo fundamentalista' },
          fundamentals: null, assetClass: asset.class_name, noFundamentals: true
        });
      }
 
      analysis.sort((a, b) => {
        if (!!a.noFundamentals !== !!b.noFundamentals) return a.noFundamentals ? 1 : -1;
        return (b.currentValue || 0) - (a.currentValue || 0);
      });
 
      const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;
 
      let aiAnalysis = null;
      const scoredPositions = analysis.filter(a => !a.noFundamentals && a.qualityScore != null);
      if (groqKey && scoredPositions.length > 0) {
        try { aiAnalysis = await this.getAIPortfolioAnalysis(groqKey, scoredPositions, filters); }
        catch (e) { console.error('Groq portfolio error:', e.message); }
      }
 
      return res.json({
        analysis,
        summary: { manter, avaliarTroca, totalPositions: analysis.length, avgQualityScore: avgScore },
        aiAnalysis, filtersApplied: filters
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
      const candidates = STOCKS_BR.filter(s => s !== ticker).slice(0, 20);
      const suggestions = [];
      for (const stock of candidates) {
        try {
          const yData = await yahooGetBR(stock);
          const priceModule = yData.price || {};
          const fundamentals = this.extractYahooFundamentals(yData);
          const score = this.calculateScore(fundamentals, filters) ?? 50;
          if (this.applyFilters(fundamentals, filters)) {
            suggestions.push({ ticker: stock, name: priceModule.longName || stock, price: priceModule.regularMarketPrice ?? null, ...fundamentals, score });
          }
        } catch (e) { }
        await new Promise(r => setTimeout(r, 300));
      }
      suggestions.sort((a, b) => b.score - a.score);
      return res.json({ suggestions: suggestions.slice(0, 5) });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar sugestões' });
    }
  }
 
  async getFundamentals(req, res) {
    try {
      const { ticker } = req.params;
      // Detectar se é ativo BR ou US pelo padrão do ticker
      const isBR = /^[A-Z]{3,6}\d{1,2}$/.test(ticker);
      const yData = isBR ? await yahooGetBR(ticker) : await yahooGetUS(ticker);
      const priceModule = yData.price || {};
      const fundamentals = this.extractYahooFundamentals(yData);
      return res.json({
        ticker, name: priceModule.longName || priceModule.shortName || ticker,
        price: priceModule.regularMarketPrice ?? null,
        ...fundamentals, score: this.calculateScore(fundamentals, {}) ?? 50
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao buscar dados: ' + error.message });
    }
  }
 
  async saveFilters(req, res) {
    try {
      const { name, filters } = req.body;
      await pool.query(`INSERT INTO screener_filters (user_id, name, filters) VALUES ($1, $2, $3) ON CONFLICT (user_id, name) DO UPDATE SET filters = $3, updated_at = NOW()`, [req.userId, name, JSON.stringify(filters)]);
      return res.json({ message: 'Filtros salvos' });
    } catch (error) { return res.status(500).json({ error: 'Erro ao salvar' }); }
  }
 
  async listFilters(req, res) {
    try {
      const result = await pool.query('SELECT * FROM screener_filters WHERE user_id = $1', [req.userId]);
      return res.json({ filters: result.rows });
    } catch (error) { return res.status(500).json({ error: 'Erro ao listar' }); }
  }
 
  // ── Extração de fundamentals — Yahoo Finance ──────────────────────────────
  // Com formatted=false, campos chegam como número direto.
  // Alguns módulos ainda retornam { raw, fmt } — n() trata os dois casos.
  // debtToEquity vem em escala percentual (101.6 = 1.016x) → dividir por 100
  extractYahooFundamentals(yData) {
    const ks = yData.defaultKeyStatistics || {};
    const fd = yData.financialData        || {};
    const sd = yData.summaryDetail        || {};
    const ce = yData.calendarEvents       || {};
 
    const n = (v) => {
      if (v == null) return null;
      const val = typeof v === 'object' ? (v.raw ?? v.fmt) : v;
      const f = parseFloat(val);
      return isNaN(f) || !isFinite(f) ? null : f;
    };
    const pct = (v) => { const x = n(v); return x != null ? x * 100 : null; };
 
    // Converte timestamp Unix (segundos) ou objeto { raw } para ISO date string
    const toDate = (v) => {
      if (v == null) return null;
      const raw = typeof v === 'object' ? v.raw : v;
      if (!raw || isNaN(raw)) return null;
      // Yahoo retorna timestamps em segundos
      const ms = raw > 1e10 ? raw : raw * 1000;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    };
 
    const pl      = n(sd.trailingPE) ?? n(ks.forwardPE) ?? n(sd.forwardPE);
    const pvp     = n(ks.priceToBook);
    const dy      = (() => {
      const v = n(sd.dividendYield) ?? n(ks.dividendYield);
      if (v == null) return null;
      return v > 1 ? v : v * 100;
    })();
    const evEbitda         = n(ks.enterpriseToEbitda);
    const psr              = n(sd.priceToSalesTrailing12Months);
    const margemEbit       = pct(fd.operatingMargins);
    const margemLiquida    = pct(fd.profitMargins);
    const liquidezCorrente = n(fd.currentRatio);
    const roe              = pct(fd.returnOnEquity);
    const roic             = pct(fd.returnOnAssets);
    const dividaPl         = (() => { const v = n(fd.debtToEquity); return v != null ? v / 100 : null; })();
    const crescReceita     = pct(fd.revenueGrowth);
 
    // Datas de dividendo — calendarEvents
    // exDividendDate: data ex-dividendo (precisa ter a ação ANTES desta data para receber)
    // dividendDate:   data de pagamento efetivo
    const exDividendDate = toDate(ce.exDividendDate) ?? toDate(sd.exDividendDate) ?? toDate(ks.lastDividendDate);
    const dividendDate   = toDate(ce.dividendDate);
 
    return {
      pl, pvp, psr, dy, evEbitda, margemEbit, margemLiquida,
      liquidezCorrente, roic, roe, dividaPl, crescReceita,
      exDividendDate, dividendDate
    };
  }
 
  // ── Filtros ───────────────────────────────────────────────────────────────
  applyFilters(data, filters) {
    if (!filters || Object.keys(filters).length === 0) return true;
    const map = {
      pl: [filters.plMin, filters.plMax], pvp: [filters.pvpMin, filters.pvpMax],
      psr: [filters.psrMin, filters.psrMax], dy: [filters.dyMin, filters.dyMax],
      evEbitda: [filters.evEbitdaMin, filters.evEbitdaMax],
      margemEbit: [filters.margemEbitMin, filters.margemEbitMax],
      margemLiquida: [filters.margemLiquidaMin, filters.margemLiquidaMax],
      liquidezCorrente: [filters.liquidezCorrenteMin, filters.liquidezCorrenteMax],
      roic: [filters.roicMin, filters.roicMax], roe: [filters.roeMin, filters.roeMax],
      dividaPl: [filters.dividaPatrimonioMin, filters.dividaPatrimonioMax],
      crescReceita: [filters.crescimentoReceitaMin, filters.crescimentoReceitaMax],
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
      ['P/L','pl',filters.plMin,filters.plMax],['P/VP','pvp',filters.pvpMin,filters.pvpMax],
      ['PSR','psr',filters.psrMin,filters.psrMax],['DY','dy',filters.dyMin,filters.dyMax],
      ['EV/EBITDA','evEbitda',filters.evEbitdaMin,filters.evEbitdaMax],
      ['M.EBIT','margemEbit',filters.margemEbitMin,filters.margemEbitMax],
      ['M.Líq','margemLiquida',filters.margemLiquidaMin,filters.margemLiquidaMax],
      ['Liq.Cor','liquidezCorrente',filters.liquidezCorrenteMin,filters.liquidezCorrenteMax],
      ['ROIC','roic',filters.roicMin,filters.roicMax],['ROE','roe',filters.roeMin,filters.roeMax],
      ['Dív/PL','dividaPl',filters.dividaPatrimonioMin,filters.dividaPatrimonioMax],
      ['Cresc.','crescReceita',filters.crescimentoReceitaMin,filters.crescimentoReceitaMax],
    ];
    for (const [label, field, min, max] of checks) {
      const val = data[field];
      if (val == null) continue;
      if (min != null && !isNaN(min) && val < parseFloat(min)) violations.push(`${label} baixo (${val.toFixed(1)})`);
      else if (max != null && !isNaN(max) && val > parseFloat(max)) violations.push(`${label} alto (${val.toFixed(1)})`);
    }
    return violations;
  }
 
  // ── Score combinado (0–100) ───────────────────────────────────────────────
  // Cada indicador contribui com pontos dentro do seu peso máximo.
  // A pontuação de cada campo é proporcional à qualidade do valor — não binária.
  // Score final = soma dos pontos / soma dos pesos disponíveis × 100
  //
  // Limiares de recomendação:
  //   >= 80 → COMPRAR  (excelente combinação de indicadores)
  //   >= 60 → MANTER   (bom, mas não excepcional)
  //    < 60 → AVALIAR  (indicadores fracos ou abaixo dos parâmetros)
  calculateScore(data, filters = {}) {
    const hasAny = [data.pl, data.pvp, data.dy, data.roe, data.roic,
                    data.margemLiquida, data.dividaPl, data.crescReceita,
                    data.liquidezCorrente].some(v => v != null);
    if (!hasAny) return null;
 
    // Cada entrada: [campo, peso, fn pontuação → 0.0 a 1.0]
    // A fn recebe o valor e os filtros e retorna quanto do peso máximo ganhou.
    const criteria = [
 
      // ── P/L (peso 15) — menor é melhor, ideal 5–12 ────────────────────────
      ['pl', 15, (v) => {
        if (v <= 0) return 0;
        const min = filters.plMin, max = filters.plMax;
        if (min != null && max != null && v >= min && v <= max) return 1.0;
        if (v <= 8)  return 0.95;
        if (v <= 12) return 0.80;
        if (v <= 15) return 0.65;
        if (v <= 20) return 0.45;
        if (v <= 30) return 0.20;
        return 0.05;
      }],
 
      // ── P/VP (peso 10) — menor é melhor, ideal 0.5–1.5 ──────────────────
      ['pvp', 10, (v) => {
        const min = filters.pvpMin, max = filters.pvpMax;
        if (min != null && max != null && v >= min && v <= max) return 1.0;
        if (v <= 0) return 0;
        if (v <= 0.8)  return 0.95;
        if (v <= 1.2)  return 0.85;
        if (v <= 1.8)  return 0.70;
        if (v <= 2.5)  return 0.45;
        if (v <= 3.5)  return 0.20;
        return 0.05;
      }],
 
      // ── Dividend Yield (peso 15) — maior é melhor, ideal > 5% ────────────
      ['dy', 15, (v) => {
        const min = filters.dyMin;
        if (min != null && v >= min) return Math.min(1.0, 0.7 + (v - min) / (min * 2) * 0.3);
        if (v >= 10) return 0.95;
        if (v >= 7)  return 0.85;
        if (v >= 5)  return 0.70;
        if (v >= 3)  return 0.45;
        if (v >= 1)  return 0.25;
        return 0.10;
      }],
 
      // ── ROE (peso 15) — maior é melhor, ideal > 15% ──────────────────────
      ['roe', 15, (v) => {
        const min = filters.roeMin;
        if (min != null && v >= min) return Math.min(1.0, 0.7 + (v - min) / (min * 2) * 0.3);
        if (v >= 30) return 0.95;
        if (v >= 20) return 0.85;
        if (v >= 15) return 0.70;
        if (v >= 10) return 0.50;
        if (v >= 5)  return 0.30;
        if (v >= 0)  return 0.15;
        return 0.0; // ROE negativo penaliza
      }],
 
      // ── ROIC/ROA (peso 10) — maior é melhor, ideal > 8% ─────────────────
      ['roic', 10, (v) => {
        const min = filters.roicMin;
        if (min != null && v >= min) return Math.min(1.0, 0.7 + (v - min) / (min * 2) * 0.3);
        if (v >= 20) return 0.95;
        if (v >= 12) return 0.80;
        if (v >= 8)  return 0.65;
        if (v >= 5)  return 0.40;
        if (v >= 0)  return 0.20;
        return 0.0;
      }],
 
      // ── Margem Líquida (peso 10) — maior é melhor, ideal > 10% ──────────
      ['margemLiquida', 10, (v) => {
        const min = filters.margemLiquidaMin;
        if (min != null && v >= min) return Math.min(1.0, 0.7 + (v - min) / (min * 2) * 0.3);
        if (v >= 25) return 0.95;
        if (v >= 15) return 0.85;
        if (v >= 10) return 0.70;
        if (v >= 5)  return 0.45;
        if (v >= 0)  return 0.20;
        return 0.0;
      }],
 
      // ── Margem EBIT (peso 5) — maior é melhor, ideal > 10% ───────────────
      ['margemEbit', 5, (v) => {
        if (v >= 25) return 0.95;
        if (v >= 15) return 0.80;
        if (v >= 10) return 0.65;
        if (v >= 5)  return 0.40;
        if (v >= 0)  return 0.20;
        return 0.0;
      }],
 
      // ── Dívida/PL (peso 10) — menor é melhor, ideal < 1.0 ────────────────
      ['dividaPl', 10, (v) => {
        const max = filters.dividaPatrimonioMax;
        if (max != null && v <= max) return Math.min(1.0, 0.7 + (max - v) / max * 0.3);
        if (v <= 0.3)  return 0.95;
        if (v <= 0.7)  return 0.85;
        if (v <= 1.0)  return 0.70;
        if (v <= 1.5)  return 0.50;
        if (v <= 2.0)  return 0.30;
        if (v <= 3.0)  return 0.15;
        return 0.0;
      }],
 
      // ── Liquidez Corrente (peso 5) — maior é melhor, ideal > 1.5 ─────────
      ['liquidezCorrente', 5, (v) => {
        if (v >= 2.5) return 0.95;
        if (v >= 1.8) return 0.85;
        if (v >= 1.5) return 0.70;
        if (v >= 1.0) return 0.45;
        if (v >= 0.8) return 0.20;
        return 0.05;
      }],
 
      // ── Crescimento de Receita (peso 5) — maior é melhor, ideal > 5% ─────
      ['crescReceita', 5, (v) => {
        const min = filters.crescimentoReceitaMin;
        if (min != null && v >= min) return Math.min(1.0, 0.7 + (v - min) / (min * 2 || 20) * 0.3);
        if (v >= 20) return 0.95;
        if (v >= 10) return 0.80;
        if (v >= 5)  return 0.65;
        if (v >= 0)  return 0.45; // crescimento nulo ainda é neutro
        if (v >= -5) return 0.25;
        return 0.05;
      }],
    ];
 
    let totalPoints = 0;
    let totalWeight = 0;
 
    for (const [field, weight, scoreFn] of criteria) {
      const val = data[field];
      if (val == null) continue; // campo ausente não penaliza nem pontua
      totalPoints += weight * scoreFn(val);
      totalWeight += weight;
    }
 
    if (totalWeight === 0) return null;
 
    // Score de 0–100, proporcional aos campos disponíveis
    return Math.round((totalPoints / totalWeight) * 100);
  }
 
  getRecommendationReason(f, score, passFilters, violations) {
    const positives = [];
    const negatives = [];
 
    if (f.roe  != null && f.roe  >= 20)  positives.push(`ROE forte (${f.roe.toFixed(1)}%)`);
    if (f.dy   != null && f.dy   >= 5)   positives.push(`DY atrativo (${f.dy.toFixed(1)}%)`);
    if (f.pvp  != null && f.pvp  <= 1)   positives.push(`P/VP abaixo de 1 (${f.pvp.toFixed(2)})`);
    if (f.pl   != null && f.pl   <= 10 && f.pl > 0) positives.push(`P/L baixo (${f.pl.toFixed(1)})`);
    if (f.roic != null && f.roic >= 15)  positives.push(`ROIC alto (${f.roic.toFixed(1)}%)`);
    if (f.margemLiquida != null && f.margemLiquida >= 15) positives.push(`Margem líquida forte (${f.margemLiquida.toFixed(1)}%)`);
 
    if (f.dividaPl != null && f.dividaPl > 2.5) negatives.push(`Dívida elevada (${f.dividaPl.toFixed(1)}x PL)`);
    if (f.roe  != null && f.roe  < 5)   negatives.push(`ROE fraco (${f.roe.toFixed(1)}%)`);
    if (f.dy   != null && f.dy   < 2)   negatives.push(`DY baixo (${f.dy.toFixed(1)}%)`);
 
    if (violations?.length > 0) negatives.push(...violations.slice(0, 2));
 
    if (score >= 80) {
      return positives.length > 0
        ? positives.slice(0, 2).join(' · ')
        : 'Excelente combinação de indicadores';
    }
    if (score >= 60) {
      if (positives.length > 0 && negatives.length > 0)
        return `${positives[0]} · ${negatives[0]}`;
      if (positives.length > 0) return positives[0];
      return 'Indicadores razoáveis';
    }
    return negatives.length > 0
      ? negatives.slice(0, 2).join(' · ')
      : 'Indicadores abaixo do esperado';
  }
 
  calcPosition(asset, currentPx) {
    const avgPrice = parseFloat(asset.average_price) || 0;
    const qty      = parseFloat(asset.quantity) || 0;
    const px       = currentPx || parseFloat(asset.current_price) || avgPrice;
    const invested = qty * avgPrice;
    const currentValue = qty * px;
    const gainPercent  = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;
    return { currentValue, gainPercent };
  }
 
  pushBasicPosition(analysis, asset, reason) {
    const { currentValue, gainPercent } = this.calcPosition(asset, null);
    analysis.push({
      ticker: asset.ticker, name: asset.name || asset.ticker,
      quantity: asset.quantity,
      averagePrice: parseFloat(asset.average_price) || 0,
      currentPrice: parseFloat(asset.current_price) || parseFloat(asset.average_price) || 0,
      currentValue, gainPercent,
      qualityScore: null, passFilters: false, violations: [],
      recommendation: { action: 'AVALIAR', reason },
      fundamentals: {}, assetClass: asset.class_name, noFundamentals: true
    });
  }
 
  async getAIRecommendation(apiKey, stocks, filters) {
    const summary = stocks.slice(0, 8).map(s =>
      `${s.ticker}(${s.market||'BR'}): Score=${s.score}, P/L=${s.pl?.toFixed(1)??'-'}, DY=${s.dy?.toFixed(1)??'-'}%, ROE=${s.roe?.toFixed(1)??'-'}%`
    ).join('\n');
    const filtersDesc = Object.entries(filters).filter(([,v])=>v!=null).map(([k,v])=>`${k}=${v}`).join(', ');
    const prompt = `Analista de ações. Filtros: ${filtersDesc||'padrão'}.\nAtivos:\n${summary}\nRetorne APENAS JSON:\n{"topPicks":[{"ticker":"XX","reason":"motivo","conviction":"alta|media|baixa","horizon":"curto|medio|longo prazo"}],"marketComment":"2-3 frases","riskWarning":"1 frase"}\nMáximo 3 topPicks.`;
    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions',
      { model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'Analista financeiro. Responda APENAS com JSON válido, sem markdown.' }, { role: 'user', content: prompt }], max_tokens: 800, temperature: 0.5 },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );
    const content = resp.data?.choices?.[0]?.message?.content || '';
    const clean = content.trim().replace(/```json\s*/g,'').replace(/```\s*/g,'');
    return JSON.parse((clean.match(/\{[\s\S]*\}/) || [clean])[0]);
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
    const prompt = `Analise o portfólio (critérios: ${filtersDesc||'padrão'}):\n${summary}\nRetorne APENAS JSON:\n{"portfolioScore":75,"summary":"2 frases","strengths":["ponto1"],"weaknesses":["ponto1 com ticker"],"suggestion":"ação imediata"}`;
    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions',
      { model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'Analista financeiro brasileiro sênior. Responda APENAS com JSON válido, sem markdown.' }, { role: 'user', content: prompt }], max_tokens: 700, temperature: 0.5 },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );
    const content = resp.data?.choices?.[0]?.message?.content || '';
    const clean = content.trim().replace(/```json\s*/g,'').replace(/```\s*/g,'');
    return JSON.parse((clean.match(/\{[\s\S]*\}/) || [clean])[0]);
  }
}
 
module.exports = new ScreenerController();