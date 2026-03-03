import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para tratar erros
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

// Auth
export const authService = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (name, email, password) => api.post('/auth/register', { name, email, password }),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (currentPassword, newPassword) => 
    api.put('/auth/password', { currentPassword, newPassword }),
};

// Asset Classes
export const classesService = {
  list: () => api.get('/classes'),
  create: (data) => api.post('/classes', data),
  update: (id, data) => api.put(`/classes/${id}`, data),
  delete: (id) => api.delete(`/classes/${id}`),
};

// Assets
export const assetsService = {
  list: (classId) => api.get('/assets', { params: { classId } }),
  get: (id) => api.get(`/assets/${id}`),
  create: (data) => api.post('/assets', data),
  update: (id, data) => api.put(`/assets/${id}`, data),
  delete: (id) => api.delete(`/assets/${id}`),
  registerTransaction: (id, data) => api.post(`/assets/${id}/transaction`, data),
};

// Transactions
export const transactionsService = {
  list: (params) => api.get('/transactions', { params }),
};

// Portfolio
export const portfolioService = {
  getDashboard: () => api.get('/portfolio/dashboard'),
  sync: () => api.post('/portfolio/sync'),
  getRebalance: () => api.get('/portfolio/rebalance'),
  calculateContribution: (amount) => api.post('/portfolio/contribution', { amount }),
  getProjection: (months, monthlyContribution) => 
    api.get('/portfolio/projection', { params: { months, monthlyContribution } }),
  getHistory: (params) => api.get('/portfolio/history', { params }),
  dismissRecommendation: (id) => api.post(`/portfolio/recommendations/${id}/dismiss`),
};

// Settings
export const settingsService = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  testApi: (api, token) => api.post('/settings/test-api', { api, token }),
  exportData: () => api.get('/settings/export'),
  importData: (data, overwrite) => api.post('/settings/import', { data, overwrite }),
};

export default api;
