import React, { useState, useEffect } from 'react';
import { portfolioService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  AlertTriangle,
  CheckCircle,
  Info,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Target,
  ChevronRight
} from 'lucide-react';
import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshingMacro, setRefreshingMacro] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await portfolioService.getDashboard();
      setData(response.data || {});
    } catch (error) {
      toast.error('Erro ao carregar dashboard');
      console.error(error);
      setData({});
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const toastId = toast.loading('Sincronizando dados...');

    try {
      const response = await portfolioService.sync();
      const quotesSuccess = response.data?.results?.quotes?.success || 0;
      toast.success(`Sincronização concluída! ${quotesSuccess} cotações atualizadas`, {
        id: toastId
      });
      await loadDashboard();
    } catch (error) {
      toast.error('Erro na sincronização', { id: toastId });
      console.error(error);
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshMacro = async () => {
    setRefreshingMacro(true);
    try {
      const response = await portfolioService.refreshMacroAnalysis();
      setData(prev => ({
        ...prev,
        macroAnalysis: response.data
      }));
      toast.success('Análise macro atualizada!');
    } catch (error) {
      toast.error('Erro ao atualizar análise');
    } finally {
      setRefreshingMacro(false);
    }
  };

  const dismissRecommendation = async (id) => {
    try {
      await portfolioService.dismissRecommendation(id);
      setData(prev => ({
        ...prev,
        recommendations: (prev?.recommendations || []).filter(r => r.id !== id)
      }));
    } catch (error) {
      toast.error('Erro ao dispensar recomendação');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatPercent = (value) => {
    return `${(value || 0).toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loader"></div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const allocation = data?.allocation || [];
  const recommendations = data?.recommendations || [];
  const history = data?.history || [];
  const macroAnalysis = data?.macroAnalysis || {};

  const allocationWithValue = allocation.filter(a => (a.currentValue || 0) > 0);

  // Preparar dados para gráfico de alocação sugerida
  const suggestedAllocationData = Object.entries(macroAnalysis.allocation || {}).map(([name, value]) => ({
    name,
    value,
    fill: getColorForClass(name)
  }));

  function getColorForClass(name) {
    const colors = {
      'Renda Fixa': '#10B981',
      'Ações BR': '#3B82F6',
      'FIIs': '#8B5CF6',
      'Ações EUA': '#EC4899',
      'Cripto': '#F97316',
      'Metais': '#EAB308',
      'ETFs': '#06B6D4'
    };
    return colors[name] || '#64748B';
  }

  function getProbabilityColor(prob) {
    switch(prob) {
      case 'alta': return 'text-emerald-400 bg-emerald-500/20';
      case 'media': return 'text-amber-400 bg-amber-500/20';
      case 'baixa': return 'text-red-400 bg-red-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  }

  function getRiskColor(risk) {
    switch(risk) {
      case 'baixo': return 'text-emerald-400';
      case 'moderado': return 'text-amber-400';
      case 'alto': return 'text-red-400';
      default: return 'text-slate-400';
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Olá, {user?.name?.split(' ')[0] || 'Usuário'}! 👋
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {summary?.lastUpdate ? (
              <>
                Última atualização: {formatDistanceToNow(new Date(summary.lastUpdate), { 
                  addSuffix: true, 
                  locale: ptBR 
                })}
              </>
            ) : (
              'Clique em sincronizar para atualizar as cotações'
            )}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="btn btn-primary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sincronizar Tudo'}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            {(summary?.totalGain || 0) >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-red-400" />
            )}
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(summary?.totalValue)}</p>
          <p className="text-xs text-slate-400 mt-1">Patrimônio Total</p>
        </div>

        <div className={`stat-card ${(summary?.totalGain || 0) >= 0 
          ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/20' 
          : 'bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/20'}`}>
          <div className="flex items-center justify-between mb-2">
            {(summary?.totalGain || 0) >= 0 ? (
              <TrendingUp className="w-5 h-5 text-green-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-400" />
            )}
            <span className={`text-xs font-medium ${(summary?.totalGain || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPercent(summary?.gainPercentage)}
            </span>
          </div>
          <p className={`text-2xl font-bold ${(summary?.totalGain || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(summary?.totalGain)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Ganho/Perda Total</p>
        </div>

        <div className="stat-card bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-amber-400">mensal</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">{formatCurrency(summary?.monthlyIncome)}</p>
          <p className="text-xs text-slate-400 mt-1">Renda Passiva</p>
        </div>

        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <div className="flex items-center justify-between mb-2">
            <PieChart className="w-5 h-5 text-blue-400" />
            <span className="text-xs text-blue-400">anual</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">{formatCurrency(summary?.annualIncome)}</p>
          <p className="text-xs text-slate-400 mt-1">Renda Anual Est.</p>
        </div>
      </div>

      {/* Macro Analysis Section */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-white">Análise de Cenário Macro</h3>
            {macroAnalysis.isDefault && (
              <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">Padrão</span>
            )}
          </div>
          <button
            onClick={handleRefreshMacro}
            disabled={refreshingMacro}
            className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
          >
            <RefreshCw className={`w-4 h-4 ${refreshingMacro ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {macroAnalysis.summary && (
          <p className="text-sm text-slate-400 mb-4 p-3 bg-slate-800/50 rounded-lg">
            {macroAnalysis.summary}
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cenários */}
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-3">Cenários com Potencial</h4>
            <div className="space-y-3">
              {(macroAnalysis.scenarios || []).map((scenario, i) => (
                <div key={i} className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <div className="flex items-start justify-between mb-2">
                    <h5 className="font-medium text-white text-sm">{scenario.title}</h5>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getProbabilityColor(scenario.probability)}`}>
                      {scenario.probability}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{scenario.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {(scenario.benefited_assets || []).slice(0, 3).map((asset, j) => (
                        <span key={j} className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded">
                          {asset}
                        </span>
                      ))}
                    </div>
                    <span className={`text-xs ${getRiskColor(scenario.risk_level)}`}>
                      Risco {scenario.risk_level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alocação Sugerida */}
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-3">Alocação Sugerida</h4>
            {suggestedAllocationData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={suggestedAllocationData} layout="vertical">
                    <XAxis type="number" domain={[0, 'auto']} tick={{ fill: '#64748B', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-800 border border-slate-600 p-2 rounded-lg text-sm">
                              <p className="text-white">{payload[0]?.payload?.name}</p>
                              <p className="text-purple-400">{payload[0]?.value}%</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {suggestedAllocationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Configure a API Grok para análises personalizadas</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocation Chart */}
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4">Alocação Atual</h3>
          {allocationWithValue.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={allocationWithValue}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="currentValue"
                    >
                      {allocationWithValue.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || '#3B82F6'} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
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
                      }}
                    />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {allocationWithValue.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color || '#3B82F6' }} />
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
          <h3 className="font-semibold text-white mb-4">Recomendações de Rebalanceamento</h3>
          {recommendations.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className={`p-3 rounded-xl flex items-start gap-3 ${
                    rec.type === 'BUY' ? 'bg-emerald-500/10 border border-emerald-500/20' :
                    rec.type === 'SELL' ? 'bg-amber-500/10 border border-amber-500/20' :
                    'bg-blue-500/10 border border-blue-500/20'
                  }`}
                >
                  {rec.type === 'BUY' ? (
                    <Zap className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : rec.type === 'SELL' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{rec.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{rec.description}</p>
                  </div>
                  <button
                    onClick={() => dismissRecommendation(rec.id)}
                    className="text-slate-500 hover:text-white text-xs"
                  >
                    ✕
                  </button>
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
                <XAxis
                  dataKey="date"
                  stroke="#475569"
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  tickFormatter={(v) => {
                    try { return format(new Date(v), 'dd/MM'); }
                    catch { return v; }
                  }}
                />
                <YAxis
                  stroke="#475569"
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      let formattedDate = label;
                      try { formattedDate = format(new Date(label), 'dd/MM/yyyy'); } catch {}
                      return (
                        <div className="bg-slate-800 border border-slate-600 p-3 rounded-lg shadow-xl">
                          <p className="text-slate-400 text-xs mb-1">{formattedDate}</p>
                          <p className="text-emerald-400 font-mono">
                            {formatCurrency(payload[0].value)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total_value"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
