// routes/productRoutes.js
const express = require('express');
const router = express.Router();

// Get all products
router.get('/', (req, res) => {
  // We'll handle this in server.js for now
  res.json({ message: 'Use /api/products directly' });
});

module.exports = router;