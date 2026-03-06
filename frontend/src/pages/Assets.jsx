import React, { useState, useEffect } from 'react';
import { assetsService, classesService } from '../services/api';
import {
  Plus, Search, Edit2, Trash2, TrendingUp, TrendingDown, X,
  DollarSign, ShoppingCart, ArrowDownCircle, Landmark, Bitcoin, Building2, Globe
} from 'lucide-react';
import toast from 'react-hot-toast';

const ASSET_TYPES_BY_CATEGORY = {
  fixed_income: {
    label: 'Renda Fixa',
    types: ['CDB', 'LCI', 'LCA', 'Tesouro Selic', 'Tesouro IPCA+', 'Tesouro Prefixado', 'Debênture', 'CRI', 'CRA', 'LC'],
    fields: ['fixedIncomeType', 'indexer', 'rate', 'maturityDate', 'issuer', 'presentValue']
  },
  stocks_br: {
    label: 'Ações BR',
    types: ['Ação', 'Unit', 'BDR'],
    fields: ['sector']
  },
  fiis: {
    label: 'FIIs',
    types: ['Tijolo', 'Papel', 'Híbrido', 'FOF'],
    fields: ['sector']
  },
  stocks_us: {
    label: 'Ações EUA',
    types: ['Stock', 'ETF', 'ADR'],
    fields: ['sector']
  },
  reits: {
    label: 'REITs',
    types: ['Equity REIT', 'Mortgage REIT', 'Hybrid REIT'],
    fields: ['sector']
  },
  crypto: {
    label: 'Cripto',
    types: ['Coin', 'Token', 'Stablecoin', 'DeFi'],
    fields: ['network', 'walletAddress']
  },
  metals: {
    label: 'Metais',
    types: ['Ouro', 'Prata', 'Platina', 'ETF de Metais'],
    fields: ['presentValue']
  },
  etfs: {
    label: 'ETFs',
    types: ['ETF Índice', 'ETF Setorial', 'ETF Smart Beta'],
    fields: ['sector']
  },
  other: {
    label: 'Outros',
    types: ['Outro'],
    fields: ['presentValue']
  }
};

const INDEXERS = ['CDI', 'IPCA', 'Prefixado', 'Selic', 'IGP-M', 'Dólar'];

