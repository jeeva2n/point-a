const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { upload, handleUploadErrors } = require('../config/upload');

// GET all products
router.get('/', productController.getAllProducts);

// GET single product
router.get('/:id', productController.getProductById);

// CREATE product (with image upload)
router.post(
  '/',
  upload.array('images', 10),
  handleUploadErrors,
  productController.createProduct
);

// UPDATE product (with image upload)
router.put(
  '/:id',
  upload.array('images', 10),
  handleUploadErrors,
  productController.updateProduct
);

// DELETE product
router.delete('/:id', productController.deleteProduct);

module.exports = router;