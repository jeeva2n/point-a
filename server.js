const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Configs
const db = require('./config/database');

// Import Routes
const adminRoutes = require('./routes/adminRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// 🌍 CORS SETTINGS (THE FIX)
// ==========================================
// We set origin to '*' to allow connections from:
// 1. Your Laptop (localhost:9999)
// 2. Your Phone (192.168.x.x)
// 3. The Public Internet
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ======================
// Multer Setup (Image Uploads)
// ======================
const uploadDir = path.join(__dirname, 'uploads/products/');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const safeName = file.originalname.replace(/\s+/g, '-').toLowerCase();
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(safeName);
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter
});

// ======================
// DATABASE INIT FUNCTION
// ======================
async function initDb() {
  try {
    console.log("⚙️  Checking database tables...");

    const queries = [
      `CREATE TABLE IF NOT EXISTS admins (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        is_active TINYINT(1) DEFAULT 1,
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS products (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255),
        sku VARCHAR(100),
        description TEXT,
        short_description TEXT,
        category VARCHAR(100) NOT NULL,
        subcategory VARCHAR(100),
        type VARCHAR(50) NOT NULL,
        price DECIMAL(10,2) DEFAULT 0.00,
        compare_price DECIMAL(10,2),
        cost_price DECIMAL(10,2),
        image_url VARCHAR(500),
        dimensions VARCHAR(255),
        tolerance VARCHAR(255),
        flaws TEXT,
        materials JSON,
        weight VARCHAR(100),
        standards VARCHAR(255),
        specifications JSON,
        features JSON,
        stock_quantity INT DEFAULT 0,
        is_featured TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        view_count INT DEFAULT 0,
        meta_title VARCHAR(255),
        meta_description TEXT,
        meta_keywords VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS product_images (
        id INT PRIMARY KEY AUTO_INCREMENT,
        product_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        is_main TINYINT(1) DEFAULT 0,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS categories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100),
        description TEXT,
        parent_id INT,
        image_url VARCHAR(500),
        sort_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        meta_title VARCHAR(255),
        meta_description TEXT,
        meta_keywords VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        company VARCHAR(100),
        phone VARCHAR(20),
        address TEXT,
        city VARCHAR(100),
        country VARCHAR(100),
        postal_code VARCHAR(20),
        email_verified TINYINT(1) DEFAULT 0,
        verification_token VARCHAR(255),
        reset_token VARCHAR(255),
        reset_expires TIMESTAMP NULL,
        is_active TINYINT(1) DEFAULT 1,
        last_login TIMESTAMP NULL,
        password_changed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS user_addresses (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        type VARCHAR(20) DEFAULT 'shipping',
        street TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        postal_code VARCHAR(20),
        is_default TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS orders (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        user_id INT,
        customer_email VARCHAR(100),
        customer_name VARCHAR(100),
        customer_company VARCHAR(100),
        customer_phone VARCHAR(20),
        shipping_address JSON,
        billing_address JSON,
        items JSON,
        subtotal DECIMAL(10,2) DEFAULT 0.00,
        tax_amount DECIMAL(10,2) DEFAULT 0.00,
        shipping_amount DECIMAL(10,2) DEFAULT 0.00,
        discount_amount DECIMAL(10,2) DEFAULT 0.00,
        total_amount DECIMAL(10,2) DEFAULT 0.00,
        payment_method VARCHAR(50),
        payment_status VARCHAR(20) DEFAULT 'pending',
        order_status VARCHAR(20) DEFAULT 'pending',
        tracking_number VARCHAR(100),
        carrier VARCHAR(50),
        estimated_delivery DATE,
        shipped_at TIMESTAMP NULL,
        refund_amount DECIMAL(10,2),
        refund_reason TEXT,
        refunded_at TIMESTAMP NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS order_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_id INT NOT NULL,
        product_id INT,
        product_name VARCHAR(255),
        product_sku VARCHAR(100),
        quantity INT DEFAULT 1,
        unit_price DECIMAL(10,2),
        total_price DECIMAL(10,2),
        specifications JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS wishlists (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_wishlist (user_id, product_id)
      )`,
      `CREATE TABLE IF NOT EXISTS reviews (
        id INT PRIMARY KEY AUTO_INCREMENT,
        product_id INT NOT NULL,
        user_id INT,
        user_name VARCHAR(100),
        user_email VARCHAR(100),
        rating INT DEFAULT 5,
        title VARCHAR(255),
        comment TEXT,
        is_approved TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        admin_id INT,
        action VARCHAR(50),
        table_name VARCHAR(50),
        record_id INT,
        old_data JSON,
        new_data JSON,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const query of queries) {
      await db.query(query);
    }

    console.log('✅ Database tables initialized');
    await updateExistingTables();

  } catch (error) {
    console.error('❌ DB Init Error:', error.message);
  }
}

// Function to add missing columns to existing tables
async function updateExistingTables() {
  try {
    const productColumns = [
      { name: 'slug', definition: 'VARCHAR(255) AFTER name' },
      { name: 'sku', definition: 'VARCHAR(100) AFTER slug' },
      { name: 'short_description', definition: 'TEXT AFTER description' },
      { name: 'subcategory', definition: 'VARCHAR(100) AFTER category' },
      { name: 'dimensions', definition: 'VARCHAR(255) AFTER image_url' },
      { name: 'tolerance', definition: 'VARCHAR(255) AFTER dimensions' },
      { name: 'flaws', definition: 'TEXT AFTER tolerance' },
      { name: 'materials', definition: 'JSON AFTER flaws' },
      { name: 'weight', definition: 'VARCHAR(100) AFTER materials' },
      { name: 'standards', definition: 'VARCHAR(255) AFTER weight' },
      { name: 'specifications', definition: 'JSON AFTER standards' },
      { name: 'features', definition: 'JSON AFTER specifications' },
      { name: 'compare_price', definition: 'DECIMAL(10,2) AFTER price' },
      { name: 'cost_price', definition: 'DECIMAL(10,2) AFTER compare_price' },
      { name: 'stock_quantity', definition: 'INT DEFAULT 0 AFTER cost_price' },
      { name: 'is_featured', definition: 'TINYINT(1) DEFAULT 0 AFTER stock_quantity' },
      { name: 'is_active', definition: 'TINYINT(1) DEFAULT 1 AFTER is_featured' },
      { name: 'view_count', definition: 'INT DEFAULT 0 AFTER is_active' },
      { name: 'meta_title', definition: 'VARCHAR(255) AFTER view_count' },
      { name: 'meta_description', definition: 'TEXT AFTER meta_title' },
      { name: 'meta_keywords', definition: 'VARCHAR(255) AFTER meta_description' },
      { name: 'updated_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
    ];

    for (const col of productColumns) {
      try {
        await db.query(`ALTER TABLE products ADD COLUMN ${col.name} ${col.definition}`);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
          console.log(`⚠️ Column check: ${err.message}`);
        }
      }
    }
    console.log("✅ Table schema check completed");
  } catch (error) {
    console.error("❌ Error updating tables:", error.message);
  }
}

// ======================
// Routes Setup
// ======================
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ======================
// PRODUCT ROUTES (INLINE)
// ======================

// GET products
app.get('/api/products', async (req, res) => {
  try {
    const { type, category, search, page = 1, limit = 20 } = req.query;
    let query = 'SELECT * FROM products WHERE is_active = 1';
    const params = [];

    if (type) { query += ' AND type = ?'; params.push(type); }
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countResult] = await db.execute(countQuery, params);
    const total = countResult[0]?.total || 0;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [products] = await db.execute(query, params);

    const productsWithImages = await Promise.all(
      products.map(async (product) => {
        const [images] = await db.execute(
          'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
          [product.id]
        );
        let materials = [];
        let specifications = {};
        try { materials = product.materials ? JSON.parse(product.materials) : []; } catch (e) { materials = []; }
        try { specifications = product.specifications ? JSON.parse(product.specifications) : {}; } catch (e) { specifications = {}; }

        return {
          ...product,
          materials,
          specifications,
          images: images.map(img => ({
            id: img.id,
            url: img.image_url,
            isMain: img.is_main === 1,
            sortOrder: img.sort_order
          })),
          mainImage: images.find(img => img.is_main === 1)?.image_url || product.image_url || null
        };
      })
    );

    res.json({
      success: true,
      count: productsWithImages.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      products: productsWithImages
    });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute('SELECT * FROM products WHERE id = ? AND is_active = 1 LIMIT 1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const product = rows[0];
    const [images] = await db.execute('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC', [id]);

    let materials = [], specifications = {};
    try { materials = product.materials ? JSON.parse(product.materials) : []; } catch (e) { materials = []; }
    try { specifications = product.specifications ? JSON.parse(product.specifications) : {}; } catch (e) { specifications = {}; }

    res.json({
      success: true,
      product: {
        ...product,
        materials,
        specifications,
        images: images.map(img => ({
          id: img.id,
          url: img.image_url,
          isMain: img.is_main === 1,
          sortOrder: img.sort_order
        })),
        mainImage: images.find(img => img.is_main === 1)?.image_url || product.image_url || null
      }
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// CREATE Product
app.post('/api/products', upload.array('images', 10), async (req, res) => {
  try {
    const { 
      name, description, category, type, price,
      dimensions, tolerance, flaws, materials, specifications, mainImageIndex
    } = req.body;

    if (!name || !category || !type) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    let materialsArray = [];
    if (materials) { try { materialsArray = typeof materials === 'string' ? JSON.parse(materials) : materials; } catch (e) { materialsArray = []; } }
    
    let specificationsObj = {};
    if (specifications) { try { specificationsObj = typeof specifications === 'string' ? JSON.parse(specifications) : specifications; } catch (e) { specificationsObj = {}; } }

    const mainIdx = parseInt(mainImageIndex) || 0;
    const mainImageUrl = req.files && req.files.length > 0 
      ? `/uploads/products/${req.files[Math.min(mainIdx, req.files.length - 1)].filename}`
      : null;

    const [result] = await db.execute(
      `INSERT INTO products 
       (name, description, category, type, price, image_url, dimensions, tolerance, flaws, materials, specifications)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || '', category, type, parseFloat(price) || 0, mainImageUrl, dimensions, tolerance, flaws, JSON.stringify(materialsArray), JSON.stringify(specificationsObj)]
    );

    const productId = result.insertId;

    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const isMain = i === mainIdx ? 1 : 0;
        await db.execute(
          `INSERT INTO product_images (product_id, image_url, is_main, sort_order) VALUES (?, ?, ?, ?)`,
          [productId, `/uploads/products/${file.filename}`, isMain, i]
        );
      }
    }

    res.status(201).json({ success: true, message: 'Product created successfully', productId });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE Product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get images to delete
    const [images] = await db.execute('SELECT image_url FROM product_images WHERE product_id = ?', [id]);
    const [product] = await db.execute('SELECT image_url FROM products WHERE id = ?', [id]);
    
    // Delete files (Note: only works if filesystem persists)
    const allImageUrls = [...images.map(img => img.image_url), product[0]?.image_url].filter(Boolean);
    for (const imageUrl of allImageUrls) {
      const imagePath = path.join(__dirname, imageUrl);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    await db.execute('DELETE FROM products WHERE id = ?', [id]);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET Product Categories
app.get('/api/product-categories', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT category, type, COUNT(*) as product_count FROM products WHERE is_active = 1 GROUP BY category, type ORDER BY category, type`
    );
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// SEARCH Products
app.get('/api/products/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, products: [] });

    const searchTerm = `%${q}%`;
    const [products] = await db.execute(
      `SELECT * FROM products WHERE is_active = 1 AND (name LIKE ? OR description LIKE ? OR category LIKE ?) LIMIT 20`,
      [searchTerm, searchTerm, searchTerm]
    );
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Error Handling
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ======================
// SERVER START
// ======================
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initDb();
});