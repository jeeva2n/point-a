// routes/adminRoutes.js
const express = require('express');
const router = express.Router();

// Temporary test route
router.get('/test', (req, res) => {
  res.json({ message: 'Admin routes working!' });
});

// Simple login route
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Simple validation for development
  if (username === 'admin' && password === 'admin123') {
    return res.json({
      success: true,
      message: 'Login successful',
      token: 'dummy-token-for-dev',
      admin: {
        id: 1,
        username: 'admin',
        email: 'admin@daksndt.com',
        role: 'super_admin'
      }
    });
  }
  
  res.status(401).json({
    success: false,
    message: 'Invalid credentials'
  });
});

// Protected routes placeholder
router.get('/profile', (req, res) => {
  res.json({
    success: true,
    admin: {
      id: 1,
      username: 'admin',
      email: 'admin@daksndt.com',
      role: 'super_admin'
    }
  });
});

module.exports = router;