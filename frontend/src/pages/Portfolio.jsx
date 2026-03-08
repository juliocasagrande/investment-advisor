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
      console.log('Contribution response:', response.data);
      
      const targets = response.data?.targets || [];
      
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
            currentValue: (a.quantity || 0) * (a.current_price || a.average_price || 0)
          }))
        };
      });
      
      setContributionTargets(enrichedTargets);
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
    const deviation = currentPct - targetPct;
    
    let status = 'ok';
    if (targetPct > 0) {
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
  const displaySuggestions = suggestions.map((s, i) => ({
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
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-400" />
            Onde Aportar?
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Informe o valor do aporte para saber onde investir para rebalancear
          </p>
          
          <div className="flex gap-2 mb-4">
            <input
              type="number"
              value={contributionAmount}
              onChange={(e) => setContributionAmount(e.target.value)}
              placeholder="Valor do aporte"
              className="input flex-1"
              onKeyDown={(e) => e.key === 'Enter' && calculateContribution()}
            />
            <button onClick={calculateContribution} className="btn btn-primary">
              Calcular
            </button>
          </div>

          {contributionTargets.length > 0 && (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {contributionTargets.map((target, i) => (
                <div key={i} className="p-3 bg-slate-700/30 rounded-xl border border-slate-600/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: target.color || '#3B82F6' }} />
                      <span className="font-medium text-white">{target.className}</span>
                    </div>
                    <span className="font-mono text-emerald-400 font-bold">
                      {formatCurrency(target.amount)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">
                    {(target.currentPercentage || 0).toFixed(1)}% <ArrowRight className="w-3 h-3 inline" /> {(target.targetPercentage || 0).toFixed(1)}%
                    <span className="ml-2 text-emerald-400">({(target.percentage || 0).toFixed(0)}% do aporte)</span>
                  </p>
                  
                  {/* Ativos específicos da classe */}
                  {target.assets && target.assets.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-600/50">
                      <p className="text-xs text-slate-500 mb-1">Ativos nesta classe:</p>
                      <div className="flex flex-wrap gap-1">
                        {target.assets.map((asset, j) => (
                          <span key={j} className="text-xs bg-slate-600/50 text-slate-300 px-2 py-0.5 rounded">
                            {asset.ticker}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Sugestão baseada no cenário macro */}
                  {macroAnalysis && !macroAnalysis.isDefault && (
                    <div className="mt-2 pt-2 border-t border-slate-600/50">
                      <p className="text-xs text-purple-400 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        Favorecido pelo cenário atual
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
                      {editingClass === item.id ? (
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
                      <span className={`font-mono ${
                        item.deviation > 3 ? 'text-amber-400' : 
                        item.deviation < -3 ? 'text-red-400' : 
                        'text-slate-400'
                      }`}>
                        {item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        item.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' :
                        item.status === 'over' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {item.status === 'ok' ? 'OK' : item.status === 'over' ? 'Acima' : 'Abaixo'}
                      </span>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => setEditingClass(item.id)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
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
