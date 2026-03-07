import React, { useState, useEffect } from 'react';
import { assetsService, classesService } from '../services/api';
import {
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  TrendingUp,
  TrendingDown,
  X,
  DollarSign,
  ShoppingCart,
  ArrowDownCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

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

  const [formData, setFormData] = useState({
    assetClassId: '',
    ticker: '',
    name: '',
    type: '',
    market: 'BR',
    quantity: '',
    averagePrice: '',
    notes: ''
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
      setAssets(assetsRes.data.assets);
      setClasses(classesRes.data.classes);
    } catch (error) {
      toast.error('Erro ao carregar ativos');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      assetClassId: '',
      ticker: '',
      name: '',
      type: '',
      market: 'BR',
      quantity: '',
      averagePrice: '',
      notes: ''
    });
    setEditingAsset(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingAsset) {
        await assetsService.update(editingAsset.id, {
          assetClassId: formData.assetClassId || undefined,
          name: formData.name,
          type: formData.type,
          notes: formData.notes
        });
        toast.success('Ativo atualizado!');
      } else {
        await assetsService.create({
          ...formData,
          quantity: parseFloat(formData.quantity) || 0,
          averagePrice: parseFloat(formData.averagePrice) || 0
        });
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
    if (!confirm(`Excluir ${asset.ticker}? Esta ação não pode ser desfeita.`)) return;

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
      setTransactionData({
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

  const openEdit = (asset) => {
    setEditingAsset(asset);
    setFormData({
      assetClassId: asset.asset_class_id,
      ticker: asset.ticker,
      name: asset.name || '',
      type: asset.type || '',
      market: asset.market || 'BR',
      quantity: asset.quantity,
      averagePrice: asset.average_price,
      notes: asset.notes || ''
    });
    setShowModal(true);
  };

  const openTransaction = (asset) => {
    setTransactionAsset(asset);
    setShowTransactionModal(true);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const filteredAssets = assets.filter(asset =>
    asset.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalValue = filteredAssets.reduce((sum, a) => sum + (a.current_value || 0), 0);
  const totalInvested = filteredAssets.reduce((sum, a) => sum + (a.invested_value || 0), 0);

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
            {assets.length} ativo{assets.length !== 1 ? 's' : ''} cadastrado{assets.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="btn btn-primary flex items-center gap-2"
        >
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
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="input w-full sm:w-48"
        >
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
        <div className={`stat-card ${totalValue - totalInvested >= 0 
          ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/20'
          : 'bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/20'}`}>
          <p className={`text-2xl font-bold ${totalValue - totalInvested >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(totalValue - totalInvested)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Lucro/Prejuízo</p>
        </div>
        <div className="stat-card bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/20">
          <p className="text-2xl font-bold text-purple-400">{filteredAssets.length}</p>
          <p className="text-xs text-slate-400 mt-1">Ativos Filtrados</p>
        </div>
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
                const gain = (asset.current_value || 0) - (asset.invested_value || 0);
                const gainPercent = asset.invested_value > 0 
                  ? ((gain / asset.invested_value) * 100) 
                  : 0;

                return (
                  <tr key={asset.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-mono font-bold text-emerald-400">{asset.ticker}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[150px]">{asset.name}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: asset.class_color }}
                        />
                        <span className="text-sm text-slate-300">{asset.class_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-300">
                      {parseFloat(asset.quantity).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">
                      {formatCurrency(asset.average_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-white">
                      {formatCurrency(asset.current_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-white">
                      {formatCurrency(asset.current_value)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className={`flex items-center justify-end gap-1 ${gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {gain >= 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        <span className="font-mono">{gainPercent.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openTransaction(asset)}
                          className="p-2 text-emerald-400 hover:bg-emerald-500/20 rounded-lg"
                          title="Registrar transação"
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(asset)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(asset)}
                          className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"
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

      {/* Asset Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingAsset ? 'Editar Ativo' : 'Novo Ativo'}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Ticker *</label>
                  <input
                    type="text"
                    value={formData.ticker}
                    onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                    className="input"
                    placeholder="Ex: PETR4, AAPL"
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
                    disabled={!!editingAsset}
                  >
                    <option value="BR">Brasil</option>
                    <option value="US">EUA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Classe *</label>
                <select
                  value={formData.assetClassId}
                  onChange={(e) => setFormData({ ...formData, assetClassId: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">Selecione...</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>

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

              <div>
                <label className="block text-sm text-slate-400 mb-2">Tipo</label>
                <input
                  type="text"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="input"
                  placeholder="Ex: Ação, FII, ETF, REIT"
                />
              </div>

              {!editingAsset && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Quantidade</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      className="input"
                      placeholder="0"
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
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-2">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input min-h-[80px] resize-none"
                  placeholder="Observações sobre o ativo..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary flex-1">
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
              <button
                onClick={() => { setShowTransactionModal(false); setTransactionAsset(null); }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
              >
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
                    <ShoppingCart className="w-4 h-4" />
                    Compra
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
                    <ArrowDownCircle className="w-4 h-4" />
                    Venda
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
                <button
                  type="button"
                  onClick={() => { setShowTransactionModal(false); setTransactionAsset(null); }}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary flex-1">
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
