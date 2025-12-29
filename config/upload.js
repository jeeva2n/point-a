// config/upload.js
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
    if (req.baseUrl.includes('admin')) {
      if (file.fieldname === 'category_image') {
        folder = 'categories';
      } else if (file.fieldname === 'document') {
        folder = 'documents';
      }
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
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx'
  ];
  
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };

  if (allowedTypes.includes(ext) && mimeTypes[ext] === file.mimetype) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`));
  }
};

// Virus scanning middleware (requires clamscan or similar)
const scanForViruses = async (filePath) => {
  if (process.env.ENABLE_VIRUS_SCAN === 'true') {
    const { default: clamscan } = await import('clamscan');
    const scanner = new clamscan();
    
    try {
      const { isInfected, viruses } = await scanner.scanFile(filePath);
      if (isInfected) {
        fs.unlinkSync(filePath);
        throw new Error(`Virus detected: ${viruses.join(', ')}`);
      }
    } catch (error) {
      console.error('Virus scan error:', error);
      throw new Error('File scanning failed');
    }
  }
};

// Image processing (resize, optimize)
const processImage = async (filePath) => {
  if (process.env.ENABLE_IMAGE_PROCESSING === 'true') {
    try {
      const sharp = require('sharp');
      
      // Resize if too large
      const stats = fs.statSync(filePath);
      if (stats.size > 1024 * 1024) { // > 1MB
        await sharp(filePath)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(filePath + '.tmp');
        
        fs.renameSync(filePath + '.tmp', filePath);
      }
    } catch (error) {
      console.error('Image processing error:', error);
    }
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
    files: 5 // Maximum 5 files
  },
  fileFilter: fileFilter
});

// Middleware to handle upload errors
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File too large. Maximum size is ${process.env.MAX_FILE_SIZE / (1024*1024)}MB`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded';
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
  if (req.file) {
    try {
      // Scan for viruses
      await scanForViruses(req.file.path);
      
      // Process image if it's an image
      if (req.file.mimetype.startsWith('image/')) {
        await processImage(req.file.path);
      }
      
      // Update file path in request
      req.file.url = `/uploads/${path.basename(req.file.destination)}/${req.file.filename}`;
      
      next();
    } catch (error) {
      // Clean up file if processing failed
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  } else {
    next();
  }
};

module.exports = {
  upload,
  handleUploadErrors,
  processUploadedFile
};