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
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', auth, authController.me);

// Assets routes
router.get('/assets', auth, assetsController.list);
router.post('/assets', auth, assetsController.create);
router.put('/assets/:id', auth, assetsController.update);
router.delete('/assets/:id', auth, assetsController.delete);
router.post('/assets/:id/transaction', auth, assetsController.registerTransaction);

// Classes routes
router.get('/classes', auth, assetsController.listClasses);
router.post('/classes', auth, assetsController.createClass);
router.put('/classes/:id', auth, assetsController.updateClass);
router.delete('/classes/:id', auth, assetsController.deleteClass);

// Portfolio routes
router.get('/portfolio/dashboard', auth, portfolioController.getDashboard);
router.post('/portfolio/sync', auth, portfolioController.syncQuotes);
router.get('/portfolio/rebalance', auth, portfolioController.getRebalance);
router.post('/portfolio/contribution', auth, portfolioController.calculateContribution);
router.get('/portfolio/projection', auth, portfolioController.getProjection);
router.get('/portfolio/history', auth, portfolioController.getHistory);
router.post('/portfolio/recommendation/:id/dismiss', auth, portfolioController.dismissRecommendation);
router.get('/portfolio/macro-analysis', auth, portfolioController.getMacroAnalysis);
router.post('/portfolio/macro-analysis/refresh', auth, portfolioController.refreshMacroAnalysis);

// Dividends routes
router.get('/dividends', auth, dividendsController.list);
router.post('/dividends', auth, dividendsController.create);
router.put('/dividends/:id', auth, dividendsController.update);
router.delete('/dividends/:id', auth, dividendsController.delete);
router.get('/dividends/summary', auth, dividendsController.getSummary);

// Goals routes
router.get('/goals', auth, goalsController.list);
router.post('/goals', auth, goalsController.create);
router.put('/goals/:id', auth, goalsController.update);
router.delete('/goals/:id', auth, goalsController.delete);

// Tax Report routes
router.get('/tax-report/:year', auth, taxReportController.getReport);
router.get('/tax-report/:year/export', auth, taxReportController.exportReport);

// Screener routes
router.post('/screener/search', auth, screenerController.search);
router.post('/screener/positions', auth, screenerController.analyzePositions);
router.post('/screener/suggestions', auth, screenerController.getSuggestions);
router.get('/screener/fundamentals/:ticker', auth, screenerController.getFundamentals);
router.post('/screener/filters', auth, screenerController.saveFilters);
router.get('/screener/filters', auth, screenerController.listFilters);

// Settings routes
router.get('/settings', auth, settingsController.getSettings);
router.put('/settings', auth, settingsController.updateSettings);
router.post('/settings/test-api', auth, settingsController.testApiConnection);
router.get('/settings/export', auth, settingsController.exportData);
router.post('/settings/import', auth, settingsController.importData);

module.exports = router;
