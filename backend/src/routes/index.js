const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Controllers
const authController = require('../controllers/auth.controller');
const assetsController = require('../controllers/assets.controller');
const portfolioController = require('../controllers/portfolio.controller');
const dividendsController = require('../controllers/dividends.controller');
const goalsController = require('../controllers/goals.controller');
const taxReportController = require('../controllers/tax-report.controller');
const screenerController = require('../controllers/screener.controller');
const settingsController = require('../controllers/settings.controller');

// Auth routes
router.post('/auth/register', (req, res) => authController.register(req, res));
router.post('/auth/login', (req, res) => authController.login(req, res));
router.get('/auth/me', auth, (req, res) => authController.me(req, res));

// Assets routes
router.get('/assets', auth, (req, res) => assetsController.listAssets(req, res));
router.post('/assets', auth, (req, res) => assetsController.createAsset(req, res));
router.put('/assets/:id', auth, (req, res) => assetsController.updateAsset(req, res));
router.delete('/assets/:id', auth, (req, res) => assetsController.deleteAsset(req, res));
router.post('/assets/:id/transaction', auth, (req, res) => assetsController.registerTransaction(req, res));
router.get('/assets/transactions', auth, (req, res) => assetsController.listTransactions(req, res));

// Classes routes
router.get('/classes', auth, (req, res) => assetsController.listClasses(req, res));
router.get('/classes/templates', auth, (req, res) => assetsController.getClassTemplates(req, res));
router.post('/classes', auth, (req, res) => assetsController.createClass(req, res));
router.put('/classes/:id', auth, (req, res) => assetsController.updateClass(req, res));
router.delete('/classes/:id', auth, (req, res) => assetsController.deleteClass(req, res));

// Portfolio routes
router.get('/portfolio/dashboard', auth, (req, res) => portfolioController.getDashboard(req, res));
router.post('/portfolio/sync', auth, (req, res) => portfolioController.syncQuotes(req, res));
router.get('/portfolio/rebalance', auth, (req, res) => portfolioController.getRebalance(req, res));
router.post('/portfolio/contribution', auth, (req, res) => portfolioController.calculateContribution(req, res));
router.get('/portfolio/projection', auth, (req, res) => portfolioController.getProjection(req, res));
router.get('/portfolio/history', auth, (req, res) => portfolioController.getHistory(req, res));
router.post('/portfolio/recommendation/:id/dismiss', auth, (req, res) => portfolioController.dismissRecommendation(req, res));
router.get('/portfolio/macro-analysis', auth, (req, res) => portfolioController.getMacroAnalysis(req, res));
router.post('/portfolio/macro-analysis/refresh', auth, (req, res) => portfolioController.refreshMacroAnalysis(req, res));

// Dividends routes
router.get('/dividends', auth, (req, res) => dividendsController.list(req, res));
router.post('/dividends', auth, (req, res) => dividendsController.create(req, res));
router.put('/dividends/:id', auth, (req, res) => dividendsController.update(req, res));
router.delete('/dividends/:id', auth, (req, res) => dividendsController.delete(req, res));
router.get('/dividends/summary', auth, (req, res) => dividendsController.getSummary(req, res));

// Goals routes
router.get('/goals', auth, (req, res) => goalsController.list(req, res));
router.post('/goals', auth, (req, res) => goalsController.create(req, res));
router.put('/goals/:id', auth, (req, res) => goalsController.update(req, res));
router.delete('/goals/:id', auth, (req, res) => goalsController.delete(req, res));

// Tax Report routes
router.get('/tax-report/:year', auth, (req, res) => taxReportController.getReport(req, res));
router.get('/tax-report/:year/export', auth, (req, res) => taxReportController.exportReport(req, res));

// Screener routes
router.post('/screener/search', auth, (req, res) => screenerController.search(req, res));
router.post('/screener/positions', auth, (req, res) => screenerController.analyzePositions(req, res));
router.post('/screener/suggestions', auth, (req, res) => screenerController.getSuggestions(req, res));
router.get('/screener/fundamentals/:ticker', auth, (req, res) => screenerController.getFundamentals(req, res));
router.post('/screener/filters', auth, (req, res) => screenerController.saveFilters(req, res));
router.get('/screener/filters', auth, (req, res) => screenerController.listFilters(req, res));

// Settings routes
router.get('/settings', auth, (req, res) => settingsController.getSettings(req, res));
router.put('/settings', auth, (req, res) => settingsController.updateSettings(req, res));
router.post('/settings/test-api', auth, (req, res) => settingsController.testApiConnection(req, res));
router.get('/settings/export', auth, (req, res) => settingsController.exportData(req, res));
router.post('/settings/import', auth, (req, res) => settingsController.importData(req, res));

module.exports = router;
