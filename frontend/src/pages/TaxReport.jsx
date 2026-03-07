import React, { useState, useEffect } from 'react';
import { taxReportService, transactionsService } from '../services/api';
import {
  FileText, Calendar, Download, TrendingUp, TrendingDown, AlertCircle,
  ChevronLeft, ChevronRight, DollarSign, Receipt, Building, Filter
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

export default function TaxReport() {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState({});
  const [monthlyGains, setMonthlyGains] = useState([]);
  const [positionDec31, setPositionDec31] = useState([]);

  useEffect(() => {
    loadData();
  }, [year]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reportRes, gainsRes] = await Promise.all([
        taxReportService.getReport(year),
        transactionsService.getRealizedGains({ year, groupBy: 'month' })
      ]);

      setReport(reportRes.data?.report || {});
      setPositionDec31(reportRes.data?.positionDec31 || []);
      setMonthlyGains(gainsRes.data?.byPeriod || []);
    } catch (error) {
      toast.error('Erro ao carregar relatório');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const calculateDARF = (gain) => {
    if (gain <= 0) return 0;
    // Ações/FIIs: 15% sobre lucro (swing trade)
    // Day trade: 20%
    // Isenção: vendas até R$ 20.000/mês em ações
    return gain * 0.15;
  };

  const exportCSV = () => {
    const headers = ['Ticker', 'Classe', 'Quantidade', 'Custo Médio', 'Custo Total', 'Valor Mercado'];
    const rows = positionDec31.map(p => [
      p.ticker,
      p.class_name,
      p.quantity,
      p.average_price,
      p.total_cost,
      p.market_value
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `posicao-31-12-${year}.csv`;
    a.click();
    toast.success('Exportado!');
  };

  const totalGains = parseFloat(report.totalGains || 0);
  const totalLosses = parseFloat(report.totalLosses || 0);
  const netResult = totalGains + totalLosses;
  const estimatedDARF = monthlyGains.reduce((sum, m) => {
    const gain = parseFloat(m.net_result || 0);
    return sum + (gain > 0 ? calculateDARF(gain) : 0);
  }, 0);

  // Dados para gráfico mensal
  const chartData = monthlyGains.map(m => ({
    month: m.period?.slice(5) || '',
    gains: parseFloat(m.total_gains || 0),
    losses: Math.abs(parseFloat(m.total_losses || 0)),
    net: parseFloat(m.net_result || 0)
  }));

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="loader"></div></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-20 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Relatório IR</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Imposto de Renda - Ano {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(year - 1)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-medium min-w-[60px] text-center">{year}</span>
          <button onClick={() => setYear(year + 1)} disabled={year >= new Date().getFullYear()} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg disabled:opacity-30">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] sm:text-xs text-emerald-400">Ganhos</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-emerald-400">{formatCurrency(totalGains)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/20">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-[10px] sm:text-xs text-red-400">Perdas</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-red-400">{formatCurrency(totalLosses)}</p>
        </div>
        <div className={`stat-card ${netResult >= 0 ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20' : 'bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="w-4 h-4" style={{ color: netResult >= 0 ? '#3B82F6' : '#F59E0B' }} />
            <span className="text-[10px] sm:text-xs" style={{ color: netResult >= 0 ? '#3B82F6' : '#F59E0B' }}>Resultado Líquido</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold" style={{ color: netResult >= 0 ? '#3B82F6' : '#F59E0B' }}>{formatCurrency(netResult)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Building className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] sm:text-xs text-purple-400">DARF Estimado</span>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-purple-400">{formatCurrency(estimatedDARF)}</p>
        </div>
      </div>

      {/* Info Alert */}
      <div className="p-3 sm:p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="text-amber-400 font-medium mb-1">Importante</p>
          <p className="text-slate-400 text-xs sm:text-sm">
            Este relatório é apenas informativo. Consulte um contador para declaração oficial do IR. 
            Vendas de ações até R$ 20.000/mês são isentas para pessoas físicas.
          </p>
        </div>
      </div>

      {/* Monthly Chart */}
      <div className="card p-4 sm:p-5">
        <h3 className="font-semibold text-white mb-4 text-sm sm:text-base">Lucros e Prejuízos Mensais</h3>
        <div className="h-48 sm:h-64">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="bg-slate-800 border border-slate-600 p-2 rounded-lg text-xs">
                    <p className="text-slate-400 mb-1">{label}/{year}</p>
                    <p className="text-emerald-400">Ganhos: {formatCurrency(payload[0]?.payload?.gains)}</p>
                    <p className="text-red-400">Perdas: -{formatCurrency(payload[0]?.payload?.losses)}</p>
                    <p className={`font-bold mt-1 ${payload[0]?.payload?.net >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>
                      Líquido: {formatCurrency(payload[0]?.payload?.net)}
                    </p>
                  </div>
                ) : null} />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="gains" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="losses" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Sem operações realizadas em {year}
            </div>
          )}
        </div>
      </div>

      {/* Monthly DARF Table */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white text-sm sm:text-base">DARF Mensal</h3>
          <p className="text-xs text-slate-500">Vencimento: último dia útil do mês seguinte</p>
        </div>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                <th className="pb-2 px-4 sm:px-2">Mês</th>
                <th className="pb-2 px-4 sm:px-2 text-right">Ganhos</th>
                <th className="pb-2 px-4 sm:px-2 text-right">Perdas</th>
                <th className="pb-2 px-4 sm:px-2 text-right">Líquido</th>
                <th className="pb-2 px-4 sm:px-2 text-right">DARF (15%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {monthlyGains.map((m, i) => {
                const net = parseFloat(m.net_result || 0);
                const darf = net > 0 ? calculateDARF(net) : 0;
                return (
                  <tr key={i} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 sm:px-2 text-slate-300">{m.period}</td>
                    <td className="py-2.5 px-4 sm:px-2 text-right text-emerald-400 font-mono">{formatCurrency(m.total_gains)}</td>
                    <td className="py-2.5 px-4 sm:px-2 text-right text-red-400 font-mono">{formatCurrency(m.total_losses)}</td>
                    <td className={`py-2.5 px-4 sm:px-2 text-right font-mono ${net >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>{formatCurrency(net)}</td>
                    <td className="py-2.5 px-4 sm:px-2 text-right font-mono text-purple-400">{darf > 0 ? formatCurrency(darf) : '-'}</td>
                  </tr>
                );
              })}
              {monthlyGains.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">Sem operações em {year}</td>
                </tr>
              )}
            </tbody>
            {monthlyGains.length > 0 && (
              <tfoot className="border-t border-slate-600">
                <tr className="font-medium">
                  <td className="py-3 px-4 sm:px-2 text-white">Total</td>
                  <td className="py-3 px-4 sm:px-2 text-right text-emerald-400 font-mono">{formatCurrency(totalGains)}</td>
                  <td className="py-3 px-4 sm:px-2 text-right text-red-400 font-mono">{formatCurrency(totalLosses)}</td>
                  <td className={`py-3 px-4 sm:px-2 text-right font-mono ${netResult >= 0 ? 'text-blue-400' : 'text-amber-400'}`}>{formatCurrency(netResult)}</td>
                  <td className="py-3 px-4 sm:px-2 text-right text-purple-400 font-mono">{formatCurrency(estimatedDARF)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Position Dec 31 */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white text-sm sm:text-base">
            Posição em 31/12/{year}
          </h3>
          <button onClick={exportCSV} className="btn btn-secondary text-xs flex items-center gap-1.5">
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Use esta posição para declarar na ficha "Bens e Direitos" do IRPF
        </p>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                <th className="pb-2 px-4 sm:px-2">Ativo</th>
                <th className="pb-2 px-4 sm:px-2">Classe</th>
                <th className="pb-2 px-4 sm:px-2 text-right">Qtd</th>
                <th className="pb-2 px-4 sm:px-2 text-right">Custo Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {positionDec31.map((p, i) => (
                <tr key={i} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-4 sm:px-2">
                    <span className="font-mono text-emerald-400">{p.ticker}</span>
                  </td>
                  <td className="py-2.5 px-4 sm:px-2 text-slate-400">{p.class_name}</td>
                  <td className="py-2.5 px-4 sm:px-2 text-right text-slate-300 font-mono">{parseFloat(p.quantity).toLocaleString('pt-BR')}</td>
                  <td className="py-2.5 px-4 sm:px-2 text-right text-white font-mono">{formatCurrency(p.total_cost)}</td>
                </tr>
              ))}
              {positionDec31.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">Sem posição em 31/12/{year}</td>
                </tr>
              )}
            </tbody>
            {positionDec31.length > 0 && (
              <tfoot className="border-t border-slate-600">
                <tr className="font-medium">
                  <td colSpan={3} className="py-3 px-4 sm:px-2 text-white">Total</td>
                  <td className="py-3 px-4 sm:px-2 text-right text-white font-mono">
                    {formatCurrency(positionDec31.reduce((sum, p) => sum + parseFloat(p.total_cost || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
