import React, { useState, useEffect } from 'react';
import { screenerService } from '../services/api';
import {
  Search, Filter, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  RefreshCw, ChevronDown, ChevronUp, BarChart3, ArrowRightLeft, Save, X
} from 'lucide-react';
import toast from 'react-hot-toast';

const DEFAULT_FILTERS = {
  plMin: 5,
  plMax: 15,
  pvpMin: 0.7,
  pvpMax: 1.8,
  psrMin: 0.5,
  psrMax: 2,
  dyMin: 4,
  dyMax: null,
  evEbitdaMin: 3,
  evEbitdaMax: 8,
  margemEbitMin: 5,
  margemLiquidaMin: 5,
  liquidezCorrenteMin: 1.5,
  roicMin: 8,
  roeMin: 10,
  dividaPatrimonioMax: 2,
  crescimentoReceitaMin: 10,
  volumeMin: 500000
};

const FILTER_CONFIG = [
  { key: 'pl', label: 'P/L', min: 'plMin', max: 'plMax', step: 0.5 },
  { key: 'pvp', label: 'P/VP', min: 'pvpMin', max: 'pvpMax', step: 0.1 },
  { key: 'psr', label: 'PSR', min: 'psrMin', max: 'psrMax', step: 0.1 },
  { key: 'dy', label: 'Dividend Yield (%)', min: 'dyMin', max: 'dyMax', step: 0.5 },
  { key: 'evEbitda', label: 'EV/EBITDA', min: 'evEbitdaMin', max: 'evEbitdaMax', step: 0.5 },
  { key: 'margemEbit', label: 'Margem EBIT (%)', min: 'margemEbitMin', max: null, step: 1 },
  { key: 'margemLiquida', label: 'Margem Líquida (%)', min: 'margemLiquidaMin', max: null, step: 1 },
  { key: 'liquidezCorrente', label: 'Liquidez Corrente', min: 'liquidezCorrenteMin', max: null, step: 0.1 },
  { key: 'roic', label: 'ROIC (%)', min: 'roicMin', max: null, step: 1 },
  { key: 'roe', label: 'ROE (%)', min: 'roeMin', max: null, step: 1 },
  { key: 'dividaPatrimonio', label: 'Dívida/PL', min: null, max: 'dividaPatrimonioMax', step: 0.1 },
  { key: 'crescimentoReceita', label: 'Cresc. Receita (%)', min: 'crescimentoReceitaMin', max: null, step: 1 },
];

