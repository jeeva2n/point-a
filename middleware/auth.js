const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many login attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        code: 'NO_TOKEN',
        message: 'Access denied. No token provided.'
      });
    }

    // Check Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN_FORMAT',
        message: 'Invalid token format. Use: Bearer <token>'
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    
    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'EMPTY_TOKEN',
        message: 'Token cannot be empty'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired. Please login again.'
        });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          code: 'INVALID_TOKEN',
          message: 'Invalid token.'
        });
      }
      throw error;
    }

    // Check token blacklist (if implemented)
    // await checkTokenBlacklist(token);

    // Get admin from database
    const admin = await Admin.findById(decoded.id);
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        code: 'ADMIN_NOT_FOUND',
        message: 'Admin account not found or disabled.'
      });
    }

    // Check if admin is active
    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        message: 'Your account has been disabled.'
      });
    }

    // Check if password was changed after token was issued
    if (decoded.iat < Math.floor(admin.password_changed_at / 1000)) {
      return res.status(401).json({
        success: false,
        code: 'PASSWORD_CHANGED',
        message: 'Password was changed. Please login again.'
      });
    }

    // Attach admin to request
    req.admin = {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions || []
    };
    
    req.token = token;
    req.tokenExpiry = decoded.exp;

    // Log successful authentication (optional)
    // await logAuthSuccess(req);

    next();
  } catch (error) {
    console.error('Auth error:', error);
    
    // Don't expose internal errors
    res.status(500).json({
      success: false,
      code: 'AUTH_ERROR',
      message: 'Authentication failed'
    });
  }
};

const isSuperAdmin = async (req, res, next) => {
  try {
    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        code: 'ACCESS_DENIED',
        message: 'Access denied. Super admin privileges required.'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Server error checking permissions'
    });
  }
};

const hasPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (req.admin.role === 'super_admin') {
        return next();
      }

      const admin = await Admin.findById(req.admin.id);
      
      if (!admin.permissions || !admin.permissions.includes(requiredPermission)) {
        return res.status(403).json({
          success: false,
          code: 'PERMISSION_DENIED',
          message: `Required permission: ${requiredPermission}`
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        code: 'SERVER_ERROR',
        message: 'Server error checking permissions'
      });
    }
  };
};

// Optional: IP whitelisting middleware
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Extract IP from X-Forwarded-For header if behind proxy
    const forwardedIP = req.headers['x-forwarded-for']?.split(',')[0];
    const realIP = forwardedIP || clientIP;
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(realIP)) {
      return res.status(403).json({
        success: false,
        code: 'IP_NOT_ALLOWED',
        message: 'Access from your IP address is not allowed.'
      });
    }
    
    next();
  };
};

// CSRF protection for non-API routes
const csrfProtection = (req, res, next) => {
  // Skip for API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Validate CSRF token for form submissions
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionToken = req.session?.csrfToken;
    
    if (!csrfToken || csrfToken !== sessionToken) {
      return res.status(403).json({
        success: false,
        code: 'CSRF_TOKEN_INVALID',
        message: 'Invalid CSRF token'
      });
    }
  }
  
  next();
};

module.exports = { 
  auth, 
  isSuperAdmin, 
  hasPermission, 
  authLimiter,
  ipWhitelist,
  csrfProtection 
};