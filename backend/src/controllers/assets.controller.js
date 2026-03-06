const pool = require('../config/database');
const quotesService = require('../services/quotes.service');

class AssetsController {

  // ==================== ASSET CLASSES ====================

  // Listar classes de ativos
  async listClasses(req, res) {
    try {
      const result = await pool.query(`
        SELECT 
          ac.*,
          COUNT(a.id) as asset_count,
          COALESCE(SUM(a.quantity * COALESCE(a.current_price, a.average_price)), 0) as total_value,
          COALESCE(SUM(a.quantity * a.average_price), 0) as total_invested
        FROM asset_classes ac
        LEFT JOIN assets a ON a.asset_class_id = ac.id
        WHERE ac.user_id = $1
        GROUP BY ac.id
        ORDER BY ac.target_percentage DESC
      `, [req.userId]);

      return res.json({ classes: result.rows });

    } catch (error) {
      console.error('Erro ao listar classes:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Listar templates de classes disponíveis
  async getClassTemplates(req, res) {
    const templates = [
      { name: 'Renda Fixa', color: '#10B981', icon: 'Landmark', category: 'fixed_income', expectedYield: 12, description: 'CDBs, Tesouro Direto, LCI, LCA, Debêntures' },
      { name: 'Ações BR', color: '#3B82F6', icon: 'TrendingUp', category: 'stocks_br', expectedYield: 15, description: 'Ações de empresas brasileiras' },
      { name: 'FIIs', color: '#8B5CF6', icon: 'Building2', category: 'fiis', expectedYield: 10, description: 'Fundos Imobiliários' },
      { name: 'Ações EUA', color: '#EC4899', icon: 'Globe', category: 'stocks_us', expectedYield: 12, description: 'Ações americanas e BDRs' },
      { name: 'REITs', color: '#F59E0B', icon: 'Building', category: 'reits', expectedYield: 8, description: 'Real Estate Investment Trusts' },
      { name: 'Cripto', color: '#F97316', icon: 'Bitcoin', category: 'crypto', expectedYield: 20, description: 'Criptomoedas e tokens' },
      { name: 'Metais', color: '#EAB308', icon: 'Gem', category: 'metals', expectedYield: 5, description: 'Ouro, prata e metais preciosos' },
      { name: 'ETFs', color: '#06B6D4', icon: 'Layers', category: 'etfs', expectedYield: 10, description: 'Exchange Traded Funds' },
      { name: 'Previdência', color: '#14B8A6', icon: 'Shield', category: 'pension', expectedYield: 8, description: 'PGBL e VGBL' },
      { name: 'Internacional', color: '#6366F1', icon: 'Plane', category: 'international', expectedYield: 10, description: 'Investimentos no exterior' },
      { name: 'Caixa', color: '#64748B', icon: 'Wallet', category: 'cash', expectedYield: 0, description: 'Reserva de emergência' }
    ];
    
    return res.json({ templates });
  }

  // Criar classe de ativo
  async createClass(req, res) {
    try {
      const { name, targetPercentage, color, description, expectedYield, icon, category } = req.body;

      const result = await pool.query(`
        INSERT INTO asset_classes (user_id, name, target_percentage, color, description, expected_yield, icon, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        req.userId, 
        name, 
        targetPercentage || 0, 
        color || '#3B82F6', 
        description, 
        expectedYield || 0,
        icon || 'Wallet',
        category || 'other'
      ]);

      return res.status(201).json({ class: result.rows[0] });

    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Já existe uma classe com esse nome' });
      }
      console.error('Erro ao criar classe:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Atualizar classe de ativo
  async updateClass(req, res) {
    try {
      const { id } = req.params;
      const { name, targetPercentage, color, description, expectedYield, icon, category } = req.body;

      const result = await pool.query(`
        UPDATE asset_classes 
        SET name = COALESCE($1, name),
            target_percentage = COALESCE($2, target_percentage),
            color = COALESCE($3, color),
            description = COALESCE($4, description),
            expected_yield = COALESCE($5, expected_yield),
            icon = COALESCE($6, icon),
            category = COALESCE($7, category),
            updated_at = NOW()
        WHERE id = $8 AND user_id = $9
        RETURNING *
      `, [name, targetPercentage, color, description, expectedYield, icon, category, id, req.userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Classe não encontrada' });
      }

      return res.json({ class: result.rows[0] });

    } catch (error) {
      console.error('Erro ao atualizar classe:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Deletar classe de ativo
  async deleteClass(req, res) {
    try {
      const { id } = req.params;

      // Verificar se há ativos na classe
      const assetsCheck = await pool.query(
        'SELECT COUNT(*) FROM assets WHERE asset_class_id = $1',
        [id]
      );

      if (parseInt(assetsCheck.rows[0].count) > 0) {
        return res.status(400).json({ 
          error: 'Não é possível excluir uma classe que possui ativos. Mova ou exclua os ativos primeiro.' 
        });
      }

      const result = await pool.query(
        'DELETE FROM asset_classes WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Classe não encontrada' });
      }

      return res.json({ message: 'Classe excluída com sucesso' });

    } catch (error) {
      console.error('Erro ao excluir classe:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // ==================== ASSETS ====================

  // Listar todos os ativos
  async listAssets(req, res) {
    try {
      const { classId } = req.query;

      let query = `
        SELECT 
          a.*,
          ac.name as class_name,
          ac.color as class_color,
          ac.category as class_category,
          (a.quantity * COALESCE(a.current_price, a.average_price)) as current_value,
          (a.quantity * a.average_price) as invested_value,
          ((COALESCE(a.current_price, a.average_price) - a.average_price) / NULLIF(a.average_price, 0) * 100) as gain_percentage
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1
      `;
      
      const params = [req.userId];

      if (classId) {
        query += ' AND a.asset_class_id = $2';
        params.push(classId);
      }

      query += ' ORDER BY (a.quantity * COALESCE(a.current_price, a.average_price)) DESC';

      const result = await pool.query(query, params);

      return res.json({ assets: result.rows });

    } catch (error) {
      console.error('Erro ao listar ativos:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Obter ativo por ID
  async getAsset(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(`
        SELECT 
          a.*,
          ac.name as class_name,
          ac.color as class_color,
          ac.category as class_category
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.id = $1 AND a.user_id = $2
      `, [id, req.userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ativo não encontrado' });
      }

      // Buscar transações do ativo
      const transactions = await pool.query(
        'SELECT * FROM transactions WHERE asset_id = $1 ORDER BY date DESC LIMIT 50',
        [id]
      );

      return res.json({ 
        asset: result.rows[0],
        transactions: transactions.rows
      });

    } catch (error) {
      console.error('Erro ao buscar ativo:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Criar ativo com campos específicos por tipo
  async createAsset(req, res) {
    try {
      const { 
        assetClassId, 
        ticker, 
        name, 
        type, 
        market = 'BR',
        quantity = 0, 
        averagePrice = 0,
        notes,
        // Campos específicos de Renda Fixa
        fixedIncomeType,
        indexer,
        rate,
        maturityDate,
        issuer,
        // Campos específicos de FIIs/REITs
        sector,
        // Campos específicos de Cripto
        walletAddress,
        network,
        // Valor presente
        presentValue,
        // Dados extras
        extraData
      } = req.body;

      // Verificar se a classe pertence ao usuário
      const classCheck = await pool.query(
        'SELECT id, category FROM asset_classes WHERE id = $1 AND user_id = $2',
        [assetClassId, req.userId]
      );

      if (classCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Classe de ativo inválida' });
      }

      // Tentar buscar cotação atual
      let currentPrice = averagePrice;
      try {
        const settings = await pool.query(
          'SELECT brapi_token, alphavantage_key FROM user_settings WHERE user_id = $1',
          [req.userId]
        );
        const { brapi_token, alphavantage_key } = settings.rows[0] || {};
        
        const quote = await quotesService.getQuote(
          ticker.toUpperCase(), 
          market, 
          brapi_token || process.env.BRAPI_TOKEN,
          alphavantage_key || process.env.ALPHAVANTAGE_KEY
        );
        
        if (quote && quote.price) {
          currentPrice = quote.price;
        }
      } catch (e) {
        console.log('Não foi possível buscar cotação:', e.message);
      }

      const result = await pool.query(`
        INSERT INTO assets (
          user_id, asset_class_id, ticker, name, type, market, 
          quantity, average_price, current_price, notes,
          fixed_income_type, indexer, rate, maturity_date, issuer,
          sector, wallet_address, network, present_value, present_value_date,
          extra_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *
      `, [
        req.userId, assetClassId, ticker.toUpperCase(), name, type, market,
        quantity, averagePrice, currentPrice, notes,
        fixedIncomeType, indexer, rate, maturityDate, issuer,
        sector, walletAddress, network, presentValue, presentValue ? new Date() : null,
        extraData ? JSON.stringify(extraData) : null
      ]);

      // Se houver quantidade, criar transação inicial
      if (quantity > 0 && averagePrice > 0) {
        await pool.query(`
          INSERT INTO transactions (user_id, asset_id, type, quantity, price, total, date)
          VALUES ($1, $2, 'BUY', $3, $4, $5, CURRENT_DATE)
        `, [req.userId, result.rows[0].id, quantity, averagePrice, quantity * averagePrice]);
      }

      return res.status(201).json({ asset: result.rows[0] });

    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Você já possui este ativo cadastrado' });
      }
      console.error('Erro ao criar ativo:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Atualizar ativo - TODOS os campos
  async updateAsset(req, res) {
    try {
      const { id } = req.params;
      const { 
        assetClassId, 
        ticker,
        name, 
        type, 
        market,
        notes,
        quantity,
        averagePrice,
        currentPrice,
        // Campos específicos
        fixedIncomeType,
        indexer,
        rate,
        maturityDate,
        issuer,
        sector,
        walletAddress,
        network,
        presentValue,
        extraData
      } = req.body;

      const result = await pool.query(`
        UPDATE assets 
        SET asset_class_id = COALESCE($1, asset_class_id),
            ticker = COALESCE($2, ticker),
            name = COALESCE($3, name),
            type = COALESCE($4, type),
            market = COALESCE($5, market),
            notes = COALESCE($6, notes),
            quantity = COALESCE($7, quantity),
            average_price = COALESCE($8, average_price),
            current_price = COALESCE($9, current_price),
            fixed_income_type = COALESCE($10, fixed_income_type),
            indexer = COALESCE($11, indexer),
            rate = COALESCE($12, rate),
            maturity_date = COALESCE($13, maturity_date),
            issuer = COALESCE($14, issuer),
            sector = COALESCE($15, sector),
            wallet_address = COALESCE($16, wallet_address),
            network = COALESCE($17, network),
            present_value = COALESCE($18, present_value),
            present_value_date = CASE WHEN $18 IS NOT NULL THEN NOW() ELSE present_value_date END,
            extra_data = COALESCE($19, extra_data),
            updated_at = NOW()
        WHERE id = $20 AND user_id = $21
        RETURNING *
      `, [
        assetClassId, ticker, name, type, market, notes, quantity, averagePrice, currentPrice,
        fixedIncomeType, indexer, rate, maturityDate, issuer,
        sector, walletAddress, network, presentValue,
        extraData ? JSON.stringify(extraData) : null,
        id, req.userId
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ativo não encontrado' });
      }

      return res.json({ asset: result.rows[0] });

    } catch (error) {
      console.error('Erro ao atualizar ativo:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Registrar compra/venda com cálculo de lucro realizado
  async registerTransaction(req, res) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;
      const { type, quantity, price, date, notes } = req.body;

      await client.query('BEGIN');

      // Verificar se o ativo existe
      const assetResult = await client.query(
        'SELECT * FROM assets WHERE id = $1 AND user_id = $2',
        [id, req.userId]
      );

      if (assetResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Ativo não encontrado' });
      }

      const asset = assetResult.rows[0];
      let newQuantity = parseFloat(asset.quantity);
      let newAveragePrice = parseFloat(asset.average_price);
      let realizedGain = null;
      let realizedGainPercent = null;
      let averageCostAtSale = null;

      if (type === 'BUY') {
        // Calcular novo preço médio
        const totalCurrent = newQuantity * newAveragePrice;
        const totalNew = quantity * price;
        newQuantity += quantity;
        newAveragePrice = newQuantity > 0 ? (totalCurrent + totalNew) / newQuantity : 0;
      } else if (type === 'SELL') {
        if (quantity > newQuantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Quantidade insuficiente para venda' });
        }
        
        // Calcular lucro/prejuízo realizado
        averageCostAtSale = newAveragePrice;
        const costBasis = quantity * newAveragePrice;
        const saleProceeds = quantity * price;
        realizedGain = saleProceeds - costBasis;
        realizedGainPercent = costBasis > 0 ? ((saleProceeds - costBasis) / costBasis) * 100 : 0;
        
        newQuantity -= quantity;
      }

      // Atualizar ativo
      await client.query(`
        UPDATE assets 
        SET quantity = $1, average_price = $2, updated_at = NOW()
        WHERE id = $3
      `, [newQuantity, newAveragePrice, id]);

      // Registrar transação com lucro realizado
      const transactionResult = await client.query(`
        INSERT INTO transactions (
          user_id, asset_id, type, quantity, price, total, date, notes,
          average_cost_at_sale, realized_gain, realized_gain_percent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        req.userId, id, type, quantity, price, quantity * price, date || new Date(), notes,
        averageCostAtSale, realizedGain, realizedGainPercent
      ]);

      await client.query('COMMIT');

      return res.status(201).json({ 
        transaction: transactionResult.rows[0],
        newQuantity,
        newAveragePrice,
        realizedGain
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao registrar transação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
      client.release();
    }
  }

  // Criar transação direta (para página de transações)
  async createTransaction(req, res) {
    const client = await pool.connect();
    
    try {
      const { assetId, type, quantity, price, date, notes } = req.body;

      // Verificar se o ativo existe e pertence ao usuário
      const assetResult = await client.query(
        'SELECT * FROM assets WHERE id = $1 AND user_id = $2',
        [assetId, req.userId]
      );

      if (assetResult.rows.length === 0) {
        return res.status(404).json({ error: 'Ativo não encontrado' });
      }

      // Usar a mesma lógica do registerTransaction
      req.params = { id: assetId };
      req.body = { type, quantity, price, date, notes };
      
      return this.registerTransaction(req, res);

    } catch (error) {
      console.error('Erro ao criar transação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Deletar ativo
  async deleteAsset(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM assets WHERE id = $1 AND user_id = $2 RETURNING id, ticker',
        [id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ativo não encontrado' });
      }

      return res.json({ message: 'Ativo excluído com sucesso', ticker: result.rows[0].ticker });

    } catch (error) {
      console.error('Erro ao excluir ativo:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Listar transações
  async listTransactions(req, res) {
    try {
      const { assetId, startDate, endDate, type } = req.query;

      let query = `
        SELECT 
          t.*,
          a.ticker,
          a.name as asset_name,
          ac.name as class_name
        FROM transactions t
        JOIN assets a ON t.asset_id = a.id
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE t.user_id = $1
      `;
      
      const params = [req.userId];
      let paramIndex = 2;

      if (assetId) {
        query += ` AND t.asset_id = $${paramIndex++}`;
        params.push(assetId);
      }

      if (startDate) {
        query += ` AND t.date >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND t.date <= $${paramIndex++}`;
        params.push(endDate);
      }

      if (type) {
        query += ` AND t.type = $${paramIndex++}`;
        params.push(type);
      }

      query += ' ORDER BY t.date DESC, t.created_at DESC LIMIT 100';

      const result = await pool.query(query, params);

      return res.json({ transactions: result.rows });

    } catch (error) {
      console.error('Erro ao listar transações:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Obter resumo de lucros/prejuízos realizados
  async getRealizedGains(req, res) {
    try {
      const { startDate, endDate, groupBy = 'month' } = req.query;

      let dateFormat = "TO_CHAR(t.date, 'YYYY-MM')";
      if (groupBy === 'year') {
        dateFormat = "TO_CHAR(t.date, 'YYYY')";
      } else if (groupBy === 'day') {
        dateFormat = "TO_CHAR(t.date, 'YYYY-MM-DD')";
      }

      let query = `
        SELECT 
          ${dateFormat} as period,
          SUM(CASE WHEN t.realized_gain > 0 THEN t.realized_gain ELSE 0 END) as total_gains,
          SUM(CASE WHEN t.realized_gain < 0 THEN t.realized_gain ELSE 0 END) as total_losses,
          SUM(t.realized_gain) as net_result,
          COUNT(*) FILTER (WHERE t.type = 'SELL') as sell_count
        FROM transactions t
        WHERE t.user_id = $1 AND t.type = 'SELL' AND t.realized_gain IS NOT NULL
      `;

      const params = [req.userId];
      let paramIndex = 2;

      if (startDate) {
        query += ` AND t.date >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        query += ` AND t.date <= $${paramIndex++}`;
        params.push(endDate);
      }

      query += ` GROUP BY ${dateFormat} ORDER BY period DESC`;

      const result = await pool.query(query, params);

      // Calcular totais
      const totals = await pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN realized_gain > 0 THEN realized_gain ELSE 0 END), 0) as total_gains,
          COALESCE(SUM(CASE WHEN realized_gain < 0 THEN realized_gain ELSE 0 END), 0) as total_losses,
          COALESCE(SUM(realized_gain), 0) as net_result
        FROM transactions
        WHERE user_id = $1 AND type = 'SELL' AND realized_gain IS NOT NULL
      `, [req.userId]);

      return res.json({ 
        byPeriod: result.rows,
        totals: totals.rows[0]
      });

    } catch (error) {
      console.error('Erro ao buscar lucros realizados:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new AssetsController();
