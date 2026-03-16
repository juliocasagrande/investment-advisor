const pool = require('../config/database');
const axios = require('axios'); // mantido apenas para Groq (POST)

// ── Yahoo Finance — Cookie + Crumb ────────────────────────────────────────────
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

// ── Cache de resultados Yahoo (8 min) + Concorrência controlada (4 paralelas) ─
// Cache: evita rebuscar o mesmo ticker em curta janela de tempo.
// Concorrência: batches de 4 com 300ms entre grupos → ~20–30s para 328 ativos.
const _yahooCache = new Map();
const CACHE_TTL   = 8 * 60 * 1000;
const CONCURRENCY = 4;
const DELAY_MS    = 300;

function getCached(symbol) {
  const entry = _yahooCache.get(symbol);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _yahooCache.delete(symbol); return null; }
  return entry.data;
}
function setCache(symbol, data) {
  _yahooCache.set(symbol, { data, ts: Date.now() });
}
async function fetchWithConcurrency(tickers, fetchFn) {
  const results = [];
  for (let i = 0; i < tickers.length; i += CONCURRENCY) {
    const batch = tickers.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(batch.map(fetchFn));
    results.push(...batchResults);
    if (i + CONCURRENCY < tickers.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }
  return results;
}

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
  const cached = getCached(symbol);
  if (cached) return cached;

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
    setCache(symbol, result);
    return result;
  }
}

const yahooGetBR = (ticker) => yahooGet(ticker.endsWith('.SA') ? ticker : `${ticker}.SA`);
const yahooGetUS = (ticker) => yahooGet(ticker);

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

// ── Listas de ativos e mapa de setores ───────────────────────────────────────
// Mapa estático: ticker → setor em português
// O Yahoo Finance não retorna summaryProfile de forma confiável nos módulos gratuitos.

