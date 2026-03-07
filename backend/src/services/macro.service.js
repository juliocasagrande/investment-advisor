const pool = require('../config/database');
const axios = require('axios');

class MacroService {
  async getOrCreateAnalysis(userId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Verificar se já existe análise de hoje
      const existing = await pool.query(`
        SELECT * FROM macro_analysis 
        WHERE user_id = $1 AND DATE(created_at) = $2 
        ORDER BY created_at DESC LIMIT 1
      `, [userId, today]);

      if (existing.rows.length > 0) {
        try {
          return JSON.parse(existing.rows[0].analysis_data);
        } catch {
          return this.getDefaultAnalysis();
        }
      }

      // Buscar API key do Groq
      const settings = await pool.query(
        'SELECT groq_api_key FROM user_settings WHERE user_id = $1',
        [userId]
      );
      
      const apiKey = settings.rows[0]?.groq_api_key || process.env.GROQ_API_KEY;

      if (!apiKey) {
        return this.getDefaultAnalysis();
      }

      // Gerar nova análise
      const analysis = await this.generateAnalysis(apiKey);
      
      // Salvar no banco
      await pool.query(
        'INSERT INTO macro_analysis (user_id, analysis_data) VALUES ($1, $2)',
        [userId, JSON.stringify(analysis)]
      );

      return analysis;
    } catch (error) {
      console.error('Erro ao obter análise macro:', error);
      return this.getDefaultAnalysis();
    }
  }

  async generateAnalysis(apiKey) {
    try {
      const prompt = `Você é um analista financeiro especializado em investimentos. 
Analise o cenário macroeconômico atual para investidores brasileiros.

Retorne APENAS um JSON válido (sem markdown, sem \`\`\`) com esta estrutura exata:
{
  "scenarios": [
    {
      "title": "Título do Cenário",
      "description": "Descrição detalhada",
      "probability": "alta|media|baixa",
      "benefitedAssets": ["Classe 1", "Classe 2"],
      "riskLevel": "baixo|medio|alto",
      "timeHorizon": "curto|medio|longo"
    }
  ],
  "suggestedAllocation": {
    "Renda Fixa": 30,
    "Ações BR": 25,
    "Ações EUA": 20,
    "FIIs": 15,
    "Cripto": 5,
    "Metais": 5
  },
  "summary": "Resumo do cenário macroeconômico atual",
  "updatedAt": "${new Date().toISOString()}"
}

Inclua 3-5 cenários cobrindo: taxa de juros, inflação, câmbio, commodities.
A soma da alocação sugerida deve ser exatamente 100%.`;

      // Usar modelo atualizado - llama-3.3-70b-versatile
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { 
              role: 'system', 
              content: 'Você é um analista financeiro. Responda APENAS com JSON válido, sem markdown ou explicações.' 
            },
            { role: 'user', content: prompt }
          ],
          max_tokens: 2000,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      
      if (!content) {
        return this.getDefaultAnalysis();
      }

      // Limpar e parsear JSON
      let cleanContent = content.trim();
      cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      const analysis = JSON.parse(cleanContent);
      analysis.isDefault = false;
      
      return analysis;
    } catch (error) {
      console.error('Erro ao gerar análise Groq:', error.response?.data || error.message);
      return this.getDefaultAnalysis();
    }
  }

  getDefaultAnalysis() {
    return {
      isDefault: true,
      scenarios: [
        {
          title: "Juros Elevados no Brasil",
          description: "Taxa Selic em patamar elevado favorece aplicações em renda fixa pós-fixada. CDI acima de 10% ao ano torna títulos atrelados ao CDI muito atrativos.",
          probability: "alta",
          benefitedAssets: ["Renda Fixa", "Tesouro Selic", "CDBs"],
          riskLevel: "baixo",
          timeHorizon: "curto"
        },
        {
          title: "Dólar Volátil",
          description: "Incertezas fiscais e cenário global mantêm volatilidade no câmbio. Exposição a ativos dolarizados pode proteger a carteira.",
          probability: "media",
          benefitedAssets: ["Ações EUA", "ETFs Internacionais", "Metais"],
          riskLevel: "medio",
          timeHorizon: "medio"
        },
        {
          title: "FIIs com Desconto",
          description: "Fundos imobiliários negociando abaixo do valor patrimonial. Oportunidade para investidores de longo prazo que buscam renda passiva.",
          probability: "media",
          benefitedAssets: ["FIIs", "Fundos de Tijolo"],
          riskLevel: "medio",
          timeHorizon: "longo"
        }
      ],
      suggestedAllocation: {
        "Renda Fixa": 35,
        "Ações BR": 20,
        "Ações EUA": 15,
        "FIIs": 15,
        "Cripto": 5,
        "Metais": 10
      },
      summary: "Configure sua API key do Groq nas configurações para receber análises macroeconômicas personalizadas com IA.",
      updatedAt: new Date().toISOString()
    };
  }

  async refreshAnalysis(userId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Deletar análise existente de hoje
      await pool.query(
        'DELETE FROM macro_analysis WHERE user_id = $1 AND DATE(created_at) = $2',
        [userId, today]
      );
      
      // Gerar nova análise
      return await this.getOrCreateAnalysis(userId);
    } catch (error) {
      console.error('Erro ao atualizar análise:', error);
      return this.getDefaultAnalysis();
    }
  }
}

module.exports = new MacroService();
