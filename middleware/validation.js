const { body, validationResult } = require('express-validator');

const validateProduct = [
  body('name').notEmpty().withMessage('Product name is required').trim(),
  body('description').notEmpty().withMessage('Description is required').trim(),
  body('category').notEmpty().withMessage('Category is required').trim(),
  body('type').isIn(['calibration_block', 'flawed_specimen', 'validation_block', 'ndt_kit']).withMessage('Invalid product type'),
  body('material').optional().trim(),
  body('dimensions').optional().trim(),
  body('standards').optional().trim(),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('specifications').optional().isObject().withMessage('Specifications must be an object'),
  
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

module.exports = { validateProduct, validateLogin };