const SECTOR_MAP = {
  // Financeiro
  'ITUB4':'Financeiro','ITUB3':'Financeiro','BBDC4':'Financeiro','BBDC3':'Financeiro',
  'BBAS3':'Financeiro','SANB11':'Financeiro','ITSA4':'Financeiro','BPAC11':'Financeiro',
  'BBSE3':'Financeiro','B3SA3':'Financeiro','PSSA3':'Financeiro','CIEL3':'Financeiro',
  'IRBR3':'Financeiro','CASH3':'Financeiro','BMGB4':'Financeiro','BRAP4':'Financeiro',
  // Petróleo e Gás
  'PETR4':'Petróleo e Gás','PETR3':'Petróleo e Gás','PRIO3':'Petróleo e Gás',
  'RRRP3':'Petróleo e Gás','RECV3':'Petróleo e Gás','CSAN3':'Petróleo e Gás',
  'RAIZ4':'Petróleo e Gás','UGPA3':'Petróleo e Gás','VBBR3':'Petróleo e Gás',
  'BRKM5':'Petróleo e Gás','DXCO3':'Petróleo e Gás',
  // Energia Elétrica
  'ELET3':'Energia','ELET6':'Energia','CMIG4':'Energia','CMIG3':'Energia',
  'CPFE3':'Energia','CPLE3':'Energia','CPLE6':'Energia','EGIE3':'Energia',
  'TAEE11':'Energia','ENBR3':'Energia','AESB3':'Energia','EQTL3':'Energia',
  'TRPL4':'Energia','ALUP11':'Energia','ENGI11':'Energia','NEOE3':'Energia',
  'MEGA3':'Energia','AMBP3':'Energia',
  // Mineração e Siderurgia
  'VALE3':'Mineração','CMIN3':'Mineração','BAHI3':'Mineração',
  'GGBR4':'Siderurgia','GGBR3':'Siderurgia','CSNA3':'Siderurgia',
  'USIM5':'Siderurgia','GOAU4':'Siderurgia',
  // Papel e Celulose
  'SUZB3':'Papel e Celulose','KLBN11':'Papel e Celulose','RANI3':'Papel e Celulose',
  // Indústria e Bens de Capital
  'WEGE3':'Indústria','EMBR3':'Indústria','TUPY3':'Indústria','ROMI3':'Indústria',
  'POMO4':'Indústria','KEPL3':'Indústria','INTB3':'Indústria','MYPK3':'Indústria',
  'FRAS3':'Indústria','RAPT4':'Indústria','CBAV3':'Indústria',
  // Logística e Transporte
  'RAIL3':'Logística','CCRO3':'Logística','ECOR3':'Logística','LOGG3':'Logística',
  'JSLG3':'Logística','MOVI3':'Logística','SIMH3':'Logística','HBSA3':'Logística',
  // Varejo
  'LREN3':'Varejo','ARZZ3':'Varejo','SOMA3':'Varejo','VIVA3':'Varejo',
  'CEAB3':'Varejo','GUAR3':'Varejo','MGLU3':'Varejo','VIIA3':'Varejo',
  'AMER3':'Varejo','BHIA3':'Varejo','PETZ3':'Varejo','GMAT3':'Varejo',
  'AMAR3':'Varejo','RENT3':'Varejo',
  // Consumo e Alimentos
  'ABEV3':'Consumo','BRFS3':'Alimentos','MRFG3':'Alimentos','JBSS3':'Alimentos',
  'MDIA3':'Alimentos','SMTO3':'Alimentos','SLCE3':'Alimentos','BEEF3':'Alimentos',
  'CRFB3':'Consumo','ASAI3':'Consumo','PCAR3':'Consumo','CAML3':'Alimentos',
  'NTCO3':'Consumo',
  // Saúde
  'RDOR3':'Saúde','HAPV3':'Saúde','QUAL3':'Saúde','FLRY3':'Saúde',
  'DASA3':'Saúde','ODPV3':'Saúde','HYPE3':'Saúde','VVEO3':'Saúde',
  'PARD3':'Saúde','ANIM3':'Saúde',
  // Tecnologia
  'TOTS3':'Tecnologia','POSI3':'Tecnologia','LWSA3':'Tecnologia','SQIA3':'Tecnologia',
  'YDUQ3':'Tecnologia',
  // Educação
  'COGN3':'Educação',
  // Telecom
  'VIVT3':'Telecom','TIMS3':'Telecom','OIBR3':'Telecom',
  // Construção e Imobiliário
  'MRVE3':'Construção','EZTC3':'Construção','EVEN3':'Construção','CYRE3':'Construção',
  'DIRR3':'Construção','TEND3':'Construção','TRIS3':'Construção','JHSF3':'Construção',
  'HBOR3':'Construção','LAVV3':'Construção','CURY3':'Construção','PLPL3':'Construção',
  // Shoppings
  'MULT3':'Shoppings','IGTI11':'Shoppings','ALSO3':'Shoppings','BRML3':'Shoppings',
  // Saneamento
  'SBSP3':'Saneamento','SAPR11':'Saneamento','CSMG3':'Saneamento',
  // Diversificados
  'GRND3':'Diversificado','ALPA4':'Diversificado','DXCO3':'Diversificado',
  'CVCB3':'Turismo',
  // FIIs por tipo
  'MXRF11':'FII - Papel','CPTS11':'FII - Papel','KNCR11':'FII - Papel',
  'KNIP11':'FII - Papel','IRDM11':'FII - Papel','VGIP11':'FII - Papel',
  'RECR11':'FII - Papel','BTCR11':'FII - Papel','MCCI11':'FII - Papel',
  'KNHY11':'FII - Papel','DEVA11':'FII - Papel','PLCR11':'FII - Papel',
  'CVBI11':'FII - Papel','KNSC11':'FII - Papel','VGIR11':'FII - Papel',
  'BCRI11':'FII - Papel','HGCR11':'FII - Papel','BARI11':'FII - Papel',
  'AFHI11':'FII - Papel','ARRI11':'FII - Papel','SNFF11':'FII - Papel',
  'URPR11':'FII - Papel','HABT11':'FII - Papel','HCTR11':'FII - Papel',
  'FEXC11':'FII - Papel','CARE11':'FII - Papel','TGAR11':'FII - Papel',
  'XPIN11':'FII - Papel',
  'HGLG11':'FII - Logístico','BTLG11':'FII - Logístico','XPLG11':'FII - Logístico',
  'VILG11':'FII - Logístico','LVBI11':'FII - Logístico','GGRC11':'FII - Logístico',
  'PATL11':'FII - Logístico','TRXF11':'FII - Logístico','BLMG11':'FII - Logístico',
  'HSLG11':'FII - Logístico','ALZR11':'FII - Logístico',
  'XPML11':'FII - Shopping','VISC11':'FII - Shopping','HSML11':'FII - Shopping',
  'HGBS11':'FII - Shopping','MALL11':'FII - Shopping',
  'HGRE11':'FII - Escritório','BRCR11':'FII - Escritório','PVBI11':'FII - Escritório',
  'JSRE11':'FII - Escritório','HGPO11':'FII - Escritório','RNGO11':'FII - Escritório',
  'HGFF11':'FII - Escritório',
  'KNRI11':'FII - Híbrido','RBHG11':'FII - Híbrido','RBRP11':'FII - Híbrido',
  'HGRU11':'FII - Híbrido','RBVA11':'FII - Híbrido','BTAL11':'FII - Híbrido',
  'RBRF11':'FII - FoF','KFOF11':'FII - FoF','MGFF11':'FII - FoF',
  'HFOF11':'FII - FoF','BCFF11':'FII - FoF','XPSF11':'FII - FoF',
};

