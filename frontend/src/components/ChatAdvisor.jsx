import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, User, RefreshCw, CheckCircle, AlertTriangle, ChevronDown } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: `Olá! Sou seu assessor de investimentos. 👋

Posso te ajudar a:
• **Entender** as sugestões de alocação da sua carteira
• **Discutir** o cenário macroeconômico e seus impactos
• **Ajustar** os targets das suas classes de ativos
• **Calcular** onde aportar dado um valor

Por exemplo, tente me perguntar:
_"Como está minha alocação atual?"_
_"Muda o target de Renda Fixa para 35%"_
_"Onde devo aportar R$ 2000?"_`
};

function MarkdownText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\n)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('_') && part.endsWith('_')) {
          return <em key={i} className="italic text-slate-300">{part.slice(1, -1)}</em>;
        }
        if (part === '\n') return <br key={i} />;
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function ActionBadge({ action }) {
  if (!action || !action.executed) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-emerald-500/15 border border-emerald-500/25 rounded-lg text-emerald-400">
      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
      <span>Target de <strong className="text-emerald-300">{action.className}</strong> atualizado para <strong className="text-emerald-300">{action.newTarget}%</strong></span>
    </div>
  );
}

export default function ChatAdvisor() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => scrollToBottom(false), 50);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, scrollToBottom]);

  useEffect(() => {
    if (messages.length > 1) scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distanceFromBottom > 120);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages.filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0), userMsg];
    // Keep conversation history (exclude welcome)
    const historyMessages = messages
      .filter((_, i) => i > 0) // skip welcome
      .concat(userMsg);

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.post('/chat', {
        messages: historyMessages.map(m => ({ role: m.role, content: m.content }))
      });

      const { content, action } = response.data;
      const assistantMsg = { role: 'assistant', content, action };
      setMessages(prev => [...prev, assistantMsg]);

      if (action?.executed) {
        toast.success(`Target de ${action.className} atualizado para ${action.newTarget}%`);
      }
    } catch (error) {
      const errMsg = error.response?.data?.error || 'Erro ao conectar. Verifique sua API key do Groq nas configurações.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errMsg,
        isError: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE]);
  };

  const quickPrompts = [
    'Como está minha alocação?',
    'Onde aportar R$ 1000?',
    'Qual classe ajustar agora?',
  ];

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all duration-300 ${open ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 scale-100'} bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500`}
        title="Assistente de Investimentos"
      >
        <MessageSquare className="w-6 h-6 text-white" />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-purple-500 rounded-full border-2 border-slate-950" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Chat panel */}
      <div className={`fixed z-50 transition-all duration-300 ease-out
        bottom-0 left-0 right-0 h-[85vh]
        lg:bottom-6 lg:left-auto lg:right-6 lg:h-[600px] lg:w-[420px]
        ${open ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}
        flex flex-col rounded-t-2xl lg:rounded-2xl overflow-hidden
        bg-slate-900 border border-slate-700/60 shadow-2xl shadow-black/50`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-slate-800 to-slate-800/80 border-b border-slate-700/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none mb-0.5">Assessor IA</p>
              <p className="text-xs text-emerald-400">Juin Invest · online</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearChat}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
              title="Limpar conversa"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Avatar */}
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.role === 'user'
                  ? 'bg-slate-700'
                  : msg.isError
                  ? 'bg-red-500/20'
                  : 'bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-500/20'
              }`}>
                {msg.role === 'user'
                  ? <User className="w-3.5 h-3.5 text-slate-300" />
                  : msg.isError
                  ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  : <Bot className="w-3.5 h-3.5 text-emerald-400" />
                }
              </div>

              {/* Bubble */}
              <div className={`max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600/30 border border-emerald-500/20 text-slate-100 rounded-tr-sm'
                    : msg.isError
                    ? 'bg-red-500/10 border border-red-500/20 text-red-300 rounded-tl-sm'
                    : 'bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-tl-sm'
                }`}>
                  <MarkdownText text={msg.content} />
                </div>
                {msg.action && <ActionBadge action={msg.action} />}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-500/20">
                <Bot className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-slate-800/80 border border-slate-700/50 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-20 right-4 w-8 h-8 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center shadow-lg hover:bg-slate-600 transition-colors"
          >
            <ChevronDown className="w-4 h-4 text-slate-300" />
          </button>
        )}

        {/* Quick prompts — só aparecem na primeira mensagem */}
        {messages.length === 1 && (
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => { setInput(p); inputRef.current?.focus(); }}
                className="text-xs whitespace-nowrap px-3 py-1.5 bg-slate-800 border border-slate-700/60 hover:border-emerald-500/40 hover:text-emerald-300 text-slate-400 rounded-full transition-colors flex-shrink-0"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="px-3 pb-3 pt-2 border-t border-slate-700/50 flex-shrink-0 bg-slate-900/80">
          <div className="flex items-end gap-2 bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-2 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre sua carteira..."
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm resize-none outline-none min-h-[24px] max-h-[120px] py-0.5 leading-relaxed disabled:opacity-50"
              style={{ scrollbarWidth: 'thin' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700"
            >
              {loading
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Send className="w-4 h-4 text-white" />
              }
            </button>
          </div>
          <p className="text-center text-xs text-slate-600 mt-1.5">Enter para enviar · Shift+Enter para nova linha</p>
        </div>
      </div>
    </>
  );
}