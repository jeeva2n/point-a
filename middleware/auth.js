const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'daks-ndt-super-secret-jwt-key-2024';

/* =========================
   Admin Authentication Middleware
========================= */
const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired. Please login again.'
        });
      }
      throw jwtError;
    }

    // Check if admin exists
    const [admins] = await db.query(
      'SELECT id, username, email, role, is_active FROM admins WHERE id = ?',
      [decoded.id || decoded.adminId || decoded.userId]
    );

    if (admins.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Admin not found.'
      });
    }

    const admin = admins[0];

    if (admin.is_active === 0) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled.'
      });
    }

    req.admin = admin;
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

/* =========================
   Permission Middleware
========================= */
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    const rolePermissions = {
      super_admin: ['*'],
      admin: [
        'manage_products',
        'manage_categories',
        'view_orders',
        'update_orders',
        'manage_orders',
        'view_reports',
        'manage_refunds',
        'view_refunds',
        'view_products'
      ],
      editor: [
        'manage_products',
        'manage_categories',
        'view_orders'
      ],
      viewer: [
        'view_orders',
        'view_reports'
      ]
    };

    const userPermissions = rolePermissions[req.admin.role] || [];

    if (userPermissions.includes('*') || userPermissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Permission denied.'
    });
  };
};

module.exports = { auth, hasPermission };