const US_SECTOR_MAP = {
  // Tecnologia
  'AAPL':'Tecnologia','MSFT':'Tecnologia','GOOGL':'Tecnologia','GOOG':'Tecnologia',
  'NVDA':'Tecnologia','META':'Tecnologia','CSCO':'Tecnologia','INTC':'Tecnologia',
  'ADBE':'Tecnologia','CRM':'Tecnologia','AMD':'Tecnologia','QCOM':'Tecnologia',
  'AVGO':'Tecnologia','TXN':'Tecnologia','ORCL':'Tecnologia','IBM':'Tecnologia',
  'INTU':'Tecnologia','NOW':'Tecnologia','AMAT':'Tecnologia','PLTR':'Tecnologia',
  'SNOW':'Tecnologia','DDOG':'Tecnologia','CRWD':'Tecnologia','NET':'Tecnologia',
  'OKTA':'Tecnologia','TWLO':'Tecnologia','DOCU':'Tecnologia','ZM':'Tecnologia',
  'ROKU':'Tecnologia','SHOP':'Tecnologia',
  // Consumo Discricionário
  'AMZN':'Consumo','TSLA':'Consumo','HD':'Consumo','MCD':'Consumo','NKE':'Consumo',
  'SBUX':'Consumo','LOW':'Consumo','BKNG':'Consumo','UBER':'Consumo',
  'LYFT':'Consumo','SQ':'Consumo',
  // Consumo Estável
  'PG':'Consumo Estável','KO':'Consumo Estável','PEP':'Consumo Estável',
  'WMT':'Consumo Estável','COST':'Consumo Estável','PM':'Consumo Estável',
  // Financeiro
  'JPM':'Financeiro','BAC':'Financeiro','WFC':'Financeiro','GS':'Financeiro',
  'MS':'Financeiro','BLK':'Financeiro','SCHW':'Financeiro','AXP':'Financeiro',
  'SPGI':'Financeiro','ICE':'Financeiro','V':'Financeiro','MA':'Financeiro',
  'PYPL':'Financeiro',
  // Saúde
  'JNJ':'Saúde','UNH':'Saúde','PFE':'Saúde','DHR':'Saúde','ABT':'Saúde',
  'MDT':'Saúde','ISRG':'Saúde',
  // Energia
  'XOM':'Energia','CVX':'Energia','COP':'Energia','SLB':'Energia',
  'EOG':'Energia','OXY':'Energia','NEE':'Energia',
  // Indústria
  'CAT':'Indústria','GE':'Indústria','HON':'Indústria','LIN':'Indústria',
  'LMT':'Indústria','DE':'Indústria','UPS':'Indústria','FDX':'Indústria',
  'RTX':'Indústria','ADP':'Indústria',
  // Telecom
  'T':'Telecom','VZ':'Telecom',
  // Entretenimento
  'DIS':'Entretenimento','NFLX':'Entretenimento',
  // REITs
  'O':'REIT - Varejo','ADC':'REIT - Varejo','NNN':'REIT - Varejo',
  'REG':'REIT - Shopping','KIM':'REIT - Shopping','FRT':'REIT - Shopping',
  'SPG':'REIT - Shopping',
  'PLD':'REIT - Industrial','FR':'REIT - Industrial','EGP':'REIT - Industrial',
  'STAG':'REIT - Industrial','TRNO':'REIT - Industrial',
  'AMT':'REIT - Torre','CCI':'REIT - Torre','SBAC':'REIT - Torre',
  'EQIX':'REIT - Data Center','DLR':'REIT - Data Center',
  'PSA':'REIT - Self-Storage','EXR':'REIT - Self-Storage','CUBE':'REIT - Self-Storage',
  'AVB':'REIT - Residencial','EQR':'REIT - Residencial','MAA':'REIT - Residencial',
  'UDR':'REIT - Residencial','CPT':'REIT - Residencial',
  'WELL':'REIT - Saúde','VTR':'REIT - Saúde','DOC':'REIT - Saúde',
  'HR':'REIT - Saúde','MPW':'REIT - Saúde',
  'BXP':'REIT - Escritório','SLG':'REIT - Escritório','VNO':'REIT - Escritório',
  'WPC':'REIT - Diversificado','SRC':'REIT - Diversificado','STOR':'REIT - Diversificado',
  'VICI':'REIT - Cassino','ARE':'REIT - Escritório',
  'HIW':'REIT - Escritório','KRC':'REIT - Escritório',
};

