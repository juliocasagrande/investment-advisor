import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (name, email, password) => api.post('/auth/register', { name, email, password }),
  me: () => api.get('/auth/me')
};

export const classesService = {
  list: () => api.get('/classes'),
  getTemplates: () => api.get('/classes/templates'),
  create: (data) => api.post('/classes', data),
  update: (id, data) => api.put(`/classes/${id}`, data),
  delete: (id) => api.delete(`/classes/${id}`)
};

export const assetsService = {
  list: (classId) => api.get('/assets', { params: { classId } }),
  get: (id) => api.get(`/assets/${id}`),
  create: (data) => api.post('/assets', data),
  update: (id, data) => api.put(`/assets/${id}`, data),
  delete: (id) => api.delete(`/assets/${id}`),
  registerTransaction: (id, data) => api.post(`/assets/${id}/transaction`, data),
  updateQuotes: () => api.post('/portfolio/sync')
};

export const transactionsService = {
  list: (params) => api.get('/transactions', { params }),
  create: (data) => api.post('/transactions', data),
  delete: (id) => api.delete(`/transactions/${id}`),
  getRealizedGains: (params) => api.get('/transactions/realized-gains', { params })
};

export const portfolioService = {
  getDashboard: () => api.get('/portfolio/dashboard'),
  getAllocation: () => api.get('/portfolio/allocation'),
  getRebalance: () => api.get('/portfolio/rebalance'),
  sync: () => api.post('/portfolio/sync'),
  syncQuotes: () => api.post('/portfolio/sync'),
  calculateContribution: (amount) => api.post('/portfolio/contribution', { amount }),
  getProjection: (months, contribution) => api.get('/portfolio/projection', { params: { months, monthlyContribution: contribution } }),
  getHistory: (limit) => api.get('/portfolio/history', { params: { limit } }),
  dismissRecommendation: (id) => api.post(`/portfolio/recommendation/${id}/dismiss`),
  getMacroAnalysis: () => api.get('/portfolio/macro'),
  refreshMacroAnalysis: () => api.post('/portfolio/macro/refresh')
};

export const dividendsService = {
  list: (params) => api.get('/dividends', { params }),
  getSummary: (year) => api.get('/dividends/summary', { params: { year } }),
  create: (data) => api.post('/dividends', data),
  update: (id, data) => api.put(`/dividends/${id}`, data),
  delete: (id) => api.delete(`/dividends/${id}`)
};

export const goalsService = {
  list: () => api.get('/goals'),
  get: (id) => api.get(`/goals/${id}`),
  create: (data) => api.post('/goals', data),
  update: (id, data) => api.put(`/goals/${id}`, data),
  delete: (id) => api.delete(`/goals/${id}`)
};

export const taxReportService = {
  getReport: (year) => api.get(`/tax-report/${year}`),
  exportCSV: (year) => api.get(`/tax-report/${year}/export`, { responseType: 'blob' })
};

export const settingsService = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  testApi: (apiName, token) => api.post('/settings/test-api', { api: apiName, token }),
  exportData: () => api.get('/settings/export'),
  importData: (data, merge) => api.post('/settings/import', { data, merge })
};

export const screenerService = {
  search: (filters, assetClass = 'stocks') => api.post('/screener/search', { filters, assetClass }),
  analyzePositions: (filters) => api.post('/screener/analyze', { filters }),
  getSuggestions: (ticker, filters) => api.post('/screener/suggestions', { ticker, filters }),
  getFundamentals: (ticker) => api.get(`/screener/fundamentals/${ticker}`),
  saveFilters: (name, filters) => api.post('/screener/filters', { name, filters }),
  listFilters: () => api.get('/screener/filters'),
};

export const currencyService = {
  getUsdRate: () => api.get('/currency/usd-brl'),
};

export default api;
