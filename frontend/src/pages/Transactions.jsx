import React, { useState, useEffect } from 'react';
import { transactionsService, assetsService } from '../services/api';
import {
  Search, TrendingUp, TrendingDown, Calendar, Download, Plus, X,
  ShoppingCart, ArrowDownCircle, BarChart3
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

export default function Transactions() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [realizedGains, setRealizedGains] = useState({ byPeriod: [], totals: {} });
  const [showNewModal, setShowNewModal] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    startDate: '',
    endDate: ''
  });

  const [newTransaction, setNewTransaction] = useState({
    assetId: '',
    type: 'BUY',
    quantity: '',
    price: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.type) params.type = filters.type;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const [txRes, assetsRes, gainsRes] = await Promise.all([
        transactionsService.list(params),
        assetsService.list(),
        transactionsService.getRealizedGains({ groupBy: 'month' })
      ]);

      setTransactions(txRes.data?.transactions || []);
      setAssets(assetsRes.data?.assets || []);
      setRealizedGains(gainsRes.data || { byPeriod: [], totals: {} });
    } catch (error) {
      toast.error('Erro ao carregar transações');
      setTransactions([]);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewTransaction = async (e) => {
    e.preventDefault();

    if (!newTransaction.assetId) {
      toast.error('Selecione um ativo');
      return;
    }

    try {
      await assetsService.registerTransaction(newTransaction.assetId, {
        type: newTransaction.type,
        quantity: parseFloat(newTransaction.quantity),
        price: parseFloat(newTransaction.price),
        date: newTransaction.date,
        notes: newTransaction.notes
      });

      toast.success(`${newTransaction.type === 'BUY' ? 'Compra' : 'Venda'} registrada!`);
      setShowNewModal(false);
      setNewTransaction({
        assetId: '',
        type: 'BUY',
        quantity: '',
        price: '',
        date: new Date().toISOString().split('T')[0],
        notes: ''
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao registrar');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const exportCSV = () => {
    const headers = ['Data', 'Ticker', 'Tipo', 'Quantidade', 'Preço', 'Total', 'Lucro Realizado', 'Classe'];
    const rows = transactions.map(t => [
      format(new Date(t.date), 'dd/MM/yyyy'),
      t.ticker,
      t.type === 'BUY' ? 'Compra' : 'Venda',
      t.quantity,
      t.price,
      t.total,
      t.realized_gain || '',
      t.class_name
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacoes-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const totalBuys = transactions
    .filter(t => t.type === 'BUY')
    .reduce((sum, t) => sum + parseFloat(t.total || 0), 0);
  
  const totalSells = transactions
    .filter(t => t.type === 'SELL')
    .reduce((sum, t) => sum + parseFloat(t.total || 0), 0);

  // Preparar dados do gráfico de lucros
  const gainsChartData = (realizedGains.byPeriod || []).map(item => ({
    period: item.period,
    gains: parseFloat(item.total_gains || 0),
    losses: parseFloat(item.total_losses || 0),
    net: parseFloat(item.net_result || 0)
  })).reverse().slice(-12); // Últimos 12 meses

  const totals = realizedGains.totals || {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Transações</h1>
          <p className="text-slate-500 text-sm mt-1">
            Histórico de compras e vendas
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Transação
          </button>
          <button
            onClick={exportCSV}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span className="text-xs text-emerald-400">Compras</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(totalBuys)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-amber-400">Vendas</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(totalSells)}</p>
        </div>
        <div className={`stat-card ${parseFloat(totals.net_result || 0) >= 0 ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/20' : 'bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/20'}`}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className={`w-5 h-5 ${parseFloat(totals.net_result || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`} />
            <span className={`text-xs ${parseFloat(totals.net_result || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>Lucro Realizado</span>
          </div>
          <p className={`text-2xl font-bold ${parseFloat(totals.net_result || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(totals.net_result)}
          </p>
        </div>
        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <span className="text-xs text-blue-400">Total</span>
          </div>
          <p className="text-2xl font-bold text-white">{transactions.length}</p>
        </div>
      </div>

      {/* Realized Gains Chart */}
      {gainsChartData.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Lucros e Prejuízos Realizados (Mensal)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gainsChartData}>
                <XAxis 
                  dataKey="period" 
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickFormatter={(v) => {
                    const [year, month] = v.split('-');
                    return `${month}/${year.slice(2)}`;
                  }}
                />
                <YAxis 
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-800 border border-slate-600 p-3 rounded-lg shadow-xl">
                          <p className="text-slate-400 text-xs mb-2">{label}</p>
                          <p className="text-emerald-400">Ganhos: {formatCurrency(payload[0]?.payload?.gains)}</p>
                          <p className="text-red-400">Perdas: {formatCurrency(payload[0]?.payload?.losses)}</p>
                          <p className={`font-bold mt-1 ${payload[0]?.payload?.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            Líquido: {formatCurrency(payload[0]?.payload?.net)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="net" radius={[4, 4, 0, 0]}>
                  {gainsChartData.map((entry, index) => (
                    <rect 
                      key={`bar-${index}`}
                      fill={entry.net >= 0 ? '#10B981' : '#EF4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-8 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded" />
              <span className="text-slate-400">Total Ganhos: {formatCurrency(totals.total_gains)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded" />
              <span className="text-slate-400">Total Perdas: {formatCurrency(totals.total_losses)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="input w-full sm:w-40"
        >
          <option value="">Todos os tipos</option>
          <option value="BUY">Compras</option>
          <option value="SELL">Vendas</option>
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          className="input w-full sm:w-44"
          placeholder="Data inicial"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          className="input w-full sm:w-44"
          placeholder="Data final"
        />
        {(filters.type || filters.startDate || filters.endDate) && (
          <button
            onClick={() => setFilters({ type: '', startDate: '', endDate: '' })}
            className="btn btn-secondary"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Transactions Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="loader"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-700 bg-slate-800/50">
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Ativo</th>
                  <th className="py-3 px-4">Classe</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-right">Qtd</th>
                  <th className="py-3 px-4 text-right">Preço</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Lucro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4 text-slate-300">
                      {format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-mono font-bold text-emerald-400">{tx.ticker}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[150px]">{tx.asset_name}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-400">{tx.class_name}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        tx.type === 'BUY' 
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {tx.type === 'BUY' ? (
                          <>
                            <TrendingUp className="w-3 h-3" />
                            Compra
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3" />
                            Venda
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {parseFloat(tx.quantity).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      {formatCurrency(tx.price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-white">
                      {formatCurrency(tx.total)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {tx.realized_gain !== null && tx.realized_gain !== undefined ? (
                        <span className={parseFloat(tx.realized_gain) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {formatCurrency(tx.realized_gain)}
                          <span className="text-xs ml-1">
                            ({tx.realized_gain_percent >= 0 ? '+' : ''}{parseFloat(tx.realized_gain_percent || 0).toFixed(1)}%)
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Nenhuma transação encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Transaction Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Nova Transação</h2>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleNewTransaction} className="space-y-4">
              {/* Selecionar Ativo */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Ativo *</label>
                <select
                  value={newTransaction.assetId}
                  onChange={(e) => setNewTransaction({ ...newTransaction, assetId: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">Selecione o ativo...</option>
                  {assets.map(asset => (
                    <option key={asset.id} value={asset.id}>
                      {asset.ticker} - {asset.name || asset.class_name}
                    </option>
                  ))}
                </select>
                {assets.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">
                    Você precisa cadastrar ativos primeiro
                  </p>
                )}
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Tipo de Operação</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'BUY' })}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                      newTransaction.type === 'BUY'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Compra
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTransaction({ ...newTransaction, type: 'SELL' })}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                      newTransaction.type === 'SELL'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <ArrowDownCircle className="w-4 h-4" />
                    Venda
                  </button>
                </div>
              </div>

              {/* Quantidade e Preço */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Quantidade *</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={newTransaction.quantity}
                    onChange={(e) => setNewTransaction({ ...newTransaction, quantity: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Preço Unitário *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newTransaction.price}
                    onChange={(e) => setNewTransaction({ ...newTransaction, price: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>

              {/* Data */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Data</label>
                <input
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                  className="input"
                />
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Notas (opcional)</label>
                <textarea
                  value={newTransaction.notes}
                  onChange={(e) => setNewTransaction({ ...newTransaction, notes: e.target.value })}
                  className="input min-h-[60px] resize-none"
                  placeholder="Observações..."
                />
              </div>

              {/* Total Preview */}
              {newTransaction.quantity && newTransaction.price && (
                <div className="p-4 bg-slate-700/30 rounded-xl">
                  <p className="text-sm text-slate-400">Total da operação</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(parseFloat(newTransaction.quantity) * parseFloat(newTransaction.price))}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary flex-1"
                  disabled={assets.length === 0}
                >
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