const STOCKS_BR = [
  'ABEV3','ALPA4','ALSO3','AMAR3','AMBP3','AMER3','ANIM3','ARZZ3','ASAI3',
  'AZUL4','B3SA3','BAHI3','BBAS3','BBDC3','BBDC4','BBSE3','BEEF3','BHIA3',
  'BMGB4','BPAC11','BRAP4','BRFS3','BRKM5','BRML3','CAML3','CASH3','CBAV3',
  'CCRO3','CEAB3','CIEL3','CMIG3','CMIG4','CMIN3','COGN3','CPFE3','CPLE3',
  'CPLE6','CRFB3','CSAN3','CSMG3','CSNA3','CVCB3','CYRE3','DASA3','DIRR3',
  'DXCO3','ECOR3','EGIE3','ELET3','ELET6','EMBR3','ENBR3','ENGI11','EQTL3',
  'EZTC3','FLRY3','FRAS3','GGBR3','GGBR4','GMAT3','GOAU4','GRND3','GUAR3',
  'HAPV3','HBOR3','HBSA3','HYPE3','IGTI11','INTB3','IRBR3','ITSA4','ITUB3',
  'ITUB4','JBSS3','JHSF3','JSLG3','KEPL3','KLBN11','LAVV3','LREN3','LWSA3',
  'MDIA3','MEGA3','MGLU3','MOVI3','MRFG3','MRVE3','MULT3','MYPK3','NEOE3',
  'NTCO3','ODPV3','OIBR3','PARD3','PCAR3','PETR3','PETR4','PETZ3','PLPL3',
  'POMO4','POSI3','PRIO3','PSSA3','QUAL3','RAIL3','RAIZ4','RANI3','RDOR3',
  'RECV3','RENT3','RRRP3','RAPT4','SANB11','SAPR11','SBSP3','SIMH3','SLCE3',
  'SMTO3','SOMA3','SUZB3','TAEE11','TEND3','TIMS3','TOTS3','TRIS3','TRPL4',
  'TUPY3','UGPA3','USIM5','VALE3','VBBR3','VIVA3','VIVT3','VVEO3','WEGE3',
  'YDUQ3',
];

