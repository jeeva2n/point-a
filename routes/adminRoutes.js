// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auth } = require('../middleware/auth');

// Public routes
router.post('/login', adminController.login);

// Verify token (public - checks if token is valid)
router.get('/verify', auth, (req, res) => {
  res.json({
    success: true,
    admin: req.admin
  });
});

// Protected routes (require authentication)
router.get('/profile', auth, adminController.getProfile);

// Admin management (optional - for super admins)
// router.get('/list', auth, adminController.getAllAdmins);
// router.put('/:id/toggle-status', auth, adminController.toggleAdminStatus);

module.exports = router;