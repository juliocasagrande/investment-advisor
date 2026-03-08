import React, { useState, useEffect, useRef } from 'react';
import { screenerService } from '../services/api';
import {
  Search, Filter, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  RefreshCw, ChevronDown, ChevronUp, BarChart3, ArrowRightLeft, X,
  Sparkles, ShieldCheck, Target, Star, Info, ChevronRight, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Filter config ────────────────────────────────────────────────────────────
const DEFAULT_FILTERS = {
  plMin: 5, plMax: 15,
  pvpMin: 0.7, pvpMax: 1.8,
  psrMin: 0.5, psrMax: 2,
  dyMin: 4, dyMax: null,
  evEbitdaMin: 3, evEbitdaMax: 8,
  margemEbitMin: 5, margemEbitMax: null,
  margemLiquidaMin: 5, margemLiquidaMax: null,
  liquidezCorrenteMin: 1.5, liquidezCorrenteMax: null,
  roicMin: 8, roicMax: null,
  roeMin: 10, roeMax: null,
  dividaPatrimonioMin: null, dividaPatrimonioMax: 2,
  crescimentoReceitaMin: 10, crescimentoReceitaMax: null,
};

const FILTER_CONFIG = [
  { label: 'P/L', min: 'plMin', max: 'plMax' },
  { label: 'P/VP', min: 'pvpMin', max: 'pvpMax' },
  { label: 'PSR', min: 'psrMin', max: 'psrMax' },
  { label: 'Dividend Yield (%)', min: 'dyMin', max: 'dyMax' },
  { label: 'EV/EBITDA', min: 'evEbitdaMin', max: 'evEbitdaMax' },
  { label: 'Margem EBIT (%)', min: 'margemEbitMin', max: 'margemEbitMax' },
  { label: 'Margem Líquida (%)', min: 'margemLiquidaMin', max: 'margemLiquidaMax' },
  { label: 'Liquidez Corrente', min: 'liquidezCorrenteMin', max: 'liquidezCorrenteMax' },
  { label: 'ROIC (%)', min: 'roicMin', max: 'roicMax' },
  { label: 'ROE (%)', min: 'roeMin', max: 'roeMax' },
  { label: 'Dívida/PL', min: 'dividaPatrimonioMin', max: 'dividaPatrimonioMax' },
  { label: 'Cresc. Receita (%)', min: 'crescimentoReceitaMin', max: 'crescimentoReceitaMax' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v, d = 2) => v == null ? '—' : Number(v).toFixed(d);
const fmtCur = (v) => v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtPct = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`;

const scoreColor = (s) => {
  if (s == null) return 'text-slate-500';
  if (s >= 70) return 'text-emerald-400';
  if (s >= 50) return 'text-amber-400';
  return 'text-red-400';
};
const scoreBg = (s) => {
  if (s == null) return 'bg-slate-700';
  if (s >= 70) return 'bg-emerald-500';
  if (s >= 50) return 'bg-amber-500';
  return 'bg-red-500';
};
const actionStyle = (a) => {
  switch (a) {
    case 'MANTER': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'COMPRAR': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'AVALIAR_TROCA': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'AVALIAR': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'EVITAR': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
};
const actionLabel = (a) => {
  const labels = { MANTER: 'MANTER', COMPRAR: 'COMPRAR', AVALIAR_TROCA: 'AVALIAR TROCA', AVALIAR: 'AVALIAR', EVITAR: 'EVITAR', ERRO: 'ERRO' };
  return labels[a] || a;
};
const convictionColor = (c) => {
  if (c === 'alta') return 'text-emerald-400';
  if (c === 'media') return 'text-amber-400';
  return 'text-slate-400';
};

// ─── Score Bar Component ───────────────────────────────────────────────────────
function ScoreBar({ score }) {
  if (score == null) return <span className="text-xs text-slate-600">N/D</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBg(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-bold font-mono w-8 text-right ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

// ─── Fundamentals Row ──────────────────────────────────────────────────────────
function FundamentalsRow({ f }) {
  if (!f) return null;
  const items = [
    { label: 'P/L', value: fmt(f.pl, 1) },
    { label: 'P/VP', value: fmt(f.pvp, 2) },
    { label: 'PSR', value: fmt(f.psr, 2) },
    { label: 'DY', value: f.dy != null ? `${fmt(f.dy, 1)}%` : '—' },
    { label: 'ROE', value: f.roe != null ? `${fmt(f.roe, 1)}%` : '—' },
    { label: 'ROIC', value: f.roic != null ? `${fmt(f.roic, 1)}%` : '—' },
    { label: 'M.Líq', value: f.margemLiquida != null ? `${fmt(f.margemLiquida, 1)}%` : '—' },
    { label: 'EV/EBITDA', value: fmt(f.evEbitda, 1) },
    { label: 'Dív/PL', value: fmt(f.dividaPl, 2) },
    { label: 'Liq.Cor', value: fmt(f.liquidezCorrente, 2) },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-slate-700/60">
      {items.map(({ label, value }) => (
        <div key={label} className="text-center min-w-[44px]">
          <p className="text-[9px] text-slate-500 uppercase">{label}</p>
          <p className="text-xs font-mono text-slate-300">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── AI Analysis Card ──────────────────────────────────────────────────────────
function AIAnalysisCard({ aiAnalysis, type }) {
  if (!aiAnalysis) return null;

  if (type === 'search') {
    return (
      <div className="card p-4 border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-transparent">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Análise IA — Recomendações de Compra</h3>
        </div>
        {aiAnalysis.marketComment && (
          <p className="text-xs text-slate-400 mb-3 leading-relaxed">{aiAnalysis.marketComment}</p>
        )}
        {aiAnalysis.topPicks?.length > 0 && (
          <div className="space-y-2">
            {aiAnalysis.topPicks.map((pick, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20 flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-purple-400">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-emerald-400 text-sm">{pick.ticker}</span>
                    <span className={`text-[10px] font-medium ${convictionColor(pick.conviction)}`}>
                      Convicção {pick.conviction}
                    </span>
                    <span className="text-[10px] text-slate-500">{pick.horizon}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{pick.reason}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {aiAnalysis.riskWarning && (
          <p className="text-[10px] text-amber-500/80 mt-3 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {aiAnalysis.riskWarning}
          </p>
        )}
      </div>
    );
  }

  // Portfolio analysis
  return (
    <div className="card p-4 border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-transparent">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-semibold text-white">Parecer IA — Carteira</h3>
        {aiAnalysis.portfolioScore != null && (
          <span className={`ml-auto text-sm font-bold ${scoreColor(aiAnalysis.portfolioScore)}`}>
            {aiAnalysis.portfolioScore}/100
          </span>
        )}
      </div>
      {aiAnalysis.summary && <p className="text-xs text-slate-400 mb-3 leading-relaxed">{aiAnalysis.summary}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {aiAnalysis.strengths?.length > 0 && (
          <div>
            <p className="text-[10px] text-emerald-400 uppercase font-semibold mb-1">Pontos Fortes</p>
            {aiAnalysis.strengths.map((s, i) => (
              <p key={i} className="text-xs text-slate-400 flex items-start gap-1"><CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />{s}</p>
            ))}
          </div>
        )}
        {aiAnalysis.weaknesses?.length > 0 && (
          <div>
            <p className="text-[10px] text-amber-400 uppercase font-semibold mb-1">Pontos de Atenção</p>
            {aiAnalysis.weaknesses.map((s, i) => (
              <p key={i} className="text-xs text-slate-400 flex items-start gap-1"><AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />{s}</p>
            ))}
          </div>
        )}
      </div>
      {aiAnalysis.suggestion && (
        <div className="mt-3 p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-[10px] text-blue-400 uppercase font-semibold mb-1">Sugestão Principal</p>
          <p className="text-xs text-slate-300">{aiAnalysis.suggestion}</p>
        </div>
      )}
    </div>
  );
}

// ─── Stock Detail Modal ────────────────────────────────────────────────────────
function StockDetailModal({ stock, onClose }) {
  if (!stock) return null;
  const f = stock.fundamentals || stock;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        <div className={`h-1 w-full ${scoreBg(stock.qualityScore ?? stock.score)}`} />
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-xl text-emerald-400">{stock.ticker}</span>
                {(stock.recommendation?.action || stock.recommendation) && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${actionStyle(stock.recommendation?.action || stock.recommendation)}`}>
                    {actionLabel(stock.recommendation?.action || stock.recommendation)}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mt-0.5">{stock.name}</p>
              {stock.assetClass && <p className="text-xs text-slate-600 mt-0.5">{stock.assetClass}</p>}
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Preço</p>
              <p className="font-mono font-bold text-white text-sm">{fmtCur(stock.price || stock.currentPrice)}</p>
            </div>
            {(stock.gainPercent != null) && (
              <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">Ganho</p>
                <p className={`font-mono font-bold text-sm ${stock.gainPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtPct(stock.gainPercent)}
                </p>
              </div>
            )}
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Score</p>
              <p className={`font-mono font-bold text-sm ${scoreColor(stock.qualityScore ?? stock.score)}`}>
                {stock.qualityScore ?? stock.score ?? '—'}
              </p>
            </div>
          </div>

          {stock.qualityScore != null || stock.score != null ? (
            <div className="mb-4">
              <ScoreBar score={stock.qualityScore ?? stock.score} />
            </div>
          ) : null}

          {stock.recommendation?.reason && (
            <div className="mb-4 p-3 bg-slate-800/50 rounded-xl flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400">{stock.recommendation.reason}</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              ['P/L', f.pl, 1], ['P/VP', f.pvp, 2], ['PSR', f.psr, 2],
              ['DY (%)', f.dy, 1], ['ROE (%)', f.roe, 1], ['ROIC (%)', f.roic, 1],
              ['M. EBIT (%)', f.margemEbit, 1], ['M. Líquida (%)', f.margemLiquida, 1],
              ['EV/EBITDA', f.evEbitda, 1], ['Liq. Corrente', f.liquidezCorrente, 2],
              ['Dívida/PL', f.dividaPl, 2], ['Cresc. Rec. (%)', f.crescReceita, 1],
            ].map(([label, val, dec]) => (
              <div key={label} className="bg-slate-800/40 rounded-lg p-2">
                <p className="text-[9px] text-slate-500 uppercase">{label}</p>
                <p className="text-sm font-mono text-slate-200">{val != null ? fmt(val, dec) : '—'}</p>
              </div>
            ))}
          </div>

          {stock.quantity && (
            <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <p className="text-xs text-emerald-400 font-semibold mb-2">Sua Posição</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-slate-500">Qtd</p>
                  <p className="text-xs font-mono text-white">{Number(stock.quantity).toLocaleString('pt-BR')}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">PM</p>
                  <p className="text-xs font-mono text-white">{fmtCur(stock.averagePrice)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Valor</p>
                  <p className="text-xs font-mono text-white">{fmtCur(stock.currentValue)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Screener() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('positions');
  const [assetClass, setAssetClass] = useState('stocks');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [positionAnalysis, setPositionAnalysis] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showOnlyPassed, setShowOnlyPassed] = useState(true);

  useEffect(() => {
    analyzePositions();
  }, []);

  const analyzePositions = async () => {
    try {
      setAnalyzing(true);
      setAiAnalysis(null);
      const response = await screenerService.analyzePositions(filters);
      setPositionAnalysis(response.data);
      if (response.data?.aiAnalysis) setAiAnalysis(response.data.aiAnalysis);
    } catch (error) {
      const msg = error.response?.data?.error || 'Erro ao analisar posições';
      toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const searchStocks = async () => {
    try {
      setLoading(true);
      setResults([]);
      setAiAnalysis(null);
      const response = await screenerService.search(null, filters, assetClass);
      // API call passes assetClass via body — need to call directly
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/screener/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ filters, assetClass })
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Erro ao buscar'); return; }
      setResults(data.stocks || []);
      if (data.aiAnalysis) setAiAnalysis(data.aiAnalysis);
      toast.success(`${data.passed || 0} ativo(s) passaram nos filtros`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao buscar ações');
    } finally {
      setLoading(false);
    }
  };

  const getSuggestions = async (ticker) => {
    try {
      setLoadingSuggestions(true);
      setSelectedStock(ticker);
      const response = await screenerService.getSuggestions(null, filters);
      setSuggestions(response.data);
    } catch (error) {
      toast.error('Erro ao buscar sugestões');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const resetFilters = () => { setFilters(DEFAULT_FILTERS); toast.success('Filtros resetados'); };

  const updateFilter = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val === '' ? null : parseFloat(val) }));
  };

  const displayedResults = showOnlyPassed ? results.filter(r => r.passFilters) : results;

  return (
    <>
      {selectedStock != null && (
        <StockDetailModal
          stock={(() => {
            const pos = positionAnalysis?.analysis?.find(a => a.ticker === selectedStock);
            const res = results.find(r => r.ticker === selectedStock);
            return pos || res;
          })()}
          onClose={() => setSelectedStock(null)}
        />
      )}

      <div className="space-y-4 sm:space-y-6 animate-fade-in pb-20 sm:pb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Screener de Ações</h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">Filtre e analise ativos por indicadores fundamentalistas</p>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn btn-secondary flex items-center justify-center gap-2 text-sm"
          >
            <Filter className="w-4 h-4" />
            Filtros
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="card p-4 sm:p-5 border-slate-600">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-sm">Parâmetros de Filtro</h3>
              <button onClick={resetFilters} className="text-xs text-slate-400 hover:text-white transition-colors">Resetar</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {FILTER_CONFIG.map((config) => (
                <div key={config.label} className="space-y-1.5">
                  <label className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide font-medium">
                    {config.label}
                  </label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="number"
                      value={filters[config.min] ?? ''}
                      onChange={e => updateFilter(config.min, e.target.value)}
                      className="input text-xs py-1.5 px-2 flex-1 min-w-0"
                      placeholder="Min"
                    />
                    <span className="text-slate-600 text-xs flex-shrink-0">–</span>
                    <input
                      type="number"
                      value={filters[config.max] ?? ''}
                      onChange={e => updateFilter(config.max, e.target.value)}
                      className="input text-xs py-1.5 px-2 flex-1 min-w-0"
                      placeholder="Max"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-700 pb-0">
          {[
            { id: 'positions', label: 'Minhas Posições', icon: BarChart3 },
            { id: 'search', label: 'Buscar Ativos', icon: Search },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── POSITIONS TAB ── */}
        {activeTab === 'positions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Análise fundamentalista das suas posições em ações BR</p>
              <button
                onClick={analyzePositions}
                disabled={analyzing}
                className="btn btn-secondary flex items-center gap-2 text-xs"
              >
                {analyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Reanalisar
              </button>
            </div>

            {analyzing ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="loader mx-auto mb-4" />
                  <p className="text-slate-400 text-sm">Buscando dados e analisando posições...</p>
                  <p className="text-slate-600 text-xs mt-1">Isso pode levar alguns segundos</p>
                </div>
              </div>
            ) : positionAnalysis ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
                    <p className={`text-2xl font-bold text-emerald-400`}>{positionAnalysis.summary?.manter ?? 0}</p>
                    <p className="text-xs text-slate-400 mt-1">Manter</p>
                  </div>
                  <div className="stat-card bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20">
                    <p className={`text-2xl font-bold text-amber-400`}>{positionAnalysis.summary?.avaliarTroca ?? 0}</p>
                    <p className="text-xs text-slate-400 mt-1">Avaliar Troca</p>
                  </div>
                  <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
                    <p className={`text-2xl font-bold text-blue-400`}>{positionAnalysis.summary?.totalPositions ?? 0}</p>
                    <p className="text-xs text-slate-400 mt-1">Total Posições</p>
                  </div>
                  <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
                    <p className={`text-2xl font-bold ${scoreColor(positionAnalysis.summary?.avgQualityScore)}`}>
                      {positionAnalysis.summary?.avgQualityScore ?? 0}%
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Score Médio</p>
                  </div>
                </div>

                {/* AI Analysis */}
                {aiAnalysis && <AIAnalysisCard aiAnalysis={aiAnalysis} type="portfolio" />}

                {/* Positions list */}
                <div className="space-y-2">
                  {positionAnalysis.analysis?.map(stock => (
                    <div
                      key={stock.ticker}
                      className="card p-4 hover:border-slate-600 transition-colors cursor-pointer"
                      onClick={() => setSelectedStock(stock.ticker)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono font-bold text-emerald-400">{stock.ticker}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${actionStyle(stock.recommendation?.action)}`}>
                              {actionLabel(stock.recommendation?.action)}
                            </span>
                            {stock.assetClass && (
                              <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                                {stock.assetClass}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{stock.name}</p>
                          {stock.recommendation?.reason && !stock.noFundamentals && (
                            <p className="text-[10px] text-slate-600 mt-1 flex items-center gap-1">
                              {stock.recommendation.action === 'MANTER'
                                ? <CheckCircle className="w-3 h-3 text-emerald-600" />
                                : <AlertTriangle className="w-3 h-3 text-amber-600" />
                              }
                              {stock.recommendation.reason}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-mono text-white">{fmtCur(stock.currentValue)}</p>
                            {stock.gainPercent != null && (
                              <p className={`text-xs font-mono ${stock.gainPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {fmtPct(stock.gainPercent)}
                              </p>
                            )}
                          </div>
                          {!stock.noFundamentals && (
                            <div className="w-24">
                              <ScoreBar score={stock.qualityScore} />
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-1">
                            {stock.recommendation?.action === 'AVALIAR_TROCA' && (
                              <button
                                onClick={e => { e.stopPropagation(); getSuggestions(stock.ticker); }}
                                className="btn btn-secondary text-[10px] px-2 py-1 flex items-center gap-1"
                              >
                                <ArrowRightLeft className="w-3 h-3" /> Sugestões
                              </button>
                            )}
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                          </div>
                        </div>
                      </div>

                      {!stock.noFundamentals && stock.fundamentals && (
                        <FundamentalsRow f={stock.fundamentals} />
                      )}
                    </div>
                  ))}

                  {positionAnalysis.analysis?.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                      <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>Nenhum ativo encontrado na carteira</p>
                      <p className="text-xs mt-1">Adicione ativos na página de Portfólio</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">Clique em "Reanalisar" para começar</p>
              </div>
            )}
          </div>
        )}

        {/* ── SEARCH TAB ── */}
        {activeTab === 'search' && (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex gap-2">
                {[
                  { id: 'stocks', label: 'Ações BR' },
                  { id: 'fiis', label: 'FIIs' },
                ].map(c => (
                  <button
                    key={c.id}
                    onClick={() => setAssetClass(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      assetClass === c.id
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 sm:ml-auto flex-wrap">
                {results.length > 0 && (
                  <button
                    onClick={() => setShowOnlyPassed(!showOnlyPassed)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                      showOnlyPassed
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    {showOnlyPassed ? `Passaram (${results.filter(r => r.passFilters).length})` : `Todos (${results.length})`}
                  </button>
                )}
                <button
                  onClick={searchStocks}
                  disabled={loading}
                  className="btn btn-primary flex items-center gap-2 text-sm"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Buscar {assetClass === 'fiis' ? 'FIIs' : 'Ações'}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="loader mx-auto mb-4" />
                  <p className="text-slate-400 text-sm">Buscando e filtrando ativos...</p>
                  <p className="text-slate-600 text-xs mt-1">Analisando {assetClass === 'fiis' ? '20 FIIs' : '48 ações'}</p>
                </div>
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-4">
                {/* AI analysis */}
                {aiAnalysis && <AIAnalysisCard aiAnalysis={aiAnalysis} type="search" />}

                {/* Results */}
                <div className="space-y-2">
                  {displayedResults.map(stock => (
                    <div
                      key={stock.ticker}
                      className={`card p-4 cursor-pointer transition-all hover:border-slate-500 ${
                        !stock.passFilters ? 'opacity-50' : ''
                      }`}
                      onClick={() => setSelectedStock(stock.ticker)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono font-bold text-emerald-400">{stock.ticker}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${actionStyle(stock.recommendation)}`}>
                              {stock.recommendation}
                            </span>
                            {stock.passFilters && (
                              <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
                                <CheckCircle className="w-3 h-3" /> Passou
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{stock.name}</p>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <p className="font-mono font-bold text-white text-sm">{fmtCur(stock.price)}</p>
                          {stock.change != null && (
                            <p className={`text-xs font-mono ${stock.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {fmtPct(stock.change)}
                            </p>
                          )}
                          <div className="w-24">
                            <ScoreBar score={stock.score} />
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 mt-1" />
                        </div>
                      </div>

                      <FundamentalsRow f={stock} />
                    </div>
                  ))}

                  {displayedResults.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                      <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>Nenhum ativo passou nos filtros</p>
                      <p className="text-xs mt-1">Tente ajustar os parâmetros</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Search className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">Configure os filtros e clique em "Buscar"</p>
                <p className="text-xs text-slate-600 mt-1">Requer token Brapi configurado nas Configurações</p>
              </div>
            )}
          </div>
        )}

        {/* Suggestions Modal */}
        {(suggestions || loadingSuggestions) && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="card p-5 sm:p-6 w-full sm:max-w-lg rounded-b-none sm:rounded-b-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">Sugestões de Troca</h2>
                  {selectedStock && <p className="text-xs text-slate-400">Para substituir {selectedStock}</p>}
                </div>
                <button
                  onClick={() => { setSuggestions(null); setSelectedStock(null); }}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {loadingSuggestions ? (
                <div className="flex items-center justify-center py-8"><div className="loader" /></div>
              ) : suggestions?.suggestions?.length > 0 ? (
                <div className="space-y-3">
                  {suggestions.suggestions.map((stock) => (
                    <div key={stock.ticker} className="p-3 bg-slate-800/50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-400">{stock.ticker}</span>
                          <span className={`text-sm font-bold ${scoreColor(stock.score)}`}>{stock.score}</span>
                        </div>
                        <span className="font-mono text-white text-sm">{fmtCur(stock.price)}</span>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">{stock.name}</p>
                      <FundamentalsRow f={stock} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-500 py-6 text-sm">
                  Nenhuma ação com score melhor encontrada nos filtros atuais
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}