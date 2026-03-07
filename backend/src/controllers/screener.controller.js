const pool = require('../config/database');
const screenerService = require('../services/screener.service');

class ScreenerController {

  // Buscar ações com filtros
  async search(req, res) {
    try {
      const { tickers, filters } = req.body;

      // Buscar token da Brapi
      const settings = await pool.query(
        'SELECT brapi_token FROM user_settings WHERE user_id = $1',
        [req.userId]
      );

      const brapiToken = settings.rows[0]?.brapi_token;
      if (!brapiToken) {
        return res.status(400).json({ 
          error: 'Configure sua API key da Brapi nas configurações' 
        });
      }

      // Se não passar tickers, usa lista padrão de ações mais negociadas
      let tickerList = tickers;
      if (!tickerList || tickerList.length === 0) {
        tickerList = [
          'PETR4', 'VALE3', 'ITUB4', 'BBDC4', 'ABEV3', 'B3SA3', 'WEGE3', 'RENT3',
          'EQTL3', 'SUZB3', 'RADL3', 'RAIL3', 'JBSS3', 'GGBR4', 'CSNA3', 'USIM5',
          'VIVT3', 'CMIG4', 'ELET3', 'SBSP3', 'CPLE6', 'TAEE11', 'ENBR3', 'CPFE3',
          'BBAS3', 'SANB11', 'ITSA4', 'BPAC11', 'BBSE3', 'CIEL3', 'PRIO3', 'RRRP3',
          'MGLU3', 'VIIA3', 'LREN3', 'ARZZ3', 'PETZ3', 'LWSA3', 'TOTS3', 'POSI3',
          'HAPV3', 'RDOR3', 'FLRY3', 'QUAL3', 'HYPE3', 'CMIN3', 'KLBN11', 'CSAN3'
        ];
      }

      const results = [];
      const errors = [];

      // Buscar dados de cada ticker (em paralelo, mas limitado)
      const batchSize = 5;
      for (let i = 0; i < tickerList.length; i += batchSize) {
        const batch = tickerList.slice(i, i + batchSize);
        const promises = batch.map(ticker => 
          screenerService.getFundamentals(ticker, brapiToken)
        );
        
        const batchResults = await Promise.all(promises);
        
        for (let j = 0; j < batchResults.length; j++) {
          const stock = batchResults[j];
          const ticker = batch[j];
          
          if (!stock) {
            errors.push(ticker);
            continue;
          }

          // Aplicar filtros
          const filterResult = screenerService.applyFilters(stock, filters || {});
          const qualityScore = screenerService.calculateQualityScore(stock);

          results.push({
            ...stock,
            passFilters: filterResult.pass,
            failedReason: filterResult.failed,
            qualityScore
          });
        }

        // Pequeno delay entre batches para não sobrecarregar a API
        if (i + batchSize < tickerList.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Ordenar por score de qualidade
      results.sort((a, b) => b.qualityScore - a.qualityScore);

      return res.json({
        total: results.length,
        passed: results.filter(r => r.passFilters).length,
        results,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      console.error('Erro no screener:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Analisar posições do usuário
  async analyzePositions(req, res) {
    try {
      const { filters } = req.body;

      // Buscar token da Brapi
      const settings = await pool.query(
        'SELECT brapi_token FROM user_settings WHERE user_id = $1',
        [req.userId]
      );

      const brapiToken = settings.rows[0]?.brapi_token;
      if (!brapiToken) {
        return res.status(400).json({ 
          error: 'Configure sua API key da Brapi nas configurações' 
        });
      }

      // Buscar ativos do usuário (apenas ações BR)
      const assets = await pool.query(`
        SELECT a.*, ac.name as class_name, ac.category
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1 
          AND a.quantity > 0 
          AND a.market = 'BR'
          AND (ac.category = 'stocks_br' OR ac.name ILIKE '%ação%' OR ac.name ILIKE '%ações%')
      `, [req.userId]);

      if (assets.rows.length === 0) {
        return res.json({
          message: 'Nenhuma ação brasileira encontrada na carteira',
          analysis: [],
          summary: { manter: 0, avaliarTroca: 0, comprar: 0 }
        });
      }

      const analysis = [];

      for (const asset of assets.rows) {
        const stock = await screenerService.getFundamentals(asset.ticker, brapiToken);
        
        if (!stock) {
          analysis.push({
            ticker: asset.ticker,
            name: asset.name,
            quantity: asset.quantity,
            averagePrice: asset.average_price,
            currentPrice: asset.current_price,
            error: 'Não foi possível obter dados fundamentalistas'
          });
          continue;
        }

        const filterResult = screenerService.applyFilters(stock, filters || {});
        const qualityScore = screenerService.calculateQualityScore(stock);
        const recommendation = screenerService.generateRecommendation(stock, filterResult, qualityScore, true);

        // Calcular valores da posição
        const currentValue = asset.quantity * (stock.price || asset.current_price);
        const investedValue = asset.quantity * asset.average_price;
        const gain = currentValue - investedValue;
        const gainPercent = investedValue > 0 ? (gain / investedValue) * 100 : 0;

        analysis.push({
          ticker: asset.ticker,
          name: stock.name || asset.name,
          quantity: parseFloat(asset.quantity),
          averagePrice: parseFloat(asset.average_price),
          currentPrice: stock.price,
          currentValue,
          investedValue,
          gain,
          gainPercent,
          // Indicadores
          fundamentals: {
            pl: stock.pl,
            pvp: stock.pvp,
            psr: stock.psr,
            dividendYield: stock.dividendYield,
            roe: stock.roe,
            roic: stock.roic,
            margemLiquida: stock.margemLiquida,
            margemEbit: stock.margemEbit,
            liquidezCorrente: stock.liquidezCorrente,
            dividaPatrimonio: stock.dividaPatrimonio,
            evEbitda: stock.evEbitda
          },
          // Análise
          passFilters: filterResult.pass,
          failedReason: filterResult.failed,
          qualityScore,
          recommendation
        });

        // Delay entre requests
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Ordenar por recomendação (AVALIAR_TROCA primeiro)
      analysis.sort((a, b) => {
        const priority = { 'AVALIAR_TROCA': 0, 'MANTER': 1, 'COMPRAR': 2 };
        const pA = priority[a.recommendation?.action] ?? 3;
        const pB = priority[b.recommendation?.action] ?? 3;
        return pA - pB;
      });

      // Resumo
      const summary = {
        manter: analysis.filter(a => a.recommendation?.action === 'MANTER').length,
        avaliarTroca: analysis.filter(a => a.recommendation?.action === 'AVALIAR_TROCA').length,
        totalPositions: analysis.length,
        avgQualityScore: Math.round(
          analysis.reduce((sum, a) => sum + (a.qualityScore || 0), 0) / analysis.length
        )
      };

      return res.json({ analysis, summary });

    } catch (error) {
      console.error('Erro ao analisar posições:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Buscar sugestões de troca
  async getSuggestions(req, res) {
    try {
      const { ticker, filters } = req.body;

      // Buscar token da Brapi
      const settings = await pool.query(
        'SELECT brapi_token FROM user_settings WHERE user_id = $1',
        [req.userId]
      );

      const brapiToken = settings.rows[0]?.brapi_token;
      if (!brapiToken) {
        return res.status(400).json({ 
          error: 'Configure sua API key da Brapi nas configurações' 
        });
      }

      // Buscar dados da ação atual
      const currentStock = await screenerService.getFundamentals(ticker, brapiToken);
      if (!currentStock) {
        return res.status(404).json({ error: 'Ação não encontrada' });
      }

      // Lista de ações do mesmo setor ou similares para comparar
      const compareList = [
        // Petróleo
        'PETR4', 'PRIO3', 'RRRP3', 'RECV3',
        // Bancos
        'ITUB4', 'BBDC4', 'BBAS3', 'SANB11', 'BPAC11',
        // Energia
        'ELET3', 'EQTL3', 'CPFE3', 'CMIG4', 'TAEE11', 'ENBR3',
        // Varejo
        'MGLU3', 'LREN3', 'ARZZ3', 'VIIA3',
        // Indústria
        'WEGE3', 'GGBR4', 'CSNA3', 'USIM5',
        // Alimentos
        'JBSS3', 'ABEV3', 'MDIA3', 'BRFS3'
      ].filter(t => t !== ticker);

      const suggestions = [];

      for (const compareTicker of compareList) {
        const stock = await screenerService.getFundamentals(compareTicker, brapiToken);
        if (!stock) continue;

        const filterResult = screenerService.applyFilters(stock, filters || {});
        if (!filterResult.pass) continue;

        const qualityScore = screenerService.calculateQualityScore(stock);
        
        // Só sugerir se tiver score melhor que a atual
        const currentScore = screenerService.calculateQualityScore(currentStock);
        if (qualityScore > currentScore) {
          suggestions.push({
            ...stock,
            qualityScore,
            scoreDiff: qualityScore - currentScore
          });
        }

        // Delay
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Ordenar por diferença de score
      suggestions.sort((a, b) => b.scoreDiff - a.scoreDiff);

      return res.json({
        currentStock: {
          ...currentStock,
          qualityScore: screenerService.calculateQualityScore(currentStock)
        },
        suggestions: suggestions.slice(0, 5)
      });

    } catch (error) {
      console.error('Erro ao buscar sugestões:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Obter dados fundamentalistas de um ticker específico
  async getFundamentals(req, res) {
    try {
      const { ticker } = req.params;

      // Buscar token da Brapi
      const settings = await pool.query(
        'SELECT brapi_token FROM user_settings WHERE user_id = $1',
        [req.userId]
      );

      const brapiToken = settings.rows[0]?.brapi_token;
      if (!brapiToken) {
        return res.status(400).json({ 
          error: 'Configure sua API key da Brapi nas configurações' 
        });
      }

      const stock = await screenerService.getFundamentals(ticker, brapiToken);
      
      if (!stock) {
        return res.status(404).json({ error: 'Ação não encontrada' });
      }

      const qualityScore = screenerService.calculateQualityScore(stock);

      return res.json({
        ...stock,
        qualityScore
      });

    } catch (error) {
      console.error('Erro ao buscar fundamentals:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Salvar filtros do usuário
  async saveFilters(req, res) {
    try {
      const { filters, name } = req.body;

      // Verificar se já existe
      const existing = await pool.query(
        'SELECT id FROM screener_filters WHERE user_id = $1 AND name = $2',
        [req.userId, name]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE screener_filters SET filters = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(filters), existing.rows[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO screener_filters (user_id, name, filters) VALUES ($1, $2, $3)',
          [req.userId, name, JSON.stringify(filters)]
        );
      }

      return res.json({ message: 'Filtros salvos' });

    } catch (error) {
      console.error('Erro ao salvar filtros:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Listar filtros salvos
  async listFilters(req, res) {
    try {
      const result = await pool.query(
        'SELECT * FROM screener_filters WHERE user_id = $1 ORDER BY name',
        [req.userId]
      );

      return res.json({ 
        filters: result.rows.map(r => ({
          id: r.id,
          name: r.name,
          filters: JSON.parse(r.filters)
        }))
      });

    } catch (error) {
      console.error('Erro ao listar filtros:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new ScreenerController();
