import React, { useState, useEffect } from 'react';
import { transactionsService, assetsService } from '../services/api';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Plus,
  X,
  DollarSign
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ─── Transaction Modal ────────────────────────────────────────────────────────
function TransactionModal({ onClose, onSuccess }) {
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    assetId: '',
    type: 'BUY',
    quantity: '',
    price: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    notes: ''
  });

  useEffect(() => {
    assetsService.list().then(res => {
      setAssets(res.data.assets || []);
    }).catch(() => {
      toast.error('Erro ao carregar ativos');
    }).finally(() => setLoadingAssets(false));
  }, []);

  const total = form.quantity && form.price
    ? parseFloat(form.quantity) * parseFloat(form.price)
    : 0;

  const selectedAsset = assets.find(a => String(a.id) === String(form.assetId));

  const handleSubmit = async () => {
    if (!form.assetId || !form.quantity || !form.price || !form.date) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (parseFloat(form.quantity) <= 0 || parseFloat(form.price) <= 0) {
      toast.error('Quantidade e preço devem ser maiores que zero');
      return;
    }
    try {
      setSubmitting(true);
      await transactionsService.create({
        assetId: form.assetId,
        type: form.type,
        quantity: parseFloat(form.quantity),
        price: parseFloat(form.price),
        date: form.date,
        notes: form.notes || null
      });
      toast.success(form.type === 'BUY' ? 'Compra registrada com sucesso!' : 'Venda registrada com sucesso!');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao registrar transação');
    } finally {
      setSubmitting(false);
    }
  };

  const isBuy = form.type === 'BUY';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isBuy ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
              {isBuy ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-amber-400" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Nova Transação</h2>
              <p className="text-xs text-slate-500">Registrar compra ou venda</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Type Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800 rounded-xl">
            <button
              onClick={() => setForm(f => ({ ...f, type: 'BUY' }))}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${isBuy ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <TrendingUp className="w-4 h-4" /> Compra
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, type: 'SELL' }))}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${!isBuy ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <TrendingDown className="w-4 h-4" /> Venda
            </button>
          </div>

          {/* Asset */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Ativo *</label>
            {loadingAssets ? (
              <div className="input flex items-center gap-2 text-slate-500 text-sm"><div className="loader w-4 h-4" /> Carregando...</div>
            ) : (
              <select value={form.assetId} onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))} className="input w-full">
                <option value="">Selecione um ativo</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>{a.ticker} — {a.name}</option>
                ))}
              </select>
            )}
            {selectedAsset && !isBuy && (
              <p className="text-xs text-slate-500 mt-1">
                Posição: <span className="text-white font-mono">{parseFloat(selectedAsset.quantity).toLocaleString('pt-BR')}</span> un
                · PM: <span className="text-white font-mono">R$ {parseFloat(selectedAsset.average_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Data *</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="input w-full" />
          </div>

          {/* Qty + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Quantidade *</label>
              <input type="number" min="0" step="1" placeholder="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Preço unitário *</label>
              <input type="number" min="0" step="0.01" placeholder="0,00" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} className="input w-full" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Observações</label>
            <input type="text" placeholder="Opcional" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input w-full" />
          </div>

          {/* Total preview */}
          {total > 0 && (
            <div className={`flex items-center justify-between p-3 rounded-xl border ${isBuy ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
              <span className="text-sm text-slate-400">Total da operação</span>
              <span className="font-bold text-white font-mono">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
              </span>
            </div>
          )}

          {/* Estimated P&L for sells */}
          {!isBuy && selectedAsset && form.price && form.quantity && (() => {
            const avgCost = parseFloat(selectedAsset.average_price);
            const salePrice = parseFloat(form.price);
            const qty = parseFloat(form.quantity);
            const gain = (salePrice - avgCost) * qty;
            const pct = avgCost > 0 ? ((salePrice - avgCost) / avgCost) * 100 : 0;
            const positive = gain >= 0;
            const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
            return (
              <div className={`flex items-center justify-between p-3 rounded-xl border ${positive ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <span className="text-sm text-slate-400">{positive ? 'Lucro estimado' : 'Prejuízo estimado'}</span>
                <div className="text-right">
                  <p className={`font-bold font-mono text-sm ${positive ? 'text-emerald-400' : 'text-red-400'}`}>{positive ? '+' : ''}{fmt(gain)}</p>
                  <p className={`text-xs font-mono ${positive ? 'text-emerald-500' : 'text-red-500'}`}>{positive ? '+' : ''}{pct.toFixed(2)}%</p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="btn btn-secondary flex-1" disabled={submitting}>Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`btn flex-1 flex items-center justify-center gap-2 ${isBuy ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
          >
            {submitting ? <div className="loader w-4 h-4" /> : (
              <>{isBuy ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} {isBuy ? 'Registrar Compra' : 'Registrar Venda'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Transactions() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [realizedGains, setRealizedGains] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({ type: '', startDate: '', endDate: '' });

  useEffect(() => {
    loadTransactions();
    loadRealizedGains();
  }, [filters]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.type) params.type = filters.type;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const response = await transactionsService.list(params);
      setTransactions(response.data.transactions);
    } catch (error) {
      toast.error('Erro ao carregar transações');
    } finally {
      setLoading(false);
    }
  };

  const loadRealizedGains = async () => {
    try {
      const response = await transactionsService.getRealizedGains();
      setRealizedGains(response.data.totals);
    } catch (_) {}
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const exportCSV = () => {
    const headers = ['Data', 'Ticker', 'Tipo', 'Quantidade', 'Preço', 'Total', 'Classe', 'Resultado'];
    const rows = transactions.map(t => [
      format(new Date(t.date), 'dd/MM/yyyy'),
      t.ticker,
      t.type === 'BUY' ? 'Compra' : 'Venda',
      t.quantity, t.price, t.total, t.class_name,
      t.realized_gain != null ? t.realized_gain : ''
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacoes-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const totalBuys = transactions.filter(t => t.type === 'BUY').reduce((s, t) => s + parseFloat(t.total), 0);
  const totalSells = transactions.filter(t => t.type === 'SELL').reduce((s, t) => s + parseFloat(t.total), 0);

  const netResult = realizedGains?.net_result != null
    ? parseFloat(realizedGains.net_result)
    : transactions.filter(t => t.type === 'SELL' && t.realized_gain != null).reduce((s, t) => s + parseFloat(t.realized_gain), 0);

  const isProfit = netResult >= 0;

  return (
    <>
      {showModal && (
        <TransactionModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { loadTransactions(); loadRealizedGains(); }}
        />
      )}

      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Transações</h1>
            <p className="text-slate-500 text-sm mt-1">Histórico de compras e vendas</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={exportCSV} className="btn btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="btn bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Nova Transação
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
          <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              <span className="text-xs text-blue-400">Total</span>
            </div>
            <p className="text-2xl font-bold text-white">{transactions.length}</p>
          </div>

          {/* P&L Card */}
          <div className={`stat-card bg-gradient-to-br border ${isProfit ? 'from-emerald-500/20 to-green-500/10 border-emerald-500/20' : 'from-red-500/20 to-rose-500/10 border-red-500/20'}`}>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className={`w-5 h-5 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`} />
              <span className={`text-xs ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                {isProfit ? 'Lucro Realizado' : 'Prejuízo Realizado'}
              </span>
            </div>
            <p className={`text-2xl font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
              {isProfit ? '+' : ''}{formatCurrency(netResult)}
            </p>
            <p className="text-xs text-slate-500 mt-1">sobre vendas realizadas</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })} className="input w-full sm:w-40">
            <option value="">Todos os tipos</option>
            <option value="BUY">Compras</option>
            <option value="SELL">Vendas</option>
          </select>
          <input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} className="input w-full sm:w-44" />
          <input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} className="input w-full sm:w-44" />
          {(filters.type || filters.startDate || filters.endDate) && (
            <button onClick={() => setFilters({ type: '', startDate: '', endDate: '' })} className="btn btn-secondary">Limpar</button>
          )}
        </div>

        {/* Transactions Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="loader"></div></div>
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
                    <th className="py-3 px-4 text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {transactions.map(tx => {
                    const hasResult = tx.type === 'SELL' && tx.realized_gain != null;
                    const gain = hasResult ? parseFloat(tx.realized_gain) : null;
                    const gainPct = hasResult && tx.realized_gain_percent != null ? parseFloat(tx.realized_gain_percent) : null;
                    const pos = gain != null && gain >= 0;

                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 text-slate-300">{format(new Date(tx.date), 'dd/MM/yyyy', { locale: ptBR })}</td>
                        <td className="py-3 px-4">
                          <p className="font-mono font-bold text-emerald-400">{tx.ticker}</p>
                          <p className="text-xs text-slate-500 truncate max-w-[150px]">{tx.asset_name}</p>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-400">{tx.class_name}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${tx.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {tx.type === 'BUY' ? <><TrendingUp className="w-3 h-3" /> Compra</> : <><TrendingDown className="w-3 h-3" /> Venda</>}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">{parseFloat(tx.quantity).toLocaleString('pt-BR')}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400">{formatCurrency(tx.price)}</td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-white">{formatCurrency(tx.total)}</td>
                        <td className="py-3 px-4 text-right">
                          {hasResult ? (
                            <div>
                              <p className={`font-mono font-medium text-sm ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pos ? '+' : ''}{formatCurrency(gain)}
                              </p>
                              {gainPct != null && (
                                <p className={`text-xs font-mono ${pos ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {pos ? '+' : ''}{gainPct.toFixed(2)}%
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {transactions.length === 0 && (
                    <tr><td colSpan={8} className="py-12 text-center text-slate-500">Nenhuma transação encontrada</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}