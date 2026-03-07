const pool = require('../config/database');

class TaxReportController {

  // Obter relatório de IR
  async getReport(req, res) {
    try {
      const { year } = req.query;
      const targetYear = parseInt(year) || new Date().getFullYear() - 1;

      // Posição em 31/12
      const position = await pool.query(`
        SELECT 
          a.ticker,
          a.name,
          a.quantity,
          a.average_price,
          (a.quantity * a.average_price) as cost_basis,
          ac.name as class_name
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1 AND a.quantity > 0
        ORDER BY cost_basis DESC
      `, [req.userId]);

      // Lucros/Prejuízos por mês
      const gains = await pool.query(`
        SELECT 
          TO_CHAR(date, 'YYYY-MM') as month,
          SUM(CASE WHEN type = 'SELL' THEN total ELSE 0 END) as total_sales,
          SUM(CASE WHEN realized_gain > 0 THEN realized_gain ELSE 0 END) as total_gains,
          SUM(CASE WHEN realized_gain < 0 THEN realized_gain ELSE 0 END) as total_losses,
          SUM(COALESCE(realized_gain, 0)) as net_result
        FROM transactions
        WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = $2 AND type = 'SELL'
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        ORDER BY month
      `, [req.userId, targetYear]);

      // Dividendos por ativo
      const dividends = await pool.query(`
        SELECT 
          a.ticker,
          d.type,
          SUM(d.amount) as total
        FROM dividends d
        JOIN assets a ON d.asset_id = a.id
        WHERE d.user_id = $1 AND EXTRACT(YEAR FROM d.payment_date) = $2
        GROUP BY a.ticker, d.type
        ORDER BY total DESC
      `, [req.userId, targetYear]);

      // Calcular totais
      const positionDec31 = position.rows.reduce((sum, p) => sum + parseFloat(p.cost_basis || 0), 0);
      
      const totalGains = gains.rows.reduce((sum, g) => sum + parseFloat(g.total_gains || 0), 0);
      const totalLosses = gains.rows.reduce((sum, g) => sum + parseFloat(g.total_losses || 0), 0);
      const netGains = totalGains + totalLosses;

      const totalDividends = dividends.rows.reduce((sum, d) => sum + parseFloat(d.total || 0), 0);

      // DARF estimado (15% sobre lucro líquido em swing trade, 20% day trade)
      // Simplificado: considera apenas swing trade
      const darfDue = netGains > 0 ? netGains * 0.15 : 0;

      return res.json({
        year: targetYear,
        position: position.rows,
        gains: gains.rows,
        dividends: dividends.rows,
        summary: {
          positionDec31,
          totalGains,
          totalLosses,
          netGains,
          totalDividends,
          darfDue
        }
      });

    } catch (error) {
      console.error('Erro ao gerar relatório IR:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Exportar relatório
  async exportReport(req, res) {
    try {
      const { year } = req.query;
      
      // Usa o mesmo método do getReport
      req.query.year = year;
      const report = await this.getReport(req, { json: (data) => data });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=relatorio-ir-${year}.json`);
      return res.json(report);

    } catch (error) {
      console.error('Erro ao exportar relatório:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new TaxReportController();
