const pool = require('../config/database');

class MacroAnalysisService {
  
  async getOrCreateAnalysis(userId) {
    const client = await pool.connect();
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Verificar se já existe análise do dia
      const existing = await client.query(
        'SELECT * FROM macro_analysis WHERE user_id = $1 AND analysis_date = $2',
        [userId, today]
      );
      
      if (existing.rows.length > 0) {
        return {
          scenarios: existing.rows[0].scenarios,
          allocation: existing.rows[0].allocation_suggestion,
          summary: existing.rows[0].summary,
          cached: true
        };
      }
      
      // Buscar API key do usuário
      const settings = await client.query(
        'SELECT grok_api_key FROM user_settings WHERE user_id = $1',
        [userId]
      );
      
      const apiKey = settings.rows[0]?.grok_api_key || process.env.GROK_API_KEY;
      
      if (!apiKey) {
        return this.getDefaultAnalysis();
      }
      
      // Gerar nova análise
      const analysis = await this.generateAnalysis(apiKey);
      
      // Salvar no banco
      await client.query(`
        INSERT INTO macro_analysis (user_id, analysis_date, scenarios, allocation_suggestion, summary, source)
        VALUES ($1, $2, $3, $4, $5, 'grok')
        ON CONFLICT (user_id, analysis_date) DO UPDATE SET
          scenarios = EXCLUDED.scenarios,
          allocation_suggestion = EXCLUDED.allocation_suggestion,
          summary = EXCLUDED.summary
      `, [userId, today, JSON.stringify(analysis.scenarios), JSON.stringify(analysis.allocation), analysis.summary]);
      
      return analysis;
      
    } finally {
      client.release();
    }
  }
  
  async generateAnalysis(apiKey) {
    try {
      // Importar fetch dinamicamente para Node.js
      const fetch = (await import('node-fetch')).default;
      
      const prompt = `Você é um analista de investimentos experiente. Analise o cenário macroeconômico atual (Brasil e global) e forneça:

1. Os 3-5 principais cenários/tendências com boa chance de retorno nos próximos 6-12 meses
2. Para cada cenário: título, descrição, probabilidade (alta/média/baixa), classes que se beneficiam
3. Sugestão de alocação percentual para perfil moderado

Responda APENAS em JSON válido:
{
  "scenarios": [
    {
      "title": "Título",
      "description": "Descrição breve",
      "probability": "alta|media|baixa",
      "benefited_assets": ["Classe1", "Classe2"],
      "risk_level": "baixo|moderado|alto"
    }
  ],
  "allocation": {
    "Renda Fixa": 30,
    "Ações BR": 25,
    "FIIs": 15,
    "Ações EUA": 20,
    "Cripto": 5,
    "Metais": 5
  },
  "summary": "Resumo geral"
}`;

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [
            { role: 'system', content: 'Você é um analista de investimentos. Responda apenas em JSON válido.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        }),
        timeout: 30000
      });
      
      if (!response.ok) {
        console.error('Grok API error:', response.status);
        return this.getDefaultAnalysis();
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Parsear JSON da resposta
      let parsed;
      try {
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleanContent);
      } catch (e) {
        console.error('Erro ao parsear resposta da IA:', e);
        return this.getDefaultAnalysis();
      }
      
      return {
        scenarios: parsed.scenarios || [],
        allocation: parsed.allocation || {},
        summary: parsed.summary || ''
      };
      
    } catch (error) {
      console.error('Erro ao chamar Grok API:', error.message);
      return this.getDefaultAnalysis();
    }
  }
  
  getDefaultAnalysis() {
    return {
      scenarios: [
        {
          title: 'Juros elevados no Brasil',
          description: 'Com a Selic em patamares elevados, títulos de renda fixa atrelados ao CDI e IPCA oferecem retornos atrativos com baixo risco.',
          probability: 'alta',
          benefited_assets: ['Renda Fixa', 'CDBs', 'Tesouro Direto'],
          risk_level: 'baixo'
        },
        {
          title: 'Recuperação de FIIs',
          description: 'Fundos imobiliários estão descontados em relação ao valor patrimonial, oferecendo dividend yield atrativo.',
          probability: 'media',
          benefited_assets: ['FIIs', 'Fundos de Tijolo'],
          risk_level: 'moderado'
        },
        {
          title: 'Tecnologia e IA global',
          description: 'O setor de tecnologia, especialmente empresas ligadas à IA, continua com forte momentum.',
          probability: 'alta',
          benefited_assets: ['Ações EUA', 'ETFs de Tecnologia'],
          risk_level: 'alto'
        },
        {
          title: 'Commodities em alta',
          description: 'Demanda global por commodities e tensões geopolíticas sustentam preços de metais e energia.',
          probability: 'media',
          benefited_assets: ['Metais', 'Ações de Commodities'],
          risk_level: 'moderado'
        }
      ],
      allocation: {
        'Renda Fixa': 35,
        'Ações BR': 20,
        'FIIs': 15,
        'Ações EUA': 20,
        'Cripto': 5,
        'Metais': 5
      },
      summary: 'Para análises personalizadas em tempo real, configure sua chave da API Grok em Configurações.',
      isDefault: true
    };
  }
  
  async refreshAnalysis(userId) {
    const client = await pool.connect();
    
    try {
      // Deletar análise existente para forçar nova geração
      await client.query(
        'DELETE FROM macro_analysis WHERE user_id = $1',
        [userId]
      );
      
      return await this.getOrCreateAnalysis(userId);
      
    } finally {
      client.release();
    }
  }
}

module.exports = new MacroAnalysisService();
