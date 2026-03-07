const pool = require('../config/database');

class GoalsController {
  async list(req, res) {
    try {
      const result = await pool.query(
        'SELECT * FROM goals WHERE user_id = $1 ORDER BY target_date ASC',
        [req.userId]
      );
      
      // Calcular progresso para cada meta
      const totalInvested = await pool.query(
        'SELECT COALESCE(SUM(quantity * current_price), 0) as total FROM assets WHERE user_id = $1',
        [req.userId]
      );
      const currentValue = parseFloat(totalInvested.rows[0]?.total || 0);
      
      const goals = result.rows.map(goal => {
        const progress = goal.target_value > 0 ? (currentValue / goal.target_value) * 100 : 0;
        return { ...goal, progress: Math.min(progress, 100), currentValue };
      });
      
      return res.json({ goals });
    } catch (error) {
      console.error('Erro ao listar metas:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async create(req, res) {
    try {
      const { name, targetValue, targetDate, monthlyContribution, expectedYield, color } = req.body;

      if (!name || !targetValue) {
        return res.status(400).json({ error: 'Nome e valor são obrigatórios' });
      }

      const result = await pool.query(`
        INSERT INTO goals (user_id, name, target_value, target_date, monthly_contribution, expected_yield, color)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [req.userId, name, targetValue, targetDate || null, monthlyContribution || 0, expectedYield || 10, color || '#10b981']);

      return res.status(201).json({ goal: result.rows[0] });
    } catch (error) {
      console.error('Erro ao criar meta:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, targetValue, targetDate, monthlyContribution, expectedYield, color, isCompleted } = req.body;

      const result = await pool.query(`
        UPDATE goals SET
          name = COALESCE($1, name),
          target_value = COALESCE($2, target_value),
          target_date = COALESCE($3, target_date),
          monthly_contribution = COALESCE($4, monthly_contribution),
          expected_yield = COALESCE($5, expected_yield),
          color = COALESCE($6, color),
          is_completed = COALESCE($7, is_completed),
          updated_at = NOW()
        WHERE id = $8 AND user_id = $9
        RETURNING *
      `, [name, targetValue, targetDate, monthlyContribution, expectedYield, color, isCompleted, id, req.userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Meta não encontrada' });
      }

      return res.json({ goal: result.rows[0] });
    } catch (error) {
      console.error('Erro ao atualizar meta:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Meta não encontrada' });
      }

      return res.json({ message: 'Meta excluída' });
    } catch (error) {
      console.error('Erro ao excluir meta:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new GoalsController();
