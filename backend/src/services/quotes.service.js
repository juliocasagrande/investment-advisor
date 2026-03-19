const axios = require('axios');
const pool = require('../config/database');

class QuotesService {
  constructor() {
    this.brapiBaseUrl = 'https://brapi.dev/api';
    this.alphaVantageBaseUrl = 'https://www.alphavantage.co/query';
    // Yahoo Finance state (compartilhado com screener)
    this._yahooCookie = null;
    this._yahooCrumb  = null;
    this._yahooLastFetch = 0;
    this._yahooHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://finance.yahoo.com',
      'Referer': 'https://finance.yahoo.com/',
    };
  }

  // Obter cookie+crumb do Yahoo Finance
  async _getYahooCrumb(force = false) {
    const CRUMB_TTL = 55 * 60 * 1000; // 55 min
    const now = Date.now();
    if (!force && this._yahooCrumb && (now - this._yahooLastFetch) < CRUMB_TTL) {
      return { cookie: this._yahooCookie, crumb: this._yahooCrumb };
    }
    const cookieRes = await fetch('https://fc.yahoo.com', { headers: this._yahooHeaders, redirect: 'follow' });
    const cookieStr = (cookieRes.headers.get('set-cookie') || '').split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...this._yahooHeaders, 'Cookie': cookieStr }
    });
    const crumb = await crumbRes.text();
    this._yahooCookie = cookieStr;
    this._yahooCrumb  = crumb;
    this._yahooLastFetch = now;
    return { cookie: cookieStr, crumb };
  }

  // Buscar cotação US via Yahoo Finance (preço intraday real)
  async getUSQuoteFromYahoo(ticker) {
    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const { cookie, crumb } = await this._getYahooCrumb(attempt === 2);
        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price,summaryDetail&crumb=${encodeURIComponent(crumb)}&formatted=false&corsDomain=finance.yahoo.com`;
        const res = await fetch(url, { headers: { ...this._yahooHeaders, 'Cookie': cookie } });
        if (res.status === 401 && attempt === 1) { continue; }
        if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
        const data = await res.json();
        const result = data?.quoteSummary?.result?.[0];
        if (!result) throw new Error('Sem dados Yahoo');
        const price = result.price;
        return {
          ticker: price.symbol,
          price: price.regularMarketPrice,
          changePercent: price.regularMarketChangePercent * 100,
          previousClose: price.regularMarketPreviousClose,
          open: price.regularMarketOpen,
          high: price.regularMarketDayHigh,
          low: price.regularMarketDayLow,
          volume: price.regularMarketVolume,
          dividendYield: result.summaryDetail?.trailingAnnualDividendYield || null,
          market: 'US',
        };
      }
    } catch (error) {
      console.warn(`[Yahoo] Falha ao buscar ${ticker}:`, error.message);
      return null;
    }
  }

  // Buscar cotação brasileira via Brapi
  async getBrazilianQuote(ticker, token) {
    try {
      const url = `${this.brapiBaseUrl}/quote/${ticker}`;
      const params = token ? { token } : {};
      
      const response = await axios.get(url, { params, timeout: 10000 });
      
      if (response.data.results && response.data.results.length > 0) {
        const data = response.data.results[0];
        return {
          ticker: data.symbol,
          price: data.regularMarketPrice,
          changePercent: data.regularMarketChangePercent,
          previousClose: data.regularMarketPreviousClose,
          marketCap: data.marketCap,
          dividendYield: data.dividendYield,
          pe: data.priceEarnings,
          name: data.longName || data.shortName,
          market: 'BR',
          raw: data
        };
      }
      return null;
    } catch (error) {
      console.error(`Erro ao buscar cotação BR ${ticker}:`, error.message);
      return null;
    }
  }

  // Buscar cotação global via Alpha Vantage
  async getGlobalQuote(ticker, apiKey) {
    try {
      const response = await axios.get(this.alphaVantageBaseUrl, {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: ticker,
          apikey: apiKey
        },
        timeout: 10000
      });

      const data = response.data['Global Quote'];
      
      if (data && Object.keys(data).length > 0) {
        return {
          ticker: data['01. symbol'],
          price: parseFloat(data['05. price']),
          changePercent: parseFloat(data['10. change percent']?.replace('%', '')),
          previousClose: parseFloat(data['08. previous close']),
          open: parseFloat(data['02. open']),
          high: parseFloat(data['03. high']),
          low: parseFloat(data['04. low']),
          volume: parseInt(data['06. volume']),
          market: 'US',
          raw: data
        };
      }
      return null;
    } catch (error) {
      console.error(`Erro ao buscar cotação US ${ticker}:`, error.message);
      return null;
    }
  }

  // Buscar overview de ativo US (inclui dividend yield)
  async getUSOverview(ticker, apiKey) {
    try {
      const response = await axios.get(this.alphaVantageBaseUrl, {
        params: {
          function: 'OVERVIEW',
          symbol: ticker,
          apikey: apiKey
        },
        timeout: 10000
      });

      const data = response.data;
      
      if (data && data.Symbol) {
        return {
          ticker: data.Symbol,
          name: data.Name,
          sector: data.Sector,
          industry: data.Industry,
          marketCap: parseFloat(data.MarketCapitalization),
          pe: parseFloat(data.PERatio),
          dividendYield: parseFloat(data.DividendYield) * 100, // Converter para %
          dividendPerShare: parseFloat(data.DividendPerShare),
          eps: parseFloat(data.EPS),
          beta: parseFloat(data.Beta),
          fiftyTwoWeekHigh: parseFloat(data['52WeekHigh']),
          fiftyTwoWeekLow: parseFloat(data['52WeekLow'])
        };
      }
      return null;
    } catch (error) {
      console.error(`Erro ao buscar overview US ${ticker}:`, error.message);
      return null;
    }
  }

  // Buscar cotação inteligente (detecta mercado automaticamente)
  async getQuote(ticker, market, brapiToken, alphaVantageKey) {
    if (market === 'BR' || ticker.match(/\d+$/)) {
      return await this.getBrazilianQuote(ticker, brapiToken);
    } else {
      // Yahoo Finance como fonte primária para ativos US (preço intraday real)
      const yahooQuote = await this.getUSQuoteFromYahoo(ticker);
      if (yahooQuote && yahooQuote.price) {
        return yahooQuote;
      }
      // Fallback: Alpha Vantage
      console.warn(`[Quotes] Yahoo falhou para ${ticker}, tentando Alpha Vantage...`);
      const quote = await this.getGlobalQuote(ticker, alphaVantageKey);
      if (quote && alphaVantageKey) {
        const overview = await this.getUSOverview(ticker, alphaVantageKey);
        if (overview) return { ...quote, ...overview };
      }
      return quote;
    }
  }

  // Alias para compatibilidade com portfolio.controller.js
  async getBRQuote(ticker, token) {
    return this.getBrazilianQuote(ticker, token);
  }

  // Atualizar todas as cotações de um usuário
  async updateAllQuotes(userId) {
    const client = await pool.connect();
    
    try {
      const settingsResult = await client.query(
        'SELECT brapi_token, alphavantage_key FROM user_settings WHERE user_id = $1',
        [userId]
      );
      
      const settings = settingsResult.rows[0] || {};
      const brapiToken = settings.brapi_token || process.env.BRAPI_TOKEN;
      const alphaKey = settings.alphavantage_key || process.env.ALPHAVANTAGE_KEY;

      const assetsResult = await client.query(
        'SELECT id, ticker, market, currency FROM assets WHERE user_id = $1 AND quantity > 0',
        [userId]
      );

      const assets = assetsResult.rows;
      const results = { success: [], failed: [], skipped: [] };

      for (const asset of assets) {
        try {
          // Inferir mercado pela moeda caso o market salvo seja inconsistente (ex: metals USD cadastrados como BR)
          const effectiveMarket = (asset.currency === 'USD' && (!asset.market || asset.market === 'BR'))
            ? 'US'
            : asset.market;
          const quote = await this.getQuote(asset.ticker, effectiveMarket, brapiToken, alphaKey);
          
          if (quote && quote.price) {
            await client.query(`
              UPDATE assets SET 
                current_price = $1,
                dividend_yield = COALESCE($2, dividend_yield),
                updated_at = NOW()
              WHERE id = $3
            `, [quote.price, quote.dividendYield || null, asset.id]);

            results.success.push({ ticker: asset.ticker, price: quote.price });
          } else {
            results.failed.push({ ticker: asset.ticker, reason: 'Sem dados' });
          }

          await this.delay(300);
          
        } catch (error) {
          results.failed.push({ ticker: asset.ticker, reason: error.message });
        }
      }

      return results;
      
    } finally {
      client.release();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new QuotesService();