export default function Screener() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('positions'); // 'positions' | 'search'
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState([]);
  const [positionAnalysis, setPositionAnalysis] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [suggestions, setSuggestions] = useState(null);

  useEffect(() => {
    if (activeTab === 'positions') {
      analyzePositions();
    }
  }, []);

  const analyzePositions = async () => {
    try {
      setAnalyzing(true);
      const response = await screenerService.analyzePositions(filters);
      setPositionAnalysis(response.data);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao analisar posições');
    } finally {
      setAnalyzing(false);
    }
  };

  const searchStocks = async () => {
    try {
      setLoading(true);
      const response = await screenerService.search(null, filters);
      setResults(response.data?.results || []);
      toast.success(`${response.data?.passed || 0} ações passaram nos filtros`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao buscar ações');
    } finally {
      setLoading(false);
    }
  };

  const getSuggestions = async (ticker) => {
    try {
      setSelectedStock(ticker);
      const response = await screenerService.getSuggestions(ticker, filters);
      setSuggestions(response.data);
    } catch (error) {
      toast.error('Erro ao buscar sugestões');
    }
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    toast.success('Filtros resetados');
  };

  const formatCurrency = (value) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatNumber = (value, decimals = 2) => {
    if (value === null || value === undefined) return '-';
    return value.toFixed(decimals);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getRecommendationStyle = (action) => {
    switch (action) {
      case 'MANTER':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'COMPRAR':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'AVALIAR_TROCA':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'EVITAR':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-20 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Screener de Ações</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Filtre e analise ações por indicadores fundamentalistas</p>
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button
          onClick={() => setActiveTab('positions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'positions'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Minhas Posições
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'search'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Buscar Ações
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white text-sm sm:text-base">Parâmetros de Filtro</h3>
            <button onClick={resetFilters} className="text-xs text-slate-400 hover:text-white">
              Resetar
            </button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {FILTER_CONFIG.map((config) => (
              <div key={config.key} className="space-y-1">
                <label className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wide">
                  {config.label}
                </label>
                <div className="flex gap-1">
                  {config.min && (
                    <input
                      type="number"
                      step={config.step}
                      value={filters[config.min] || ''}
                      onChange={(e) => setFilters({ ...filters, [config.min]: e.target.value ? parseFloat(e.target.value) : null })}
                      className="input text-xs py-1.5 px-2"
                      placeholder="Min"
                    />
                  )}
                  {config.max && (
                    <input
                      type="number"
                      step={config.step}
                      value={filters[config.max] || ''}
                      onChange={(e) => setFilters({ ...filters, [config.max]: e.target.value ? parseFloat(e.target.value) : null })}
                      className="input text-xs py-1.5 px-2"
                      placeholder="Max"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            {activeTab === 'positions' ? (
              <button
                onClick={analyzePositions}
                disabled={analyzing}
                className="btn btn-primary flex items-center gap-2 text-sm"
              >
                {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                Analisar Posições
              </button>
            ) : (
              <button
                onClick={searchStocks}
                disabled={loading}
                className="btn btn-primary flex items-center gap-2 text-sm"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar Ações
              </button>
            )}
          </div>
        </div>
      )}

      {/* Positions Analysis Tab */}
      {activeTab === 'positions' && (
        <>
          {analyzing ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="loader mx-auto mb-4"></div>
                <p className="text-slate-400">Analisando suas posições...</p>
              </div>
            </div>
          ) : positionAnalysis ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
                  <p className="text-lg sm:text-2xl font-bold text-emerald-400">{positionAnalysis.summary?.manter || 0}</p>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-1">Manter</p>
                </div>
                <div className="stat-card bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20">
                  <p className="text-lg sm:text-2xl font-bold text-amber-400">{positionAnalysis.summary?.avaliarTroca || 0}</p>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-1">Avaliar Troca</p>
                </div>
                <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
                  <p className="text-lg sm:text-2xl font-bold text-blue-400">{positionAnalysis.summary?.totalPositions || 0}</p>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-1">Total Posições</p>
                </div>
                <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
                  <p className="text-lg sm:text-2xl font-bold text-purple-400">{positionAnalysis.summary?.avgQualityScore || 0}%</p>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-1">Score Médio</p>
                </div>
              </div>

              {/* Positions List */}
              <div className="space-y-3">
                {positionAnalysis.analysis?.map((stock) => (
                  <div key={stock.ticker} className="card p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-emerald-400">{stock.ticker}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${getRecommendationStyle(stock.recommendation?.action)}`}>
                            {stock.recommendation?.action === 'MANTER' && 'MANTER'}
                            {stock.recommendation?.action === 'AVALIAR_TROCA' && 'AVALIAR TROCA'}
                          </span>
                          <span className={`text-sm font-bold ${getScoreColor(stock.qualityScore)}`}>
                            {stock.qualityScore}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{stock.name}</p>
                        {stock.recommendation?.reason && (
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            {stock.passFilters ? (
                              <CheckCircle className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                            )}
                            {stock.recommendation.reason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-mono text-white">{formatCurrency(stock.currentValue)}</p>
                          <p className={`text-xs font-mono ${stock.gainPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatPercent(stock.gainPercent)}
                          </p>
                        </div>
                        
                        {stock.recommendation?.action === 'AVALIAR_TROCA' && (
                          <button
                            onClick={() => getSuggestions(stock.ticker)}
                            className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            Sugestões
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Fundamentals Grid */}
                    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2 mt-3 pt-3 border-t border-slate-700">
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">P/L</p>
                        <p className="text-xs font-mono text-slate-300">{formatNumber(stock.fundamentals?.pl)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">P/VP</p>
                        <p className="text-xs font-mono text-slate-300">{formatNumber(stock.fundamentals?.pvp)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">DY</p>
                        <p className="text-xs font-mono text-slate-300">{formatNumber(stock.fundamentals?.dividendYield)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">ROE</p>
                        <p className="text-xs font-mono text-slate-300">{formatNumber(stock.fundamentals?.roe)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">M.Líq</p>
                        <p className="text-xs font-mono text-slate-300">{formatNumber(stock.fundamentals?.margemLiquida)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">EV/EBITDA</p>
                        <p className="text-xs font-mono text-slate-300">{formatNumber(stock.fundamentals?.evEbitda)}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {positionAnalysis.analysis?.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <p>Nenhuma ação brasileira encontrada na carteira</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">Clique em "Analisar Posições" para começar</p>
            </div>
          )}
        </>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="loader mx-auto mb-4"></div>
                <p className="text-slate-400">Buscando ações...</p>
              </div>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              {results.filter(r => r.passFilters).map((stock) => (
                <div key={stock.ticker} className="card p-4 hover:border-slate-600 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-emerald-400">{stock.ticker}</span>
                        <span className={`text-sm font-bold ${getScoreColor(stock.qualityScore)}`}>
                          Score: {stock.qualityScore}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{stock.name}</p>
                      <p className="text-xs text-slate-500">{stock.setor} • {stock.industria}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-white">{formatCurrency(stock.price)}</p>
                      <p className="text-xs text-slate-400">
                        DY: {formatNumber(stock.dividendYield)}%
                      </p>
                    </div>
                  </div>

                  {/* Indicators */}
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mt-3 pt-3 border-t border-slate-700">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">P/L</p>
                      <p className="text-xs font-mono text-slate-300">{formatNumber(stock.pl)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">P/VP</p>
                      <p className="text-xs font-mono text-slate-300">{formatNumber(stock.pvp)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">PSR</p>
                      <p className="text-xs font-mono text-slate-300">{formatNumber(stock.psr)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">ROE</p>
                      <p className="text-xs font-mono text-slate-300">{formatNumber(stock.roe)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">ROIC</p>
                      <p className="text-xs font-mono text-slate-300">{formatNumber(stock.roic)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">M.Líq</p>
                      <p className="text-xs font-mono text-slate-300">{formatNumber(stock.margemLiquida)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">Liq.Cor</p>
                      <p className="text-xs font-mono text-slate-300">{formatNumber(stock.liquidezCorrente)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500">Dív/PL</p>
                      <p className="text-xs font-mono text-slate-300">{formatNumber(stock.dividaPatrimonio)}</p>
                    </div>
                  </div>
                </div>
              ))}

              {results.filter(r => r.passFilters).length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <p>Nenhuma ação passou nos filtros</p>
                  <p className="text-xs mt-1">Tente ajustar os parâmetros</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Search className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">Configure os filtros e clique em "Buscar Ações"</p>
            </div>
          )}
        </>
      )}

      {/* Suggestions Modal */}
      {suggestions && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-5 sm:p-6 w-full sm:max-w-lg rounded-b-none sm:rounded-b-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Sugestões de Troca</h2>
                <p className="text-xs text-slate-400">
                  Substituir {selectedStock} (Score: {suggestions.currentStock?.qualityScore}%)
                </p>
              </div>
              <button
                onClick={() => { setSuggestions(null); setSelectedStock(null); }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {suggestions.suggestions?.length > 0 ? (
              <div className="space-y-3">
                {suggestions.suggestions.map((stock) => (
                  <div key={stock.ticker} className="p-3 bg-slate-800/50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-mono font-bold text-emerald-400">{stock.ticker}</span>
                        <span className={`ml-2 text-sm font-bold ${getScoreColor(stock.qualityScore)}`}>
                          {stock.qualityScore}%
                        </span>
                        <span className="ml-2 text-xs text-emerald-400">
                          (+{stock.scoreDiff} pts)
                        </span>
                      </div>
                      <span className="font-mono text-white">{formatCurrency(stock.price)}</span>
                    </div>
                    <p className="text-xs text-slate-400">{stock.name}</p>
                    <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-slate-700">
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">P/L</p>
                        <p className="text-xs font-mono">{formatNumber(stock.pl)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">DY</p>
                        <p className="text-xs font-mono">{formatNumber(stock.dividendYield)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">ROE</p>
                        <p className="text-xs font-mono">{formatNumber(stock.roe)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-slate-500">M.Líq</p>
                        <p className="text-xs font-mono">{formatNumber(stock.margemLiquida)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-500 py-4">
                Nenhuma ação com score melhor encontrada nos filtros atuais
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
