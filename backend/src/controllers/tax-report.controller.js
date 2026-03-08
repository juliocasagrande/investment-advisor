const pool = require('../config/database');

class TaxReportController {
  async getReport(req, res) {
    try {
      const userId = req.userId;
      const year = parseInt(req.params.year) || new Date().getFullYear();

      const salesResult = await pool.query(`
        SELECT t.*, 
               COALESCE(a.ticker, 'N/A') as ticker, 
               COALESCE(a.name, 'Ativo') as asset_name, 
               COALESCE(a.market, 'BR') as market, 
               COALESCE(ac.name, 'Sem classe') as class_name
        FROM transactions t
        LEFT JOIN assets a ON t.asset_id = a.id
        LEFT JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE t.user_id = $1 
        AND t.type = 'SELL' 
        AND EXTRACT(YEAR FROM t.date) = $2
        ORDER BY t.date
      `, [userId, year]);

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
          quantity: parseFloat(sale.quantity),
          price: parseFloat(sale.price),
          total: parseFloat(sale.total),
          gain: gain
        });
      }

      const dividendsResult = await pool.query(`
        SELECT d.*, COALESCE(a.ticker, 'N/A') as ticker
        FROM dividends d
        LEFT JOIN assets a ON d.asset_id = a.id
        WHERE d.user_id = $1 AND EXTRACT(YEAR FROM d.payment_date) = $2
      `, [userId, year]);

      const totalDividends = dividendsResult.rows.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

      let estimatedDarf = 0;
      for (const [month, data] of Object.entries(monthlyGains)) {
        const totalSalesMonth = data.sales.reduce((sum, s) => sum + (s.total || 0), 0);
        if (totalSalesMonth > 20000 && data.total > 0) {
          estimatedDarf += data.total * 0.15;
        }
      }

      const positionResult = await pool.query(`
        SELECT a.ticker, a.name, a.quantity, a.average_price, a.market,
               COALESCE(ac.name, 'Sem classe') as class_name
        FROM assets a
        LEFT JOIN asset_classes ac ON a.asset_class_id = ac.id
        WHERE a.user_id = $1 AND a.quantity > 0
        ORDER BY (a.quantity * a.average_price) DESC
      `, [userId]);

      const position = positionResult.rows.map(a => ({
        ...a,
        totalCost: parseFloat(a.quantity || 0) * parseFloat(a.average_price || 0)
      }));

      return res.json({
        year,
        summary: {
          totalGains: Math.round(totalGains * 100) / 100,
          totalLosses: Math.round(totalLosses * 100) / 100,
          netResult: Math.round((totalGains - totalLosses) * 100) / 100,
          estimatedDarf: Math.round(Math.max(0, estimatedDarf) * 100) / 100,
          totalDividends: Math.round(totalDividends * 100) / 100
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
      const userId = req.userId;
      const year = parseInt(req.params.year) || new Date().getFullYear();
      
      const salesResult = await pool.query(`
        SELECT t.date, COALESCE(a.ticker, 'N/A') as ticker, 
               COALESCE(a.name, '') as name, t.type, t.quantity, t.price, t.total, 
               COALESCE(t.realized_gain, 0) as realized_gain
        FROM transactions t
        LEFT JOIN assets a ON t.asset_id = a.id
        WHERE t.user_id = $1 AND EXTRACT(YEAR FROM t.date) = $2
        ORDER BY t.date
      `, [userId, year]);

      let csv = 'Data,Ticker,Nome,Tipo,Quantidade,Preço,Total,Ganho/Perda\n';
      for (const row of salesResult.rows) {
        const date = row.date ? new Date(row.date).toISOString().split('T')[0] : '';
        csv += `${date},${row.ticker},"${row.name || ''}",${row.type},${row.quantity},${row.price},${row.total},${row.realized_gain}\n`;
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=transacoes-${year}.csv`);
      return res.send(csv);
    } catch (error) {
      console.error('Erro ao exportar relatório:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = new TaxReportController();
