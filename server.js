const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { upload, handleUploadErrors } = require('./config/upload');

const cartRoutes = require('./routes/cart');
const quoteRoutes = require('./routes/quote');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const contactRoutes = require('./routes/contactRoutes');
const adminRoutes = require('./routes/adminRoutes'); 

const app = express();

/* =========================
   Middleware
========================= */
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   Static Files
========================= */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* =========================
   Routes
========================= */
app.use('/api/cart', cartRoutes);
app.use('/api/quote-requests', quoteRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);


// Database connection
const mysql = require('mysql2');
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'daks_ndt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const db = pool.promise();

// Initialize database tables
async function initDb() {
  try {
    // Create products table
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
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
        stock_quantity INT DEFAULT 10,
        sku VARCHAR(100),
        meta_title VARCHAR(255),
        meta_description TEXT,
        meta_keywords VARCHAR(255),
        is_featured BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create product_images table
    await db.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id INT PRIMARY KEY AUTO_INCREMENT,
        product_id INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        is_main BOOLEAN DEFAULT FALSE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        full_name VARCHAR(255),
        phone VARCHAR(50),
        company VARCHAR(255),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        zip VARCHAR(20),
        country VARCHAR(100) DEFAULT 'India',
        is_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        reset_token VARCHAR(255),
        reset_token_expires DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create otp_codes table
    await db.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        expires_at DATETIME NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create carts table
    await db.query(`
      CREATE TABLE IF NOT EXISTS carts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        customer_email VARCHAR(255),
        customer_name VARCHAR(255),
        status ENUM('active', 'converted', 'abandoned') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create cart_items table
    await db.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        cart_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT DEFAULT 1,
        price DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    // Create orders table
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        user_id INT,
        cart_id INT,
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50),
        customer_company VARCHAR(255),
        shipping_address TEXT,
        shipping_city VARCHAR(100),
        shipping_state VARCHAR(100),
        shipping_zip VARCHAR(20),
        shipping_country VARCHAR(100) DEFAULT 'India',
        order_notes TEXT,
        subtotal DECIMAL(10,2) DEFAULT 0.00,
        tax DECIMAL(10,2) DEFAULT 0.00,
        shipping_cost DECIMAL(10,2) DEFAULT 0.00,
        total_amount DECIMAL(10,2) DEFAULT 0.00,
        order_type ENUM('purchase', 'quote') DEFAULT 'purchase',
        status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE SET NULL
      )
    `);

    // Create order_items table
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_id INT NOT NULL,
        product_id INT,
        product_name VARCHAR(255) NOT NULL,
        product_sku VARCHAR(100),
        quantity INT DEFAULT 1,
        unit_price DECIMAL(10,2) DEFAULT 0.00,
        total_price DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      )
    `);

    // Create quote_requests table
    await db.query(`
      CREATE TABLE IF NOT EXISTS quote_requests (
        id INT PRIMARY KEY AUTO_INCREMENT,
        quote_number VARCHAR(50) UNIQUE NOT NULL,
        user_id INT,
        customer_name VARCHAR(255),
        customer_email VARCHAR(255),
        customer_phone VARCHAR(50),
        customer_company VARCHAR(255),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        zip VARCHAR(20),
        country VARCHAR(100) DEFAULT 'India',
        message TEXT,
        status ENUM('pending', 'submitted', 'reviewed', 'quoted', 'accepted', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create quote_request_items table
    await db.query(`
      CREATE TABLE IF NOT EXISTS quote_request_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        quote_request_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quote_request_id) REFERENCES quote_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    // Create contact_messages table
    await db.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        company VARCHAR(255),
        message TEXT NOT NULL,
        status ENUM('new', 'read', 'replied', 'closed') DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create admins table
    await db.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('super_admin', 'admin', 'editor', 'viewer') DEFAULT 'admin',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ DB Init Error:', error.message);
  }
}

// Helper function to parse JSON fields
function parseProductFields(product) {
  // Parse JSON fields
  if (product.materials) {
    try {
      product.materials = JSON.parse(product.materials);
    } catch (e) {
      product.materials = [];
    }
  } else {
    product.materials = [];
  }

  if (product.specifications) {
    try {
      product.specifications = JSON.parse(product.specifications);
    } catch (e) {
      product.specifications = {};
    }
  } else {
    product.specifications = {};
  }

  if (product.features) {
    try {
      product.features = JSON.parse(product.features);
    } catch (e) {
      product.features = {};
    }
  } else {
    product.features = {};
  }

  return product;
}

// ======================
// PRODUCT ROUTES
// ======================

// GET ALL PRODUCTS
app.get('/api/products', async (req, res) => {
  try {
    const { type, category, search, limit = 100 } = req.query;
    let query = 'SELECT * FROM products WHERE is_active = TRUE';
    const params = [];

    if (type && type !== 'all') {
      query += ' AND type = ?';
      params.push(type);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ? OR category LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [products] = await db.query(query, params);

    // Get images for each product
    const productsWithImages = await Promise.all(
      products.map(async (product) => {
        const [images] = await db.query(
          'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
          [product.id]
        );

        const parsedProduct = parseProductFields(product);
        
        parsedProduct.images = images.map(img => ({
          id: img.id,
          url: img.image_url,
          isMain: img.is_main === 1,
          sortOrder: img.sort_order
        }));

        // Set main image
        const mainImage = images.find(img => img.is_main === 1);
        parsedProduct.mainImage = mainImage ? mainImage.image_url : 
          (images.length > 0 ? images[0].image_url : product.image_url);
        
        parsedProduct.image_url = parsedProduct.mainImage;

        return parsedProduct;
      })
    );

    res.json({
      success: true,
      products: productsWithImages
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching products'
    });
  }
});

// GET SINGLE PRODUCT BY ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [products] = await db.query(
      'SELECT * FROM products WHERE id = ? AND is_active = TRUE',
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const product = products[0];

    // Get all images for this product
    const [images] = await db.query(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
      [id]
    );

    const parsedProduct = parseProductFields(product);
    
    parsedProduct.images = images.map(img => ({
      id: img.id,
      url: img.image_url,
      isMain: img.is_main === 1,
      sortOrder: img.sort_order
    }));

    // Set main image
    const mainImage = images.find(img => img.is_main === 1);
    parsedProduct.mainImage = mainImage ? mainImage.image_url : 
      (images.length > 0 ? images[0].image_url : product.image_url);
    
    parsedProduct.image_url = parsedProduct.mainImage;

    res.json({
      success: true,
      product: parsedProduct
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching product'
    });
  }
});

// CREATE PRODUCT
app.post('/api/products', upload.array('images', 10), handleUploadErrors, async (req, res) => {
  try {
    const { 
      name, description, short_description, category, subcategory, type,
      price, compare_price, cost_price, stock_quantity, sku,
      dimensions, tolerance, flaws, weight, standards,
      materials, specifications, features,
      meta_title, meta_description, meta_keywords,
      is_featured, mainImageIndex = 0
    } = req.body;

    console.log('📥 Received product data:', { name, category, type, price });

    if (!name || !category || !type) {
      // Clean up uploaded files if validation fails
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join(__dirname, 'uploads/products', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, category, and type'
      });
    }

    // Parse JSON fields
    let materialsArray = [];
    if (materials) {
      try {
        materialsArray = typeof materials === 'string' ? JSON.parse(materials) : materials;
      } catch (e) {
        materialsArray = Array.isArray(materials) ? materials : [];
      }
    }

    let specificationsObj = {};
    if (specifications) {
      try {
        specificationsObj = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
      } catch (e) {
        specificationsObj = {};
      }
    }

    let featuresObj = {};
    if (features) {
      try {
        featuresObj = typeof features === 'string' ? JSON.parse(features) : features;
      } catch (e) {
        featuresObj = {};
      }
    }

    // Insert product
    const [result] = await db.query(
      `INSERT INTO products (
        name, description, short_description, category, subcategory, type,
        price, compare_price, cost_price, stock_quantity, sku,
        dimensions, tolerance, flaws, weight, standards,
        materials, specifications, features,
        meta_title, meta_description, meta_keywords, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, 
        description || '', 
        short_description || '', 
        category, 
        subcategory || '', 
        type,
        parseFloat(price) || 0, 
        compare_price ? parseFloat(compare_price) : null, 
        cost_price ? parseFloat(cost_price) : null, 
        parseInt(stock_quantity) || 10, 
        sku || '',
        dimensions || null, 
        tolerance || null, 
        flaws || null, 
        weight || null, 
        standards || null,
        JSON.stringify(materialsArray), 
        JSON.stringify(specificationsObj), 
        JSON.stringify(featuresObj),
        meta_title || null, 
        meta_description || null, 
        meta_keywords || null,
        is_featured === 'true' || is_featured === true || false
      ]
    );

    const productId = result.insertId;
    console.log('✅ Product inserted with ID:', productId);

    // Handle images
    let mainImageUrl = null;
    if (req.files && req.files.length > 0) {
      console.log('📸 Processing', req.files.length, 'images');
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const imageUrl = `/uploads/products/${file.filename}`;
        const isMain = parseInt(mainImageIndex) === i;
        
        if (isMain) {
          mainImageUrl = imageUrl;
          console.log('⭐ Set main image:', file.filename);
        }

        await db.query(
          'INSERT INTO product_images (product_id, image_url, is_main, sort_order) VALUES (?, ?, ?, ?)',
          [productId, imageUrl, isMain, i]
        );
      }

      // If main image was set, update product
      if (mainImageUrl) {
        await db.query('UPDATE products SET image_url = ? WHERE id = ?', [mainImageUrl, productId]);
      }
    }

    // Fetch the created product with images
    const [productRows] = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
    const [imageRows] = await db.query(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
      [productId]
    );

    const product = parseProductFields(productRows[0]);
    product.images = imageRows.map(img => ({
      id: img.id,
      url: img.image_url,
      isMain: img.is_main === 1,
      sortOrder: img.sort_order
    }));

    // Set main image
    const mainImage = imageRows.find(img => img.is_main === 1);
    product.mainImage = mainImage ? mainImage.image_url : 
      (imageRows.length > 0 ? imageRows[0].image_url : product.image_url);
    
    product.image_url = product.mainImage;

    console.log('✅ Product created successfully:', product.name);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('❌ Create product error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        const filePath = path.join(__dirname, 'uploads/products', file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error creating product: ' + error.message
    });
  }
});

