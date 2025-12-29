const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { auth, hasPermission } = require('../middleware/auth');
const { validateCategory } = require('../middleware/validation');
const { upload, handleUploadErrors, processUploadedFile } = require('../config/upload');

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/tree', categoryController.getCategoryTree);
router.get('/with-products', categoryController.getCategoriesWithProducts);
router.get('/:slug', categoryController.getCategoryBySlug);
router.get('/:slug/products', categoryController.getCategoryProducts);

// Protected routes (admin access)
router.use(auth);

// Category management
router.post('/', 
  hasPermission('manage_categories'),
  upload.single('image'),
  handleUploadErrors,
  processUploadedFile,
  validateCategory,
  categoryController.createCategory
);

router.put('/:id', 
  hasPermission('manage_categories'),
  upload.single('image'),
  handleUploadErrors,
  processUploadedFile,
  validateCategory,
  categoryController.updateCategory
);

router.delete('/:id', 
  hasPermission('manage_categories'),
  categoryController.deleteCategory
);

router.put('/:id/order', 
  hasPermission('manage_categories'),
  categoryController.updateCategoryOrder
);

router.put('/:id/visibility', 
  hasPermission('manage_categories'),
  categoryController.toggleCategoryVisibility
);

module.exports = router;