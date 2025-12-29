const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { auth, hasPermission } = require('../middleware/auth');
const { validateProduct } = require('../middleware/validation');
const { upload, handleUploadErrors, processUploadedFile } = require('../config/upload');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for product images
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/products/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const productUpload = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
    }
  }
});

// Public routes
router.get('/', productController.getProducts);
router.get('/search', productController.searchProducts);
router.get('/categories', productController.getCategories);
router.get('/:id', productController.getProductById);
router.get('/:id/related', productController.getRelatedProducts);

// Protected routes (admin access)
router.use(auth);

// Product management
router.post('/',
  hasPermission('manage_products'),
  productUpload.array('images', 10),
  handleUploadErrors,
  validateProduct,
  productController.createProduct
);

router.put('/:id',
  hasPermission('manage_products'),
  productUpload.array('images', 10),
  handleUploadErrors,
  productController.updateProduct
);

router.delete('/:id',
  hasPermission('manage_products'),
  productController.deleteProduct
);

// Image management
router.post('/:id/images',
  hasPermission('manage_products'),
  productUpload.array('images', 10),
  handleUploadErrors,
  productController.addProductImages
);

router.delete('/:productId/images/:imageId',
  hasPermission('manage_products'),
  productController.deleteProductImage
);

router.put('/:productId/images/:imageId/main',
  hasPermission('manage_products'),
  productController.setMainImage
);

router.put('/:productId/images/reorder',
  hasPermission('manage_products'),
  productController.reorderImages
);

module.exports = router;