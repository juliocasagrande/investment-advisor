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
          COALESCE(SUM(a.quantity * a.current_price), 0) as total_value,
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
      const { name, targetPercentage, color, description, expectedYield } = req.body;

      const result = await pool.query(`
        INSERT INTO asset_classes (user_id, name, target_percentage, color, description, expected_yield)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [req.userId, name, targetPercentage || 0, color || '#3B82F6', description, expectedYield || 0]);

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
      const { name, targetPercentage, color, description, expectedYield } = req.body;

      const result = await pool.query(`
        UPDATE asset_classes 
        SET name = COALESCE($1, name),
            target_percentage = COALESCE($2, target_percentage),
            color = COALESCE($3, color),
            description = COALESCE($4, description),
            expected_yield = COALESCE($5, expected_yield),
            updated_at = NOW()
        WHERE id = $6 AND user_id = $7
        RETURNING *
      `, [name, targetPercentage, color, description, expectedYield, id, req.userId]);

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
          (a.quantity * a.current_price) as current_value,
          (a.quantity * a.average_price) as invested_value,
          ((a.current_price - a.average_price) / NULLIF(a.average_price, 0) * 100) as gain_percentage
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1
      `;
      
      const params = [req.userId];

      if (classId) {
        query += ' AND a.asset_class_id = $2';
        params.push(classId);
      }

      query += ' ORDER BY (a.quantity * a.current_price) DESC';

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
        notes 
      } = req.body;

      // Verificar se a classe pertence ao usuário
      const classCheck = await pool.query(
        'SELECT id FROM asset_classes WHERE id = $1 AND user_id = $2',
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
          quantity, average_price, current_price, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        req.userId, assetClassId, ticker.toUpperCase(), name, type, market,
        quantity, averagePrice, currentPrice, notes
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

  // Atualizar ativo
  async updateAsset(req, res) {
    try {
      const { id } = req.params;
      const { assetClassId, name, type, notes } = req.body;

      const result = await pool.query(`
        UPDATE assets 
        SET asset_class_id = COALESCE($1, asset_class_id),
            name = COALESCE($2, name),
            type = COALESCE($3, type),
            notes = COALESCE($4, notes),
            updated_at = NOW()
        WHERE id = $5 AND user_id = $6
        RETURNING *
      `, [assetClassId, name, type, notes, id, req.userId]);

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
        newQuantity -= quantity;
        // Preço médio não muda na venda
      }

      // Atualizar ativo
      await client.query(`
        UPDATE assets 
        SET quantity = $1, average_price = $2, updated_at = NOW()
        WHERE id = $3
      `, [newQuantity, newAveragePrice, id]);

      // Registrar transação
      const transactionResult = await client.query(`
        INSERT INTO transactions (user_id, asset_id, type, quantity, price, total, date, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [req.userId, id, type, quantity, price, quantity * price, date || new Date(), notes]);

      await client.query('COMMIT');

      return res.status(201).json({ 
        transaction: transactionResult.rows[0],
        newQuantity,
        newAveragePrice
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Erro ao registrar transação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
      client.release();
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
}

module.exports = new AssetsController();