const FIIS = [
  'AFHI11','ALZR11','ARRI11','BARI11','BCFF11','BCRI11','BLMG11','BTAL11',
  'BTCR11','BTLG11','CARE11','CPTS11','CVBI11','DEVA11','FEXC11','GGRC11',
  'HABT11','HCTR11','HFOF11','HGCR11','HGFF11','HGLG11','HGPO11','HGRE11',
  'HGRU11','HSML11','HSLG11','IRDM11','JSRE11','KFOF11','KNCR11','KNHY11',
  'KNIP11','KNRI11','KNSC11','LVBI11','MALL11','MCCI11','MGFF11','MXRF11',
  'PATL11','PLCR11','PVBI11','RBRF11','RBRP11','RBVA11','RECR11','RNGO11',
  'SNFF11','TGAR11','TRXF11','URPR11','VGIP11','VGIR11','VILG11','VISC11',
  'XPIN11','XPLG11','XPML11','XPSF11',
];

const STOCKS_US = [
  'AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','META','TSLA','BRK-B','JPM',
  'JNJ','V','PG','UNH','HD','MA','DIS','BAC','XOM','PFE',
  'KO','PEP','WMT','COST','CSCO','INTC','NFLX','ADBE','CRM','AMD',
  'PYPL','QCOM','T','VZ','AVGO','TXN','ORCL','IBM','INTU','NOW',
  'SBUX','NKE','MCD','CAT','GE','HON','LIN','AMAT','ISRG','BKNG',
  'DHR','ABT','MDT','LOW','NEE','PM','RTX','WFC','GS','MS',
  'BLK','SCHW','AXP','SPGI','ICE','ADP','LMT','DE','UPS','FDX',
  'CVX','COP','SLB','EOG','OXY','PLTR','SNOW','UBER','LYFT','SQ',
  'SHOP','ROKU','TWLO','DOCU','ZM','DDOG','CRWD','NET','OKTA',
];

