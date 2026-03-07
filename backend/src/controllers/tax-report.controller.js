const pool = require('../config/database');

class TaxReportController {
  async getReport(req, res) {
    try {
      const userId = req.userId;
      const year = parseInt(req.query.year) || new Date().getFullYear();

      // Buscar transações de venda no ano
      const salesResult = await pool.query(`
        SELECT t.*, a.ticker, a.name as asset_name, a.market
        FROM transactions t
        JOIN assets a ON t.asset_id = a.id
        WHERE t.user_id = $1 
        AND t.type = 'SELL' 
        AND EXTRACT(YEAR FROM t.date) = $2
        ORDER BY t.date
      `, [userId, year]);

      // Calcular ganhos por mês
      const monthlyGains = {};
      let totalGains = 0;
      let totalLosses = 0;

      for (const sale of salesResult.rows) {
        const month = new Date(sale.date).toISOString().slice(0, 7);
        const gain = parseFloat(sale.realized_gain) || 0;
        
        if (!monthlyGains[month]) {
          monthlyGains[month] = { gains: 0, losses: 0, total: 0, sales: [] };
        }

        if (gain >= 0) {
          monthlyGains[month].gains += gain;
          totalGains += gain;
        } else {
          monthlyGains[month].losses += Math.abs(gain);
          totalLosses += Math.abs(gain);
        }
        monthlyGains[month].total += gain;
        monthlyGains[month].sales.push({
          ticker: sale.ticker,
          date: sale.date,
          quantity: sale.quantity,
          price: sale.price,
          total: sale.total,
          gain: gain
        });
      }

      // Buscar dividendos
      const dividendsResult = await pool.query(`
        SELECT d.*, a.ticker
        FROM dividends d
        JOIN assets a ON d.asset_id = a.id
        WHERE d.user_id = $1 AND EXTRACT(YEAR FROM d.payment_date) = $2
      `, [userId, year]);

      const totalDividends = dividendsResult.rows.reduce((sum, d) => sum + parseFloat(d.amount), 0);

      // Calcular DARF estimado (15% sobre lucros líquidos acima de R$ 20.000/mês para ações)
      let estimatedDarf = 0;
      for (const [month, data] of Object.entries(monthlyGains)) {
        // Simplificação: 15% sobre lucro líquido positivo
        if (data.total > 0) {
          estimatedDarf += data.total * 0.15;
        }
      }

      // Posição em 31/12
      const positionResult = await pool.query(`
        SELECT a.ticker, a.name, a.quantity, a.average_price, a.market,
               ac.name as class_name
        FROM assets a
        JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1 AND a.quantity > 0
        ORDER BY (a.quantity * a.average_price) DESC
      `, [userId]);

      const position = positionResult.rows.map(a => ({
        ...a,
        totalCost: a.quantity * a.average_price
      }));

      return res.json({
        year,
        summary: {
          totalGains,
          totalLosses,
          netResult: totalGains - totalLosses,
          estimatedDarf,
          totalDividends
        },
        monthlyGains: Object.entries(monthlyGains).map(([month, data]) => ({
          month,
          ...data
        })).sort((a, b) => a.month.localeCompare(b.month)),
        dividends: dividendsResult.rows,
        position
      });
    } catch (error) {
      console.error('Erro ao gerar relatório IR:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  async exportReport(req, res) {
    try {
      const report = await this.getReport(req, { json: (data) => data });
      return res.json(report);
    } catch (error) {
      console.error('Erro ao exportar relatório:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new TaxReportController();
