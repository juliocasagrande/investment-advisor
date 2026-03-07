const pool = require('../config/database');

class GoalsController {

  // Listar metas
  async list(req, res) {
    try {
      const result = await pool.query(`
        SELECT * FROM goals 
        WHERE user_id = $1 
        ORDER BY is_completed ASC, target_date ASC NULLS LAST
      `, [req.userId]);

      return res.json({ goals: result.rows });

    } catch (error) {
      console.error('Erro ao listar metas:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Criar meta
  async create(req, res) {
    try {
      const { name, targetValue, targetDate, monthlyContribution, expectedYield, color } = req.body;

      if (!name || !targetValue) {
        return res.status(400).json({ error: 'Nome e valor alvo são obrigatórios' });
      }

      const result = await pool.query(`
        INSERT INTO goals (user_id, name, target_value, target_date, monthly_contribution, expected_yield, color)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        req.userId,
        name,
        targetValue,
        targetDate || null,
        monthlyContribution || 0,
        expectedYield || 10,
        color || '#10B981'
      ]);

      return res.status(201).json({ goal: result.rows[0] });

    } catch (error) {
      console.error('Erro ao criar meta:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Atualizar meta
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

  // Excluir meta
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