export default function Assets() {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [transactionAsset, setTransactionAsset] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [formData, setFormData] = useState({
    assetClassId: '',
    ticker: '',
    name: '',
    type: '',
    market: 'BR',
    quantity: '',
    averagePrice: '',
    currentPrice: '',
    notes: '',
    // Renda Fixa
    fixedIncomeType: '',
    indexer: '',
    rate: '',
    maturityDate: '',
    issuer: '',
    // FIIs/Ações
    sector: '',
    // Cripto
    walletAddress: '',
    network: '',
    // Valor presente
    presentValue: ''
  });

  const [transactionData, setTransactionData] = useState({
    type: 'BUY',
    quantity: '',
    price: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, [selectedClass]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsRes, classesRes] = await Promise.all([
        assetsService.list(selectedClass || undefined),
        classesService.list()
      ]);
      setAssets(assetsRes.data?.assets || []);
      setClasses(classesRes.data?.classes || []);
    } catch (error) {
      toast.error('Erro ao carregar ativos');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      assetClassId: '', ticker: '', name: '', type: '', market: 'BR',
      quantity: '', averagePrice: '', currentPrice: '', notes: '',
      fixedIncomeType: '', indexer: '', rate: '', maturityDate: '', issuer: '',
      sector: '', walletAddress: '', network: '', presentValue: ''
    });
    setEditingAsset(null);
    setSelectedCategory(null);
  };

  const handleClassSelect = (classId) => {
    const selectedClassObj = classes.find(c => c.id === parseInt(classId));
    const category = selectedClassObj?.category || 'other';
    setSelectedCategory(category);
    setFormData({ ...formData, assetClassId: classId, type: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const payload = {
        ...formData,
        quantity: parseFloat(formData.quantity) || 0,
        averagePrice: parseFloat(formData.averagePrice) || 0,
        currentPrice: parseFloat(formData.currentPrice) || undefined,
        rate: parseFloat(formData.rate) || undefined,
        presentValue: parseFloat(formData.presentValue) || undefined
      };

      if (editingAsset) {
        await assetsService.update(editingAsset.id, payload);
        toast.success('Ativo atualizado!');
      } else {
        await assetsService.create(payload);
        toast.success('Ativo cadastrado!');
      }
      setShowModal(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao salvar');
    }
  };

  const handleDelete = async (asset) => {
    if (!confirm(`Excluir ${asset.ticker}?`)) return;

    try {
      await assetsService.delete(asset.id);
      toast.success('Ativo excluído');
      loadData();
    } catch (error) {
      toast.error('Erro ao excluir');
    }
  };

  const handleTransaction = async (e) => {
    e.preventDefault();

    try {
      await assetsService.registerTransaction(transactionAsset.id, {
        ...transactionData,
        quantity: parseFloat(transactionData.quantity),
        price: parseFloat(transactionData.price)
      });
      toast.success(`${transactionData.type === 'BUY' ? 'Compra' : 'Venda'} registrada!`);
      setShowTransactionModal(false);
      setTransactionAsset(null);
      setTransactionData({ type: 'BUY', quantity: '', price: '', date: new Date().toISOString().split('T')[0], notes: '' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao registrar');
    }
  };

  const openEdit = (asset) => {
    setEditingAsset(asset);
    const classObj = classes.find(c => c.id === asset.asset_class_id);
    setSelectedCategory(classObj?.category || 'other');
    
    setFormData({
      assetClassId: asset.asset_class_id,
      ticker: asset.ticker,
      name: asset.name || '',
      type: asset.type || '',
      market: asset.market || 'BR',
      quantity: asset.quantity,
      averagePrice: asset.average_price,
      currentPrice: asset.current_price || '',
      notes: asset.notes || '',
      fixedIncomeType: asset.fixed_income_type || '',
      indexer: asset.indexer || '',
      rate: asset.rate || '',
      maturityDate: asset.maturity_date?.split('T')[0] || '',
      issuer: asset.issuer || '',
      sector: asset.sector || '',
      walletAddress: asset.wallet_address || '',
      network: asset.network || '',
      presentValue: asset.present_value || ''
    });
    setShowModal(true);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  const filteredAssets = assets.filter(asset =>
    asset.ticker?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalValue = filteredAssets.reduce((sum, a) => sum + (a.current_value || 0), 0);
  const totalInvested = filteredAssets.reduce((sum, a) => sum + (a.invested_value || 0), 0);

  const getCategoryConfig = () => {
    return ASSET_TYPES_BY_CATEGORY[selectedCategory] || ASSET_TYPES_BY_CATEGORY.other;
  };

  const shouldShowField = (fieldName) => {
    if (!selectedCategory) return false;
    const config = getCategoryConfig();
    return config.fields?.includes(fieldName);
  };

  if (loading && assets.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Meus Ativos</h1>
          <p className="text-slate-500 text-sm mt-1">
            {assets.length} ativo{assets.length !== 1 ? 's' : ''} • {formatCurrency(totalValue)}
          </p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Novo Ativo
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por ticker ou nome..."
            className="input pl-11"
          />
        </div>
        <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="input w-full sm:w-48">
          <option value="">Todas as classes</option>
          {classes.map(cls => (
            <option key={cls.id} value={cls.id}>{cls.name}</option>
          ))}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <p className="text-2xl font-bold text-white">{formatCurrency(totalValue)}</p>
          <p className="text-xs text-slate-400 mt-1">Valor Atual</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <p className="text-2xl font-bold text-blue-400">{formatCurrency(totalInvested)}</p>
          <p className="text-xs text-slate-400 mt-1">Total Investido</p>
        </div>
        <div className={`stat-card ${totalValue >= totalInvested ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/20' : 'bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/20'}`}>
          <p className={`text-2xl font-bold ${totalValue >= totalInvested ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(totalValue - totalInvested)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Resultado</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
          <p className="text-2xl font-bold text-purple-400">{filteredAssets.length}</p>
          <p className="text-xs text-slate-400 mt-1">Ativos</p>
        </div>
      </div>

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredAssets.map((asset) => (
          <div key={asset.id} className="card p-4 hover:border-slate-600 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: asset.class_color || '#3B82F6' }} />
                  <span className="font-mono font-bold text-lg text-emerald-400">{asset.ticker}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">{asset.market}</span>
                </div>
                <p className="text-sm text-slate-400 mt-1 truncate max-w-[200px]">{asset.name || asset.class_name}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(asset)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(asset)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Quantidade</span>
                <span className="text-white font-mono">{parseFloat(asset.quantity).toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">PM</span>
                <span className="text-white font-mono">{formatCurrency(asset.average_price)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Cotação</span>
                <span className="text-white font-mono">{formatCurrency(asset.current_price)}</span>
              </div>
              {asset.present_value && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Valor Presente</span>
                  <span className="text-amber-400 font-mono">{formatCurrency(asset.present_value)}</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-700">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-slate-500">Valor Total</p>
                  <p className="font-bold text-white">{formatCurrency(asset.current_value)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Resultado</p>
                  <p className={`font-bold ${(asset.gain_percentage || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(asset.gain_percentage || 0) >= 0 ? '+' : ''}{(asset.gain_percentage || 0).toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => { setTransactionAsset(asset); setShowTransactionModal(true); }}
              className="w-full mt-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <DollarSign className="w-4 h-4" />
              Registrar Operação
            </button>
          </div>
        ))}

        {filteredAssets.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500">
            <p>Nenhum ativo encontrado</p>
          </div>
        )}
      </div>

      {/* Asset Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingAsset ? 'Editar Ativo' : 'Novo Ativo'}
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Classe - Primeiro campo */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Classe de Ativo *</label>
                <select
                  value={formData.assetClassId}
                  onChange={(e) => handleClassSelect(e.target.value)}
                  className="input"
                  required
                >
                  <option value="">Selecione a classe...</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>

              {selectedCategory && (
                <>
                  {/* Ticker e Mercado */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Ticker *</label>
                      <input
                        type="text"
                        value={formData.ticker}
                        onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                        className="input"
                        placeholder="Ex: PETR4"
                        required
                        disabled={!!editingAsset}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Mercado</label>
                      <select
                        value={formData.market}
                        onChange={(e) => setFormData({ ...formData, market: e.target.value })}
                        className="input"
                      >
                        <option value="BR">Brasil</option>
                        <option value="US">EUA</option>
                        <option value="CRYPTO">Cripto</option>
                      </select>
                    </div>
                  </div>

                  {/* Tipo do Ativo */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Tipo</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="input"
                    >
                      <option value="">Selecione...</option>
                      {getCategoryConfig().types.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  {/* Nome */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Nome do Ativo</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input"
                      placeholder="Ex: Petrobras PN"
                    />
                  </div>

                  {/* Quantidade e Preço Médio */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Quantidade</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Preço Médio</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.averagePrice}
                        onChange={(e) => setFormData({ ...formData, averagePrice: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>

                  {/* Cotação Atual (edição) */}
                  {editingAsset && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Cotação Atual</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.currentPrice}
                        onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })}
                        className="input"
                      />
                    </div>
                  )}

                  {/* === CAMPOS ESPECÍFICOS POR CATEGORIA === */}

                  {/* Renda Fixa */}
                  {shouldShowField('fixedIncomeType') && (
                    <div className="p-4 bg-slate-800/50 rounded-xl space-y-4">
                      <h4 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                        <Landmark className="w-4 h-4" /> Dados de Renda Fixa
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-slate-400 mb-2">Indexador</label>
                          <select
                            value={formData.indexer}
                            onChange={(e) => setFormData({ ...formData, indexer: e.target.value })}
                            className="input"
                          >
                            <option value="">Selecione...</option>
                            {INDEXERS.map(idx => (
                              <option key={idx} value={idx}>{idx}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-slate-400 mb-2">Taxa (% a.a.)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.rate}
                            onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                            className="input"
                            placeholder="Ex: 12.5"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-slate-400 mb-2">Vencimento</label>
                          <input
                            type="date"
                            value={formData.maturityDate}
                            onChange={(e) => setFormData({ ...formData, maturityDate: e.target.value })}
                            className="input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-slate-400 mb-2">Emissor</label>
                          <input
                            type="text"
                            value={formData.issuer}
                            onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
                            className="input"
                            placeholder="Ex: Banco XP"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Setor (FIIs, Ações) */}
                  {shouldShowField('sector') && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Setor</label>
                      <input
                        type="text"
                        value={formData.sector}
                        onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                        className="input"
                        placeholder="Ex: Logística, Tecnologia"
                      />
                    </div>
                  )}

                  {/* Cripto */}
                  {shouldShowField('network') && (
                    <div className="p-4 bg-slate-800/50 rounded-xl space-y-4">
                      <h4 className="text-sm font-medium text-orange-400 flex items-center gap-2">
                        <Bitcoin className="w-4 h-4" /> Dados de Cripto
                      </h4>
                      <div>
                        <label className="block text-sm text-slate-400 mb-2">Rede/Blockchain</label>
                        <input
                          type="text"
                          value={formData.network}
                          onChange={(e) => setFormData({ ...formData, network: e.target.value })}
                          className="input"
                          placeholder="Ex: Ethereum, Solana"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 mb-2">Endereço da Carteira</label>
                        <input
                          type="text"
                          value={formData.walletAddress}
                          onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
                          className="input"
                          placeholder="0x..."
                        />
                      </div>
                    </div>
                  )}

                  {/* Valor Presente */}
                  {shouldShowField('presentValue') && (
                    <div className="p-4 bg-slate-800/50 rounded-xl">
                      <label className="block text-sm text-slate-400 mb-2">Valor Presente (Marcação a Mercado)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.presentValue}
                        onChange={(e) => setFormData({ ...formData, presentValue: e.target.value })}
                        className="input"
                        placeholder="Valor atual de mercado"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Use para ativos sem cotação automática (Renda Fixa, Metais físicos)
                      </p>
                    </div>
                  )}

                  {/* Notas */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Notas</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="input min-h-[80px] resize-none"
                      placeholder="Observações..."
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={!selectedCategory}>
                  {editingAsset ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTransactionModal && transactionAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Registrar Operação</h2>
                <p className="text-sm text-emerald-400 font-mono">{transactionAsset.ticker}</p>
              </div>
              <button onClick={() => { setShowTransactionModal(false); setTransactionAsset(null); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransaction} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Tipo de Operação</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTransactionData({ ...transactionData, type: 'BUY' })}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                      transactionData.type === 'BUY'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" /> Compra
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionData({ ...transactionData, type: 'SELL' })}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                      transactionData.type === 'SELL'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <ArrowDownCircle className="w-4 h-4" /> Venda
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Quantidade *</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={transactionData.quantity}
                    onChange={(e) => setTransactionData({ ...transactionData, quantity: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Preço Unitário *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={transactionData.price}
                    onChange={(e) => setTransactionData({ ...transactionData, price: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Data</label>
                <input
                  type="date"
                  value={transactionData.date}
                  onChange={(e) => setTransactionData({ ...transactionData, date: e.target.value })}
                  className="input"
                />
              </div>

              {transactionData.quantity && transactionData.price && (
                <div className="p-4 bg-slate-700/30 rounded-xl">
                  <p className="text-sm text-slate-400">Total da operação</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(parseFloat(transactionData.quantity) * parseFloat(transactionData.price))}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setShowTransactionModal(false); setTransactionAsset(null); }} className="btn btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary flex-1">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
