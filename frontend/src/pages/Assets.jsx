import React, { useState, useEffect } from 'react';
import { assetsService, classesService } from '../services/api';
import { Plus, Search, Edit2, Trash2, TrendingUp, TrendingDown, X, ShoppingCart } from 'lucide-react';
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
      { name: 'walletAddress', label: 'Carteira', type: 'text', placeholder: 'Endereço (opcional)' },
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
  pension: {
    label: 'Previdência',
    fields: [
      { name: 'name', label: 'Nome do Plano', type: 'text', required: true, placeholder: 'Previdência XYZ' },
      { name: 'type', label: 'Tipo', type: 'select', options: ['PGBL', 'VGBL'], required: true },
      { name: 'issuer', label: 'Instituição', type: 'text', placeholder: 'Bradesco Seguros' },
      { name: 'quantity', label: 'Cotas', type: 'number', step: '0.000001', defaultValue: '1' },
      { name: 'averagePrice', label: 'Valor Aplicado (R$)', type: 'number', step: '0.01', required: true }
    ]
  },
  international: {
    label: 'Internacional',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'VT', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Vanguard Total World' },
      { name: 'type', label: 'Tipo', type: 'select', options: ['ETF', 'Stock', 'BDR', 'Fundo'] },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.000001', required: true },
      { name: 'averagePrice', label: 'Preço Médio ($)', type: 'number', step: '0.01', required: true }
    ],
    market: 'US'
  },
  cash: {
    label: 'Caixa',
    fields: [
      { name: 'name', label: 'Descrição', type: 'text', required: true, placeholder: 'Reserva de Emergência' },
      { name: 'issuer', label: 'Onde está', type: 'text', placeholder: 'NuBank' },
      { name: 'quantity', label: 'Unidades', type: 'number', step: '1', defaultValue: '1' },
      { name: 'averagePrice', label: 'Valor (R$)', type: 'number', step: '0.01', required: true }
    ]
  },
  default: {
    label: 'Outro',
    fields: [
      { name: 'ticker', label: 'Código', type: 'text', placeholder: 'Código', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'Nome do ativo' },
      { name: 'type', label: 'Tipo', type: 'text', placeholder: 'Tipo' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.000001', required: true },
      { name: 'averagePrice', label: 'Preço Médio', type: 'number', step: '0.01', required: true }
    ]
  }
};

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
  const [formData, setFormData] = useState({});
  const [transactionData, setTransactionData] = useState({ type: 'BUY', quantity: '', price: '', date: new Date().toISOString().split('T')[0] });

  useEffect(() => { loadData(); }, [selectedClass]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsRes, classesRes] = await Promise.all([
        assetsService.list(selectedClass || undefined),
        classesService.list()
      ]);
      setAssets(assetsRes.data.assets || []);
      setClasses(classesRes.data.classes || []);
    } catch (error) {
      toast.error('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({});
    setEditingAsset(null);
    setSelectedCategory(null);
  };

  const handleClassSelect = (classId) => {
    const cls = classes.find(c => c.id === parseInt(classId));
    const category = cls?.category || 'default';
    setSelectedCategory(category);
    const config = FIELD_CONFIG[category] || FIELD_CONFIG.default;
    setFormData({ assetClassId: classId, market: config.market || 'BR' });
  };

  const handleFieldChange = (name, value, field) => {
    setFormData(prev => ({ ...prev, [name]: field?.uppercase ? value.toUpperCase() : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (payload.quantity) payload.quantity = parseFloat(payload.quantity) || 0;
      if (payload.averagePrice) payload.averagePrice = parseFloat(payload.averagePrice) || 0;
      if (payload.rate) payload.rate = parseFloat(payload.rate) || 0;
      if (!payload.ticker && payload.name) payload.ticker = payload.name.substring(0, 10).toUpperCase().replace(/\s/g, '');

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

  const openEdit = (asset) => {
    const cls = classes.find(c => c.id === asset.asset_class_id);
    setSelectedCategory(cls?.category || 'default');
    setEditingAsset(asset);
    setFormData({
      assetClassId: asset.asset_class_id?.toString() || '',
      ticker: asset.ticker || '', name: asset.name || '', type: asset.type || '',
      market: asset.market || 'BR', quantity: asset.quantity?.toString() || '',
      averagePrice: asset.average_price?.toString() || '', notes: asset.notes || '',
      sector: asset.sector || '', fixedIncomeType: asset.fixed_income_type || '',
      issuer: asset.issuer || '', indexer: asset.indexer || '', rate: asset.rate?.toString() || '',
      maturityDate: asset.maturity_date?.split('T')[0] || '', network: asset.network || '',
      walletAddress: asset.wallet_address || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (asset) => {
    if (!window.confirm(`Excluir ${asset.ticker || asset.name}?`)) return;
    try {
      await assetsService.delete(asset.id);
      toast.success('Excluído!');
      loadData();
    } catch { toast.error('Erro ao excluir'); }
  };

  const openTransaction = (asset) => {
    setTransactionAsset(asset);
    setTransactionData({ type: 'BUY', quantity: '', price: asset.current_price?.toString() || '', date: new Date().toISOString().split('T')[0] });
    setShowTransactionModal(true);
  };

  const handleTransaction = async (e) => {
    e.preventDefault();
    try {
      await assetsService.registerTransaction(transactionAsset.id, {
        ...transactionData, quantity: parseFloat(transactionData.quantity), price: parseFloat(transactionData.price)
      });
      toast.success('Transação registrada!');
      setShowTransactionModal(false);
      loadData();
    } catch { toast.error('Erro ao registrar'); }
  };

  const formatCurrency = (v) => {
    if (v === undefined || v === null || isNaN(v)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  };

  const filteredAssets = assets.filter(a =>
    (a.ticker?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (a.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const totalValue = filteredAssets.reduce((s, a) => s + ((parseFloat(a.quantity) || 0) * (parseFloat(a.current_price) || parseFloat(a.average_price) || 0)), 0);
  const totalInvested = filteredAssets.reduce((s, a) => s + ((parseFloat(a.quantity) || 0) * (parseFloat(a.average_price) || 0)), 0);
  const totalGain = totalValue - totalInvested;

  const currentConfig = FIELD_CONFIG[selectedCategory] || FIELD_CONFIG.default;

  const renderField = (field) => {
    const value = formData[field.name] || '';
    if (field.type === 'select') {
      return (
        <div key={field.name}>
          <label className="block text-sm text-slate-400 mb-2">{field.label} {field.required && '*'}</label>
          <select value={value} onChange={(e) => handleFieldChange(field.name, e.target.value, field)} className="input" required={field.required}>
            <option value="">Selecione...</option>
            {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div key={field.name}>
        <label className="block text-sm text-slate-400 mb-2">{field.label} {field.required && '*'}</label>
        <input type={field.type || 'text'} step={field.step} value={value}
          onChange={(e) => handleFieldChange(field.name, e.target.value, field)}
          className="input" placeholder={field.placeholder} required={field.required}
          disabled={field.name === 'ticker' && !!editingAsset} />
      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div></div>;

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Meus Ativos</h1>
          <p className="text-sm text-slate-400">{assets.length} ativos cadastrados</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="btn-primary flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Novo Ativo
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input pl-10 w-full" />
        </div>
        <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="input w-full sm:w-48">
          <option value="">Todas as classes</option>
          {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500/30">
          <p className="text-xs text-emerald-400 mb-1">Valor Atual</p>
          <p className="text-lg sm:text-xl font-bold text-white">{formatCurrency(totalValue)}</p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
          <p className="text-xs text-blue-400 mb-1">Total Investido</p>
          <p className="text-lg sm:text-xl font-bold text-white">{formatCurrency(totalInvested)}</p>
        </div>
        <div className={`card p-4 bg-gradient-to-br ${totalGain >= 0 ? 'from-green-500/20 to-green-600/10 border-green-500/30' : 'from-red-500/20 to-red-600/10 border-red-500/30'}`}>
          <p className={`text-xs ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'} mb-1`}>Lucro/Prejuízo</p>
          <p className={`text-lg sm:text-xl font-bold ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(totalGain)}</p>
        </div>
        <div className="card p-4 bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
          <p className="text-xs text-purple-400 mb-1">Ativos</p>
          <p className="text-lg sm:text-xl font-bold text-white">{filteredAssets.length}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Ativo</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Classe</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Qtd</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">PM</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Cotação</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Valor</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Ganho</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
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
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: (cls?.color || '#3b82f6') + '30', color: cls?.color || '#3b82f6' }}>
                          {(asset.ticker || asset.name || '??').substring(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-white">{asset.ticker || asset.name}</p>
                          <p className="text-xs text-slate-500">{asset.name || asset.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: (cls?.color || '#3b82f6') + '20', color: cls?.color || '#3b82f6' }}>{cls?.name || '-'}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">{qty.toLocaleString('pt-BR')}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">{formatCurrency(avgPrice)}</td>
                    <td className="py-3 px-4 text-right font-mono text-white">{formatCurrency(currentPrice)}</td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-white">{formatCurrency(currentValue)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className={`flex items-center justify-end gap-1 ${gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {gain >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="font-mono">{gainPercent.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openTransaction(asset)} className="p-2 text-emerald-400 hover:bg-emerald-500/20 rounded-lg"><ShoppingCart className="w-4 h-4" /></button>
                        <button onClick={() => openEdit(asset)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(asset)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAssets.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-slate-500">Nenhum ativo</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dinâmico */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60">
          <div className="card p-5 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingAsset ? 'Editar' : 'Novo'} Ativo
                {selectedCategory && <span className="text-sm font-normal text-slate-400 ml-2">({currentConfig.label})</span>}
              </h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Classe *</label>
                <select value={formData.assetClassId || ''} onChange={(e) => handleClassSelect(e.target.value)} className="input" required disabled={!!editingAsset}>
                  <option value="">Selecione...</option>
                  {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.icon} {cls.name}</option>)}
                </select>
              </div>
              {selectedCategory && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {currentConfig.fields.map(field => renderField(field))}
                </div>
              )}
              {selectedCategory && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Observações</label>
                  <textarea value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input resize-none h-20" />
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={!selectedCategory}>{editingAsset ? 'Salvar' : 'Cadastrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTransactionModal && transactionAsset && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60">
          <div className="card p-5 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Transação - {transactionAsset.ticker || transactionAsset.name}</h2>
              <button onClick={() => setShowTransactionModal(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleTransaction} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setTransactionData({ ...transactionData, type: 'BUY' })} className={`py-3 rounded-xl font-medium ${transactionData.type === 'BUY' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400'}`}>Compra</button>
                <button type="button" onClick={() => setTransactionData({ ...transactionData, type: 'SELL' })} className={`py-3 rounded-xl font-medium ${transactionData.type === 'SELL' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}>Venda</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-slate-400 mb-2">Quantidade</label><input type="number" step="0.000001" value={transactionData.quantity} onChange={(e) => setTransactionData({ ...transactionData, quantity: e.target.value })} className="input" required /></div>
                <div><label className="block text-sm text-slate-400 mb-2">Preço</label><input type="number" step="0.01" value={transactionData.price} onChange={(e) => setTransactionData({ ...transactionData, price: e.target.value })} className="input" required /></div>
              </div>
              <div><label className="block text-sm text-slate-400 mb-2">Data</label><input type="date" value={transactionData.date} onChange={(e) => setTransactionData({ ...transactionData, date: e.target.value })} className="input" /></div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowTransactionModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
