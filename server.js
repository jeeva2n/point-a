// server.js - UPDATED VERSION WITH FORM-DATA SUPPORT
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const multer = require('multer'); // Add multer for file uploads
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// ========================
// DATABASE CONNECTION
// ========================
let db;

async function connectDB() {
  try {
    db = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'daks_ndt',
      port: process.env.DB_PORT || 3306
    });
    
    console.log('✅ Database connected');
    
  } catch (error) {
    console.log('⚠️  Database connection failed:', error.message);
  }
}

// ========================
// MULTER SETUP FOR FILE UPLOADS
// ========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ========================
// MIDDLEWARE
// ========================
app.use(cors({
  origin: '*', // Allow all for testing
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Parse JSON for non-file endpoints
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// ========================
// ROUTES
// ========================

// 1. HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    database: db ? 'connected' : 'disconnected',
    uploads: fs.existsSync('uploads') ? 'available' : 'not available'
  });
});

// 2. CREATE PRODUCT WITH FORM-DATA (WITH IMAGE)
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    console.log('📝 Product Creation Request:');
    console.log('- Body:', req.body);
    console.log('- File:', req.file);
    
    // Extract data from form
    const { name, description, category, type, price } = req.body;
    
    console.log('📋 Parsed fields:');
    console.log('  name:', name);
    console.log('  description:', description);
    console.log('  category:', category);
    console.log('  type:', type);
    console.log('  price:', price);
    
    // Validate required fields
    if (!name || !category || !type) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${!name ? 'name, ' : ''}${!category ? 'category, ' : ''}${!type ? 'type' : ''}`.replace(/, $/, '')
      });
    }
    
    // Handle image URL
    let image_url = null;
    if (req.file) {
      image_url = `/uploads/${req.file.filename}`;
      console.log('📸 Image saved:', image_url);
    }
    
    let product;
    
    if (db) {
      const [result] = await db.query(
        `INSERT INTO products (name, description, category, type, price, image_url) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          name, 
          description || '', 
          category, 
          type, 
          parseFloat(price) || 0,
          image_url
        ]
      );
      
      const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
      product = rows[0];
      
      console.log(`✅ Product saved to MySQL with ID: ${product.id}`);
    } else {
      product = {
        id: Date.now(),
        name,
        description: description || '',
        category,
        type,
        price: parseFloat(price) || 0,
        image_url,
        created_at: new Date().toISOString()
      };
    }
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
    
  } catch (error) {
    console.error('❌ Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error: ' + error.message
    });
  }
});

// 3. CREATE PRODUCT WITHOUT IMAGE (JSON VERSION)
app.post('/api/products/json', async (req, res) => {
  try {
    const { name, description, category, type, price } = req.body;
    
    console.log('📝 JSON Product Creation:', { name, category, type, price });
    
    if (!name || !category || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, category, type'
      });
    }
    
    let product;
    
    if (db) {
      const [result] = await db.query(
        `INSERT INTO products (name, description, category, type, price) 
         VALUES (?, ?, ?, ?, ?)`,
        [name, description || '', category, type, parseFloat(price) || 0]
      );
      
      const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
      product = rows[0];
    } else {
      product = {
        id: Date.now(),
        name,
        description: description || '',
        category,
        type,
        price: parseFloat(price) || 0,
        created_at: new Date().toISOString()
      };
    }
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully (JSON)',
      product
    });
    
  } catch (error) {
    console.error('❌ JSON create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error: ' + error.message
    });
  }
});

// 4. GET ALL PRODUCTS
app.get('/api/products', async (req, res) => {
  try {
    const { type, category } = req.query;
    
    console.log('📦 Fetch Request:', { type, category });
    
    let products = [];
    
    if (db) {
      let query = 'SELECT * FROM products WHERE 1=1';
      const params = [];
      
      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }
      
      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }
      
      query += ' ORDER BY created_at DESC';
      
      [products] = await db.query(query, params);
      console.log(`📦 Retrieved ${products.length} products from MySQL`);
    } else {
      // Fallback data
      products = [
        {
          id: 1,
          name: 'Test Calibration Block',
          description: 'Test calibration block',
          category: 'UT Calibration Blocks',
          type: 'calibration_block',
          price: 100.00,
          image_url: null,
          created_at: new Date().toISOString()
        }
      ];
    }
    
    res.json({
      success: true,
      count: products.length,
      products
    });
    
  } catch (error) {
    console.error('❌ Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// 5. ADMIN LOGIN (ALWAYS SUCCESS)
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log('🔐 Login attempt:', username);
  
  const token = 'dev-token-' + Date.now();
  
  res.json({
    success: true,
    message: 'Login successful',
    token: token,
    admin: {
      id: 1,
      username: username || 'admin',
      email: (username || 'admin') + '@daksndt.com',
      role: 'super_admin'
    }
  });
});

