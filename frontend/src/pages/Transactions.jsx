import React, { useState, useEffect } from 'react';
import { transactionsService } from '../services/api';
import {
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

export default function Transactions() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({
    type: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    loadTransactions();
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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const exportCSV = () => {
    const headers = ['Data', 'Ticker', 'Tipo', 'Quantidade', 'Preço', 'Total', 'Classe'];
    const rows = transactions.map(t => [
      format(new Date(t.date), 'dd/MM/yyyy'),
      t.ticker,
      t.type === 'BUY' ? 'Compra' : 'Venda',
      t.quantity,
      t.price,
      t.total,
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
    .reduce((sum, t) => sum + parseFloat(t.total), 0);
  
  const totalSells = transactions
    .filter(t => t.type === 'SELL')
    .reduce((sum, t) => sum + parseFloat(t.total), 0);

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
        <button
          onClick={exportCSV}
          className="btn btn-secondary flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
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
      </div>

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
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      Nenhuma transação encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
