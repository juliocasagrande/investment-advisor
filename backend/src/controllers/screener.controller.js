const pool = require('../config/database');
const axios = require('axios');

// Lista de ações para buscar
const STOCK_LIST = [
  'PETR4', 'VALE3', 'ITUB4', 'BBDC4', 'ABEV3', 'B3SA3', 'WEGE3', 'RENT3',
  'EQTL3', 'SUZB3', 'RADL3', 'RAIL3', 'JBSS3', 'GGBR4', 'CSNA3', 'USIM5',
  'VIVT3', 'CMIG4', 'ELET3', 'SBSP3', 'CPLE6', 'TAEE11', 'CPFE3', 'BBAS3',
  'SANB11', 'ITSA4', 'BPAC11', 'BBSE3', 'CIEL3', 'PRIO3', 'MGLU3', 'LREN3',
  'ARZZ3', 'PETZ3', 'LWSA3', 'TOTS3', 'POSI3', 'HAPV3', 'RDOR3', 'FLRY3',
  'QUAL3', 'HYPE3', 'CMIN3', 'KLBN11', 'CSAN3', 'EMBR3', 'AZUL4', 'GOAU4'
];

class ScreenerController {
  // Buscar ações com filtros
  async search(req, res) {
    try {
      const userId = req.userId;
      const filters = req.body.filters || {};
      
      // Buscar token do usuário
      const settings = await pool.query('SELECT brapi_token FROM user_settings WHERE user_id = $1', [userId]);
      const token = settings.rows[0]?.brapi_token;
      
      if (!token) {
        return res.status(400).json({ error: 'Configure seu token Brapi nas configurações' });
      }

      const results = [];
      const batchSize = 5;
      
      // Buscar em batches
      for (let i = 0; i < STOCK_LIST.length; i += batchSize) {
        const batch = STOCK_LIST.slice(i, i + batchSize);
        const tickers = batch.join(',');
        
        try {
          const response = await axios.get(
            `https://brapi.dev/api/quote/${tickers}?token=${token}&fundamental=true`,
            { timeout: 15000 }
          );
          
          if (response.data?.results) {
            for (const stock of response.data.results) {
              const fundamentals = this.extractFundamentals(stock);
              const passesFilter = this.applyFilters(fundamentals, filters);
              const score = this.calculateScore(fundamentals);
              
              if (passesFilter) {
                results.push({
                  ticker: stock.symbol,
                  name: stock.longName || stock.shortName,
                  price: stock.regularMarketPrice,
                  change: stock.regularMarketChangePercent,
                  ...fundamentals,
                  score,
                  recommendation: score >= 70 ? 'COMPRAR' : score >= 50 ? 'MANTER' : 'AVALIAR'
                });
              }
            }
          }
        } catch (e) {
          console.error(`Erro ao buscar batch ${tickers}:`, e.message);
        }
        
        // Delay entre batches
        if (i + batchSize < STOCK_LIST.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Ordenar por score
      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      return res.json({
        total: results.length,
        stocks: results
      });
    } catch (error) {
      console.error('Erro no screener:', error);
      return res.status(500).json({ error: 'Erro ao buscar ações' });
    }
  }

  // Analisar posições do usuário
  async analyzePositions(req, res) {
    try {
      const userId = req.userId;
      const filters = req.body.filters || {};
      
      // Buscar ativos BR do usuário
      const assetsResult = await pool.query(`
        SELECT a.*, ac.category 
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1 AND a.market = 'BR' AND a.quantity > 0
        AND ac.category IN ('stocks_br', 'fiis')
      `, [userId]);

      if (assetsResult.rows.length === 0) {
        return res.json({ positions: [], summary: { maintain: 0, evaluate: 0, total: 0, avgScore: 0 } });
      }

      const settings = await pool.query('SELECT brapi_token FROM user_settings WHERE user_id = $1', [userId]);
      const token = settings.rows[0]?.brapi_token;
      
      if (!token) {
        return res.status(400).json({ error: 'Configure seu token Brapi nas configurações' });
      }

      const positions = [];
      let maintain = 0, evaluate = 0, totalScore = 0;

      for (const asset of assetsResult.rows) {
        try {
          const response = await axios.get(
            `https://brapi.dev/api/quote/${asset.ticker}?token=${token}&fundamental=true`,
            { timeout: 10000 }
          );
          
          if (response.data?.results?.[0]) {
            const stock = response.data.results[0];
            const fundamentals = this.extractFundamentals(stock);
            const score = this.calculateScore(fundamentals);
            const recommendation = score >= 60 ? 'MANTER' : 'AVALIAR TROCA';
            
            if (recommendation === 'MANTER') maintain++;
            else evaluate++;
            
            totalScore += score;

            positions.push({
              ticker: asset.ticker,
              name: asset.name,
              quantity: asset.quantity,
              avgPrice: asset.average_price,
              currentPrice: stock.regularMarketPrice,
              ...fundamentals,
              score,
              recommendation
            });
          }
        } catch (e) {
          positions.push({
            ticker: asset.ticker,
            name: asset.name,
            quantity: asset.quantity,
            score: 0,
            recommendation: '-',
            error: true
          });
        }
        
        await new Promise(r => setTimeout(r, 300));
      }

      return res.json({
        positions,
        summary: {
          maintain,
          evaluate,
          total: positions.length,
          avgScore: positions.length > 0 ? Math.round(totalScore / positions.length) : 0
        }
      });
    } catch (error) {
      console.error('Erro ao analisar posições:', error);
      return res.status(500).json({ error: 'Erro ao analisar posições' });
    }
  }

  // Sugestões de troca
  async getSuggestions(req, res) {
    try {
      const { ticker } = req.body;
      const userId = req.userId;
      
      const settings = await pool.query('SELECT brapi_token FROM user_settings WHERE user_id = $1', [userId]);
      const token = settings.rows[0]?.brapi_token;
      
      if (!token) {
        return res.status(400).json({ error: 'Configure seu token Brapi' });
      }

      // Buscar ações do mesmo setor com score melhor
      const suggestions = [];
      const sampleStocks = ['WEGE3', 'ITSA4', 'TAEE11', 'BBAS3', 'EGIE3'];
      
      for (const stock of sampleStocks) {
        if (stock !== ticker) {
          try {
            const response = await axios.get(
              `https://brapi.dev/api/quote/${stock}?token=${token}&fundamental=true`,
              { timeout: 10000 }
            );
            
            if (response.data?.results?.[0]) {
              const data = response.data.results[0];
              const fundamentals = this.extractFundamentals(data);
              const score = this.calculateScore(fundamentals);
              
              suggestions.push({
                ticker: stock,
                name: data.longName,
                price: data.regularMarketPrice,
                ...fundamentals,
                score
              });
            }
          } catch (e) {
            // Ignorar erros
          }
        }
      }

      suggestions.sort((a, b) => b.score - a.score);
      return res.json({ suggestions: suggestions.slice(0, 5) });
    } catch (error) {
      console.error('Erro ao buscar sugestões:', error);
      return res.status(500).json({ error: 'Erro ao buscar sugestões' });
    }
  }

  // Dados fundamentalistas de um ticker
  async getFundamentals(req, res) {
    try {
      const { ticker } = req.params;
      const userId = req.userId;
      
      const settings = await pool.query('SELECT brapi_token FROM user_settings WHERE user_id = $1', [userId]);
      const token = settings.rows[0]?.brapi_token;
      
      if (!token) {
        return res.status(400).json({ error: 'Configure seu token Brapi' });
      }

      const response = await axios.get(
        `https://brapi.dev/api/quote/${ticker}?token=${token}&fundamental=true`,
        { timeout: 10000 }
      );
      
      if (!response.data?.results?.[0]) {
        return res.status(404).json({ error: 'Ação não encontrada' });
      }

      const stock = response.data.results[0];
      const fundamentals = this.extractFundamentals(stock);
      const score = this.calculateScore(fundamentals);

      return res.json({
        ticker: stock.symbol,
        name: stock.longName,
        price: stock.regularMarketPrice,
        ...fundamentals,
        score
      });
    } catch (error) {
      console.error('Erro ao buscar fundamentalistas:', error);
      return res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  }

  // Salvar filtros
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
      console.error('Erro ao salvar filtros:', error);
      return res.status(500).json({ error: 'Erro ao salvar' });
    }
  }

  // Listar filtros salvos
  async listFilters(req, res) {
    try {
      const result = await pool.query(
        'SELECT * FROM screener_filters WHERE user_id = $1',
        [req.userId]
      );
      return res.json({ filters: result.rows });
    } catch (error) {
      console.error('Erro ao listar filtros:', error);
      return res.status(500).json({ error: 'Erro ao listar' });
    }
  }

  // Extrair dados fundamentalistas
  extractFundamentals(stock) {
    return {
      pl: stock.priceEarnings || null,
      pvp: stock.priceToBook || null,
      psr: stock.priceToSalesTrailing12Months || null,
      dy: stock.dividendYield ? stock.dividendYield * 100 : null,
      evEbitda: stock.enterpriseToEbitda || null,
      margemEbit: stock.ebitdaMargins ? stock.ebitdaMargins * 100 : null,
      margemLiquida: stock.profitMargins ? stock.profitMargins * 100 : null,
      liquidezCorrente: stock.currentRatio || null,
      roic: stock.returnOnAssets ? stock.returnOnAssets * 100 : null,
      roe: stock.returnOnEquity ? stock.returnOnEquity * 100 : null,
      dividaPl: stock.debtToEquity || null,
      crescReceita: stock.revenueGrowth ? stock.revenueGrowth * 100 : null
    };
  }

  // Aplicar filtros (com min e max)
  applyFilters(data, filters) {
    for (const [key, range] of Object.entries(filters)) {
      const value = data[key];
      if (value === null || value === undefined) continue;
      
      const min = range.min !== undefined && range.min !== '' ? parseFloat(range.min) : null;
      const max = range.max !== undefined && range.max !== '' ? parseFloat(range.max) : null;
      
      if (min !== null && value < min) return false;
      if (max !== null && value > max) return false;
    }
    return true;
  }

  // Calcular score de qualidade (0-100)
  calculateScore(data) {
    let score = 50; // Base
    
    // P/L entre 5-15 é bom
    if (data.pl !== null) {
      if (data.pl >= 5 && data.pl <= 15) score += 10;
      else if (data.pl > 0 && data.pl < 5) score += 5;
      else if (data.pl > 25) score -= 10;
    }

    // P/VP < 1.5 é bom
    if (data.pvp !== null) {
      if (data.pvp < 1) score += 10;
      else if (data.pvp < 1.5) score += 5;
      else if (data.pvp > 3) score -= 10;
    }

    // DY > 4% é bom
    if (data.dy !== null) {
      if (data.dy > 6) score += 10;
      else if (data.dy > 4) score += 5;
    }

    // ROE > 15% é bom
    if (data.roe !== null) {
      if (data.roe > 20) score += 10;
      else if (data.roe > 15) score += 5;
      else if (data.roe < 5) score -= 5;
    }

    // Margem líquida > 10% é bom
    if (data.margemLiquida !== null) {
      if (data.margemLiquida > 15) score += 5;
      else if (data.margemLiquida > 10) score += 3;
    }

    // Dívida/PL < 1 é bom
    if (data.dividaPl !== null) {
      if (data.dividaPl < 0.5) score += 5;
      else if (data.dividaPl > 2) score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }
}

module.exports = new ScreenerController();
