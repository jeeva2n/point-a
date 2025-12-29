const jwt = require('jsonwebtoken');
const pool = require('../config/database');

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

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

      // Check if admin exists and is active
      const [admins] = await pool.query(
        'SELECT id, username, email, role, is_active FROM admins WHERE id = ?',
        [decoded.id]
      );

      if (admins.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. Admin not found.'
        });
      }

      const admin = admins[0];

      if (!admin.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account is disabled.'
        });
      }

      req.admin = admin;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired. Please login again.'
        });
      }
      throw jwtError;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // Define role permissions
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
        'view_refunds'
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
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Permission denied.'
      });
    }
  };
};

module.exports = { auth, hasPermission };