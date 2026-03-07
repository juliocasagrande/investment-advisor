import React, { useState, useEffect } from 'react';
import { goalsService, portfolioService } from '../services/api';
import {
  Target, Plus, TrendingUp, Calendar, Wallet, X, Edit2, Trash2,
  CheckCircle, Clock, AlertTriangle, Calculator, ChevronRight
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { format, addMonths, differenceInMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

export default function Goals() {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showSimulator, setShowSimulator] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    targetAmount: '',
    targetDate: '',
    initialAmount: '',
    monthlyContribution: '',
    expectedReturn: '10',
    priority: 'medium',
    notes: ''
  });

  const [simulation, setSimulation] = useState({
    monthlyContribution: '',
    targetAmount: '',
    expectedReturn: '10',
    years: '10'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [goalsRes, portfolioRes] = await Promise.all([
        goalsService.list(),
        portfolioService.getAllocation()
      ]);
      setGoals(goalsRes.data?.goals || []);
      setPortfolioValue(portfolioRes.data?.allocation?.totalValue || 0);
    } catch (error) {
      toast.error('Erro ao carregar metas');
    } finally {
      setLoading(false);
    }
  };

  const calculateProjection = (goal) => {
    const monthsRemaining = differenceInMonths(new Date(goal.target_date), new Date());
    if (monthsRemaining <= 0) return [];

    const monthlyRate = (goal.expected_return || 10) / 100 / 12;
    const data = [];
    let balance = parseFloat(goal.current_amount || goal.initial_amount || 0);

    for (let i = 0; i <= Math.min(monthsRemaining, 120); i++) {
      if (i > 0) {
        balance = balance * (1 + monthlyRate) + parseFloat(goal.monthly_contribution || 0);
      }
      if (i % 3 === 0 || i === monthsRemaining) {
        data.push({
          month: format(addMonths(new Date(), i), 'MMM/yy', { locale: ptBR }),
          value: balance,
          target: goal.target_amount
        });
      }
    }
    return data;
  };

  const calculateSimulation = () => {
    const monthlyRate = parseFloat(simulation.expectedReturn) / 100 / 12;
    const months = parseFloat(simulation.years) * 12;
    const monthly = parseFloat(simulation.monthlyContribution) || 0;
    const target = parseFloat(simulation.targetAmount) || 0;

    const data = [];
    let balance = portfolioValue;

    for (let i = 0; i <= months; i++) {
      if (i > 0) {
        balance = balance * (1 + monthlyRate) + monthly;
      }
      if (i % 6 === 0 || i === months) {
        data.push({
          month: format(addMonths(new Date(), i), 'MMM/yy', { locale: ptBR }),
          projected: balance,
          target: target || balance * 1.5
        });
      }
    }
    return data;
  };

  const calculateRequiredMonthly = () => {
    const target = parseFloat(simulation.targetAmount) || 0;
    const years = parseFloat(simulation.years) || 10;
    const rate = parseFloat(simulation.expectedReturn) / 100 / 12;
    const months = years * 12;

    if (target <= portfolioValue) return 0;

    const futureValueOfPrincipal = portfolioValue * Math.pow(1 + rate, months);
    const remaining = target - futureValueOfPrincipal;

    if (remaining <= 0) return 0;

    const required = remaining * rate / (Math.pow(1 + rate, months) - 1);
    return Math.max(0, required);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.targetAmount || !formData.targetDate) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    try {
      if (editingGoal) {
        await goalsService.update(editingGoal.id, formData);
        toast.success('Meta atualizada!');
      } else {
        await goalsService.create(formData);
        toast.success('Meta criada!');
      }
      setShowModal(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta meta?')) return;
    try {
      await goalsService.delete(id);
      toast.success('Meta excluída');
      loadData();
    } catch (error) {
      toast.error('Erro ao excluir');
    }
  };

  const openEdit = (goal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      targetAmount: goal.target_amount,
      targetDate: goal.target_date?.split('T')[0] || '',
      initialAmount: goal.initial_amount || '',
      monthlyContribution: goal.monthly_contribution || '',
      expectedReturn: goal.expected_return || '10',
      priority: goal.priority || 'medium',
      notes: goal.notes || ''
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingGoal(null);
    setFormData({ name: '', targetAmount: '', targetDate: '', initialAmount: '', monthlyContribution: '', expectedReturn: '10', priority: 'medium', notes: '' });
  };

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const getGoalStatus = (goal) => {
    const progress = ((goal.current_amount || 0) / goal.target_amount) * 100;
    const monthsRemaining = differenceInMonths(new Date(goal.target_date), new Date());

    if (progress >= 100) return { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Concluída' };
    if (monthsRemaining < 0) return { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Atrasada' };
    if (monthsRemaining < 6) return { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Urgente' };
    return { icon: Target, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Em andamento' };
  };

  const simulationData = calculateSimulation();
  const requiredMonthly = calculateRequiredMonthly();

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="loader"></div></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-20 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Metas Financeiras</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Defina e acompanhe seus objetivos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSimulator(true)} className="btn btn-secondary flex items-center justify-center gap-2 text-sm">
            <Calculator className="w-4 h-4" />
            <span className="hidden sm:inline">Simulador</span>
          </button>
          <button onClick={() => { resetForm(); setShowModal(true); }} className="btn btn-primary flex items-center justify-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            Nova Meta
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] sm:text-xs text-emerald-400">Patrimônio Atual</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{formatCurrency(portfolioValue)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] sm:text-xs text-blue-400">Metas Ativas</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{goals.length}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] sm:text-xs text-amber-400">Soma das Metas</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">
            {formatCurrency(goals.reduce((sum, g) => sum + parseFloat(g.target_amount || 0), 0))}
          </p>
        </div>
        <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] sm:text-xs text-purple-400">Concluídas</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">
            {goals.filter(g => ((g.current_amount || 0) / g.target_amount) >= 1).length}
          </p>
        </div>
      </div>

      {/* Goals Grid */}
      {goals.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {goals.map((goal) => {
            const status = getGoalStatus(goal);
            const progress = Math.min(100, ((goal.current_amount || 0) / goal.target_amount) * 100);
            const projection = calculateProjection(goal);
            const monthsRemaining = differenceInMonths(new Date(goal.target_date), new Date());

            return (
              <div key={goal.id} className="card p-4 sm:p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${status.bg} flex items-center justify-center`}>
                      <status.icon className={`w-5 h-5 ${status.color}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white text-sm sm:text-base">{goal.name}</h3>
                      <p className="text-xs text-slate-500">{status.label}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(goal)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(goal.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">Progresso</span>
                    <span className="text-white font-medium">{progress.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-emerald-500' : progress >= 75 ? 'bg-blue-500' : progress >= 50 ? 'bg-amber-500' : 'bg-slate-500'}`}
                      style={{ width: `${Math.min(100, progress)}%` }}
                    />
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs">Meta</p>
                    <p className="text-white font-mono">{formatCurrency(goal.target_amount)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Atual</p>
                    <p className="text-emerald-400 font-mono">{formatCurrency(goal.current_amount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Prazo</p>
                    <p className="text-white">{format(new Date(goal.target_date), 'MMM/yyyy', { locale: ptBR })}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Restam</p>
                    <p className={monthsRemaining < 0 ? 'text-red-400' : 'text-white'}>
                      {monthsRemaining < 0 ? 'Vencida' : `${monthsRemaining} meses`}
                    </p>
                  </div>
                </div>

                {/* Mini Chart */}
                {projection.length > 0 && (
                  <div className="h-24">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={projection}>
                        <defs>
                          <linearGradient id={`gradient-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="value" stroke="#10B981" fill={`url(#gradient-${goal.id})`} strokeWidth={2} />
                        <Line type="monotone" dataKey="target" stroke="#3B82F6" strokeDasharray="3 3" dot={false} />
                        <Tooltip content={({ active, payload }) => active && payload?.length ? (
                          <div className="bg-slate-800 border border-slate-600 p-2 rounded text-xs">
                            <p className="text-emerald-400">Projeção: {formatCurrency(payload[0]?.value)}</p>
                          </div>
                        ) : null} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card p-8 sm:p-12 text-center">
          <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Nenhuma meta cadastrada</h3>
          <p className="text-slate-500 text-sm mb-4">Crie sua primeira meta financeira</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Criar Meta
          </button>
        </div>
      )}

      {/* Goal Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-5 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editingGoal ? 'Editar Meta' : 'Nova Meta'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Nome da Meta *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input" placeholder="Ex: Aposentadoria" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Valor Alvo *</label>
                  <input type="number" value={formData.targetAmount} onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })} className="input" placeholder="500000" required />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Data Alvo *</label>
                  <input type="date" value={formData.targetDate} onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })} className="input" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Valor Inicial</label>
                  <input type="number" value={formData.initialAmount} onChange={(e) => setFormData({ ...formData, initialAmount: e.target.value })} className="input" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Aporte Mensal</label>
                  <input type="number" value={formData.monthlyContribution} onChange={(e) => setFormData({ ...formData, monthlyContribution: e.target.value })} className="input" placeholder="1000" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Retorno Esperado (%)</label>
                  <input type="number" step="0.1" value={formData.expectedReturn} onChange={(e) => setFormData({ ...formData, expectedReturn: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Prioridade</label>
                  <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} className="input">
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn btn-primary flex-1">{editingGoal ? 'Salvar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Simulator Modal */}
      {showSimulator && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-5 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-400" />
                Simulador de Metas
              </h2>
              <button onClick={() => setShowSimulator(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <p className="text-sm text-slate-400">Patrimônio Atual</p>
                <p className="text-xl font-bold text-white">{formatCurrency(portfolioValue)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Meta (R$)</label>
                  <input type="number" value={simulation.targetAmount} onChange={(e) => setSimulation({ ...simulation, targetAmount: e.target.value })} className="input" placeholder="1000000" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Prazo (anos)</label>
                  <input type="number" value={simulation.years} onChange={(e) => setSimulation({ ...simulation, years: e.target.value })} className="input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Aporte Mensal</label>
                  <input type="number" value={simulation.monthlyContribution} onChange={(e) => setSimulation({ ...simulation, monthlyContribution: e.target.value })} className="input" placeholder="2000" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Retorno (% a.a.)</label>
                  <input type="number" step="0.1" value={simulation.expectedReturn} onChange={(e) => setSimulation({ ...simulation, expectedReturn: e.target.value })} className="input" />
                </div>
              </div>

              {simulation.targetAmount && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <p className="text-sm text-blue-400">Aporte mensal necessário</p>
                  <p className="text-xl font-bold text-white">{formatCurrency(requiredMonthly)}</p>
                </div>
              )}

              {/* Projection Chart */}
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={simulationData}>
                    <defs>
                      <linearGradient id="simGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                      <div className="bg-slate-800 border border-slate-600 p-2 rounded text-xs">
                        <p className="text-slate-400">{label}</p>
                        <p className="text-emerald-400">Projeção: {formatCurrency(payload[0]?.value)}</p>
                        {payload[1] && <p className="text-blue-400">Meta: {formatCurrency(payload[1]?.value)}</p>}
                      </div>
                    ) : null} />
                    <Area type="monotone" dataKey="projected" stroke="#10B981" fill="url(#simGradient)" strokeWidth={2} />
                    <Line type="monotone" dataKey="target" stroke="#3B82F6" strokeDasharray="5 5" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <button onClick={() => setShowSimulator(false)} className="btn btn-primary w-full">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
