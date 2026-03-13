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
      const currentDate = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const prompt = `Você é um analista financeiro especializado em investimentos brasileiros.
Analise o cenário macroeconômico atual (${currentDate}) para investidores brasileiros.

Retorne APENAS um JSON válido (sem markdown, sem backticks) com esta estrutura exata:
{
  "scenarios": [
    {
      "title": "Título do Cenário",
      "description": "Descrição detalhada do cenário e seu impacto para investidores brasileiros",
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
  "recommendedClass": {
    "name": "Nome da classe mais favorecida no cenário atual",
    "reason": "Motivo objetivo em 1-2 frases por que esta classe está mais favorecida agora",
    "confidence": "alta|media|baixa"
  },
  "summary": "Resumo executivo do cenário macroeconômico atual em 2-3 frases, focando nos pontos mais relevantes para o investidor brasileiro",
  "updatedAt": "${new Date().toISOString()}"
}

Inclua 3-5 cenários cobrindo: taxa Selic/juros, inflação (IPCA), câmbio (BRL/USD), commodities e contexto global.
A soma da suggestedAllocation deve ser exatamente 100%.
O campo recommendedClass deve indicar claramente qual ÚNICA classe de ativo está mais favorecida pelo cenário macroeconômico atual.`;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { 
              role: 'system', 
              content: 'Você é um analista financeiro brasileiro sênior. Responda APENAS com JSON válido, sem markdown, sem explicações, sem texto antes ou depois do JSON.' 
            },
            { role: 'user', content: prompt }
          ],
          max_tokens: 2000,
          temperature: 0.5
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
      
      // Extrair JSON se houver texto ao redor
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }
      
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
      recommendedClass: {
        name: "Renda Fixa",
        reason: "Com a Selic elevada, renda fixa pós-fixada oferece retorno real positivo com baixo risco.",
        confidence: "alta"
      },
      suggestedAllocation: {
        "Renda Fixa": 35,
        "Ações BR": 20,
        "Ações EUA": 15,
        "FIIs": 15,
        "Cripto": 5,
        "Metais": 10
      },
      summary: "Dados padrão baseados no cenário típico brasileiro. Configure sua API key do Groq para análises personalizadas e atualizadas com IA.",
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