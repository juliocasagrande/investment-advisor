const pool = require('../config/database');
const quotesService = require('../services/quotes.service');

class AssetsController {

  // ==================== ASSET CLASSES ====================

  // Templates de classes de ativos
  async getClassTemplates(req, res) {
    const templates = [
      { name: 'Renda Fixa', color: '#10B981', expectedYield: 12, icon: '📊', category: 'fixed_income', description: 'CDBs, LCIs, LCAs, Tesouro Direto' },
      { name: 'Ações BR', color: '#3B82F6', expectedYield: 15, icon: '🇧🇷', category: 'stocks_br', description: 'Ações da B3' },
      { name: 'FIIs', color: '#8B5CF6', expectedYield: 10, icon: '🏢', category: 'fiis', description: 'Fundos Imobiliários' },
      { name: 'Ações EUA', color: '#EC4899', expectedYield: 12, icon: '🇺🇸', category: 'stocks_us', description: 'Stocks e ETFs americanos' },
      { name: 'REITs', color: '#F59E0B', expectedYield: 8, icon: '🏠', category: 'reits', description: 'Real Estate Investment Trusts' },
      { name: 'Cripto', color: '#F97316', expectedYield: 20, icon: '₿', category: 'crypto', description: 'Bitcoin, Ethereum e altcoins' },
      { name: 'Metais', color: '#EAB308', expectedYield: 5, icon: '🥇', category: 'metals', description: 'Ouro, Prata' },
      { name: 'ETFs BR', color: '#06B6D4', expectedYield: 12, icon: '📈', category: 'etfs', description: 'ETFs da B3' },
      { name: 'Previdência', color: '#14B8A6', expectedYield: 10, icon: '🏦', category: 'pension', description: 'PGBL, VGBL' },
      { name: 'Internacional', color: '#6366F1', expectedYield: 10, icon: '🌍', category: 'international', description: 'Fundos e ETFs internacionais' },
      { name: 'Caixa', color: '#64748B', expectedYield: 0, icon: '💵', category: 'cash', description: 'Reserva de emergência' }
    ];

    return res.json({ templates });
  }

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

  // Criar classe de ativo
  async createClass(req, res) {
    try {
      const { name, targetPercentage, color, description, expectedYield, icon, category } = req.body;

      const result = await pool.query(`
        INSERT INTO asset_classes (user_id, name, target_percentage, color, description, expected_yield, icon, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [req.userId, name, targetPercentage || 0, color || '#3B82F6', description, expectedYield || 0, icon, category]);

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
          ac.color as class_color
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.id = $1 AND a.user_id = $2
      `, [id, req.userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ativo não encontrado' });
      }

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

  // Criar ativo
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
        currentPrice,
        notes,
        fixedIncomeType,
        indexer,
        rate,
        maturityDate,
        issuer,
        sector,
        walletAddress,
        network,
        presentValue
      } = req.body;

      const classCheck = await pool.query(
        'SELECT id FROM asset_classes WHERE id = $1 AND user_id = $2',
        [assetClassId, req.userId]
      );

      if (classCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Classe de ativo inválida' });
      }

      let finalCurrentPrice = currentPrice || averagePrice;
      if (!currentPrice && market !== 'CRYPTO' && ticker) {
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
            finalCurrentPrice = quote.price;
          }
        } catch (e) {
          console.log('Não foi possível buscar cotação:', e.message);
        }
      }

      const result = await pool.query(`
        INSERT INTO assets (
          user_id, asset_class_id, ticker, name, type, market, 
          quantity, average_price, current_price, notes,
          fixed_income_type, indexer, rate, maturity_date, issuer,
          sector, wallet_address, network, present_value
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
      `, [
        req.userId, assetClassId, ticker ? ticker.toUpperCase() : null, name, type, market,
        quantity, averagePrice, finalCurrentPrice, notes,
        fixedIncomeType, indexer, rate, maturityDate || null, issuer,
        sector, walletAddress, network, presentValue
      ]);

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

