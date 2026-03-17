const currencyService = require('../services/currency.service');

class CurrencyController {
  async getUsdRate(req, res) {
    try {
      const info = await currencyService.getRateInfo();
      return res.json(info);
    } catch (error) {
      console.error('Erro ao buscar taxa de câmbio:', error);
      return res.status(500).json({ error: 'Erro ao buscar cotação do dólar' });
    }
  }
}

module.exports = new CurrencyController();
