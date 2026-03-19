import React, { useState, useEffect } from 'react';
import { portfolioService, classesService, assetsService } from '../services/api';
import {
  PieChart, Target, TrendingUp, TrendingDown, Edit2, Save, X,
  Calculator, Zap, AlertTriangle, CheckCircle, ArrowRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import toast from 'react-hot-toast';

export default function Portfolio() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [classes, setClasses] = useState([]);
  const [assets, setAssets] = useState([]);
  const [editingClass, setEditingClass] = useState(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionTargets, setContributionTargets] = useState([]);
  const [macroAnalysis, setMacroAnalysis] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [rebalanceRes, classesRes, assetsRes, macroRes] = await Promise.all([
        portfolioService.getRebalance(),
        classesService.list(),
        assetsService.list(),
        portfolioService.getMacroAnalysis().catch(() => ({ data: null }))
      ]);
      
      console.log('Rebalance data:', rebalanceRes.data);
      setData(rebalanceRes.data || {});
      setClasses(classesRes.data?.classes || []);
      setAssets(assetsRes.data?.assets || []);
      setMacroAnalysis(macroRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
      setData({});
      setClasses([]);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const updateClassTarget = async (classId, newTarget) => {
    try {
      await classesService.update(classId, { targetPercentage: parseFloat(newTarget) });
      toast.success('Target atualizado');
      setEditingClass(null);
      loadData();
    } catch (error) {
      toast.error('Erro ao atualizar');
    }
  };

  const calculateContribution = async () => {
    const amount = parseFloat(contributionAmount);
    if (!amount || amount <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    try {
      const response = await portfolioService.calculateContribution(amount);
      const targets = response.data?.targets || [];
      const macroCtx = response.data?.macroContext || null;

      // Enriquecer com ativos específicos de cada classe
      const enrichedTargets = targets.map(target => {
        const classAssets = assets.filter(a => {
          const assetClass = classes.find(c => c.id === a.asset_class_id);
          return assetClass?.id === target.classId;
        });
        return {
          ...target,
          assets: classAssets.map(a => ({
            id: a.id,
            ticker: a.ticker,
            name: a.name,
          }))
        };
      });

      setContributionTargets(enrichedTargets);
      // Salvar o contexto macro retornado pelo backend para exibição
      if (macroCtx) setMacroAnalysis(prev => ({ ...prev, _macroCtx: macroCtx }));
    } catch (error) {
      console.error('Erro ao calcular:', error);
      toast.error('Erro ao calcular');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
      </div>
    );
  }

  const allocationData = data?.allocation || {};
  const allocation = allocationData.allocation || [];
  const suggestions = data?.suggestions || [];
  
  // Calcular total target corretamente
  const totalTarget = allocation.reduce((sum, a) => sum + (parseFloat(a.targetPercentage) || 0), 0);
  
  // Calcular desvios e status para cada classe
  const allocationWithStatus = allocation.map(item => {
    const currentPct = parseFloat(item.currentPercentage) || 0;
    const targetPct = parseFloat(item.targetPercentage) || 0;
    const deviation = item.isPension ? 0 : (currentPct - targetPct);

    let status = 'ok';
    if (!item.isPension && targetPct > 0) {
      if (deviation > 3) status = 'over';
      else if (deviation < -3) status = 'under';
    }

    return {
      ...item,
      deviation,
      status
    };
  });

  // Dados para o gráfico de comparação
  const comparisonData = allocationWithStatus.map(a => ({
    name: a.name && a.name.length > 12 ? a.name.substring(0, 12) + '...' : (a.name || ''),
    atual: a.currentPercentage || 0,
    target: a.targetPercentage || 0,
    color: a.color || '#3B82F6'
  }));

  // Converter suggestions para formato de exibição
  const displaySuggestions = suggestions
    .filter(s => s.type !== 'INCREASE' || !allocationWithStatus.find(a => a.id === s.classId && a.isPension))
    .map((s, i) => ({
    id: i,
    type: s.type === 'INCREASE' ? 'BUY' : s.type === 'REDUCE' ? 'SELL' : 'INFO',
    title: s.className || 'Classe',
    description: s.message || '',
    currentPct: s.currentPercentage,
    targetPct: s.targetPercentage,
    difference: s.difference,
    color: s.color,
    priority: s.priority
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfólio</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie sua alocação e rebalanceamento</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <p className="text-2xl font-bold text-white">
            {formatCurrency(allocationData.totalValue || 0)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Valor Total</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <p className="text-2xl font-bold text-blue-400">{allocation.length}</p>
          <p className="text-xs text-slate-400 mt-1">Classes de Ativos</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20">
          <p className={'text-2xl font-bold ' + (Math.abs(totalTarget - 100) < 0.1 ? 'text-emerald-400' : 'text-amber-400')}>
            {totalTarget.toFixed(0)}%
          </p>
          <p className="text-xs text-slate-400 mt-1">Total Targets</p>
          {Math.abs(totalTarget - 100) > 0.1 && (
            <p className="text-xs text-red-400 mt-1">⚠️ Deveria ser 100%</p>
          )}
        </div>
        <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
          <p className="text-2xl font-bold text-purple-400">{displaySuggestions.length}</p>
          <p className="text-xs text-slate-400 mt-1">Sugestões Ativas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Comparison Chart */}
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4">Atual vs Target</h3>
          {comparisonData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-800 border border-slate-600 p-2 rounded-lg text-sm">
                            <p className="text-slate-300">{payload[0]?.payload?.name}</p>
                            <p className="text-emerald-400">Atual: {(payload[0]?.value || 0).toFixed(1)}%</p>
                            <p className="text-blue-400">Target: {(payload[1]?.value || 0).toFixed(1)}%</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="atual" fill="#10B981" name="Atual" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="target" fill="#3B82F6" name="Target" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Cadastre ativos para ver a comparação</p>
            </div>
          )}
        </div>

        {/* Contribution Calculator */}
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-1 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            Onde Aportar?
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Distribuição inteligente considerando seus targets e o cenário macro atual
          </p>

          <div className="flex gap-2 mb-4">
            <input
              type="number"
              value={contributionAmount}
              onChange={(e) => setContributionAmount(e.target.value)}
              placeholder="Valor do aporte (R$)"
              className="input flex-1"
              onKeyDown={(e) => e.key === 'Enter' && calculateContribution()}
            />
            <button onClick={calculateContribution} className="btn btn-primary">
              Calcular
            </button>
          </div>

          {contributionTargets.length > 0 && (() => {
            const macroCtx = macroAnalysis?._macroCtx;
            const hasMacro = !!macroCtx;
            const boostedTargets = contributionTargets.filter(t => t.isMacroBoosted);
            const normalTargets = contributionTargets.filter(t => !t.isMacroBoosted);

            return (
              <div className="space-y-3">
                {/* Macro context banner */}
                {hasMacro && macroCtx.recommendedClass && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <Zap className="w-4 h-4 text-purple-400 flex-shrink-0" />
                    <p className="text-xs text-purple-300">
                      <span className="font-semibold text-purple-200">Cenário macro:</span>{' '}
                      {macroCtx.recommendedClass.name} está mais favorecida —{' '}
                      {macroCtx.recommendedClass.reason}
                    </p>
                  </div>
                )}

                {/* Boosted classes first */}
                {boostedTargets.length > 0 && (
                  <div className="space-y-2">
                    {hasMacro && <p className="text-xs font-medium text-purple-400 uppercase tracking-wide">✦ Favorecidas pelo cenário atual</p>}
                    {boostedTargets.map((target, i) => (
                      <div key={i} className="p-3 bg-purple-500/10 border border-purple-500/25 rounded-xl">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: target.color || '#A855F7' }} />
                            <span className="font-semibold text-white text-sm">{target.className}</span>
                            <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">macro ↑</span>
                          </div>
                          <span className="font-mono text-emerald-400 font-bold text-sm">
                            {formatCurrency(target.amount)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
                          <span>{target.currentPercentage}%</span>
                          <ArrowRight className="w-3 h-3" />
                          <span className="text-blue-400">{target.targetPercentage}% target</span>
                          <span className="ml-auto text-slate-500">{target.percentage}% do aporte</span>
                        </div>
                        {target.willReachTarget && (
                          <p className="text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Atinge o target com este aporte
                          </p>
                        )}
                        {target.assets?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-purple-500/20">
                            {target.assets.map((a, j) => (
                              <span key={j} className="text-xs bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded">{a.ticker}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Normal classes */}
                {normalTargets.length > 0 && (
                  <div className="space-y-2">
                    {hasMacro && boostedTargets.length > 0 && (
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Rebalanceamento complementar</p>
                    )}
                    {normalTargets.map((target, i) => (
                      <div key={i} className="p-3 bg-slate-700/30 border border-slate-600/40 rounded-xl">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: target.color || '#3B82F6' }} />
                            <span className="font-medium text-white text-sm">{target.className}</span>
                          </div>
                          <span className="font-mono text-emerald-400 font-bold text-sm">
                            {formatCurrency(target.amount)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                          <span>{target.currentPercentage}%</span>
                          <ArrowRight className="w-3 h-3" />
                          <span className="text-blue-400">{target.targetPercentage}% target</span>
                          <span className="ml-auto text-slate-500">{target.percentage}% do aporte</span>
                        </div>
                        {target.willReachTarget && (
                          <p className="text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Atinge o target com este aporte
                          </p>
                        )}
                        {target.assets?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-600/40">
                            {target.assets.map((a, j) => (
                              <span key={j} className="text-xs bg-slate-600/50 text-slate-300 px-2 py-0.5 rounded">{a.ticker}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Total bar */}
                <div className="pt-2 border-t border-slate-700/50">
                  <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                    <span>Distribuição do aporte</span>
                    <span className="text-white font-mono">{formatCurrency(parseFloat(contributionAmount))}</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                    {contributionTargets.map((t, i) => (
                      <div
                        key={i}
                        style={{ width: `${t.percentage}%`, backgroundColor: t.color || '#3B82F6' }}
                        title={`${t.className}: ${t.percentage}%`}
                        className="rounded-full"
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {contributionTargets.map((t, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="text-xs text-slate-400">{t.className} <span className="text-slate-300">{t.percentage}%</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Classes Management */}
      <div className="card p-5">
        <h3 className="font-semibold text-white mb-4">Classes de Ativos</h3>
        {allocationWithStatus.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                  <th className="pb-3 pl-3">Classe</th>
                  <th className="pb-3">Valor Atual</th>
                  <th className="pb-3">% Atual</th>
                  <th className="pb-3">% Target</th>
                  <th className="pb-3">Desvio</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {allocationWithStatus.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="py-3 pl-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color || '#3B82F6' }} />
                        <span className="font-medium text-white">{item.name}</span>
                      </div>
                    </td>
                    <td className="py-3 font-mono text-slate-300">{formatCurrency(item.currentValue)}</td>
                    <td className="py-3 font-mono text-slate-300">{(item.currentPercentage || 0).toFixed(1)}%</td>
                    <td className="py-3">
                      {item.isPension ? (
                        <span className="text-slate-600 text-xs">—</span>
                      ) : editingClass === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.1"
                            defaultValue={item.targetPercentage || 0}
                            className="w-20 px-2 py-1 bg-slate-700 rounded text-white text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateClassTarget(item.id, e.target.value);
                              } else if (e.key === 'Escape') {
                                setEditingClass(null);
                              }
                            }}
                            id={`target-${item.id}`}
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              const input = document.getElementById(`target-${item.id}`);
                              updateClassTarget(item.id, input.value);
                            }}
                            className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingClass(null)}
                            className="p-1 text-slate-400 hover:bg-slate-700 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-blue-400">{(item.targetPercentage || 0).toFixed(1)}%</span>
                      )}
                    </td>
                    <td className="py-3">
                      {item.isPension ? (
                        <span className="text-slate-600 text-xs">—</span>
                      ) : (
                        <span className={`font-mono ${
                          item.deviation > 3 ? 'text-amber-400' :
                          item.deviation < -3 ? 'text-red-400' :
                          'text-slate-400'
                        }`}>
                          {item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {item.isPension ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-teal-500/20 text-teal-400">
                          Informativo
                        </span>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          item.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' :
                          item.status === 'over' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {item.status === 'ok' ? 'OK' : item.status === 'over' ? 'Acima' : 'Abaixo'}
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {!item.isPension && (
                        <button
                          onClick={() => setEditingClass(item.id)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma classe de ativo cadastrada</p>
            <p className="text-sm mt-1">Vá em Ativos para cadastrar suas classes</p>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {displaySuggestions.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4">Sugestões de Rebalanceamento</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displaySuggestions.map((sug, i) => (
              <div
                key={i}
                className={`p-4 rounded-xl ${
                  sug.type === 'BUY' ? 'bg-emerald-500/10 border border-emerald-500/20' :
                  sug.type === 'SELL' ? 'bg-amber-500/10 border border-amber-500/20' :
                  'bg-blue-500/10 border border-blue-500/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {sug.type === 'BUY' ? (
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  ) : sug.type === 'SELL' ? (
                    <TrendingDown className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Target className="w-5 h-5 text-blue-400" />
                  )}
                  <span className={`text-xs font-medium uppercase ${
                    sug.type === 'BUY' ? 'text-emerald-400' : 
                    sug.type === 'SELL' ? 'text-amber-400' : 'text-blue-400'
                  }`}>
                    {sug.type === 'BUY' ? 'APORTAR' : sug.type === 'SELL' ? 'NÃO APORTAR' : 'INFO'}
                  </span>
                  {sug.priority === 'high' && (
                    <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                      Urgente
                    </span>
                  )}
                </div>
                <p className="font-medium text-white">{sug.title}</p>
                <p className="text-sm text-slate-400 mt-1">{sug.description}</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Atual:</span>
                  <span className="text-white">{(sug.currentPct || 0).toFixed(1)}%</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-slate-500">Target:</span>
                  <span className="text-blue-400">{(sug.targetPct || 0).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}