  // Atualizar ativo
  async updateAsset(req, res) {
    try {
      const { id } = req.params;
      const { 
        assetClassId, name, type, notes, quantity, averagePrice, currentPrice,
        fixedIncomeType, indexer, rate, maturityDate, issuer, sector,
        walletAddress, network, presentValue
      } = req.body;

      const result = await pool.query(`
        UPDATE assets 
        SET asset_class_id = COALESCE($1, asset_class_id),
            name = COALESCE($2, name),
            type = COALESCE($3, type),
            notes = COALESCE($4, notes),
            quantity = COALESCE($5, quantity),
            average_price = COALESCE($6, average_price),
            current_price = COALESCE($7, current_price),
            fixed_income_type = COALESCE($8, fixed_income_type),
            indexer = COALESCE($9, indexer),
            rate = COALESCE($10, rate),
            maturity_date = COALESCE($11, maturity_date),
            issuer = COALESCE($12, issuer),
            sector = COALESCE($13, sector),
            wallet_address = COALESCE($14, wallet_address),
            network = COALESCE($15, network),
            present_value = COALESCE($16, present_value),
            updated_at = NOW()
        WHERE id = $17 AND user_id = $18
        RETURNING *
      `, [
        assetClassId, name, type, notes, quantity, averagePrice, currentPrice,
        fixedIncomeType, indexer, rate, maturityDate, issuer, sector,
        walletAddress, network, presentValue, id, req.userId
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

  // Registrar compra/venda
  async registerTransaction(req, res) {
    const client = await pool.connect();
    
    try {
      const { id } = req.params;
      const { type, quantity, price, date, notes } = req.body;

      await client.query('BEGIN');

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

      if (type === 'BUY') {
        const totalCurrent = newQuantity * newAveragePrice;
        const totalNew = quantity * price;
        newQuantity += quantity;
        newAveragePrice = newQuantity > 0 ? (totalCurrent + totalNew) / newQuantity : 0;
      } else if (type === 'SELL') {
        if (quantity > newQuantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Quantidade insuficiente para venda' });
        }
        
        realizedGain = (price - newAveragePrice) * quantity;
        realizedGainPercent = newAveragePrice > 0 ? ((price - newAveragePrice) / newAveragePrice) * 100 : 0;
        
        newQuantity -= quantity;
      }

      await client.query(`
        UPDATE assets 
        SET quantity = $1, average_price = $2, updated_at = NOW()
        WHERE id = $3
      `, [newQuantity, newAveragePrice, id]);

      const transactionResult = await client.query(`
        INSERT INTO transactions (user_id, asset_id, type, quantity, price, total, date, notes, average_cost_at_sale, realized_gain, realized_gain_percent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        req.userId, id, type, quantity, price, quantity * price, 
        date || new Date(), notes,
        type === 'SELL' ? asset.average_price : null,
        realizedGain,
        realizedGainPercent
      ]);

      await client.query('COMMIT');

      return res.status(201).json({ 
        transaction: transactionResult.rows[0],
        newQuantity,
        newAveragePrice,
        realizedGain,
        realizedGainPercent
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao registrar transação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
      client.release();
    }
  }

  // Criar transação diretamente (wrapper)
  async createTransaction(req, res) {
    const { assetId, type, quantity, price, date, notes } = req.body;

    if (!assetId) {
      return res.status(400).json({ error: 'assetId é obrigatório' });
    }

    req.params = { id: assetId };
    req.body = { type, quantity, price, date, notes };
    return this.registerTransaction(req, res);
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

  // ==================== TRANSACTIONS ====================

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

  // Obter lucros realizados agrupados
  async getRealizedGains(req, res) {
    try {
      const { groupBy = 'month', year } = req.query;

      let dateFormat;
      switch (groupBy) {
        case 'day':
          dateFormat = 'YYYY-MM-DD';
          break;
        case 'year':
          dateFormat = 'YYYY';
          break;
        default:
          dateFormat = 'YYYY-MM';
      }

      let query = `
        SELECT 
          TO_CHAR(date, '${dateFormat}') as period,
          SUM(CASE WHEN realized_gain > 0 THEN realized_gain ELSE 0 END) as total_gains,
          SUM(CASE WHEN realized_gain < 0 THEN realized_gain ELSE 0 END) as total_losses,
          SUM(COALESCE(realized_gain, 0)) as net_result,
          COUNT(*) as transaction_count
        FROM transactions
        WHERE user_id = $1 AND type = 'SELL' AND realized_gain IS NOT NULL
      `;

      const params = [req.userId];

      if (year) {
        query += ` AND EXTRACT(YEAR FROM date) = $2`;
        params.push(year);
      }

      query += ` GROUP BY TO_CHAR(date, '${dateFormat}') ORDER BY period DESC`;

      const result = await pool.query(query, params);

      const totals = await pool.query(`
        SELECT 
          SUM(CASE WHEN realized_gain > 0 THEN realized_gain ELSE 0 END) as total_gains,
          SUM(CASE WHEN realized_gain < 0 THEN realized_gain ELSE 0 END) as total_losses,
          SUM(COALESCE(realized_gain, 0)) as net_result
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
