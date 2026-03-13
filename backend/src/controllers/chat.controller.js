const axios = require('axios');
const pool = require('../config/database');
const rebalanceService = require('../services/rebalance.service');
const macroService = require('../services/macro.service');

class ChatController {
  async sendMessage(req, res) {
    try {
      const { messages } = req.body;
      const userId = req.userId;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Mensagens inválidas' });
      }

      // Buscar API key do Groq
      const settings = await pool.query(
        'SELECT groq_api_key FROM user_settings WHERE user_id = $1',
        [userId]
      );
      const apiKey = settings.rows[0]?.groq_api_key || process.env.GROQ_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ error: 'Configure sua API key do Groq nas configurações para usar o assistente.' });
      }

      // Montar contexto completo da carteira
      const [allocation, macro] = await Promise.all([
        rebalanceService.calculateAllocation(userId).catch(() => ({ allocation: [], totalValue: 0 })),
        macroService.getOrCreateAnalysis(userId).catch(() => null)
      ]);

      const classesInfo = allocation.allocation?.map(c => ({
        nome: c.name,
        valorAtual: c.currentValue?.toFixed(2),
        percentualAtual: c.currentPercentage?.toFixed(1) + '%',
        targetPercentual: c.targetPercentage?.toFixed(1) + '%',
        desvio: ((c.currentPercentage || 0) - (c.targetPercentage || 0)).toFixed(1) + '%',
        id: c.id
      })) || [];

      const macroRecommended = macro?.recommendedClass?.name || null;
      const macroSummary = macro?.isDefault ? null : macro?.summary;

      const systemPrompt = `Você é o Assistente de Investimentos do Juin Invest, um assessor financeiro especializado na carteira brasileira do usuário.

## CARTEIRA ATUAL
Valor total: R$ ${allocation.totalValue?.toFixed(2) || '0,00'}
Classes de ativos:
${classesInfo.map(c => `- ${c.nome}: R$ ${c.valorAtual} | Atual: ${c.percentualAtual} | Target: ${c.targetPercentual} | Desvio: ${c.desvio}`).join('\n')}

## CENÁRIO MACROECONÔMICO ATUAL
${macroSummary ? macroSummary : 'Análise macro padrão (sem IA configurada).'}
${macroRecommended ? `Classe mais favorecida: ${macroRecommended}` : ''}
${macro?.scenarios ? 'Cenários: ' + macro.scenarios.map(s => `${s.title} (${s.probability})`).join(', ') : ''}

## SUAS CAPACIDADES
Você pode:
1. Explicar e discutir as sugestões de alocação
2. Sugerir ajustes nos targets das classes de ativos
3. Recomendar onde aportar com base no cenário atual
4. Responder perguntas sobre a carteira, diversificação, risco
5. **EXECUTAR AÇÕES**: quando o usuário pedir para ajustar um target, você deve emitir uma ação

## AÇÕES EXECUTÁVEIS
Quando o usuário pedir para AJUSTAR um target de classe, inclua ao final da resposta um bloco de ação neste formato exato (nada depois deste bloco):
<action>
{
  "type": "UPDATE_TARGET",
  "classId": <id_numerico_da_classe>,
  "className": "<nome_da_classe>",
  "newTarget": <novo_percentual_numerico>
}
</action>

REGRAS IMPORTANTES:
- Seja direto, objetivo e use linguagem financeira brasileira
- Use R$ e % no formato brasileiro
- Ao sugerir ajuste de target, verifique se a soma de todos os targets resultará em ~100%
- Se o usuário pedir ajuste que ultrapasse 100% no total, avise e sugira redistribuição
- Não invente dados — use apenas o que está no contexto acima
- Para ações múltiplas (ex: rebalancear tudo), execute uma de cada vez e informe o usuário
- Seja encorajador mas realista sobre riscos`;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages
          ],
          max_tokens: 1024,
          temperature: 0.6
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const rawContent = response.data?.choices?.[0]?.message?.content || '';

      // Extrair ação se presente
      const actionMatch = rawContent.match(/<action>([\s\S]*?)<\/action>/);
      let action = null;
      let content = rawContent.replace(/<action>[\s\S]*?<\/action>/g, '').trim();

      if (actionMatch) {
        try {
          action = JSON.parse(actionMatch[1].trim());

          // Executar a ação diretamente
          if (action.type === 'UPDATE_TARGET' && action.classId && action.newTarget !== undefined) {
            await pool.query(
              'UPDATE asset_classes SET target_percentage = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
              [parseFloat(action.newTarget), action.classId, userId]
            );
            action.executed = true;
          }
        } catch (e) {
          console.error('Erro ao parsear/executar ação:', e.message);
          action = null;
        }
      }

      return res.json({ content, action });
    } catch (error) {
      console.error('Erro no chat:', error.response?.data || error.message);
      if (error.response?.status === 401) {
        return res.status(400).json({ error: 'API key do Groq inválida. Verifique nas configurações.' });
      }
      return res.status(500).json({ error: 'Erro ao processar mensagem. Tente novamente.' });
    }
  }
}

module.exports = new ChatController();