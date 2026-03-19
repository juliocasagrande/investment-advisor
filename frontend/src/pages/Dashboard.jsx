import React, { useState, useEffect } from 'react';
import { portfolioService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  RefreshCw, TrendingUp, TrendingDown, DollarSign, PieChart,
  AlertTriangle, CheckCircle, Info, Zap, ArrowUpRight, ArrowDownRight,
  Clock, Globe, Target, Lightbulb, BarChart3
} from 'lucide-react';
import {
  PieChart as RechartsPie, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingMacro, setLoadingMacro] = useState(false);
  const [data, setData] = useState(null);
  const [macroAnalysis, setMacroAnalysis] = useState(null);

  useEffect(() => {
    loadDashboard();
    loadMacroAnalysis();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await portfolioService.getDashboard();
      console.log('Dashboard data:', response.data);
      setData(response.data);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadMacroAnalysis = async () => {
    try {
      const response = await portfolioService.getMacroAnalysis();
      console.log('Macro analysis:', response.data);
      setMacroAnalysis(response.data);
    } catch (error) {
      console.error('Erro ao carregar análise macro:', error);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const toastId = toast.loading('Sincronizando cotações...');

    try {
      const response = await portfolioService.sync();
      console.log('Sync response:', response.data);
      
      // Tratamento robusto da resposta
      let successCount = 0;
      if (response.data) {
        if (response.data.results) {
          successCount = response.data.results.success || 0;
        } else if (response.data.success !== undefined) {
          successCount = response.data.success ? 1 : 0;
        }
      }
      
      toast.success('Sincronização concluída! ' + successCount + ' cotações atualizadas', { id: toastId });
      await loadDashboard();
    } catch (error) {
      console.error('Erro sync:', error);
      const msg = error.response?.data?.error || error.message || 'Erro na sincronização';
      toast.error(msg, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshMacro = async () => {
    setLoadingMacro(true);
    const toastId = toast.loading('Atualizando análise macroeconômica...');
    
    try {
      const response = await portfolioService.refreshMacroAnalysis();
      setMacroAnalysis(response.data);
      toast.success('Análise atualizada!', { id: toastId });
    } catch (error) {
      console.error('Erro refresh macro:', error);
      toast.error('Erro ao atualizar análise', { id: toastId });
    } finally {
      setLoadingMacro(false);
    }
  };

  const dismissSuggestion = (index) => {
    setData(prev => ({
      ...prev,
      suggestions: (prev?.suggestions || []).filter((_, i) => i !== index)
    }));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatPercent = (value) => {
    return (value || 0).toFixed(2) + '%';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const allocation = data?.allocation || [];
  const suggestions = data?.suggestions || [];
  const history = data?.history || [];
  const usdRate = data?.usdRate || null;

  // Converter suggestions para formato de exibição
  const recommendations = suggestions.map((s, i) => ({
    id: i,
    type: s.type === 'INCREASE' ? 'BUY' : s.type === 'REDUCE' ? 'SELL' : 'INFO',
    title: s.type === 'INCREASE'
      ? '↑ Aportar em ' + s.className
      : '↓ Reduzir ' + s.className,
    description: s.message,
    color: s.color,
    priority: s.priority,
    difference: s.difference,
    currentPct: s.currentPercentage,
    targetPct: s.targetPercentage
  }));

  // Preparar dados para gráfico de alocação sugerida vs atual
  const allocationComparison = macroAnalysis?.suggestedAllocation 
    ? Object.entries(macroAnalysis.suggestedAllocation).map(([name, suggested]) => {
        const current = allocation.find(a => a.name && a.name.toLowerCase().includes(name.toLowerCase().split(' ')[0]));
        return {
          name: name.length > 12 ? name.substring(0, 12) + '...' : name,
          sugerido: suggested,
          atual: current?.currentPercentage || 0
        };
      })
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Olá, {user?.name?.split(' ')[0]}! 👋
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {summary.lastUpdate ? (
              <>Última atualização: {formatDistanceToNow(new Date(summary.lastUpdate), { addSuffix: true, locale: ptBR })}</>
            ) : (
              'Clique em sincronizar para atualizar as cotações'
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {usdRate && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <span className="text-xs text-blue-400 font-mono">US$ 1 = {formatCurrency(usdRate)}</span>
            </div>
          )}
          <button onClick={handleSync} disabled={syncing} className="btn btn-primary flex items-center gap-2">
            <RefreshCw className={'w-4 h-4 ' + (syncing ? 'animate-spin' : '')} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Tudo'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            {(summary.totalGain || 0) >= 0 ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(summary.totalValue)}</p>
          <p className="text-xs text-slate-400 mt-1">Patrimônio Total</p>
        </div>

        <div className={'stat-card ' + ((summary.totalGain || 0) >= 0 ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/20' : 'bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/20')}>
          <div className="flex items-center justify-between mb-2">
            {(summary.totalGain || 0) >= 0 ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
            <span className={'text-xs font-medium ' + ((summary.totalGain || 0) >= 0 ? 'text-green-400' : 'text-red-400')}>{formatPercent(summary.gainPercentage)}</span>
          </div>
          <p className={'text-2xl font-bold ' + ((summary.totalGain || 0) >= 0 ? 'text-green-400' : 'text-red-400')}>{formatCurrency(summary.totalGain)}</p>
          <p className="text-xs text-slate-400 mt-1">Ganho/Perda Total</p>
        </div>

        <div className="stat-card bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-amber-400">mensal</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">{formatCurrency(summary.monthlyIncome)}</p>
          <p className="text-xs text-slate-400 mt-1">Renda Passiva</p>
        </div>

        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-blue-400" />
            <span className="text-xs text-blue-400">anual</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">{formatCurrency(summary.annualIncome)}</p>
          <p className="text-xs text-slate-400 mt-1">Renda Anual Est.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocation Chart */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Alocação Atual</h3>
            {usdRate && (
              <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg font-mono">
                USD convertido · {formatCurrency(usdRate)}
              </span>
            )}
          </div>
          {allocation.length > 0 && allocation.some(a => a.currentValue > 0) ? (
            <div className="flex items-center gap-4">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie data={allocation.filter(a => a.currentValue > 0)} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="currentValue">
                      {allocation.filter(a => a.currentValue > 0).map((entry, index) => (
                        <Cell key={'cell-' + index} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-800 border border-slate-600 p-2 rounded-lg shadow-xl text-sm">
                            <p className="font-medium text-white">{d.name}</p>
                            <p className="text-emerald-400">{formatCurrency(d.currentValue)}</p>
                            <p className="text-slate-400">{(d.currentPercentage || 0).toFixed(1)}%</p>
                          </div>
                        );
                      }
                      return null;
                    }} />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {allocation.filter(a => a.currentValue > 0).map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-slate-300 flex-1 truncate">{item.name}</span>
                    <span className="text-sm font-mono text-slate-400">{(item.currentPercentage || 0).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Cadastre seus ativos para ver a alocação</p>
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400" />
            Recomendações de Rebalanceamento
          </h3>
          {recommendations.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {recommendations.map((rec, index) => (
                <div key={index} className={'p-3 rounded-xl flex items-start gap-3 ' + (rec.type === 'BUY' ? 'bg-emerald-500/10 border border-emerald-500/20' : rec.type === 'SELL' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-blue-500/10 border border-blue-500/20')}>
                  {rec.type === 'BUY' ? <Zap className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" /> : rec.type === 'SELL' ? <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" /> : <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-white text-sm">{rec.title}</p>
                      {rec.priority === 'high' && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded ml-2 flex-shrink-0">Urgente</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{rec.description}</p>
                    {rec.currentPct !== undefined && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={"text-xs font-mono font-semibold " + (rec.type === 'SELL' ? 'text-amber-400' : 'text-red-400')}>{(rec.currentPct || 0).toFixed(1)}%</span>
                        <span className="text-slate-600 text-xs">→</span>
                        <span className="text-xs font-mono text-blue-400">{(rec.targetPct || 0).toFixed(1)}% target</span>
                        <span className={"text-xs font-mono ml-1 " + (rec.type === 'SELL' ? 'text-amber-400' : 'text-emerald-400')}>
                          {rec.type === 'SELL' ? '+' : ''}{(rec.difference || 0).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => dismissSuggestion(index)} className="text-slate-500 hover:text-white text-xs">✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Sua carteira está equilibrada!</p>
            </div>
          )}
        </div>
      </div>

      {/* Macro Analysis Section */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-purple-400" />
              Análise Macroeconômica
            </h3>
            {macroAnalysis?.updatedAt && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3" />
                Atualizado em {(() => {
                  try { return format(new Date(macroAnalysis.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); }
                  catch { return macroAnalysis.updatedAt; }
                })()}
              </p>
            )}
          </div>
          <button onClick={handleRefreshMacro} disabled={loadingMacro} className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1">
            <RefreshCw className={'w-4 h-4 ' + (loadingMacro ? 'animate-spin' : '')} />
            {loadingMacro ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        {macroAnalysis ? (
          <div className="space-y-6">
            {/* Recommended Class Highlight */}
            {macroAnalysis.recommendedClass && (
              <div className="bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30 rounded-xl p-4 flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">Classe Mais Favorecida Agora</span>
                    <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (macroAnalysis.recommendedClass.confidence === 'alta' ? 'bg-emerald-500/20 text-emerald-400' : macroAnalysis.recommendedClass.confidence === 'media' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400')}>
                      confiança {macroAnalysis.recommendedClass.confidence}
                    </span>
                  </div>
                  <p className="text-white font-semibold text-lg">{macroAnalysis.recommendedClass.name}</p>
                  <p className="text-slate-300 text-sm mt-1">{macroAnalysis.recommendedClass.reason}</p>
                </div>
              </div>
            )}

            {/* Summary — sem cards de status, sem mensagens de API key */}
            {macroAnalysis.summary && (
              <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4">
                <p className="text-slate-300 text-sm leading-relaxed">{macroAnalysis.summary}</p>
              </div>
            )}

            {/* Scenarios */}
            {macroAnalysis.scenarios && macroAnalysis.scenarios.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3">Cenários Identificados</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {macroAnalysis.scenarios.map((scenario, i) => (
                    <div key={i} className={'p-4 rounded-xl border ' + (scenario.probability === 'alta' ? 'bg-emerald-500/10 border-emerald-500/20' : scenario.probability === 'media' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-slate-500/10 border-slate-500/20')}>
                      <div className="flex items-start justify-between mb-2">
                        <h5 className="font-medium text-white text-sm">{scenario.title}</h5>
                        <span className={'text-xs px-2 py-0.5 rounded-full ' + (scenario.probability === 'alta' ? 'bg-emerald-500/20 text-emerald-400' : scenario.probability === 'media' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400')}>{scenario.probability}</span>
                      </div>
                      <p className="text-xs text-slate-400 mb-3">{scenario.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {(scenario.benefitedAssets || []).map((asset, j) => (
                          <span key={j} className="text-xs bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded">{asset}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Allocation Chart */}
            {allocationComparison.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Alocação Sugerida vs Atual
                </h4>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={allocationComparison} layout="vertical">
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" tick={{ fill: '#94A3B8', fontSize: 11 }} width={80} />
                      <Tooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-800 border border-slate-600 p-2 rounded-lg shadow-xl text-xs">
                              <p className="text-white font-medium mb-1">{payload[0]?.payload?.name}</p>
                              <p className="text-purple-400">Sugerido: {payload[0]?.value}%</p>
                              <p className="text-emerald-400">Atual: {(payload[1]?.value || 0).toFixed(1)}%</p>
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Bar dataKey="sugerido" fill="#A855F7" radius={[0, 4, 4, 0]} name="Sugerido" />
                      <Bar dataKey="atual" fill="#10B981" radius={[0, 4, 4, 0]} name="Atual" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-purple-500"></div>
                    <span className="text-xs text-slate-400">Sugerido pela análise</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-emerald-500"></div>
                    <span className="text-xs text-slate-400">Sua alocação atual</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Globe className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Carregando análise macroeconômica...</p>
          </div>
        )}
      </div>

      {/* History Chart */}
      {history.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4">Evolução do Patrimônio</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#475569" tick={{ fill: '#64748B', fontSize: 12 }} tickFormatter={(v) => { try { return format(new Date(v), 'dd/MM'); } catch(e) { return v; } }} />
                <YAxis stroke="#475569" tick={{ fill: '#64748B', fontSize: 12 }} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} />
                <Tooltip content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-800 border border-slate-600 p-3 rounded-lg shadow-xl">
                        <p className="text-slate-400 text-xs mb-1">{(() => { try { return format(new Date(label), 'dd/MM/yyyy'); } catch(e) { return label; } })()}</p>
                        <p className="text-emerald-400 font-mono">{formatCurrency(payload[0].value)}</p>
                      </div>
                    );
                  }
                  return null;
                }} />
                <Area type="monotone" dataKey="total_value" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}