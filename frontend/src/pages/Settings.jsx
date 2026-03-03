import React, { useState, useEffect } from 'react';
import { settingsService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  Settings as SettingsIcon,
  Key,
  Save,
  TestTube,
  Download,
  Upload,
  User,
  Shield,
  Sliders,
  CheckCircle,
  XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingApi, setTestingApi] = useState(null);
  const [settings, setSettings] = useState({
    rebalance_threshold: 5,
    investment_horizon: 10,
    risk_profile: 'moderate',
    monthly_contribution: 0,
    brapi_token: '',
    alphavantage_key: ''
  });

  const [apiTestResults, setApiTestResults] = useState({
    brapi: null,
    alphavantage: null
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsService.get();
      setSettings(response.data.settings);
    } catch (error) {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await settingsService.update({
        rebalanceThreshold: parseFloat(settings.rebalance_threshold),
        investmentHorizon: parseInt(settings.investment_horizon),
        riskProfile: settings.risk_profile,
        monthlyContribution: parseFloat(settings.monthly_contribution),
        brapiToken: settings.brapi_token,
        alphavantageKey: settings.alphavantage_key
      });
      toast.success('Configurações salvas!');
    } catch (error) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const testApi = async (api) => {
    setTestingApi(api);
    setApiTestResults(prev => ({ ...prev, [api]: null }));

    try {
      const token = api === 'brapi' ? settings.brapi_token : settings.alphavantage_key;
      const response = await settingsService.testApi(api, token);
      setApiTestResults(prev => ({ ...prev, [api]: response.data }));
      
      if (response.data.success) {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      setApiTestResults(prev => ({ 
        ...prev, 
        [api]: { success: false, message: 'Erro ao testar' }
      }));
      toast.error('Erro ao testar API');
    } finally {
      setTestingApi(null);
    }
  };

  const exportData = async () => {
    try {
      const response = await settingsService.exportData();
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investment-advisor-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      toast.success('Dados exportados!');
    } catch (error) {
      toast.error('Erro ao exportar');
    }
  };

  const importData = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!confirm('Isso irá sobrescrever seus dados atuais. Continuar?')) return;

      await settingsService.importData(data, true);
      toast.success('Dados importados com sucesso!');
      window.location.reload();
    } catch (error) {
      toast.error('Erro ao importar dados');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-slate-500 text-sm mt-1">Personalize o comportamento do app</p>
      </div>

      {/* Profile Section */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-white">Perfil</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Nome</label>
            <input
              type="text"
              value={user?.name || ''}
              disabled
              className="input bg-slate-800/50"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="input bg-slate-800/50"
            />
          </div>
        </div>
      </div>

      {/* Investment Settings */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-white">Parâmetros de Investimento</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Threshold de Rebalanceamento (%)
            </label>
            <input
              type="number"
              step="0.5"
              value={settings.rebalance_threshold}
              onChange={(e) => setSettings({ ...settings, rebalance_threshold: e.target.value })}
              className="input w-32"
            />
            <p className="text-xs text-slate-500 mt-1">
              Alerta quando uma classe desviar mais que este valor do target
            </p>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Horizonte de Investimento (anos)
            </label>
            <input
              type="number"
              value={settings.investment_horizon}
              onChange={(e) => setSettings({ ...settings, investment_horizon: e.target.value })}
              className="input w-32"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Aporte Mensal (R$)
            </label>
            <input
              type="number"
              step="100"
              value={settings.monthly_contribution}
              onChange={(e) => setSettings({ ...settings, monthly_contribution: e.target.value })}
              className="input w-40"
            />
            <p className="text-xs text-slate-500 mt-1">
              Usado nas sugestões de onde aportar
            </p>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Perfil de Risco</label>
            <select
              value={settings.risk_profile}
              onChange={(e) => setSettings({ ...settings, risk_profile: e.target.value })}
              className="input w-48"
            >
              <option value="conservative">Conservador</option>
              <option value="moderate">Moderado</option>
              <option value="aggressive">Agressivo</option>
            </select>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-white">Chaves de API</h2>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Configure suas chaves para buscar cotações automaticamente
        </p>

        <div className="space-y-4">
          {/* Brapi */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Brapi Token (Ativos BR)
              <a 
                href="https://brapi.dev" 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-emerald-400 hover:underline"
              >
                Obter grátis →
              </a>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={settings.brapi_token || ''}
                onChange={(e) => setSettings({ ...settings, brapi_token: e.target.value })}
                className="input flex-1"
                placeholder="Seu token da Brapi"
              />
              <button
                onClick={() => testApi('brapi')}
                disabled={testingApi === 'brapi' || !settings.brapi_token}
                className="btn btn-secondary flex items-center gap-2"
              >
                {testingApi === 'brapi' ? (
                  <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                ) : (
                  <TestTube className="w-4 h-4" />
                )}
                Testar
              </button>
            </div>
            {apiTestResults.brapi && (
              <div className={`mt-2 flex items-center gap-2 text-sm ${
                apiTestResults.brapi.success ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {apiTestResults.brapi.success ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {apiTestResults.brapi.message}
              </div>
            )}
          </div>

          {/* Alpha Vantage */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Alpha Vantage Key (Ativos Globais)
              <a 
                href="https://www.alphavantage.co/support/#api-key" 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-emerald-400 hover:underline"
              >
                Obter grátis →
              </a>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={settings.alphavantage_key || ''}
                onChange={(e) => setSettings({ ...settings, alphavantage_key: e.target.value })}
                className="input flex-1"
                placeholder="Sua API key da Alpha Vantage"
              />
              <button
                onClick={() => testApi('alphavantage')}
                disabled={testingApi === 'alphavantage' || !settings.alphavantage_key}
                className="btn btn-secondary flex items-center gap-2"
              >
                {testingApi === 'alphavantage' ? (
                  <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                ) : (
                  <TestTube className="w-4 h-4" />
                )}
                Testar
              </button>
            </div>
            {apiTestResults.alphavantage && (
              <div className={`mt-2 flex items-center gap-2 text-sm ${
                apiTestResults.alphavantage.success ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {apiTestResults.alphavantage.success ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {apiTestResults.alphavantage.message}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Backup */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-white">Backup de Dados</h2>
        </div>
        <div className="flex gap-3">
          <button onClick={exportData} className="btn btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Exportar Dados
          </button>
          <label className="btn btn-secondary flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            Importar Dados
            <input
              type="file"
              accept=".json"
              onChange={importData}
              className="hidden"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Exporte seus dados para backup ou importe de um backup anterior
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="btn btn-primary flex items-center gap-2"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
