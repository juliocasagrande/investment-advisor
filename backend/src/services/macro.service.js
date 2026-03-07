const pool = require('../config/database');
const axios = require('axios');

class MacroService {
  async getOrCreateAnalysis(userId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const existing = await pool.query(`
        SELECT * FROM macro_analysis WHERE user_id = $1 AND DATE(created_at) = $2 ORDER BY created_at DESC LIMIT 1
      `, [userId, today]);

      if (existing.rows.length > 0) {
        return JSON.parse(existing.rows[0].analysis_data);
      }

      const settings = await pool.query('SELECT groq_api_key FROM user_settings WHERE user_id = $1', [userId]);
      const apiKey = settings.rows[0]?.groq_api_key || process.env.GROQ_API_KEY;

      if (!apiKey) return this.getDefaultAnalysis();

      const analysis = await this.generateAnalysis(apiKey);
      await pool.query('INSERT INTO macro_analysis (user_id, analysis_data) VALUES ($1, $2)', [userId, JSON.stringify(analysis)]);

      return analysis;
    } catch (error) {
      console.error('Erro ao obter análise macro:', error);
      return this.getDefaultAnalysis();
    }
  }

  async generateAnalysis(apiKey) {
    try {
      const prompt = `Você é um analista financeiro. Analise o cenário macroeconômico atual para investidores brasileiros.

Retorne APENAS JSON válido com esta estrutura:
{
  "scenarios": [
    {"title": "Título", "description": "Descrição", "probability": "alta", "benefitedAssets": ["Renda Fixa"], "riskLevel": "baixo", "timeHorizon": "curto"}
  ],
  "suggestedAllocation": {"Renda Fixa": 30, "Ações BR": 25, "Ações EUA": 20, "FIIs": 15, "Cripto": 5, "Metais": 5},
  "summary": "Resumo do cenário macro",
  "updatedAt": "${new Date().toISOString()}"
}

Inclua 3-5 cenários sobre: juros, inflação, câmbio, commodities. Soma da alocação = 100%.`;

      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama3-70b-8192',
        messages: [
          { role: 'system', content: 'Responda APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 30000
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) return this.getDefaultAnalysis();

      let cleanContent = content.trim().replace(/```json|```/g, '');
      const analysis = JSON.parse(cleanContent);
      analysis.isDefault = false;
      return analysis;
    } catch (error) {
      console.error('Erro ao gerar análise:', error.response?.data || error.message);
      return this.getDefaultAnalysis();
    }
  }

  getDefaultAnalysis() {
    return {
      isDefault: true,
      scenarios: [
        { title: "Juros Elevados no Brasil", description: "Taxa Selic em patamar elevado favorece renda fixa pós-fixada.", probability: "alta", benefitedAssets: ["Renda Fixa", "Tesouro Selic"], riskLevel: "baixo", timeHorizon: "curto" },
        { title: "Dólar Volátil", description: "Incertezas fiscais mantém volatilidade no câmbio.", probability: "media", benefitedAssets: ["Ações EUA", "Metais"], riskLevel: "medio", timeHorizon: "medio" },
        { title: "FIIs Descontados", description: "FIIs negociam com desconto. Oportunidade para longo prazo.", probability: "media", benefitedAssets: ["FIIs"], riskLevel: "medio", timeHorizon: "longo" }
      ],
      suggestedAllocation: { "Renda Fixa": 35, "Ações BR": 20, "Ações EUA": 15, "FIIs": 15, "Cripto": 5, "Metais": 10 },
      summary: "Configure sua API key do Groq nas configurações para análises personalizadas.",
      updatedAt: new Date().toISOString()
    };
  }

  async refreshAnalysis(userId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      await pool.query('DELETE FROM macro_analysis WHERE user_id = $1 AND DATE(created_at) = $2', [userId, today]);
      return await this.getOrCreateAnalysis(userId);
    } catch (error) {
      console.error('Erro ao atualizar análise:', error);
      return this.getDefaultAnalysis();
    }
  }
}

module.exports = new MacroService();
