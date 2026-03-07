const pool = require('../config/database');

// Listar dividendos
exports.list = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, assetId } = req.query;

    let query = `
      SELECT d.*, a.ticker, a.name as asset_name, ac.name as class_name
      FROM dividends d
      JOIN assets a ON d.asset_id = a.id
      JOIN asset_classes ac ON a.asset_class_id = ac.id
      WHERE a.user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND d.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      query += ` AND d.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    if (assetId) {
      query += ` AND d.asset_id = $${paramIndex}`;
      params.push(assetId);
    }

    query += ' ORDER BY d.date DESC';

    const result = await pool.query(query, params);
    res.json({ dividends: result.rows });
  } catch (error) {
    console.error('Erro ao listar dividendos:', error);
    res.status(500).json({ error: 'Erro ao listar dividendos' });
  }
};

// Criar dividendo
exports.create = async (req, res) => {
  try {
    const userId = req.user.id;
    const { assetId, type, amount, date, notes } = req.body;

    const assetCheck = await pool.query(
      'SELECT id FROM assets WHERE id = $1 AND user_id = $2',
      [assetId, userId]
    );

    if (assetCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ativo não encontrado' });
    }

    const result = await pool.query(`
      INSERT INTO dividends (asset_id, type, amount, date, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [assetId, type || 'DIVIDEND', amount, date || new Date(), notes]);

    res.status(201).json({ dividend: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar dividendo:', error);
    res.status(500).json({ error: 'Erro ao criar dividendo' });
  }
};

// Atualizar dividendo
exports.update = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { type, amount, date, notes } = req.body;

    const result = await pool.query(`
      UPDATE dividends d
      SET type = COALESCE($1, d.type),
          amount = COALESCE($2, d.amount),
          date = COALESCE($3, d.date),
          notes = COALESCE($4, d.notes)
      FROM assets a
      WHERE d.id = $5 AND d.asset_id = a.id AND a.user_id = $6
      RETURNING d.*
    `, [type, amount, date, notes, id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dividendo não encontrado' });
    }

    res.json({ dividend: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar dividendo:', error);
    res.status(500).json({ error: 'Erro ao atualizar dividendo' });
  }
};

// Excluir dividendo
exports.delete = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM dividends d
      USING assets a
      WHERE d.id = $1 AND d.asset_id = a.id AND a.user_id = $2
      RETURNING d.id
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dividendo não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir dividendo:', error);
    res.status(500).json({ error: 'Erro ao excluir dividendo' });
  }
};

// Resumo de dividendos
exports.getSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const totalResult = await pool.query(`
      SELECT COALESCE(SUM(d.amount), 0) as total
      FROM dividends d
      JOIN assets a ON d.asset_id = a.id
      WHERE a.user_id = $1
    `, [userId]);

    const monthlyResult = await pool.query(`
      SELECT 
        TO_CHAR(d.date, 'YYYY-MM') as month,
        SUM(d.amount) as total
      FROM dividends d
      JOIN assets a ON d.asset_id = a.id
      WHERE a.user_id = $1 AND d.date >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(d.date, 'YYYY-MM')
      ORDER BY month
    `, [userId]);

    const byAssetResult = await pool.query(`
      SELECT 
        a.ticker,
        a.id as asset_id,
        SUM(d.amount) as total,
        COUNT(d.id) as count
      FROM dividends d
      JOIN assets a ON d.asset_id = a.id
      WHERE a.user_id = $1
      GROUP BY a.id, a.ticker
      ORDER BY total DESC
    `, [userId]);

    const investedResult = await pool.query(`
      SELECT COALESCE(SUM(quantity * average_price), 0) as total_invested
      FROM assets WHERE user_id = $1
    `, [userId]);

    const totalReceived = parseFloat(totalResult.rows[0].total) || 0;
    const totalInvested = parseFloat(investedResult.rows[0].total_invested) || 1;
    const monthlyAverage = monthlyResult.rows.length > 0 ? totalReceived / monthlyResult.rows.length : 0;
    const yieldOnCost = (totalReceived / totalInvested) * 100;

    res.json({
      summary: { totalReceived, monthlyAverage, yieldOnCost },
      monthly: monthlyResult.rows,
      byAsset: byAssetResult.rows
    });
  } catch (error) {
    console.error('Erro ao buscar resumo:', error);
    res.status(500).json({ error: 'Erro ao buscar resumo' });
  }
};