// 6. DELETE PRODUCT
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🗑️ Deleting product: ${id}`);
    
    if (db) {
      // Get product first to delete image
      const [products] = await db.query('SELECT image_url FROM products WHERE id = ?', [id]);
      
      if (products.length > 0 && products[0].image_url) {
        const imagePath = path.join(__dirname, products[0].image_url);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          console.log('🗑️ Deleted image:', imagePath);
        }
      }
      
      await db.query('DELETE FROM products WHERE id = ?', [id]);
    }
    
    res.json({
      success: true,
      message: 'Product deleted'
    });
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Delete error: ' + error.message
    });
  }
});

// 7. TEST FORM-DATA ENDPOINT
app.post('/api/test-formdata', upload.single('image'), (req, res) => {
  console.log('🧪 Test FormData:');
  console.log('- Body:', req.body);
  console.log('- File:', req.file);
  console.log('- Headers:', req.headers);
  
  res.json({
    success: true,
    message: 'FormData received successfully',
    data: {
      textFields: req.body,
      file: req.file ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      } : null
    }
  });
});

// 8. DEBUG ENDPOINT
app.get('/api/debug/products', async (req, res) => {
  try {
    let products = [];
    let tableStructure = [];
    
    if (db) {
      [products] = await db.query('SELECT id, name, category, type, price, image_url FROM products LIMIT 10');
      
      // Check table structure
      try {
        [tableStructure] = await db.query('DESCRIBE products');
      } catch (err) {
        console.log('Could not describe products table:', err.message);
      }
    }
    
    res.json({
      success: true,
      totalProducts: products.length,
      products: products,
      tableStructure: tableStructure,
      uploadsFolder: fs.existsSync('uploads') ? 'exists' : 'missing'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
});

// 9. CREATE PRODUCTS TABLE IF NOT EXISTS
app.get('/api/setup-database', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    // Create products table if not exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        price DECIMAL(10,2) DEFAULT 0.00,
        image_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_type (type)
      )
    `);
    
    console.log('✅ Products table created/verified');
    
    res.json({
      success: true,
      message: 'Database setup completed',
      table: 'products created'
    });
    
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Setup error: ' + error.message
    });
  }
});

// 10. 404 HANDLER
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    available_routes: [
      'GET    /api/health',
      'GET    /api/test',
      'GET    /api/products',
      'GET    /api/products?type={type}',
      'GET    /api/debug/products',
      'GET    /api/setup-database',
      'POST   /api/admin/login',
      'POST   /api/products          (multipart/form-data)',
      'POST   /api/products/json     (application/json)',
      'POST   /api/test-formdata     (test FormData)',
      'DELETE /api/products/:id'
    ]
  });
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`
    ==========================================
          DAKS NDT BACKEND - FORM-DATA READY
    ==========================================
    ✅ Backend: http://localhost:${PORT}
    ✅ CORS: Allowed for all origins
    ✅ Database: ${db ? 'MySQL Connected' : 'No Database'}
    ✅ File Uploads: Enabled (max 5MB)
    ✅ Uploads Folder: ${fs.existsSync('uploads') ? 'Exists' : 'Will be created'}
    
    📍 Test Endpoints:
       1. Health:      http://localhost:${PORT}/api/health
       2. Setup DB:    http://localhost:${PORT}/api/setup-database
       3. Products:    http://localhost:${PORT}/api/products
       4. Debug:       http://localhost:${PORT}/api/debug/products
       
    🧪 Quick Tests:
       # Check server
       curl http://localhost:${PORT}/api/health
       
       # Setup database
       curl http://localhost:${PORT}/api/setup-database
       
       # Test FormData (from terminal)
       curl -X POST http://localhost:${PORT}/api/test-formdata \
         -F "name=Test Product" \
         -F "category=Test Category" \
         -F "type=calibration_block" \
         -F "price=100" \
         -F "image=@./path/to/image.jpg"
    ==========================================
    `);
  });
}

startServer();