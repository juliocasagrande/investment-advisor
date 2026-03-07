const pool = require('../config/database');

class MacroService {
  
  // Buscar ou criar análise macro do dia
  async getOrCreateAnalysis(userId) {
    try {
      // Verificar se já existe análise de hoje
      const today = new Date().toISOString().split('T')[0];
      
      const existing = await pool.query(`
        SELECT * FROM macro_analysis 
        WHERE user_id = $1 AND DATE(created_at) = $2
        ORDER BY created_at DESC LIMIT 1
      `, [userId, today]);

      if (existing.rows.length > 0) {
        return JSON.parse(existing.rows[0].analysis_data);
      }

      // Buscar API key do usuário
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

      // Salvar no cache
      await pool.query(`
        INSERT INTO macro_analysis (user_id, analysis_data) VALUES ($1, $2)
      `, [userId, JSON.stringify(analysis)]);

      return analysis;

    } catch (error) {
      console.error('Erro ao obter análise macro:', error);
      return this.getDefaultAnalysis();
    }
  }

  // Gerar análise usando Groq API
  async generateAnalysis(apiKey) {
    try {
      const fetch = (await import('node-fetch')).default;
      
      const prompt = `Você é um analista financeiro especializado em mercados globais. 
Analise o cenário macroeconômico atual e forneça uma análise para investidores brasileiros.

Retorne APENAS um JSON válido (sem markdown, sem texto adicional) com esta estrutura:
{
  "scenarios": [
    {
      "title": "Título do cenário",
      "description": "Descrição breve do cenário e impactos",
      "probability": "alta|media|baixa",
      "benefitedAssets": ["Renda Fixa", "Ações BR"],
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
  "summary": "Resumo geral do cenário macro atual",
  "updatedAt": "${new Date().toISOString()}"
}

Inclua 3-5 cenários relevantes considerando: inflação, juros (Selic e Fed), câmbio, commodities, geopolítica.
A soma da alocação sugerida deve ser 100%.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { 
              role: 'system', 
              content: 'Você é um analista financeiro. Responda APENAS com JSON válido, sem markdown ou texto adicional.' 
            },
            { role: 'user', content: prompt }
          ],
          max_tokens: 2000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Erro Groq API:', error);
        return this.getDefaultAnalysis();
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return this.getDefaultAnalysis();
      }

      // Limpar possíveis marcações markdown
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3);
      }

      const analysis = JSON.parse(cleanContent.trim());
      analysis.isDefault = false;
      return analysis;

    } catch (error) {
      console.error('Erro ao gerar análise:', error);
      return this.getDefaultAnalysis();
    }
  }

  // Análise padrão quando não há API key
  getDefaultAnalysis() {
    return {
      isDefault: true,
      scenarios: [
        {
          title: "Juros Elevados no Brasil",
          description: "Taxa Selic em patamar elevado favorece investimentos em renda fixa pós-fixada como CDBs, Tesouro Selic e LCIs/LCAs.",
          probability: "alta",
          benefitedAssets: ["Renda Fixa", "Tesouro Selic"],
          riskLevel: "baixo",
          timeHorizon: "curto"
        },
        {
          title: "Dólar Volátil",
          description: "Incertezas fiscais e política monetária americana mantém volatilidade no câmbio. Diversificação internacional pode proteger patrimônio.",
          probability: "media",
          benefitedAssets: ["Ações EUA", "ETFs Internacionais", "Metais"],
          riskLevel: "medio",
          timeHorizon: "medio"
        },
        {
          title: "Fundos Imobiliários Descontados",
          description: "FIIs negociam com desconto em relação ao valor patrimonial. Oportunidade para investidor de longo prazo focado em renda.",
          probability: "media",
          benefitedAssets: ["FIIs", "REITs"],
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
      summary: "Configure sua API key do Groq nas configurações para receber análises personalizadas em tempo real.",
      updatedAt: new Date().toISOString()
    };
  }

  // Forçar nova análise
  async refreshAnalysis(userId) {
    try {
      // Deletar análise do dia
      const today = new Date().toISOString().split('T')[0];
      await pool.query(`
        DELETE FROM macro_analysis 
        WHERE user_id = $1 AND DATE(created_at) = $2
      `, [userId, today]);

      // Gerar nova
      return await this.getOrCreateAnalysis(userId);
    } catch (error) {
      console.error('Erro ao atualizar análise:', error);
      return this.getDefaultAnalysis();
    }
  }
}

module.exports = new MacroService();
