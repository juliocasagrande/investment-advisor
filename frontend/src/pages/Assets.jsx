import React, { useState, useEffect } from 'react';
import { assetsService, classesService, transactionsService } from '../services/api';
import { 
  Plus, Search, Edit2, Trash2, TrendingUp, TrendingDown, X, 
  ShoppingCart, RefreshCw, DollarSign, Briefcase, PieChart
} from 'lucide-react';
import toast from 'react-hot-toast';

// Configuração de campos por categoria
const FIELD_CONFIG = {
  fixed_income: {
    label: 'Renda Fixa',
    fields: [
      { name: 'name', label: 'Nome do Título', type: 'text', required: true, placeholder: 'Ex: Tesouro Selic 2029' },
      { name: 'fixedIncomeType', label: 'Tipo', type: 'select', options: ['CDB', 'LCI', 'LCA', 'Tesouro Selic', 'Tesouro IPCA+', 'Tesouro Prefixado', 'Debênture', 'CRI', 'CRA', 'LC', 'Poupança'] },
      { name: 'issuer', label: 'Emissor', type: 'text', placeholder: 'Ex: Banco XYZ' },
      { name: 'indexer', label: 'Indexador', type: 'select', options: ['CDI', 'IPCA', 'Prefixado', 'Selic', 'IGP-M'] },
      { name: 'rate', label: 'Taxa (%)', type: 'number', step: '0.01', placeholder: '12.5' },
      { name: 'maturityDate', label: 'Vencimento', type: 'date' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.01', defaultValue: '1' },
      { name: 'averagePrice', label: 'Valor Aplicado (R$)', type: 'number', step: '0.01', required: true }
    ]
  },
  stocks_br: {
    label: 'Ações BR',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'PETR4', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Petrobras PN' },
      { name: 'sector', label: 'Setor', type: 'text', placeholder: 'Petróleo' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '1', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ],
    market: 'BR'
  },
  stocks_us: {
    label: 'Ações EUA',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'AAPL', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Apple Inc' },
      { name: 'sector', label: 'Setor', type: 'text', placeholder: 'Technology' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.000001', required: true },
      { name: 'averagePrice', label: 'Preço Médio ($)', type: 'number', step: '0.01', required: true }
    ],
    market: 'US'
  },
  fiis: {
    label: 'FIIs',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'HGLG11', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'CSHG Logística' },
      { name: 'sector', label: 'Segmento', type: 'select', options: ['Logística', 'Lajes Corporativas', 'Shopping', 'Papel', 'Híbrido', 'Hotel', 'Educacional', 'Hospital', 'Agro'] },
      { name: 'quantity', label: 'Cotas', type: 'number', step: '1', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ],
    market: 'BR'
  },
  reits: {
    label: 'REITs',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'O', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Realty Income' },
      { name: 'sector', label: 'Segmento', type: 'text', placeholder: 'Triple Net Lease' },
      { name: 'quantity', label: 'Shares', type: 'number', step: '0.000001', required: true },
      { name: 'averagePrice', label: 'Preço Médio ($)', type: 'number', step: '0.01', required: true }
    ],
    market: 'US'
  },
  crypto: {
    label: 'Criptomoedas',
    fields: [
      { name: 'ticker', label: 'Símbolo', type: 'text', required: true, placeholder: 'BTC', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Bitcoin' },
      { name: 'network', label: 'Rede', type: 'text', placeholder: 'Ethereum' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.00000001', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ],
    market: 'CRYPTO'
  },
  metals: {
    label: 'Metais',
    fields: [
      { name: 'name', label: 'Metal', type: 'select', options: ['Ouro', 'Prata', 'Platina', 'Paládio'], required: true },
      { name: 'type', label: 'Forma', type: 'select', options: ['Físico', 'ETF', 'Fundo', 'BDR'] },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.01', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ]
  },
  etfs: {
    label: 'ETFs',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'IVVB11', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'iShares S&P 500' },
      { name: 'type', label: 'Tipo', type: 'select', options: ['Renda Variável', 'Renda Fixa', 'Multimercado', 'Commodities'] },
      { name: 'quantity', label: 'Cotas', type: 'number', step: '1', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ],
    market: 'BR'
  },
  default: {
    label: 'Outro',
    fields: [
      { name: 'ticker', label: 'Código', type: 'text', placeholder: 'Código do ativo' },
      { name: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'Nome do ativo' },
      { name: 'type', label: 'Tipo', type: 'text', placeholder: 'Tipo do ativo' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.01', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ]
  }
};

// Mapeamento de categoria baseado no nome da classe
function getCategoryFromClass(cls) {
  if (!cls) return 'default';
  const name = (cls.name || '').toLowerCase();
  const category = (cls.category || '').toLowerCase();
  
  if (category === 'fixed_income' || name.includes('renda fixa') || name.includes('tesouro') || name.includes('cdb')) return 'fixed_income';
  if (category === 'stocks_br' || (name.includes('ações') && name.includes('br'))) return 'stocks_br';
  if (category === 'stocks_us' || (name.includes('ações') && name.includes('eua'))) return 'stocks_us';
  if (category === 'fiis' || name.includes('fii') || name.includes('imobiliário')) return 'fiis';
  if (category === 'reits' || name.includes('reit')) return 'reits';
  if (category === 'crypto' || name.includes('cripto') || name.includes('crypto')) return 'crypto';
  if (category === 'metals' || name.includes('metal') || name.includes('ouro')) return 'metals';
  if (category === 'etfs' || name.includes('etf')) return 'etfs';
  
  return 'default';
}

export default function Assets() {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [classes, setClasses] = useState([]);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [transactionAsset, setTransactionAsset] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [formData, setFormData] = useState({});
  const [transactionData, setTransactionData] = useState({
    type: 'BUY',
    quantity: '',
    price: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsRes, classesRes] = await Promise.all([
        assetsService.list(),
        classesService.list()
      ]);
      setAssets(assetsRes.data?.assets || []);
      setClasses(classesRes.data?.classes || []);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleClassSelect = (classId) => {
    const cls = classes.find(c => c.id === parseInt(classId));
    const category = getCategoryFromClass(cls);
    setSelectedCategory(category);
    setFormData({ ...formData, assetClassId: classId });
  };

  const currentConfig = FIELD_CONFIG[selectedCategory] || FIELD_CONFIG.default;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        assetClassId: parseInt(formData.assetClassId),
        ticker: formData.ticker?.toUpperCase() || formData.name,
        name: formData.name || formData.ticker,
        type: formData.type || formData.fixedIncomeType || 'Ação',
        market: currentConfig.market || 'BR',
        quantity: parseFloat(formData.quantity) || 1,
        averagePrice: parseFloat(formData.averagePrice) || 0,
        notes: formData.notes || ''
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
    if (!confirm(`Excluir ${asset.ticker || asset.name}?`)) return;
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
      await transactionsService.create({
        assetId: transactionAsset.id,
        type: transactionData.type,
        quantity: parseFloat(transactionData.quantity),
        price: parseFloat(transactionData.price),
        date: transactionData.date
      });
      toast.success('Transação registrada!');
      setShowTransactionModal(false);
      setTransactionData({ type: 'BUY', quantity: '', price: '', date: new Date().toISOString().split('T')[0] });
      loadData();
    } catch (error) {
      toast.error('Erro ao registrar transação');
    }
  };

  const openEdit = (asset) => {
    const cls = classes.find(c => c.id === asset.asset_class_id);
    setSelectedCategory(getCategoryFromClass(cls));
    setEditingAsset(asset);
    setFormData({
      assetClassId: asset.asset_class_id,
      ticker: asset.ticker,
      name: asset.name,
      type: asset.type,
      quantity: asset.quantity,
      averagePrice: asset.average_price,
      notes: asset.notes
    });
    setShowModal(true);
  };

  const openTransaction = (asset) => {
    setTransactionAsset(asset);
    setTransactionData({
      type: 'BUY',
      quantity: '',
      price: asset.current_price || asset.average_price || '',
      date: new Date().toISOString().split('T')[0]
    });
    setShowTransactionModal(true);
  };

  const resetForm = () => {
    setEditingAsset(null);
    setSelectedCategory('');
    setFormData({});
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  const filteredAssets = assets.filter(a => {
    const matchSearch = !search || 
      (a.ticker || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.name || '').toLowerCase().includes(search.toLowerCase());
    const matchClass = !filterClass || a.asset_class_id === parseInt(filterClass);
    return matchSearch && matchClass;
  });

  // Totais
  const totalValue = filteredAssets.reduce((sum, a) => {
    const qty = parseFloat(a.quantity) || 0;
    const price = parseFloat(a.current_price) || parseFloat(a.average_price) || 0;
    return sum + (qty * price);
  }, 0);

  const totalInvested = filteredAssets.reduce((sum, a) => {
    const qty = parseFloat(a.quantity) || 0;
    const avgPrice = parseFloat(a.average_price) || 0;
    return sum + (qty * avgPrice);
  }, 0);

  const totalGain = totalValue - totalInvested;

  const renderField = (field) => {
    const value = formData[field.name] || '';
    
    if (field.type === 'select') {
      return (
        <div key={field.name}>
          <label className="block text-sm text-slate-400 mb-2">{field.label}{field.required && ' *'}</label>
          <select
            value={value}
            onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
            className="input"
            required={field.required}
          >
            <option value="">Selecione...</option>
            {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
      );
    }

    return (
      <div key={field.name}>
        <label className="block text-sm text-slate-400 mb-2">{field.label}{field.required && ' *'}</label>
        <input
          type={field.type}
          step={field.step}
          value={value}
          onChange={(e) => setFormData({ 
            ...formData, 
            [field.name]: field.uppercase ? e.target.value.toUpperCase() : e.target.value 
          })}
          className="input"
          placeholder={field.placeholder}
          required={field.required}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Meus Ativos</h1>
          <p className="text-slate-500 text-sm mt-1">{assets.length} ativos cadastrados</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Novo Ativo
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <span className="text-xs text-emerald-400">Valor Atual</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(totalValue)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-5 h-5 text-blue-400" />
            <span className="text-xs text-blue-400">Total Investido</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(totalInvested)}</p>
        </div>
        <div className={`stat-card ${totalGain >= 0 ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/20' : 'bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/20'}`}>
          <div className="flex items-center gap-2 mb-2">
            {totalGain >= 0 ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
            <span className={`text-xs ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>Lucro/Prejuízo</span>
          </div>
          <p className={`text-2xl font-bold ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(totalGain)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <PieChart className="w-5 h-5 text-purple-400" />
            <span className="text-xs text-purple-400">Ativos</span>
          </div>
          <p className="text-2xl font-bold text-white">{filteredAssets.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="input pl-10 w-full"
          />
        </div>
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="input w-full sm:w-48"
        >
          <option value="">Todas as classes</option>
          {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
        </select>
      </div>

      {/* Assets Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700 bg-slate-800/50">
                <th className="py-3 px-4">Ativo</th>
                <th className="py-3 px-4">Classe</th>
                <th className="py-3 px-4 text-right">Qtd</th>
                <th className="py-3 px-4 text-right">PM</th>
                <th className="py-3 px-4 text-right">Cotação</th>
                <th className="py-3 px-4 text-right">Valor</th>
                <th className="py-3 px-4 text-right">Ganho</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredAssets.map(asset => {
                const qty = parseFloat(asset.quantity) || 0;
                const avgPrice = parseFloat(asset.average_price) || 0;
                const currentPrice = parseFloat(asset.current_price) || avgPrice;
                const currentValue = qty * currentPrice;
                const investedValue = qty * avgPrice;
                const gain = currentValue - investedValue;
                const gainPercent = investedValue > 0 ? (gain / investedValue) * 100 : 0;
                const cls = classes.find(c => c.id === asset.asset_class_id);
                
                return (
                  <tr key={asset.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-mono font-bold text-emerald-400">{asset.ticker || asset.name}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[150px]">{asset.name || asset.type}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-400">{cls?.name || '-'}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">{qty.toLocaleString('pt-BR')}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">{formatCurrency(avgPrice)}</td>
                    <td className="py-3 px-4 text-right font-mono text-white">{formatCurrency(currentPrice)}</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-white">{formatCurrency(currentValue)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`inline-flex items-center gap-1 font-mono ${gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {gain >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {gainPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => openTransaction(asset)} 
                          className="p-2 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors"
                          title="Nova transação"
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openEdit(asset)} 
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(asset)} 
                          className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAssets.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Nenhum ativo encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Novo/Editar Ativo */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingAsset ? 'Editar Ativo' : 'Novo Ativo'}
              </h2>
              <button 
                onClick={() => { setShowModal(false); resetForm(); }} 
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Classe *</label>
                <select 
                  value={formData.assetClassId || ''} 
                  onChange={(e) => handleClassSelect(e.target.value)} 
                  className="input" 
                  required 
                  disabled={!!editingAsset}
                >
                  <option value="">Selecione a classe...</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.icon} {cls.name}</option>
                  ))}
                </select>
              </div>
              
              {selectedCategory && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {currentConfig.fields.map(field => renderField(field))}
                  </div>
                  
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Observações</label>
                    <textarea 
                      value={formData.notes || ''} 
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })} 
                      className="input resize-none h-20" 
                      placeholder="Anotações sobre o ativo..."
                    />
                  </div>
                </>
              )}
              
              <div className="flex gap-3 pt-4 border-t border-slate-700">
                <button 
                  type="button" 
                  onClick={() => { setShowModal(false); resetForm(); }} 
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary flex-1"
                  disabled={!selectedCategory}
                >
                  {editingAsset ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Transação */}
      {showTransactionModal && transactionAsset && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                Transação - {transactionAsset.ticker || transactionAsset.name}
              </h2>
              <button 
                onClick={() => setShowTransactionModal(false)} 
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleTransaction} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button 
                  type="button" 
                  onClick={() => setTransactionData({ ...transactionData, type: 'BUY' })} 
                  className={`py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                    transactionData.type === 'BUY' 
                      ? 'bg-emerald-500 text-white' 
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  Compra
                </button>
                <button 
                  type="button" 
                  onClick={() => setTransactionData({ ...transactionData, type: 'SELL' })} 
                  className={`py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                    transactionData.type === 'SELL' 
                      ? 'bg-red-500 text-white' 
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <TrendingDown className="w-4 h-4" />
                  Venda
                </button>
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
                    placeholder="0"
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Preço *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={transactionData.price} 
                    onChange={(e) => setTransactionData({ ...transactionData, price: e.target.value })} 
                    className="input" 
                    placeholder="0,00"
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
                <div className="p-4 bg-slate-800/50 rounded-xl">
                  <p className="text-sm text-slate-400">Total da operação</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(parseFloat(transactionData.quantity) * parseFloat(transactionData.price))}
                  </p>
                </div>
              )}
              
              <div className="flex gap-3 pt-4 border-t border-slate-700">
                <button 
                  type="button" 
                  onClick={() => setShowTransactionModal(false)} 
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary flex-1"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
