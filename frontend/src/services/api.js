import axios from 'axios';

const API_URL = 'https://investment-advisor-production.up.railway.app/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = \Bearer \\;
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
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (currentPassword, newPassword) => 
    api.put('/auth/password', { currentPassword, newPassword }),
};

export const classesService = {
  list: () => api.get('/classes'),
  create: (data) => api.post('/classes', data),
  update: (id, data) => api.put(\/classes/\\, data),
  delete: (id) => api.delete(\/classes/\\),
};

export const assetsService = {
  list: (classId) => api.get('/assets', { params: { classId } }),
  get: (id) => api.get(\/assets/\\),
  create: (data) => api.post('/assets', data),
  update: (id, data) => api.put(\/assets/\\, data),
  delete: (id) => api.delete(\/assets/\\),
  registerTransaction: (id, data) => api.post(\/assets/\/transaction\, data),
};

export const transactionsService = {
  list: (params) => api.get('/transactions', { params }),
};

export const portfolioService = {
  getDashboard: () => api.get('/portfolio/dashboard'),
  sync: () => api.post('/portfolio/sync'),
  getRebalance: () => api.get('/portfolio/rebalance'),
  calculateContribution: (amount) => api.post('/portfolio/contribution', { amount }),
  getProjection: (months, monthlyContribution) => 
    api.get('/portfolio/projection', { params: { months, monthlyContribution } }),
  getHistory: (params) => api.get('/portfolio/history', { params }),
  dismissRecommendation: (id) => api.post(\/portfolio/recommendations/\/dismiss\),
};

export const settingsService = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  testApi: (apiName, token) => api.post('/settings/test-api', { api: apiName, token }),
  exportData: () => api.get('/settings/export'),
  importData: (data, overwrite) => api.post('/settings/import', { data, overwrite }),
};

export default api;