const REITS = [
  'O','ADC','NNN','SPG','REG','KIM','FRT',
  'PLD','FR','EGP','STAG','TRNO',
  'AMT','CCI','SBAC',
  'EQIX','DLR',
  'PSA','EXR','CUBE',
  'AVB','EQR','MAA','UDR','CPT',
  'WELL','VTR','DOC','HR','MPW',
  'BXP','SLG','VNO',
  'WPC','SRC','STOR','VICI',
  'ARE','HIW','KRC',
];

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
  // Cache em memória 8 min + concorrência máxima de 4 requisições simultâneas.
  async fetchStocksYahoo(list, filters, isUS = false) {
    const unique = [...new Set(list)];
    const results = [];

    const fetchOne = async (ticker) => {
      // Verificar cache primeiro
      const cached = getCached(ticker);
      const yData = cached || (isUS ? await yahooGetUS(ticker) : await yahooGetBR(ticker));
      if (!cached) setCache(ticker, yData);

      const priceModule = yData.price || {};
      const fundamentals = this.extractYahooFundamentals(yData);
      const score = this.calculateScore(fundamentals, {}) ?? 50;
      const passFilters = score >= 80;
      const violations = this.getFilterViolations(fundamentals, filters);
      const sector = isUS ? (US_SECTOR_MAP[ticker] || null) : (SECTOR_MAP[ticker] || null);
      return {
        ticker,
        name: priceModule.longName || priceModule.shortName || ticker,
        price: priceModule.regularMarketPrice ?? null,
        change: priceModule.regularMarketChangePercent ?? null,
        market: isUS ? 'US' : 'BR',
        sector,
        ...fundamentals,
        score,
        passFilters,
        violations,
        recommendation: score >= 80 ? 'COMPRAR' : score >= 60 ? 'MANTER' : 'AVALIAR',
      };
    };

    const settled = await fetchWithConcurrency(unique, fetchOne);
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === 'fulfilled') {
        results.push(r.value);
        console.log(`[Search] ${r.value.ticker} — score: ${r.value.score}`);
      } else {
        console.error(`[Search] Erro ${unique[i]}:`, r.reason?.message || r.reason);
      }
    }
    return results;
  }

  // ── Analisar posições do usuário ──────────────────────────────────────────
  async analyzePositions(req, res) {
    try {
      const userId = req.userId;
      // Score sempre calculado com filtros vazios — igual à aba Buscar.
      // Filtros do usuário usados apenas para violations informativas.
      const scoreFilters = {};
      const violationFilters = req.body?.filters && Object.keys(req.body.filters).length > 0
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
          const cached = getCached(asset.ticker + '.SA');
          const yData = cached || await yahooGetBR(asset.ticker);
          if (!cached) setCache(asset.ticker + '.SA', yData);
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

          const score        = this.calculateScore(fundamentals, scoreFilters);
          const violations   = this.getFilterViolations(fundamentals, violationFilters);
          const passFilters  = this.applyFilters(fundamentals, violationFilters);
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
            fundamentals,
            assetClass: asset.class_name,
            market: 'BR',
            sector: SECTOR_MAP[asset.ticker] || null,
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
          const cachedUS = getCached(asset.ticker);
          const yData = cachedUS || await yahooGetUS(asset.ticker);
          if (!cachedUS) setCache(asset.ticker, yData);
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

          const score        = this.calculateScore(fundamentals, scoreFilters);
          const violations   = this.getFilterViolations(fundamentals, violationFilters);
          const passFilters  = this.applyFilters(fundamentals, violationFilters);
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
            fundamentals,
            assetClass: asset.class_name,
            market: 'US',
            sector: US_SECTOR_MAP[asset.ticker] || null,
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
        try { aiAnalysis = await this.getAIPortfolioAnalysis(groqKey, scoredPositions, violationFilters); }
        catch (e) { console.error('Groq portfolio error:', e.message); }
      }

      return res.json({
        analysis,
        summary: { manter, avaliarTroca, totalPositions: analysis.length, avgQualityScore: avgScore },
        aiAnalysis, filtersApplied: violationFilters
      });
    } catch (error) {
      console.error('Erro analyzePositions:', error);
      return res.status(500).json({ error: 'Erro ao analisar posições: ' + error.message });
    }
  }

  // ── Sugestões de troca ────────────────────────────────────────────────────
  async getSuggestions(req, res) {
    try {
      const { ticker } = req.body;
      // Detectar se é ação BR ou US
      const isBR = /^[A-Z]{3,6}\d{1,2}$/.test(ticker);
      const candidateList = isBR
        ? STOCKS_BR.filter(s => s !== ticker)
        : STOCKS_US.filter(s => s !== ticker);
      const candidates = candidateList.slice(0, 25);
      const suggestions = [];

      for (const stock of candidates) {
        try {
          const yData = isBR ? await yahooGetBR(stock) : await yahooGetUS(stock);
          const priceModule = yData.price || {};
          const fundamentals = this.extractYahooFundamentals(yData);
          // Score com filtros vazios — mesmo critério da busca e análise
          const score = this.calculateScore(fundamentals, {}) ?? 50;
          if (score >= 60) { // mostrar candidatos razoáveis ou melhores
            suggestions.push({
              ticker: stock,
              name: priceModule.longName || priceModule.shortName || stock,
              price: priceModule.regularMarketPrice ?? null,
              sector: isBR ? (SECTOR_MAP[stock] || null) : (US_SECTOR_MAP[stock] || null),
              ...fundamentals,
              score,
              recommendation: score >= 80 ? 'COMPRAR' : 'MANTER',
            });
          }
        } catch (e) { }
        await new Promise(r => setTimeout(r, 300));
      }
      suggestions.sort((a, b) => b.score - a.score);
      return res.json({ suggestions: suggestions.slice(0, 6) });
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