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
  XCircle,
  Sparkles
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
    alphavantage_key: '',
    groq_api_key: ''
  });

  const [apiTestResults, setApiTestResults] = useState({
    brapi: null,
    alphavantage: null,
    groq: null
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await settingsService.get();
      setSettings(response.data?.settings || {});
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
        alphavantageKey: settings.alphavantage_key,
        grokApiKey: settings.groq_api_key
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
      const token = api === 'brapi' ? settings.brapi_token : 
                    api === 'alphavantage' ? settings.alphavantage_key :
                    settings.groq_api_key;
      const response = await settingsService.testApi(api, token);
      setApiTestResults(prev => ({ ...prev, [api]: response.data }));
      
      if (response.data?.success) {
        toast.success(response.data.message);
      } else {
        toast.error(response.data?.message || 'Erro ao testar');
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
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-3xl pb-20 sm:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Configurações</h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-1">Personalize o comportamento do app</p>
      </div>

      {/* Profile Section */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <User className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
          <h2 className="font-semibold text-white text-sm sm:text-base">Perfil</h2>
        </div>
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="block text-xs sm:text-sm text-slate-400 mb-1.5 sm:mb-2">Nome</label>
            <input
              type="text"
              value={user?.name || ''}
              disabled
              className="input bg-slate-800/50 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-slate-400 mb-1.5 sm:mb-2">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="input bg-slate-800/50 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Investment Settings */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <Sliders className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
          <h2 className="font-semibold text-white text-sm sm:text-base">Parâmetros de Investimento</h2>
        </div>
        <div className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1.5 sm:mb-2">
                Threshold Rebalanceamento (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={settings.rebalance_threshold || 5}
                onChange={(e) => setSettings({ ...settings, rebalance_threshold: e.target.value })}
                className="input text-sm"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1.5 sm:mb-2">
                Horizonte (anos)
              </label>
              <input
                type="number"
                value={settings.investment_horizon || 10}
                onChange={(e) => setSettings({ ...settings, investment_horizon: e.target.value })}
                className="input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1.5 sm:mb-2">
                Aporte Mensal (R$)
              </label>
              <input
                type="number"
                step="100"
                value={settings.monthly_contribution || 0}
                onChange={(e) => setSettings({ ...settings, monthly_contribution: e.target.value })}
                className="input text-sm"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm text-slate-400 mb-1.5 sm:mb-2">Perfil de Risco</label>
              <select
                value={settings.risk_profile || 'moderate'}
                onChange={(e) => setSettings({ ...settings, risk_profile: e.target.value })}
                className="input text-sm"
              >
                <option value="conservative">Conservador</option>
                <option value="moderate">Moderado</option>
                <option value="aggressive">Agressivo</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <Key className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
          <h2 className="font-semibold text-white text-sm sm:text-base">Chaves de API</h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mb-3 sm:mb-4">
          Configure suas chaves para cotações e análises
        </p>

        <div className="space-y-4 sm:space-y-5">
          {/* Brapi */}
          <div>
            <label className="block text-xs sm:text-sm text-slate-400 mb-1.5 sm:mb-2">
              Brapi Token (Ativos BR)
              <a 
                href="https://brapi.dev" 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-emerald-400 hover:underline"
              >
                Obter →
              </a>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={settings.brapi_token || ''}
                onChange={(e) => setSettings({ ...settings, brapi_token: e.target.value })}
                className="input flex-1 text-sm"
                placeholder="Token da Brapi"
              />
              <button
                onClick={() => testApi('brapi')}
                disabled={testingApi === 'brapi' || !settings.brapi_token}
                className="btn btn-secondary px-3 sm:px-4"
              >
                {testingApi === 'brapi' ? (
                  <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                ) : (
                  <TestTube className="w-4 h-4" />
                )}
              </button>
            </div>
            {apiTestResults.brapi && (
              <div className={`mt-2 flex items-center gap-2 text-xs sm:text-sm ${
                apiTestResults.brapi.success ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {apiTestResults.brapi.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {apiTestResults.brapi.message}
              </div>
            )}
          </div>

          {/* Alpha Vantage */}
          <div>
            <label className="block text-xs sm:text-sm text-slate-400 mb-1.5 sm:mb-2">
              Alpha Vantage (Ativos Globais)
              <a 
                href="https://www.alphavantage.co/support/#api-key" 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-emerald-400 hover:underline"
              >
                Obter →
              </a>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={settings.alphavantage_key || ''}
                onChange={(e) => setSettings({ ...settings, alphavantage_key: e.target.value })}
                className="input flex-1 text-sm"
                placeholder="API Key"
              />
              <button
                onClick={() => testApi('alphavantage')}
                disabled={testingApi === 'alphavantage' || !settings.alphavantage_key}
                className="btn btn-secondary px-3 sm:px-4"
              >
                {testingApi === 'alphavantage' ? (
                  <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                ) : (
                  <TestTube className="w-4 h-4" />
                )}
              </button>
            </div>
            {apiTestResults.alphavantage && (
              <div className={`mt-2 flex items-center gap-2 text-xs sm:text-sm ${
                apiTestResults.alphavantage.success ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {apiTestResults.alphavantage.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {apiTestResults.alphavantage.message}
              </div>
            )}
          </div>

          {/* Groq API */}
          <div className="p-3 sm:p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <label className="block text-xs sm:text-sm text-slate-400 mb-1.5 sm:mb-2">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Groq API Key (Análise Macro com IA)
              </span>
              <a 
                href="https://console.groq.com/keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-6 text-purple-400 hover:underline"
              >
                Obter em console.groq.com →
              </a>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={settings.groq_api_key || ''}
                onChange={(e) => setSettings({ ...settings, groq_api_key: e.target.value })}
                className="input flex-1 text-sm bg-slate-800/50"
                placeholder="gsk_..."
              />
              <button
                onClick={() => testApi('groq')}
                disabled={testingApi === 'groq' || !settings.groq_api_key}
                className="btn btn-secondary px-3 sm:px-4"
              >
                {testingApi === 'groq' ? (
                  <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                ) : (
                  <TestTube className="w-4 h-4" />
                )}
              </button>
            </div>
            {apiTestResults.groq && (
              <div className={`mt-2 flex items-center gap-2 text-xs sm:text-sm ${
                apiTestResults.groq.success ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {apiTestResults.groq.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {apiTestResults.groq.message}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Habilita análises de cenário macro na Dashboard (gratuito)
            </p>
          </div>
        </div>
      </div>

      {/* Backup */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
          <h2 className="font-semibold text-white text-sm sm:text-base">Backup de Dados</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button onClick={exportData} className="btn btn-secondary flex items-center justify-center gap-2 text-sm">
            <Download className="w-4 h-4" />
            Exportar Dados
          </button>
          <label className="btn btn-secondary flex items-center justify-center gap-2 cursor-pointer text-sm">
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
          Exporte para backup ou importe de um backup anterior
        </p>
      </div>

      {/* Save Button - Fixed no mobile */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/95 backdrop-blur border-t border-slate-800 sm:relative sm:bg-transparent sm:border-0 sm:p-0 sm:flex sm:justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full sm:w-auto btn btn-primary flex items-center justify-center gap-2"
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
