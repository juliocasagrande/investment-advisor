const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const authController = require('../controllers/auth.controller');
const assetsController = require('../controllers/assets.controller');
const portfolioController = require('../controllers/portfolio.controller');
const settingsController = require('../controllers/settings.controller');
const dividendsController = require('../controllers/dividends.controller');
const goalsController = require('../controllers/goals.controller');
const taxReportController = require('../controllers/tax-report.controller');
const screenerController = require('../controllers/screener.controller');

// Auth routes (públicas)
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', authMiddleware, authController.me);
router.put('/auth/profile', authMiddleware, authController.updateProfile);
router.put('/auth/password', authMiddleware, authController.changePassword);

// Assets routes
router.get('/assets', authMiddleware, assetsController.listAssets);
router.get('/assets/:id', authMiddleware, assetsController.getAsset);
router.post('/assets', authMiddleware, assetsController.createAsset);
router.put('/assets/:id', authMiddleware, assetsController.updateAsset);
router.delete('/assets/:id', authMiddleware, assetsController.deleteAsset);
router.post('/assets/:id/transaction', authMiddleware, assetsController.registerTransaction);

// Classes routes
router.get('/classes', authMiddleware, assetsController.listClasses);
router.get('/classes/templates', authMiddleware, assetsController.getClassTemplates);
router.post('/classes', authMiddleware, assetsController.createClass);
router.put('/classes/:id', authMiddleware, assetsController.updateClass);
router.delete('/classes/:id', authMiddleware, assetsController.deleteClass);

// Transactions routes
router.get('/transactions', authMiddleware, assetsController.listTransactions);
router.post('/transactions', authMiddleware, assetsController.createTransaction);
router.get('/transactions/realized-gains', authMiddleware, assetsController.getRealizedGains);

// Portfolio routes
router.get('/portfolio/dashboard', authMiddleware, portfolioController.getDashboard);
router.post('/portfolio/sync', authMiddleware, portfolioController.syncQuotes);
router.get('/portfolio/rebalance', authMiddleware, portfolioController.getRebalance);
router.post('/portfolio/contribution', authMiddleware, portfolioController.calculateContribution);
router.get('/portfolio/projection', authMiddleware, portfolioController.getProjection);
router.get('/portfolio/history', authMiddleware, portfolioController.getHistory);
router.post('/portfolio/recommendations/:id/dismiss', authMiddleware, portfolioController.dismissRecommendation);
router.get('/portfolio/macro', authMiddleware, portfolioController.getMacroAnalysis);
router.post('/portfolio/macro/refresh', authMiddleware, portfolioController.refreshMacroAnalysis);

// Dividends routes
router.get('/dividends', authMiddleware, dividendsController.list);
router.post('/dividends', authMiddleware, dividendsController.create);
router.put('/dividends/:id', authMiddleware, dividendsController.update);
router.delete('/dividends/:id', authMiddleware, dividendsController.delete);
router.get('/dividends/summary', authMiddleware, dividendsController.getSummary);

// Goals routes
router.get('/goals', authMiddleware, goalsController.list);
router.post('/goals', authMiddleware, goalsController.create);
router.put('/goals/:id', authMiddleware, goalsController.update);
router.delete('/goals/:id', authMiddleware, goalsController.delete);

// Tax Report routes
router.get('/tax-report', authMiddleware, taxReportController.getReport);
router.get('/tax-report/export', authMiddleware, taxReportController.exportReport);

// Settings routes
router.get('/settings', authMiddleware, settingsController.getSettings);
router.put('/settings', authMiddleware, settingsController.updateSettings);
router.post('/settings/test-api', authMiddleware, settingsController.testApiConnection);
router.get('/settings/export', authMiddleware, settingsController.exportData);
router.post('/settings/import', authMiddleware, settingsController.importData);

// Screener routes
router.post('/screener/search', authMiddleware, screenerController.search);
router.post('/screener/analyze', authMiddleware, screenerController.analyzePositions);
router.post('/screener/suggestions', authMiddleware, screenerController.getSuggestions);
router.get('/screener/fundamentals/:ticker', authMiddleware, screenerController.getFundamentals);
router.post('/screener/filters', authMiddleware, screenerController.saveFilters);
router.get('/screener/filters', authMiddleware, screenerController.listFilters);

module.exports = router;
