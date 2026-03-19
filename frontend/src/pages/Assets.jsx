import React, { useState, useEffect, useRef } from 'react';
import { assetsService, classesService, transactionsService, currencyService } from '../services/api';
import { 
  Plus, Search, Edit2, Trash2, TrendingUp, TrendingDown, X, 
  ShoppingCart, DollarSign, Briefcase, PieChart, ChevronDown,
  ChevronRight, ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';

const FIELD_CONFIG = {
  fixed_income: {
    label: 'Renda Fixa', icon: '🏦',
    fields: [
      { name: 'name', label: 'Nome do Título', type: 'text', required: true, placeholder: 'Ex: Tesouro Selic 2029' },
      { name: 'fixedIncomeType', label: 'Tipo', type: 'select', options: ['CDB','LCI','LCA','Tesouro Selic','Tesouro IPCA+','Tesouro Prefixado','Debênture','CRI','CRA','LC','Poupança'] },
      { name: 'issuer', label: 'Emissor', type: 'text', placeholder: 'Ex: Banco XYZ' },
      { name: 'indexer', label: 'Indexador', type: 'select', options: ['CDI','IPCA','Prefixado','Selic','IGP-M'] },
      { name: 'rate', label: 'Taxa (%)', type: 'number', step: '0.01', placeholder: '12.5' },
      { name: 'maturityDate', label: 'Vencimento', type: 'date' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.01', defaultValue: '1' },
      { name: 'averagePrice', label: 'Valor Aplicado (R$)', type: 'number', step: '0.01', required: true }
    ]
  },
  stocks_br: {
    label: 'Ações BR', icon: '🇧🇷',
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
    label: 'Ações EUA', icon: '🇺🇸',
    defaultCurrency: 'USD',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'AAPL', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Apple Inc' },
      { name: 'sector', label: 'Setor', type: 'text', placeholder: 'Technology' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.000001', required: true },
      { name: 'averagePrice', label: 'Preço Médio (US$)', type: 'number', step: '0.01', required: true, isCurrencyField: true }
    ],
    market: 'US'
  },
  fiis: {
    label: 'FIIs', icon: '🏢',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'HGLG11', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'CSHG Logística' },
      { name: 'sector', label: 'Segmento', type: 'select', options: ['Logística','Lajes Corporativas','Shopping','Papel','Híbrido','Hotel','Educacional','Hospital','Agro'] },
      { name: 'quantity', label: 'Cotas', type: 'number', step: '1', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ],
    market: 'BR'
  },
  reits: {
    label: 'REITs', icon: '🏠',
    defaultCurrency: 'USD',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'O', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Realty Income' },
      { name: 'sector', label: 'Segmento', type: 'text', placeholder: 'Triple Net Lease' },
      { name: 'quantity', label: 'Shares', type: 'number', step: '0.000001', required: true },
      { name: 'averagePrice', label: 'Preço Médio (US$)', type: 'number', step: '0.01', required: true, isCurrencyField: true }
    ],
    market: 'US'
  },
  crypto: {
    label: 'Criptomoedas', icon: '₿',
    fields: [
      { name: 'ticker', label: 'Símbolo', type: 'text', required: true, placeholder: 'BTC', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Bitcoin' },
      { name: 'network', label: 'Rede/Exchange', type: 'text', placeholder: 'Binance / Ledger' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.00000001', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ],
    market: 'CRYPTO'
  },
  metals: {
    label: 'Metais Preciosos', icon: '🥇',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'GLD, GOLD11, IAU...', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Ex: SPDR Gold Shares' },
      { name: 'type', label: 'Tipo', type: 'select', options: ['ETF','BDR','Fundo','Físico'] },
      { name: 'quantity', label: 'Cotas / Quantidade', type: 'number', step: '0.001', required: true },
      { name: 'averagePrice', label: 'Preço Médio', type: 'number', step: '0.01', required: true, isCurrencyField: true }
    ]
  },
  etfs: {
    label: 'ETFs', icon: '📊',
    fields: [
      { name: 'ticker', label: 'Ticker', type: 'text', required: true, placeholder: 'IVVB11', uppercase: true },
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'iShares S&P 500' },
      { name: 'type', label: 'Tipo', type: 'select', options: ['Renda Variável','Renda Fixa','Multimercado','Commodities'] },
      { name: 'quantity', label: 'Cotas', type: 'number', step: '1', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ],
    market: 'BR'
  },
  default: {
    label: 'Outro', icon: '📁',
    fields: [
      { name: 'ticker', label: 'Código', type: 'text', placeholder: 'Código do ativo' },
      { name: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'Nome do ativo' },
      { name: 'type', label: 'Tipo', type: 'text', placeholder: 'Tipo do ativo' },
      { name: 'quantity', label: 'Quantidade', type: 'number', step: '0.01', required: true },
      { name: 'averagePrice', label: 'Preço Médio (R$)', type: 'number', step: '0.01', required: true }
    ]
  }
};

function getCategoryFromClass(cls) {
  if (!cls) return 'default';
  const name = (cls.name || '').toLowerCase().replace(/^wallet\s*/i, '');
  const category = (cls.category || '').toLowerCase();
  if (category === 'fixed_income' || name.includes('renda fixa') || name.includes('tesouro') || name.includes('cdb')) return 'fixed_income';
  if (category === 'stocks_br' || (name.includes('ações') && (name.includes('br') || name.includes('dividendo')))) return 'stocks_br';
  if (category === 'stocks_us' || (name.includes('ações') && name.includes('eua'))) return 'stocks_us';
  if (category === 'fiis' || name.includes('fii') || name.includes('imobiliário')) return 'fiis';
  if (category === 'reits' || name.includes('reit')) return 'reits';
  if (category === 'crypto' || name.includes('cripto') || name.includes('crypto')) return 'crypto';
  if (category === 'metals' || name.includes('metal') || name.includes('ouro') || name.includes('precioso')) return 'metals';
  if (category === 'etfs' || name.includes('etf')) return 'etfs';
  return 'default';
}

function cleanClassName(name) {
  // Remove qualquer emoji no início (qualquer char fora do ASCII básico seguido de espaço opcional)
  // Depois remove prefixo "Wallet " case-insensitive
  return (name || '')
    .replace(/^[^\w\s]+\s*/u, '')   // remove emoji/símbolos iniciais
    .replace(/^wallet\s*/i, '')      // remove "Wallet "
    .trim();
}

function StyledSelect({ value, onChange, options, placeholder = 'Selecione...', disabled = false, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOpenChange]);

  const handleToggle = () => {
    if (disabled) return;
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  };

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    onOpenChange?.(false);
  };

  const selected = options.find(o => String(o.value) === String(value));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
          disabled
            ? 'bg-slate-800/40 border-slate-700 text-slate-500 cursor-not-allowed'
            : open
            ? 'bg-slate-800 border-emerald-500 text-white shadow-lg shadow-emerald-500/10'
            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`truncate ${selected ? 'text-white' : 'text-slate-500'}`}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-y-auto"
          style={{ zIndex: 99999, maxHeight: '240px' }}
        >
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => handleSelect(opt.value)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                String(opt.value) === String(value)
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span className="flex-1">{opt.label}</span>
              {String(opt.value) === String(value) && <span className="text-emerald-400 text-xs flex-shrink-0">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function groupAssets(assets, classes, usdRate) {
  const groups = {};
  for (const asset of assets) {
    const cls = classes.find(c => c.id === asset.asset_class_id);
    const groupName = cls ? cleanClassName(cls.name) : 'Outros';
    const color = cls?.color || '#3B82F6';
    if (!groups[groupName]) groups[groupName] = { name: groupName, color, assets: [], totalValue: 0 };
    const qty = parseFloat(asset.quantity) || 0;
    const price = parseFloat(asset.current_price) || parseFloat(asset.average_price) || 0;
    // Converte para BRL se necessário
    const priceBrl = (asset.currency === 'USD' && usdRate) ? price * usdRate : price;
    groups[groupName].assets.push(asset);
    groups[groupName].totalValue += qty * priceBrl;
  }
  return Object.values(groups).sort((a, b) => b.totalValue - a.totalValue);
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
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [classSelectOpen, setClassSelectOpen] = useState(false);
  const [usdRate, setUsdRate] = useState(null);
  const [usdRateLoading, setUsdRateLoading] = useState(false);
  const [transactionData, setTransactionData] = useState({
    type: 'BUY', quantity: '', price: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsRes, classesRes] = await Promise.all([assetsService.list(), classesService.list()]);
      const fetchedAssets = assetsRes.data?.assets || [];
      setAssets(fetchedAssets);
      setClasses(classesRes.data?.classes || []);
      // O backend já devolve usdRate junto com os assets — usa direto
      if (assetsRes.data?.usdRate) {
        setUsdRate(assetsRes.data.usdRate);
      } else if (fetchedAssets.some(a => a.currency === 'USD')) {
        // Fallback: busca separado e aguarda antes de liberar o loading
        await fetchUsdRate();
      }
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  };

  const fetchUsdRate = async () => {
    try {
      setUsdRateLoading(true);
      const res = await currencyService.getUsdRate();
      setUsdRate(res.data?.rate || null);
    } catch { /* silencioso */ }
    finally { setUsdRateLoading(false); }
  };

  // Moeda detectada pela categoria selecionada no formulário
  const isUsdCategory = !!(FIELD_CONFIG[selectedCategory]?.defaultCurrency === 'USD');
  const isPensionCategory = selectedCategory === 'pension';
  // Moeda efetiva no formulário (pode ser sobrescrita pelo usuário)
  const formCurrency = formData.currency || (isUsdCategory ? 'USD' : 'BRL');

  const handleClassSelect = (classId) => {
    const cls = classes.find(c => c.id === parseInt(classId));
    const category = getCategoryFromClass(cls);
    const defaultCurrency = FIELD_CONFIG[category]?.defaultCurrency || 'BRL';
    setSelectedCategory(category);
    setFormData({ ...formData, assetClassId: classId, currency: defaultCurrency });
    // Busca cotação do dólar ao selecionar categoria USD
    if (defaultCurrency === 'USD' && !usdRate) fetchUsdRate();
  };

  const currentConfig = FIELD_CONFIG[selectedCategory] || FIELD_CONFIG.default;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const isPension = selectedCategory === 'pension';
      const payload = isPension ? {
        assetClassId: parseInt(formData.assetClassId),
        ticker: 'PREV',
        name: formData.name || 'Previdência Privada',
        type: 'Previdência',
        market: 'BR',
        currency: 'BRL',
        quantity: 1,
        averagePrice: parseFloat(formData.averagePrice) || parseFloat(formData.presentValue) || 0,
        presentValue: parseFloat(formData.presentValue) || 0,
        notes: formData.notes || ''
      } : {
        assetClassId: parseInt(formData.assetClassId),
        ticker: formData.ticker?.toUpperCase() || formData.name,
        name: formData.name || formData.ticker,
        type: formData.type || formData.fixedIncomeType || 'Ação',
        market: currentConfig.market || 'BR',
        currency: formCurrency,
        quantity: parseFloat(formData.quantity) || 1,
        averagePrice: parseFloat(formData.averagePrice) || 0,
        notes: formData.notes || ''
      };
      if (editingAsset) {
        await assetsService.update(editingAsset.id, payload);
        toast.success('Ativo atualizado!');
      } else {
        const res = await assetsService.create(payload);
        if (res.data?.usdRate) setUsdRate(res.data.usdRate);
        toast.success('Ativo cadastrado!');
      }
      setShowModal(false); resetForm(); loadData();
    } catch (error) { toast.error(error.response?.data?.error || 'Erro ao salvar'); }
  };

  const handleDelete = async (asset) => {
    if (!confirm(`Excluir ${asset.ticker || asset.name}?`)) return;
    try { await assetsService.delete(asset.id); toast.success('Ativo excluído'); loadData(); }
    catch { toast.error('Erro ao excluir'); }
  };

  const handleTransaction = async (e) => {
    e.preventDefault();
    try {
      await transactionsService.create({
        assetId: transactionAsset.id, type: transactionData.type,
        quantity: parseFloat(transactionData.quantity),
        price: parseFloat(transactionData.price), date: transactionData.date
      });
      toast.success('Transação registrada!');
      setShowTransactionModal(false);
      setTransactionData({ type: 'BUY', quantity: '', price: '', date: new Date().toISOString().split('T')[0] });
      loadData();
    } catch { toast.error('Erro ao registrar transação'); }
  };

  const openEdit = (asset) => {
    const cls = classes.find(c => c.id === asset.asset_class_id);
    const category = getCategoryFromClass(cls);
    setSelectedCategory(category);
    setEditingAsset(asset);
    setFormData({
      assetClassId: asset.asset_class_id, ticker: asset.ticker, name: asset.name,
      type: asset.type, quantity: asset.quantity, averagePrice: asset.average_price,
      notes: asset.notes, currency: asset.currency || 'BRL',
      // Para previdência: popular o campo de saldo atual
      ...(category === 'pension' && {
        presentValue: asset.present_value || '',
        averagePrice: asset.average_price || ''
      })
    });
    setShowModal(true);
  };

  const openTransaction = (asset) => {
    setTransactionAsset(asset);
    setTransactionData({ type: 'BUY', quantity: '', price: asset.current_price || asset.average_price || '', date: new Date().toISOString().split('T')[0] });
    setShowTransactionModal(true);
  };

  const resetForm = () => { setEditingAsset(null); setSelectedCategory(''); setFormData({}); };
  const toggleGroup = (name) => setCollapsedGroups(prev => ({ ...prev, [name]: !prev[name] }));

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtUsd = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

  // Helper: retorna valor atual em BRL (converte USD se necessário)
  const getAssetValueBrl = (asset) => {
    const qty = parseFloat(asset.quantity) || 0;
    const price = parseFloat(asset.current_price) || parseFloat(asset.average_price) || 0;
    const priceBrl = (asset.currency === 'USD' && usdRate) ? price * usdRate : price;
    return qty * priceBrl;
  };

  // Helper: retorna valor investido em BRL (converte USD se necessário)
  const getAssetInvestedBrl = (asset) => {
    const qty = parseFloat(asset.quantity) || 0;
    const avgPrice = parseFloat(asset.average_price) || 0;
    const avgPriceBrl = (asset.currency === 'USD' && usdRate) ? avgPrice * usdRate : avgPrice;
    return qty * avgPriceBrl;
  };

  const filteredAssets = assets.filter(a => {
    const qty = parseFloat(a.quantity) || 0;
    if (qty <= 0) return false;
    const matchSearch = !search || (a.ticker||'').toLowerCase().includes(search.toLowerCase()) || (a.name||'').toLowerCase().includes(search.toLowerCase());
    const matchClass = !filterClass || a.asset_class_id === parseInt(filterClass);
    return matchSearch && matchClass;
  });

  const totalValue    = filteredAssets.reduce((s, a) => s + getAssetValueBrl(a), 0);
  const totalInvested = filteredAssets.reduce((s, a) => s + getAssetInvestedBrl(a), 0);
  const totalGain = totalValue - totalInvested;

  // Recalcula grupos usando valores em BRL para ordenação correta
  const groups = groupAssets(filteredAssets, classes, usdRate);

  const classOptions = [
    { value: '', label: 'Todas as classes' },
    ...classes.map(c => ({ value: c.id, label: cleanClassName(c.name) }))
  ];
  const classModalOptions = classes.map(c => ({ value: c.id, label: cleanClassName(c.name) }));

  // Preview de conversão no formulário
  const previewBrl = formCurrency === 'USD' && usdRate && formData.averagePrice
    ? parseFloat(formData.averagePrice) * usdRate
    : null;

  const renderField = (field) => {
    const value = formData[field.name] || '';
    if (field.type === 'select') return (
      <div key={field.name}>
        <label className="block text-sm text-slate-400 mb-2">{field.label}{field.required && ' *'}</label>
        <select value={value} onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })} className="input" required={field.required}>
          <option value="">Selecione...</option>
          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    );
    return (
      <div key={field.name}>
        <label className="block text-sm text-slate-400 mb-2">{field.label}{field.required && ' *'}</label>
        <input type={field.type} step={field.step} value={value}
          onChange={(e) => setFormData({ ...formData, [field.name]: field.uppercase ? e.target.value.toUpperCase() : e.target.value })}
          className="input" placeholder={field.placeholder} required={field.required} />
        {/* Preview de conversão ao lado do campo de preço em USD */}
        {field.isCurrencyField && formCurrency === 'USD' && value && usdRate && (
          <p className="text-xs text-blue-400 mt-1 flex items-center gap-1">
            ≈ {fmt(parseFloat(value) * usdRate)} <span className="text-slate-500">(USD × {usdRate.toFixed(4)})</span>
          </p>
        )}
      </div>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Meus Ativos</h1>
          <p className="text-slate-500 text-sm mt-1">{assets.length} ativos cadastrados</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Badge cotação do dólar */}
          {usdRate && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <span className="text-xs text-blue-400 font-mono">US$ 1 = {fmt(usdRate)}</span>
              {usdRateLoading && <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />}
            </div>
          )}
          <button onClick={() => { resetForm(); setShowModal(true); }} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Ativo
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20">
          <div className="flex items-center gap-2 mb-2"><DollarSign className="w-5 h-5 text-emerald-400" /><span className="text-xs text-emerald-400">Valor Atual</span></div>
          <p className="text-2xl font-bold text-white">{fmt(totalValue)}</p>
          <p className="text-xs text-slate-500 mt-1">em BRL</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/20">
          <div className="flex items-center gap-2 mb-2"><Briefcase className="w-5 h-5 text-blue-400" /><span className="text-xs text-blue-400">Total Investido</span></div>
          <p className="text-2xl font-bold text-white">{fmt(totalInvested)}</p>
          <p className="text-xs text-slate-500 mt-1">em BRL</p>
        </div>
        <div className={`stat-card ${totalGain >= 0 ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/20' : 'bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/20'}`}>
          <div className="flex items-center gap-2 mb-2">
            {totalGain >= 0 ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
            <span className={`text-xs ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>Lucro/Prejuízo</span>
          </div>
          <p className={`text-2xl font-bold ${totalGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(totalGain)}</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
          <div className="flex items-center gap-2 mb-2"><PieChart className="w-5 h-5 text-purple-400" /><span className="text-xs text-purple-400">Ativos</span></div>
          <p className="text-2xl font-bold text-white">{filteredAssets.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por ticker ou nome..." className="input pl-10 w-full" />
        </div>
        <div className="sm:w-56">
          <StyledSelect value={filterClass} onChange={(v) => setFilterClass(v)} options={classOptions} placeholder="Todas as classes" />
        </div>
      </div>

      {/* Grouped Table */}
      <div className="space-y-3">
        {groups.length === 0 && <div className="card py-12 text-center text-slate-500">Nenhum ativo encontrado</div>}
        {groups.map(group => {
          const collapsed = collapsedGroups[group.name];
          const groupInvested = group.assets.reduce((s, a) => s + getAssetInvestedBrl(a), 0);
          const groupValue = group.assets.reduce((s, a) => s + getAssetValueBrl(a), 0);
          const groupGain = groupValue - groupInvested;
          const groupGainPct = groupInvested > 0 ? (groupGain / groupInvested) * 100 : 0;

          return (
            <div key={group.name} className="card overflow-hidden">
              <button onClick={() => toggleGroup(group.name)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                  <span className="font-semibold text-white">{group.name}</span>
                  <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{group.assets.length} {group.assets.length === 1 ? 'ativo' : 'ativos'}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-mono font-semibold text-white">{fmt(groupValue)}</p>
                    <p className={`text-xs font-mono ${groupGain >= 0 ? 'text-green-400' : 'text-red-400'}`}>{groupGain >= 0 ? '+' : ''}{groupGainPct.toFixed(1)}%</p>
                  </div>
                  {collapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
                </div>
              </button>

              {!collapsed && (
                <div className="overflow-x-auto border-t border-slate-700/50">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 bg-slate-800/40">
                        <th className="py-2.5 px-5">Ativo</th>
                        <th className="py-2.5 px-4 text-right">Qtd</th>
                        <th className="py-2.5 px-4 text-right">PM</th>
                        <th className="py-2.5 px-4 text-right">Cotação</th>
                        <th className="py-2.5 px-4 text-right">Valor (BRL)</th>
                        <th className="py-2.5 px-4 text-right">Ganho</th>
                        <th className="py-2.5 px-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {group.assets.slice().sort((a, b) => getAssetValueBrl(b) - getAssetValueBrl(a)).map(asset => {
                        const isUsd = asset.currency === 'USD';
                        const qty = parseFloat(asset.quantity) || 0;
                        const avgPriceOrig = parseFloat(asset.average_price) || 0;
                        const currentPriceOrig = parseFloat(asset.current_price) || avgPriceOrig;

                        // Valores em BRL
                        const avgPriceBrl = isUsd && usdRate ? avgPriceOrig * usdRate : avgPriceOrig;
                        const currentPriceBrl = isUsd && usdRate ? currentPriceOrig * usdRate : currentPriceOrig;
                        const currentValueBrl = qty * currentPriceBrl;
                        const investedValueBrl = qty * avgPriceBrl;
                        const gain = currentValueBrl - investedValueBrl;
                        const gainPercent = investedValueBrl > 0 ? (gain / investedValueBrl) * 100 : 0;

                        const isPension = asset.isPension || asset.category === 'pension';
                        return (
                          <tr key={asset.id} className="hover:bg-slate-800/20 transition-colors">
                            <td className="py-3 px-5">
                              <div className="flex items-center gap-2">
                                <p className="font-mono font-bold text-emerald-400">{asset.name || asset.ticker}</p>
                                {isPension && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400 border border-teal-500/30">PREV</span>
                                )}
                                {isUsd && !isPension && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">USD</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 truncate max-w-[160px]">{isPension ? asset.type : (asset.name || asset.type)}</p>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-slate-300">
                              {isPension ? <span className="text-slate-600 text-xs">—</span> : qty.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-slate-400">
                              {isPension
                                ? (avgPriceOrig > 0 ? fmt(avgPriceOrig) : <span className="text-slate-600 text-xs">—</span>)
                                : isUsd ? (
                                <div>
                                  <p>{fmtUsd(avgPriceOrig)}</p>
                                  {usdRate && <p className="text-xs text-slate-600">{fmt(avgPriceBrl)}</p>}
                                </div>
                              ) : fmt(avgPriceOrig)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-white">
                              {isPension
                                ? fmt(parseFloat(asset.present_value) || currentPriceOrig)
                                : isUsd ? (
                                <div>
                                  <p>{fmtUsd(currentPriceOrig)}</p>
                                  {usdRate && <p className="text-xs text-slate-500">{fmt(currentPriceBrl)}</p>}
                                </div>
                              ) : fmt(currentPriceOrig)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm font-medium text-white">{fmt(currentValueBrl)}</td>
                            <td className="py-3 px-4 text-right">
                              {isPension && avgPriceOrig === 0
                                ? <span className="text-slate-600 text-xs">—</span>
                                : <span className={`inline-flex items-center gap-1 text-sm font-mono ${gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {gain >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {gain >= 0 ? '+' : ''}{gainPercent.toFixed(1)}%
                                  </span>
                              }
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openTransaction(asset)} className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors" title="Nova transação"><ShoppingCart className="w-4 h-4" /></button>
                                <button onClick={() => openEdit(asset)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors" title="Editar"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(asset)} className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Novo/Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 w-full max-w-lg rounded-2xl shadow-2xl" style={{ maxHeight: '85vh', overflowY: classSelectOpen ? 'visible' : 'auto', overflowX: 'visible' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">{editingAsset ? 'Editar Ativo' : 'Novo Ativo'}</h2>
              <button onClick={() => { setShowModal(false); resetForm(); setClassSelectOpen(false); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Classe *</label>
                <StyledSelect value={formData.assetClassId || ''} onChange={(v) => handleClassSelect(v)} options={classModalOptions} placeholder="Selecione a classe..." disabled={!!editingAsset} onOpenChange={setClassSelectOpen} />
              </div>

              {selectedCategory && (
                <>
                  {isPensionCategory ? (
                    /* Formulário simplificado para Previdência Privada */
                    <>
                      <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                        <p className="text-xs text-teal-400">🏦 Previdência Privada — insira o saldo atual informado pela seguradora/banco. Este valor não entra no rebalanceamento.</p>
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 mb-2">Nome / Descrição *</label>
                        <input
                          type="text"
                          value={formData.name || ''}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="input"
                          placeholder="Ex: PGBL Bradesco, VGBL XP..."
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 mb-2">Preço Médio (R$) <span className="text-slate-500 text-xs">— valor investido</span></label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.averagePrice || ''}
                          onChange={(e) => setFormData({ ...formData, averagePrice: e.target.value })}
                          className="input"
                          placeholder="Ex: 38000.00"
                        />
                        {formData.averagePrice && parseFloat(formData.averagePrice) > 0 && (
                          <p className="text-xs text-slate-500 mt-1 font-mono">{fmt(parseFloat(formData.averagePrice))}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 mb-2">Valor Atual (R$) *  <span className="text-slate-500 text-xs">— saldo atualizado</span></label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.presentValue || ''}
                          onChange={(e) => setFormData({ ...formData, presentValue: e.target.value })}
                          className="input"
                          placeholder="Ex: 45000.00"
                          required
                        />
                        {formData.presentValue && parseFloat(formData.presentValue) > 0 && (
                          <p className="text-xs text-teal-400 mt-1 font-mono">{fmt(parseFloat(formData.presentValue))}</p>
                        )}
                      </div>
                      {/* Preview de rendimento */}
                      {formData.averagePrice && formData.presentValue &&
                        parseFloat(formData.averagePrice) > 0 && parseFloat(formData.presentValue) > 0 && (() => {
                          const avg = parseFloat(formData.averagePrice);
                          const cur = parseFloat(formData.presentValue);
                          const gain = cur - avg;
                          const pct = (gain / avg) * 100;
                          return (
                            <div className={`col-span-2 flex items-center justify-between px-3 py-2 rounded-xl border text-sm font-mono ${
                              gain >= 0
                                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                              <span>Rendimento</span>
                              <span>{gain >= 0 ? '+' : ''}{fmt(gain)} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)</span>
                            </div>
                          );
                        })()}
                      <div>
                        <label className="block text-sm text-slate-400 mb-2">Observações</label>
                        <textarea value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input resize-none h-16" placeholder="Tipo do plano, seguradora..." />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Seletor de moeda — visível para todas as categorias não-pension */}
                      <div>
                        <label className="block text-sm text-slate-400 mb-2">Moeda da operação</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button"
                            onClick={() => setFormData({ ...formData, currency: 'BRL' })}
                            className={`py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${formCurrency === 'BRL' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            🇧🇷 Real (BRL)
                          </button>
                          <button type="button"
                            onClick={() => { setFormData({ ...formData, currency: 'USD' }); if (!usdRate) fetchUsdRate(); }}
                            className={`py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${formCurrency === 'USD' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            🇺🇸 Dólar (USD)
                          </button>
                        </div>
                        {formCurrency === 'USD' && (
                          <div className="mt-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-between">
                            {usdRateLoading ? (
                              <span className="text-xs text-blue-400 flex items-center gap-2">
                                <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                                Buscando cotação...
                              </span>
                            ) : usdRate ? (
                              <span className="text-xs text-blue-400">
                                Cotação atual: <span className="font-mono font-semibold">US$ 1 = {fmt(usdRate)}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">Cotação não disponível</span>
                            )}
                            <button type="button" onClick={fetchUsdRate} className="text-xs text-blue-400 hover:text-blue-300 underline ml-2">atualizar</button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{currentConfig.fields.map(field => renderField(field))}</div>

                      {formData.quantity && formData.averagePrice && (
                        <div className="p-3 bg-slate-800/50 rounded-xl">
                          {formCurrency === 'USD' && usdRate ? (
                            <>
                              <p className="text-xs text-slate-500 mb-1">Total em dólar</p>
                              <p className="text-lg font-bold font-mono text-white">{fmtUsd(parseFloat(formData.quantity) * parseFloat(formData.averagePrice))}</p>
                              <p className="text-xs text-blue-400 mt-1">≈ {fmt(parseFloat(formData.quantity) * parseFloat(formData.averagePrice) * usdRate)} na cotação de hoje</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-slate-500 mb-1">Total investido</p>
                              <p className="text-lg font-bold font-mono text-white">{fmt(parseFloat(formData.quantity) * parseFloat(formData.averagePrice))}</p>
                            </>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-sm text-slate-400 mb-2">Observações</label>
                        <textarea value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input resize-none h-20" placeholder="Anotações sobre o ativo..." />
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="flex gap-3 pt-4 border-t border-slate-700">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn btn-primary flex-1" disabled={!selectedCategory}>{editingAsset ? 'Salvar' : 'Cadastrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Transação */}
      {showTransactionModal && transactionAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">Transação — <span className="text-emerald-400">{transactionAsset.ticker || transactionAsset.name}</span></h2>
                {transactionAsset.currency === 'USD' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">USD</span>
                )}
              </div>
              <button onClick={() => setShowTransactionModal(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleTransaction} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setTransactionData({ ...transactionData, type: 'BUY' })} className={`py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${transactionData.type === 'BUY' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                  <TrendingUp className="w-4 h-4" /> Compra
                </button>
                <button type="button" onClick={() => setTransactionData({ ...transactionData, type: 'SELL' })} className={`py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${transactionData.type === 'SELL' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                  <TrendingDown className="w-4 h-4" /> Venda
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Quantidade *</label>
                  <input type="number" step="0.000001" value={transactionData.quantity} onChange={(e) => setTransactionData({ ...transactionData, quantity: e.target.value })} className="input" placeholder="0" required />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Preço {transactionAsset.currency === 'USD' ? '(US$)' : '(R$)'} *
                  </label>
                  <input type="number" step="0.01" value={transactionData.price} onChange={(e) => setTransactionData({ ...transactionData, price: e.target.value })} className="input" placeholder="0,00" required />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Data</label>
                <input type="date" value={transactionData.date} onChange={(e) => setTransactionData({ ...transactionData, date: e.target.value })} className="input" />
              </div>
              {transactionData.quantity && transactionData.price && (
                <div className="p-4 bg-slate-800/50 rounded-xl">
                  {transactionAsset.currency === 'USD' ? (
                    <>
                      <p className="text-sm text-slate-400">Total em dólar</p>
                      <p className="text-2xl font-bold text-white">{fmtUsd(parseFloat(transactionData.quantity) * parseFloat(transactionData.price))}</p>
                      {usdRate && (
                        <p className="text-xs text-blue-400 mt-1">≈ {fmt(parseFloat(transactionData.quantity) * parseFloat(transactionData.price) * usdRate)} hoje</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-400">Total da operação</p>
                      <p className="text-2xl font-bold text-white">{fmt(parseFloat(transactionData.quantity) * parseFloat(transactionData.price))}</p>
                    </>
                  )}
                </div>
              )}
              <div className="flex gap-3 pt-4 border-t border-slate-700">
                <button type="button" onClick={() => setShowTransactionModal(false)} className="btn btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn btn-primary flex-1">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}