// UPDATE PRODUCT
app.put('/api/products/:id', upload.array('images', 10), handleUploadErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, short_description, category, subcategory, type,
      price, compare_price, cost_price, stock_quantity, sku,
      dimensions, tolerance, flaws, weight, standards,
      materials, specifications, features,
      meta_title, meta_description, meta_keywords,
      is_featured, mainImageIndex, mainImageId, deleteImages
    } = req.body;

    console.log('📝 Updating product ID:', id);

    // Check if product exists
    const [existing] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Handle image deletions
    if (deleteImages) {
      let imagesToDelete = [];
      try {
        imagesToDelete = typeof deleteImages === 'string' ? JSON.parse(deleteImages) : deleteImages;
      } catch (e) {
        imagesToDelete = [];
      }

      console.log('🗑️ Deleting images:', imagesToDelete);

      for (const imageId of imagesToDelete) {
        const [imgRows] = await db.query(
          'SELECT image_url FROM product_images WHERE id = ? AND product_id = ?',
          [imageId, id]
        );
        
        if (imgRows.length > 0) {
          const imagePath = path.join(__dirname, imgRows[0].image_url);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('🗑️ Deleted image file:', imagePath);
          }
          await db.query('DELETE FROM product_images WHERE id = ?', [imageId]);
        }
      }
    }

    // Add new images
    if (req.files && req.files.length > 0) {
      // Get current max sort order
      const [maxOrder] = await db.query(
        'SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?',
        [id]
      );
      let sortOrder = (maxOrder[0].max_order || -1) + 1;

      console.log('📸 Adding', req.files.length, 'new images starting at sort order:', sortOrder);

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        await db.query(
          'INSERT INTO product_images (product_id, image_url, is_main, sort_order) VALUES (?, ?, ?, ?)',
          [id, `/uploads/products/${file.filename}`, 0, sortOrder + i]
        );
      }
    }

    // Handle main image setting
    if (mainImageId !== undefined && mainImageId !== null) {
      console.log('⭐ Setting main image by ID:', mainImageId);
      
      // Set specified existing image as main
      await db.query('UPDATE product_images SET is_main = 0 WHERE product_id = ?', [id]);
      await db.query('UPDATE product_images SET is_main = 1 WHERE id = ? AND product_id = ?', [mainImageId, id]);
      
      // Get image URL and update product
      const [mainImageRow] = await db.query(
        'SELECT image_url FROM product_images WHERE id = ?',
        [mainImageId]
      );
      if (mainImageRow.length > 0) {
        await db.query('UPDATE products SET image_url = ? WHERE id = ?', [mainImageRow[0].image_url, id]);
      }
    } else if (mainImageIndex !== undefined && mainImageIndex !== null) {
      console.log('⭐ Setting main image by index:', mainImageIndex);
      
      // Set image at index as main (for new images)
      const [allImages] = await db.query(
        'SELECT id, image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
        [id]
      );
      
      if (allImages.length > 0) {
        const mainIdx = Math.min(parseInt(mainImageIndex), allImages.length - 1);
        await db.query('UPDATE product_images SET is_main = 0 WHERE product_id = ?', [id]);
        await db.query('UPDATE product_images SET is_main = 1 WHERE id = ?', [allImages[mainIdx].id]);
        await db.query('UPDATE products SET image_url = ? WHERE id = ?', [allImages[mainIdx].image_url, id]);
      }
    }

    // Parse JSON fields for update
    let materialsArray = [];
    if (materials !== undefined) {
      try {
        materialsArray = typeof materials === 'string' ? JSON.parse(materials) : materials;
      } catch (e) {
        materialsArray = Array.isArray(materials) ? materials : [];
      }
    }

    let specificationsObj = {};
    if (specifications !== undefined) {
      try {
        specificationsObj = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
      } catch (e) {
        specificationsObj = {};
      }
    }

    let featuresObj = {};
    if (features !== undefined) {
      try {
        featuresObj = typeof features === 'string' ? JSON.parse(features) : features;
      } catch (e) {
        featuresObj = {};
      }
    }

    // Build update query
    const updates = [];
    const params = [];

    const fields = {
      name, description, short_description, category, subcategory, type,
      price, compare_price, cost_price, stock_quantity, sku,
      dimensions, tolerance, flaws, weight, standards,
      meta_title, meta_description, meta_keywords, is_featured
    };

    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'price' || key === 'compare_price' || key === 'cost_price') {
          updates.push(`${key} = ?`);
          params.push(value !== '' ? parseFloat(value) : null);
        } else if (key === 'stock_quantity') {
          updates.push(`${key} = ?`);
          params.push(value !== '' ? parseInt(value) : 0);
        } else if (key === 'is_featured') {
          updates.push(`${key} = ?`);
          params.push(value === 'true' || value === true || false);
        } else {
          updates.push(`${key} = ?`);
          params.push(value || null);
        }
      }
    });

    // Add JSON fields
    if (materials !== undefined) {
      updates.push('materials = ?');
      params.push(JSON.stringify(materialsArray));
    }
    
    if (specifications !== undefined) {
      updates.push('specifications = ?');
      params.push(JSON.stringify(specificationsObj));
    }
    
    if (features !== undefined) {
      updates.push('features = ?');
      params.push(JSON.stringify(featuresObj));
    }

    if (updates.length > 0) {
      params.push(id);
      await db.query(
        `UPDATE products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params
      );
    }

    // Fetch updated product with images
    const [productRows] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    const [imageRows] = await db.query(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
      [id]
    );

    const product = parseProductFields(productRows[0]);
    product.images = imageRows.map(img => ({
      id: img.id,
      url: img.image_url,
      isMain: img.is_main === 1,
      sortOrder: img.sort_order
    }));

    // Set main image
    const mainImage = imageRows.find(img => img.is_main === 1);
    product.mainImage = mainImage ? mainImage.image_url : 
      (imageRows.length > 0 ? imageRows[0].image_url : product.image_url);
    
    product.image_url = product.mainImage;

    console.log('✅ Product updated successfully:', product.name);

    res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('❌ Update product error:', error);
    
    // Clean up uploaded files on error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const filePath = path.join(__dirname, 'uploads/products', file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error updating product: ' + error.message
    });
  }
});

// DELETE PRODUCT
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting product ID:', id);

    // Get all images for this product
    const [images] = await db.query(
      'SELECT image_url FROM product_images WHERE product_id = ?',
      [id]
    );

    // Delete all image files
    for (const img of images) {
      const imagePath = path.join(__dirname, img.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log('🗑️ Deleted image:', imagePath);
      }
    }

    // Delete from database (product_images will be deleted by CASCADE)
    await db.query('DELETE FROM products WHERE id = ?', [id]);

    console.log('✅ Product deleted successfully:', id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting product'
    });
  }
});

// BULK DELETE PRODUCTS
app.delete('/api/products/bulk', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No product IDs provided'
      });
    }

    console.log('🗑️ Bulk deleting products:', ids);

    // Delete each product
    for (const id of ids) {
      // Get all images for this product
      const [images] = await db.query(
        'SELECT image_url FROM product_images WHERE product_id = ?',
        [id]
      );

      // Delete all image files
      for (const img of images) {
        const imagePath = path.join(__dirname, img.image_url);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      // Delete from database
      await db.query('DELETE FROM products WHERE id = ?', [id]);
    }

    res.json({
      success: true,
      message: `${ids.length} products deleted successfully`
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk delete'
    });
  }
});

// GET PRODUCT STATISTICS
app.get('/api/products/stats', async (req, res) => {
  try {
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN type = 'calibration_block' THEN 1 ELSE 0 END) as calibration_blocks,
        SUM(CASE WHEN type = 'flawed_specimen' THEN 1 ELSE 0 END) as flawed_specimens,
        SUM(CASE WHEN type = 'validation_block' THEN 1 ELSE 0 END) as validation_blocks,
        SUM(CASE WHEN is_featured = TRUE THEN 1 ELSE 0 END) as featured_products,
        SUM(stock_quantity) as total_stock
      FROM products 
      WHERE is_active = TRUE
    `);

    res.json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching statistics'
    });
  }
});

