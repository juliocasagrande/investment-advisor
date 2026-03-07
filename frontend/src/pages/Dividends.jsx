import React, { useState, useEffect } from 'react';
import { dividendsService, assetsService } from '../services/api';
import {
  DollarSign, Plus, Calendar, TrendingUp, Percent, X,
  ChevronLeft, ChevronRight, PieChart, BarChart3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell
} from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];

export default function Dividends() {
  const [loading, setLoading] = useState(true);
  const [dividends, setDividends] = useState([]);
  const [assets, setAssets] = useState([]);
  const [summary, setSummary] = useState({});
  const [monthlyData, setMonthlyData] = useState([]);
  const [byAsset, setByAsset] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [formData, setFormData] = useState({
    assetId: '',
    type: 'DIVIDEND',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      const startDate = format(startOfMonth(subMonths(currentMonth, 11)), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      const [dividendsRes, assetsRes, summaryRes] = await Promise.all([
        dividendsService.list({ startDate, endDate }),
        assetsService.list(),
        dividendsService.getSummary()
      ]);

      setDividends(dividendsRes.data?.dividends || []);
      setAssets(assetsRes.data?.assets || []);
      setSummary(summaryRes.data?.summary || {});
      setMonthlyData(summaryRes.data?.monthly || []);
      setByAsset(summaryRes.data?.byAsset || []);
    } catch (error) {
      toast.error('Erro ao carregar dividendos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.assetId || !formData.amount) {
      toast.error('Preencha todos os campos');
      return;
    }

    try {
      await dividendsService.create({
        assetId: parseInt(formData.assetId),
        type: formData.type,
        amount: parseFloat(formData.amount),
        date: formData.date,
        notes: formData.notes
      });
      toast.success('Provento registrado!');
      setShowModal(false);
      setFormData({ assetId: '', type: 'DIVIDEND', amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao registrar');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir este provento?')) return;
    try {
      await dividendsService.delete(id);
      toast.success('Excluído');
      loadData();
    } catch (error) {
      toast.error('Erro ao excluir');
    }
  };

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const currentMonthDividends = dividends.filter(d => {
    const date = new Date(d.date);
    return date.getMonth() === currentMonth.getMonth() && date.getFullYear() === currentMonth.getFullYear();
  });

  const currentMonthTotal = currentMonthDividends.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

  const pieData = byAsset.slice(0, 8).map((item, i) => ({
    name: item.ticker,
    value: parseFloat(item.total || 0),
    color: COLORS[i % COLORS.length]
  }));

  if (loading && dividends.length === 0) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="loader"></div></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-20 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Dividendos</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Acompanhe seus proventos</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" />
          Registrar Provento
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] sm:text-xs text-emerald-400">Total Recebido</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{formatCurrency(summary.totalReceived)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] sm:text-xs text-blue-400">Este Mês</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{formatCurrency(currentMonthTotal)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] sm:text-xs text-amber-400">Média Mensal</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{formatCurrency(summary.monthlyAverage)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] sm:text-xs text-purple-400">Yield on Cost</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white">{(summary.yieldOnCost || 0).toFixed(2)}%</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="card p-4 sm:p-5">
          <h3 className="font-semibold text-white mb-4 text-sm sm:text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            Evolução Mensal
          </h3>
          <div className="h-48 sm:h-64">
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData.slice(-12)}>
                  <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div className="bg-slate-800 border border-slate-600 p-2 rounded-lg text-xs">
                      <p className="text-slate-400">{label}</p>
                      <p className="text-emerald-400 font-bold">{formatCurrency(payload[0].value)}</p>
                    </div>
                  ) : null} />
                  <Bar dataKey="total" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex items-center justify-center h-full text-slate-500 text-sm">Sem dados ainda</div>}
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <h3 className="font-semibold text-white mb-4 text-sm sm:text-base flex items-center gap-2">
            <PieChart className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            Por Ativo
          </h3>
          <div className="h-48 sm:h-64">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" innerRadius="40%" paddingAngle={2}>
                    {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => active && payload?.length ? (
                    <div className="bg-slate-800 border border-slate-600 p-2 rounded-lg text-xs">
                      <p className="text-white font-medium">{payload[0].name}</p>
                      <p className="text-emerald-400">{formatCurrency(payload[0].value)}</p>
                    </div>
                  ) : null} />
                </RePieChart>
              </ResponsiveContainer>
            ) : <div className="flex items-center justify-center h-full text-slate-500 text-sm">Sem dados ainda</div>}
          </div>
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {pieData.slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-slate-400">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly List */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white text-sm sm:text-base">Proventos Recebidos</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-300 min-w-[100px] text-center">
              {format(currentMonth, 'MMM yyyy', { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-emerald-400">Total do Mês</span>
            <span className="text-lg font-bold text-white">{formatCurrency(currentMonthTotal)}</span>
          </div>
        </div>

        <div className="space-y-2">
          {currentMonthDividends.length > 0 ? currentMonthDividends.map((div) => (
            <div key={div.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm truncate">{div.ticker}</p>
                  <p className="text-xs text-slate-500">
                    {format(new Date(div.date), 'dd/MM')} • {div.type === 'DIVIDEND' ? 'Div' : div.type === 'JCP' ? 'JCP' : 'Rend'}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-mono font-bold text-emerald-400 text-sm">{formatCurrency(div.amount)}</p>
                <button onClick={() => handleDelete(div.id)} className="text-[10px] text-red-400 hover:text-red-300">Excluir</button>
              </div>
            </div>
          )) : <div className="text-center py-8 text-slate-500 text-sm">Nenhum provento neste mês</div>}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-5 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Registrar Provento</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Ativo *</label>
                <select value={formData.assetId} onChange={(e) => setFormData({ ...formData, assetId: e.target.value })} className="input" required>
                  <option value="">Selecione...</option>
                  {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.ticker} - {asset.name || asset.class_name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {['DIVIDEND', 'JCP', 'YIELD'].map(type => (
                    <button key={type} type="button" onClick={() => setFormData({ ...formData, type })}
                      className={`py-2.5 px-3 rounded-xl border text-sm transition-all ${formData.type === type ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                      {type === 'DIVIDEND' ? 'Dividendo' : type === 'JCP' ? 'JCP' : 'Rendimento'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Valor *</label>
                  <input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="input" placeholder="0.00" required />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Data</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="input" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn btn-primary flex-1">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
