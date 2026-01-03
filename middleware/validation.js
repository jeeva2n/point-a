const { body, validationResult } = require('express-validator');

/* =========================
   Simple Validation Helpers
========================= */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/* =========================
   Basic Validation Middlewares
========================= */
const validateOrderBasic = (req, res, next) => {
  const { customerDetails } = req.body;

  if (!customerDetails) {
    return res.status(400).json({
      success: false,
      message: 'Customer details are required'
    });
  }

  if (!customerDetails.name || customerDetails.name.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Customer name is required'
    });
  }

  if (!customerDetails.email || !isValidEmail(customerDetails.email)) {
    return res.status(400).json({
      success: false,
      message: 'Valid email is required'
    });
  }

  next();
};

const validateProductBasic = (req, res, next) => {
  const { name, category, type } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Product name is required'
    });
  }

  if (!category || category.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Product category is required'
    });
  }

  if (!type || type.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Product type is required'
    });
  }

  next();
};

const validateEmail = (req, res, next) => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      message: 'Valid email is required'
    });
  }

  next();
};

/* =========================
   Express-Validator Based
========================= */
const validateProduct = [
  body('name').notEmpty().withMessage('Product name is required').trim(),
  body('description').optional().trim(),
  body('category').notEmpty().withMessage('Category is required').trim(),
  body('type')
    .isIn([
      'calibration_block',
      'flawed_specimen',
      'validation_block',
      'ndt_kit',
      'accessory',
      'other'
    ])
    .withMessage('Invalid product type'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('dimensions').optional().trim(),
  body('tolerance').optional().trim(),
  body('flaws').optional().trim(),
  body('materials').optional(),
  body('specifications').optional(),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateCategory = [
  body('name').notEmpty().withMessage('Category name is required').trim(),
  body('slug').optional().trim(),
  body('description').optional().trim(),
  body('parent_id').optional().isInt().withMessage('Parent ID must be an integer'),
  body('sort_order').optional().isInt().withMessage('Sort order must be an integer'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateOrder = [
  body('customer_email').isEmail().withMessage('Valid email is required'),
  body('customer_name').notEmpty().withMessage('Customer name is required').trim(),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product_id').isInt().withMessage('Product ID must be an integer'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('shipping_address').notEmpty().withMessage('Shipping address is required'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateLogin = [
  body('username').notEmpty().withMessage('Username is required').trim(),
  body('password').notEmpty().withMessage('Password is required'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateUserRegistration = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  body('full_name').notEmpty().withMessage('Full name is required').trim(),
  body('company').optional().trim(),
  body('phone').optional().trim(),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateUserLogin = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  validateOrderBasic,
  validateProductBasic,
  validateEmail,
  validateProduct,
  validateCategory,
  validateOrder,
  validateLogin,
  validateUserRegistration,
  validateUserLogin
};