// SEARCH PRODUCTS
app.get('/api/products/search/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const searchTerm = `%${keyword}%`;

    const [products] = await db.query(
      `SELECT * FROM products 
       WHERE is_active = TRUE 
       AND (name LIKE ? OR description LIKE ? OR category LIKE ? OR sku LIKE ?)
       ORDER BY name ASC`,
      [searchTerm, searchTerm, searchTerm, searchTerm]
    );

    // Get images for each product
    const productsWithImages = await Promise.all(
      products.map(async (product) => {
        const [images] = await db.query(
          'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
          [product.id]
        );

        const parsedProduct = parseProductFields(product);
        
        parsedProduct.images = images.map(img => ({
          id: img.id,
          url: img.image_url,
          isMain: img.is_main === 1,
          sortOrder: img.sort_order
        }));

        // Set main image
        const mainImage = images.find(img => img.is_main === 1);
        parsedProduct.mainImage = mainImage ? mainImage.image_url : 
          (images.length > 0 ? images[0].image_url : product.image_url);
        
        parsedProduct.image_url = parsedProduct.mainImage;

        return parsedProduct;
      })
    );

    res.json({
      success: true,
      products: productsWithImages,
      count: productsWithImages.length
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error searching products'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'NDT Products API',
    version: '1.0.0'
  });
});

