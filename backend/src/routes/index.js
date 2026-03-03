const express = require('express');
const { body } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const authController = require('../controllers/auth.controller');
const assetsController = require('../controllers/assets.controller');
const portfolioController = require('../controllers/portfolio.controller');
const settingsController = require('../controllers/settings.controller');

const router = express.Router();

// ==================== AUTH ====================
router.post('/auth/register', [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres')
], authController.register);

router.post('/auth/login', [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Senha é obrigatória')
], authController.login);

router.get('/auth/me', authMiddleware, authController.me);
router.put('/auth/profile', authMiddleware, authController.updateProfile);
router.put('/auth/password', authMiddleware, authController.changePassword);

// ==================== ASSET CLASSES ====================
router.get('/classes', authMiddleware, assetsController.listClasses);
router.post('/classes', authMiddleware, assetsController.createClass);
router.put('/classes/:id', authMiddleware, assetsController.updateClass);
router.delete('/classes/:id', authMiddleware, assetsController.deleteClass);

// ==================== ASSETS ====================
router.get('/assets', authMiddleware, assetsController.listAssets);
router.get('/assets/:id', authMiddleware, assetsController.getAsset);
router.post('/assets', authMiddleware, assetsController.createAsset);
router.put('/assets/:id', authMiddleware, assetsController.updateAsset);
router.delete('/assets/:id', authMiddleware, assetsController.deleteAsset);
router.post('/assets/:id/transaction', authMiddleware, assetsController.registerTransaction);

// ==================== TRANSACTIONS ====================
router.get('/transactions', authMiddleware, assetsController.listTransactions);

// ==================== PORTFOLIO ====================
router.get('/portfolio/dashboard', authMiddleware, portfolioController.getDashboard);
router.post('/portfolio/sync', authMiddleware, portfolioController.syncAll);
router.get('/portfolio/rebalance', authMiddleware, portfolioController.getRebalanceSuggestions);
router.post('/portfolio/contribution', authMiddleware, portfolioController.calculateContribution);
router.get('/portfolio/projection', authMiddleware, portfolioController.getProjection);
router.get('/portfolio/history', authMiddleware, portfolioController.getHistory);
router.post('/portfolio/recommendations/:id/dismiss', authMiddleware, portfolioController.dismissRecommendation);

// ==================== SETTINGS ====================
router.get('/settings', authMiddleware, settingsController.getSettings);
router.put('/settings', authMiddleware, settingsController.updateSettings);
router.post('/settings/test-api', authMiddleware, settingsController.testApiConnection);
router.get('/settings/export', authMiddleware, settingsController.exportData);
router.post('/settings/import', authMiddleware, settingsController.importData);

// ==================== HEALTH CHECK ====================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
