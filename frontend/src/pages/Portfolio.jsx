import React, { useState, useEffect } from 'react';
import { portfolioService, classesService } from '../services/api';
import {
  PieChart,
  Target,
  TrendingUp,
  TrendingDown,
  Edit2,
  Save,
  X,
  Calculator,
  Plus,
  Trash2
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import toast from 'react-hot-toast';

export default function Portfolio() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [classes, setClasses] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [editingClass, setEditingClass] = useState(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionTargets, setContributionTargets] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [editingClassData, setEditingClassData] = useState(null);

  const [newClassForm, setNewClassForm] = useState({
    name: '',
    targetPercentage: 0,
    color: '#3B82F6',
    expectedYield: 10,
    description: ''
  });

  useEffect(() => {
    loadData();
    loadTemplates();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [rebalanceRes, classesRes] = await Promise.all([
        portfolioService.getRebalance(),
        classesService.list()
      ]);
      setData(rebalanceRes.data || {});
      setClasses(classesRes.data?.classes || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
      setData({});
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await classesService.getTemplates();
      setTemplates(response.data?.templates || []);
    } catch (error) {
      // Templates default se falhar
      setTemplates([
        { name: 'Renda Fixa', color: '#10B981', expectedYield: 12 },
        { name: 'Ações BR', color: '#3B82F6', expectedYield: 15 },
        { name: 'FIIs', color: '#8B5CF6', expectedYield: 10 },
        { name: 'Ações EUA', color: '#EC4899', expectedYield: 12 },
        { name: 'Cripto', color: '#F97316', expectedYield: 20 },
        { name: 'Metais', color: '#EAB308', expectedYield: 5 }
      ]);
    }
  };

  const handleAddClass = async () => {
    if (!newClassForm.name) {
      toast.error('Informe o nome da classe');
      return;
    }

    try {
      await classesService.create(newClassForm);
      toast.success('Classe adicionada!');
      setShowAddModal(false);
      setNewClassForm({ name: '', targetPercentage: 0, color: '#3B82F6', expectedYield: 10, description: '' });
      setSelectedTemplate(null);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao criar classe');
    }
  };

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setNewClassForm({
      name: template.name,
      targetPercentage: 0,
      color: template.color,
      expectedYield: template.expectedYield,
      description: template.description || ''
    });
  };

  const handleDeleteClass = async (classItem) => {
    if (!confirm(`Excluir a classe "${classItem.name}"?`)) return;

    try {
      await classesService.delete(classItem.id);
      toast.success('Classe excluída');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao excluir');
    }
  };

  const handleEditClass = (classItem) => {
    setEditingClassData({
      id: classItem.id,
      name: classItem.name,
      targetPercentage: classItem.target_percentage,
      color: classItem.color,
      expectedYield: classItem.expected_yield,
      description: classItem.description
    });
    setShowEditModal(true);
  };

  const handleUpdateClass = async () => {
    try {
      await classesService.update(editingClassData.id, editingClassData);
      toast.success('Classe atualizada!');
      setShowEditModal(false);
      setEditingClassData(null);
      loadData();
    } catch (error) {
      toast.error('Erro ao atualizar');
    }
  };

  const updateClassTarget = async (classId, newTarget) => {
    try {
      await classesService.update(classId, { targetPercentage: newTarget });
      toast.success('Target atualizado');
      setEditingClass(null);
      loadData();
    } catch (error) {
      toast.error('Erro ao atualizar');
    }
  };

  const calculateContribution = async () => {
    if (!contributionAmount || parseFloat(contributionAmount) <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    try {
      const response = await portfolioService.calculateContribution(parseFloat(contributionAmount));
      setContributionTargets(response.data?.targets || []);
    } catch (error) {
      toast.error('Erro ao calcular');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loader"></div>
      </div>
    );
  }

  const allocationData = data?.allocation || {};
  const allocation = allocationData.allocation || [];
  const suggestions = data?.suggestions || [];
  const totalTarget = classes.reduce((sum, c) => sum + parseFloat(c.target_percentage || 0), 0);

  const comparisonData = allocation.map(a => ({
    name: a.name && a.name.length > 15 ? a.name.substring(0, 15) + '...' : (a.name || ''),
    atual: a.currentPercentage || 0,
    target: a.targetPercentage || 0
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfólio</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie sua alocação e rebalanceamento</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nova Classe
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <p className="text-2xl font-bold text-white">{formatCurrency(allocationData.totalValue || 0)}</p>
          <p className="text-xs text-slate-400 mt-1">Valor Total</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <p className="text-2xl font-bold text-blue-400">{classes.length}</p>
          <p className="text-xs text-slate-400 mt-1">Classes de Ativos</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20">
          <p className="text-2xl font-bold text-amber-400">{totalTarget.toFixed(0)}%</p>
          <p className="text-xs text-slate-400 mt-1">Total Targets</p>
          {totalTarget !== 100 && totalTarget > 0 && (
            <p className="text-xs text-red-400 mt-1">⚠️ Deveria ser 100%</p>
          )}
        </div>
        <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
          <p className="text-2xl font-bold text-purple-400">{suggestions.length}</p>
          <p className="text-xs text-slate-400 mt-1">Sugestões Ativas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4">Atual vs Target</h3>
          {comparisonData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} layout="vertical">
                  <XAxis type="number" domain={[0, 'auto']} tick={{ fill: '#64748B', fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-800 border border-slate-600 p-2 rounded-lg text-sm">
                          <p className="text-emerald-400">Atual: {payload[0]?.value?.toFixed(1)}%</p>
                          <p className="text-blue-400">Target: {payload[1]?.value?.toFixed(1)}%</p>
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Bar dataKey="atual" fill="#10B981" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="target" fill="#3B82F6" radius={[0, 4, 4, 0]} />
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
          <p className="text-sm text-slate-400 mb-4">Informe o valor para saber onde investir</p>
          <div className="flex gap-2 mb-4">
            <input
              type="number"
              value={contributionAmount}
              onChange={(e) => setContributionAmount(e.target.value)}
              placeholder="Valor do aporte"
              className="input flex-1"
            />
            <button onClick={calculateContribution} className="btn btn-primary">Calcular</button>
          </div>
          {contributionTargets.length > 0 && (
            <div className="space-y-3">
              {contributionTargets.map((target, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
                  <div>
                    <p className="font-medium text-white">{target.assetClassName}</p>
                    <p className="text-xs text-slate-400">
                      {(target.currentPercentage || 0).toFixed(1)}% → {(target.targetPercentage || 0).toFixed(1)}%
                    </p>
                  </div>
                  <p className="font-mono text-emerald-400 font-bold">{formatCurrency(target.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Classes Table */}
      <div className="card p-5">
        <h3 className="font-semibold text-white mb-4">Classes de Ativos</h3>
        {classes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                  <th className="pb-3 pl-3">Classe</th>
                  <th className="pb-3">Valor</th>
                  <th className="pb-3">% Atual</th>
                  <th className="pb-3">% Target</th>
                  <th className="pb-3">Yield</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {classes.map((classItem) => {
                  const alloc = allocation.find(a => a.id === classItem.id) || {};
                  return (
                    <tr key={classItem.id} className="hover:bg-slate-800/30">
                      <td className="py-3 pl-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: classItem.color || '#3B82F6' }} />
                          <span className="font-medium text-white">{classItem.name}</span>
                        </div>
                      </td>
                      <td className="py-3 font-mono text-slate-300">{formatCurrency(classItem.total_value)}</td>
                      <td className="py-3 font-mono text-slate-300">{(alloc.currentPercentage || 0).toFixed(1)}%</td>
                      <td className="py-3">
                        {editingClass === classItem.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              defaultValue={classItem.target_percentage}
                              className="w-20 px-2 py-1 bg-slate-700 rounded text-white text-sm"
                              id={`target-${classItem.id}`}
                              onKeyDown={(e) => e.key === 'Enter' && updateClassTarget(classItem.id, e.target.value)}
                            />
                            <button onClick={() => updateClassTarget(classItem.id, document.getElementById(`target-${classItem.id}`).value)} className="p-1 text-emerald-400">
                              <Save className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingClass(null)} className="p-1 text-slate-400">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-blue-400 cursor-pointer" onClick={() => setEditingClass(classItem.id)}>
                            {parseFloat(classItem.target_percentage || 0).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="py-3 font-mono text-slate-400">{classItem.expected_yield || 0}%</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEditClass(classItem)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteClass(classItem)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma classe cadastrada</p>
            <button onClick={() => setShowAddModal(true)} className="mt-4 btn btn-primary">Adicionar Classe</button>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4">Sugestões de Rebalanceamento</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestions.map((sug, i) => (
              <div key={i} className={`p-4 rounded-xl ${sug.type === 'BUY' ? 'bg-emerald-500/10 border border-emerald-500/20' : sug.type === 'SELL' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-blue-500/10 border border-blue-500/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {sug.type === 'BUY' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : sug.type === 'SELL' ? <TrendingDown className="w-5 h-5 text-amber-400" /> : <Target className="w-5 h-5 text-blue-400" />}
                  <span className={`text-xs font-medium ${sug.type === 'BUY' ? 'text-emerald-400' : sug.type === 'SELL' ? 'text-amber-400' : 'text-blue-400'}`}>
                    {sug.type === 'BUY' ? 'COMPRAR' : sug.type === 'SELL' ? 'VENDER' : 'APORTE'}
                  </span>
                </div>
                <p className="font-medium text-white">{sug.title}</p>
                <p className="text-sm text-slate-400 mt-1">{sug.description}</p>
                {sug.amount && <p className="mt-2 font-mono font-bold text-lg text-white">{formatCurrency(sug.amount)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Nova Classe de Ativo</h2>
              <button onClick={() => { setShowAddModal(false); setSelectedTemplate(null); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-slate-400 mb-2">Escolha um modelo (opcional)</label>
              <div className="grid grid-cols-3 gap-2">
                {templates.map((template) => (
                  <button
                    key={template.name}
                    onClick={() => handleSelectTemplate(template)}
                    className={`p-3 rounded-xl border text-center transition-all ${selectedTemplate?.name === template.name ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-600'}`}
                  >
                    <div className="w-4 h-4 rounded-full mx-auto mb-1" style={{ backgroundColor: template.color }} />
                    <p className="text-xs text-white truncate">{template.name}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Nome *</label>
                <input type="text" value={newClassForm.name} onChange={(e) => setNewClassForm({ ...newClassForm, name: e.target.value })} className="input" placeholder="Ex: Criptomoedas" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Target (%)</label>
                  <input type="number" value={newClassForm.targetPercentage} onChange={(e) => setNewClassForm({ ...newClassForm, targetPercentage: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Yield (%)</label>
                  <input type="number" value={newClassForm.expectedYield} onChange={(e) => setNewClassForm({ ...newClassForm, expectedYield: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Cor</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={newClassForm.color} onChange={(e) => setNewClassForm({ ...newClassForm, color: e.target.value })} className="w-12 h-10 rounded cursor-pointer" />
                  <input type="text" value={newClassForm.color} onChange={(e) => setNewClassForm({ ...newClassForm, color: e.target.value })} className="input flex-1" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => { setShowAddModal(false); setSelectedTemplate(null); }} className="btn btn-secondary flex-1">Cancelar</button>
                <button onClick={handleAddClass} className="btn btn-primary flex-1">Adicionar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingClassData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Editar Classe</h2>
              <button onClick={() => { setShowEditModal(false); setEditingClassData(null); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Nome</label>
                <input type="text" value={editingClassData.name} onChange={(e) => setEditingClassData({ ...editingClassData, name: e.target.value })} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Target (%)</label>
                  <input type="number" value={editingClassData.targetPercentage} onChange={(e) => setEditingClassData({ ...editingClassData, targetPercentage: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Yield (%)</label>
                  <input type="number" value={editingClassData.expectedYield} onChange={(e) => setEditingClassData({ ...editingClassData, expectedYield: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Cor</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={editingClassData.color || '#3B82F6'} onChange={(e) => setEditingClassData({ ...editingClassData, color: e.target.value })} className="w-12 h-10 rounded cursor-pointer" />
                  <input type="text" value={editingClassData.color || '#3B82F6'} onChange={(e) => setEditingClassData({ ...editingClassData, color: e.target.value })} className="input flex-1" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => { setShowEditModal(false); setEditingClassData(null); }} className="btn btn-secondary flex-1">Cancelar</button>
                <button onClick={handleUpdateClass} className="btn btn-primary flex-1">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