// Database test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const [result] = await db.query('SELECT 1 + 1 AS result');
    res.json({
      success: true,
      message: 'Database connection successful',
      result: result[0].result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed: ' + error.message
    });
  }
});

// List all uploads (for debugging)
app.get('/api/uploads/list', (req, res) => {
  const uploadPath = path.join(__dirname, 'uploads/products');
  
  fs.readdir(uploadPath, (err, files) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Error reading upload directory'
      });
    }
    
    res.json({
      success: true,
      files: files,
      count: files.length
    });
  });
});

// Clear all uploads (for debugging - use with caution!)
app.delete('/api/uploads/clear', (req, res) => {
  const uploadPath = path.join(__dirname, 'uploads/products');
  
  fs.readdir(uploadPath, (err, files) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Error reading upload directory'
      });
    }
    
    let deletedCount = 0;
    files.forEach(file => {
      const filePath = path.join(uploadPath, file);
      fs.unlinkSync(filePath);
      deletedCount++;
    });
    
    res.json({
      success: true,
      message: `Deleted ${deletedCount} files`
    });
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Start server
const PORT = process.env.PORT || 5001;

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Test DB: http://localhost:${PORT}/api/test-db`);
  console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads/products')}`);
  
  // Initialize database
  await initDb();
  
  // Test database connection
  try {
    const [result] = await db.query('SELECT 1 + 1 AS result');
    console.log(`✅ Database connected: ${result[0].result === 2 ? 'OK' : 'Failed'}`);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
});