const axios = require('axios');

class CurrencyService {
  constructor() {
    // Cache em memória: válido por 30 minutos
    this._cache = { rate: null, fetchedAt: null };
    this.CACHE_TTL_MS = 30 * 60 * 1000;
  }

  /**
   * Tenta buscar a cotação USD/BRL na AwesomeAPI.
   */
  async _fetchFromAwesomeApi() {
    const response = await axios.get('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
      timeout: 6000
    });
    const data = response.data?.USDBRL;
    if (!data || !data.bid) throw new Error('Resposta inválida da AwesomeAPI');
    return parseFloat(data.bid);
  }

  /**
   * Tenta buscar a cotação USD/BRL na open.er-api.com (gratuita, sem chave).
   */
  async _fetchFromOpenErApi() {
    const response = await axios.get('https://open.er-api.com/v6/latest/USD', {
      timeout: 6000
    });
    const rate = response.data?.rates?.BRL;
    if (!rate) throw new Error('Resposta inválida da open.er-api');
    return parseFloat(rate);
  }

  /**
   * Tenta buscar a cotação USD/BRL na exchangerate-api.com (gratuita, sem chave).
   */
  async _fetchFromExchangeRateApi() {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
      timeout: 6000
    });
    const rate = response.data?.rates?.BRL;
    if (!rate) throw new Error('Resposta inválida da exchangerate-api');
    return parseFloat(rate);
  }

  /**
   * Retorna a cotação atual do dólar (USD → BRL).
   * Tenta três APIs em sequência antes de usar fallback.
   */
  async getUsdToBrl() {
    const now = Date.now();

    if (this._cache.rate && this._cache.fetchedAt && (now - this._cache.fetchedAt) < this.CACHE_TTL_MS) {
      return this._cache.rate;
    }

    const providers = [
      { name: 'AwesomeAPI',        fn: () => this._fetchFromAwesomeApi()      },
      { name: 'open.er-api',       fn: () => this._fetchFromOpenErApi()       },
      { name: 'exchangerate-api',  fn: () => this._fetchFromExchangeRateApi() },
    ];

    for (const provider of providers) {
      try {
        const rate = await provider.fn();
        if (rate && rate > 1) {
          console.log(`Cotação USD/BRL obtida via ${provider.name}: ${rate}`);
          this._cache = { rate, fetchedAt: now };
          return rate;
        }
      } catch (err) {
        console.warn(`Falha ao buscar cotação via ${provider.name}: ${err.message}`);
      }
    }

    // Cache expirado como penúltimo recurso
    if (this._cache.rate) {
      console.warn('Usando cotação USD/BRL do cache (expirado)');
      return this._cache.rate;
    }

    // Fallback fixo apenas em último caso
    console.warn('Todas as APIs de câmbio falharam. Usando fallback fixo (5.25)');
    return 5.25;
  }

  /**
   * Invalida o cache e força uma nova busca da cotação.
   */
  async forceRefresh() {
    this._cache = { rate: null, fetchedAt: null };
    return this.getUsdToBrl();
  }

  /**
   * Converte valor em USD para BRL usando cotação atual.
   */
  async convertUsdToBrl(valueUsd) {
    const rate = await this.getUsdToBrl();
    return valueUsd * rate;
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