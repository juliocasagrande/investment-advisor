const axios = require('axios');

class CurrencyService {
  constructor() {
    // Cache em memória: válido por 30 minutos
    this._cache = { rate: null, fetchedAt: null };
    this.CACHE_TTL_MS = 30 * 60 * 1000;
  }

  /**
   * Retorna a cotação atual do dólar (USD → BRL).
   * Usa cache de 30 min para evitar chamadas excessivas.
   */
  async getUsdToBrl() {
    const now = Date.now();

    if (this._cache.rate && this._cache.fetchedAt && (now - this._cache.fetchedAt) < this.CACHE_TTL_MS) {
      return this._cache.rate;
    }

    try {
      // AwesomeAPI — gratuita, sem chave
      const response = await axios.get('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
        timeout: 8000
      });

      const data = response.data?.USDBRL;
      if (!data || !data.bid) throw new Error('Resposta inesperada da API de câmbio');

      const rate = parseFloat(data.bid);
      this._cache = { rate, fetchedAt: now };
      return rate;

    } catch (error) {
      console.error('Erro ao buscar cotação USD/BRL:', error.message);

      // Se tiver cache expirado, devolve mesmo assim como fallback
      if (this._cache.rate) {
        console.warn('Usando cotação USD/BRL do cache (expirado)');
        return this._cache.rate;
      }

      // Fallback fixo de emergência
      console.warn('Usando cotação USD/BRL de fallback fixo (5.20)');
      return 5.20;
    }
  }

  /**
   * Converte valor em USD para BRL usando cotação atual.
   */
  async convertUsdToBrl(valueUsd) {
    const rate = await this.getUsdToBrl();
    return valueUsd * rate;
  }

  /**
   * Invalida o cache e força uma nova busca da cotação.
   */
  async forceRefresh() {
    this._cache = { rate: null, fetchedAt: null };
    return this.getUsdToBrl();
  }

  /**
   * Retorna objeto completo com rate + timestamp para expor na API.
   */
  async getRateInfo() {
    const rate = await this.getUsdToBrl();
    return {
      rate,
      pair: 'USD-BRL',
      cachedAt: this._cache.fetchedAt ? new Date(this._cache.fetchedAt).toISOString() : null
    };
  }
}

module.exports = new CurrencyService();