const axios = require('axios');
const pool = require('../config/database');

class QuotesService {
  constructor() {
    this.brapiBaseUrl = 'https://brapi.dev/api';
    this.alphaVantageBaseUrl = 'https://www.alphavantage.co/query';
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
      const quote = await this.getGlobalQuote(ticker, alphaVantageKey);
      if (quote && alphaVantageKey) {
        // Tentar enriquecer com overview
        const overview = await this.getUSOverview(ticker, alphaVantageKey);
        if (overview) {
          return { ...quote, ...overview };
        }
      }
      return quote;
    }
  }

  // Atualizar todas as cotações de um usuário
  async updateAllQuotes(userId) {
    const client = await pool.connect();
    
    try {
      // Buscar configurações do usuário
      const settingsResult = await client.query(
        'SELECT brapi_token, alphavantage_key FROM user_settings WHERE user_id = $1',
        [userId]
      );
      
      const settings = settingsResult.rows[0] || {};
      const brapiToken = settings.brapi_token || process.env.BRAPI_TOKEN;
      const alphaKey = settings.alphavantage_key || process.env.ALPHAVANTAGE_KEY;

      // Buscar todos os ativos do usuário
      const assetsResult = await client.query(
        'SELECT id, ticker, market FROM assets WHERE user_id = $1',
        [userId]
      );

      const assets = assetsResult.rows;
      const results = { success: [], failed: [], skipped: [] };

      for (const asset of assets) {
        try {
          const quote = await this.getQuote(asset.ticker, asset.market, brapiToken, alphaKey);
          
          if (quote && quote.price) {
            await client.query(`
              UPDATE assets SET 
                current_price = $1,
                dividend_yield = $2,
                last_update = NOW(),
                updated_at = NOW()
              WHERE id = $3
            `, [quote.price, quote.dividendYield || null, asset.id]);

            // Atualizar cache
            await this.updateCache(asset.ticker, asset.market, quote);

            results.success.push({ ticker: asset.ticker, price: quote.price });
          } else {
            results.failed.push({ ticker: asset.ticker, reason: 'Sem dados' });
          }

          // Rate limiting - esperar entre requisições
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

  // Atualizar cache de cotações
  async updateCache(ticker, market, quote) {
    try {
      await pool.query(`
        INSERT INTO quotes_cache (ticker, market, price, change_percent, dividend_yield, data, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (ticker) DO UPDATE SET
          price = EXCLUDED.price,
          change_percent = EXCLUDED.change_percent,
          dividend_yield = EXCLUDED.dividend_yield,
          data = EXCLUDED.data,
          updated_at = NOW()
      `, [ticker, market, quote.price, quote.changePercent, quote.dividendYield, JSON.stringify(quote.raw || quote)]);
    } catch (error) {
      console.error(`Erro ao atualizar cache ${ticker}:`, error.message);
    }
  }

  // Buscar cotação do cache
  async getFromCache(ticker) {
    try {
      const result = await pool.query(
        'SELECT * FROM quotes_cache WHERE ticker = $1 AND updated_at > NOW() - INTERVAL \'1 hour\'',
        [ticker]
      );
      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new QuotesService();
