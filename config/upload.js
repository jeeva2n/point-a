const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Create uploads directory if it doesn't exist
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Create subdirectories for different file types
const dirs = ['products', 'categories', 'documents', 'tmp'];
dirs.forEach(dir => {
  const dirPath = path.join(uploadDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'products';
    
    // Determine folder based on field name or route
    if (req.baseUrl && req.baseUrl.includes('categories')) {
      folder = 'categories';
    } else if (file.fieldname === 'category_image') {
      folder = 'categories';
    } else if (file.fieldname === 'document') {
      folder = 'documents';
    }
    
    cb(null, path.join(uploadDir, folder));
  },
  
  filename: (req, file, cb) => {
    // Generate secure filename
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const originalName = path.parse(file.originalname).name;
    const safeName = originalName.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
    const ext = path.extname(file.originalname).toLowerCase();
    
    cb(null, `${timestamp}-${uniqueSuffix}-${safeName}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedDocTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  
  if (file.fieldname === 'document') {
    if (allowedDocTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid document type. Allowed types: PDF, DOC, DOCX'));
    }
  } else {
    if (allowedImageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type. Allowed types: JPEG, PNG, GIF, WebP'));
    }
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
    files: 10 // Maximum 10 files
  },
  fileFilter: fileFilter
});

// Middleware to handle upload errors
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File too large. Maximum size is ${(parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024) / (1024 * 1024)}MB`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded. Maximum is 10 files.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
    }
    
    return res.status(400).json({
      success: false,
      message
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed'
    });
  }
  
  next();
};

// Post-upload processing
const processUploadedFile = async (req, res, next) => {
  try {
    // Process single file
    if (req.file) {
      req.file.url = `/${req.file.path.replace(/\\/g, '/')}`;
    }
    
    // Process multiple files
    if (req.files && req.files.length > 0) {
      req.files = req.files.map(file => ({
        ...file,
        url: `/${file.path.replace(/\\/g, '/')}`
      }));
    }
    
    next();
  } catch (error) {
    // Clean up files if processing failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  upload,
  handleUploadErrors,
  processUploadedFile
};