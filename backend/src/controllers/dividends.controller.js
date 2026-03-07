const pool = require('../config/database');

class DividendsController {
  async list(req, res) {
    try {
      const userId = req.userId;
      const { year, assetId } = req.query;
      
      let query = `
        SELECT d.*, a.ticker, a.name as asset_name, ac.name as class_name
        FROM dividends d
        JOIN assets a ON d.asset_id = a.id
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE d.user_id = $1
      `;
      const params = [userId];

      if (year) {
        params.push(year);
        query += ` AND EXTRACT(YEAR FROM d.payment_date) = $${params.length}`;
      }
      if (assetId) {
        params.push(assetId);
        query += ` AND d.asset_id = $${params.length}`;
      }

      query += ' ORDER BY d.payment_date DESC';
      const result = await pool.query(query, params);
      return res.json({ dividends: result.rows });
    } catch (error) {
      console.error('Erro ao listar dividendos:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async create(req, res) {
    try {
      const userId = req.userId;
      const { assetId, type, amount, paymentDate, exDate, notes } = req.body;

      if (!assetId || !amount || !paymentDate) {
        return res.status(400).json({ error: 'Campos obrigatórios: assetId, amount, paymentDate' });
      }

      const assetCheck = await pool.query(
        'SELECT id FROM assets WHERE id = $1 AND user_id = $2',
        [assetId, userId]
      );
      if (assetCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Ativo não encontrado' });
      }

      const result = await pool.query(`
        INSERT INTO dividends (user_id, asset_id, type, amount, payment_date, ex_date, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [userId, assetId, type || 'DIVIDEND', amount, paymentDate, exDate, notes]);

      return res.status(201).json({ dividend: result.rows[0] });
    } catch (error) {
      console.error('Erro ao criar dividendo:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async update(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { type, amount, paymentDate, exDate, notes } = req.body;

      const result = await pool.query(`
        UPDATE dividends SET
          type = COALESCE($1, type),
          amount = COALESCE($2, amount),
          payment_date = COALESCE($3, payment_date),
          ex_date = COALESCE($4, ex_date),
          notes = COALESCE($5, notes)
        WHERE id = $6 AND user_id = $7
        RETURNING *
      `, [type, amount, paymentDate, exDate, notes, id, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Dividendo não encontrado' });
      }
      return res.json({ dividend: result.rows[0] });
    } catch (error) {
      console.error('Erro ao atualizar dividendo:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async delete(req, res) {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM dividends WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Dividendo não encontrado' });
      }
      return res.json({ message: 'Dividendo excluído' });
    } catch (error) {
      console.error('Erro ao excluir dividendo:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async getSummary(req, res) {
    try {
      const userId = req.userId;
      const { year } = req.query;
      const targetYear = year || new Date().getFullYear();

      const totalYear = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM dividends WHERE user_id = $1 AND EXTRACT(YEAR FROM payment_date) = $2
      `, [userId, targetYear]);

      const thisMonth = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM dividends 
        WHERE user_id = $1 
        AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      `, [userId]);

      const byMonth = await pool.query(`
        SELECT TO_CHAR(payment_date, 'YYYY-MM') as month, SUM(amount) as total
        FROM dividends WHERE user_id = $1 AND EXTRACT(YEAR FROM payment_date) = $2
        GROUP BY TO_CHAR(payment_date, 'YYYY-MM') ORDER BY month
      `, [userId, targetYear]);

      const byAsset = await pool.query(`
        SELECT a.ticker, a.name, SUM(d.amount) as total
        FROM dividends d JOIN assets a ON d.asset_id = a.id
        WHERE d.user_id = $1 AND EXTRACT(YEAR FROM d.payment_date) = $2
        GROUP BY a.id, a.ticker, a.name ORDER BY total DESC
      `, [userId, targetYear]);

      const totalInvested = await pool.query(`
        SELECT COALESCE(SUM(quantity * average_price), 0) as total FROM assets WHERE user_id = $1
      `, [userId]);

      const totalReceived = parseFloat(totalYear.rows[0].total);
      const invested = parseFloat(totalInvested.rows[0].total);
      const yieldOnCost = invested > 0 ? (totalReceived / invested) * 100 : 0;

      return res.json({
        totalYear: totalReceived,
        thisMonth: parseFloat(thisMonth.rows[0].total),
        avgMonthly: totalReceived / 12,
        byMonth: byMonth.rows,
        byAsset: byAsset.rows,
        yieldOnCost
      });
    } catch (error) {
      console.error('Erro ao obter resumo:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new DividendsController();
