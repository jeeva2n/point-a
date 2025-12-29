const pool = require('../config/database-mysql');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database with sample data...');
    
    // 1. Seed Admin
    console.log('👤 Creating admin user...');
    const adminPassword = await bcrypt.hash('Admin123!z', 12);
    await pool.query(
      `INSERT IGNORE INTO admins (username, password, email, role) 
       VALUES (?, ?, ?, ?)`,
      ['admin', adminPassword, 'admin@daksndt.com', 'super_admin']
    );
    
    // 2. Seed Categories
    console.log('📁 Creating categories...');
    const categories = [
      ['Reference Standards', 'reference-standards', 'Industry-certified reference standards for NDT calibration', 1],
      ['Validation Blocks', 'validation-blocks', 'Precision validation blocks for equipment testing', 2],
      ['Flawed Specimens', 'flawed-specimens', 'Training specimens with artificial flaws', 3],
      ['NDT Kits', 'ndt-kits', 'Complete NDT testing and calibration kits', 4],
      ['Accessories', 'accessories', 'NDT accessories and consumables', 5]
    ];
    
    for (const [name, slug, description, sortOrder] of categories) {
      await pool.query(
        `INSERT IGNORE INTO categories (name, slug, description, sort_order) 
         VALUES (?, ?, ?, ?)`,
        [name, slug, description, sortOrder]
      );
    }
    
    // 3. Seed Products
    console.log('📦 Creating sample products...');
    const products = [
      [
        'UT Calibration Block Set',
        'CB-UT-100',
        'Complete ultrasonic testing calibration block set with various thicknesses and reflectors',
        'High-precision calibration blocks for ultrasonic thickness gauges and flaw detectors. Includes blocks for velocity calibration, linearity checks, and resolution testing.',
        'Reference Standards',
        'UT Calibration Blocks',
        'Steel',
        '100x100x50mm',
        5.2,
        'ASTM E317, ISO 2400',
        'calibration_block',
        299.99,
        349.99,
        150.00,
        50,
        JSON.stringify({
          'Material Grade': 'ASME SA-36',
          'Surface Finish': 'Ra 1.6 μm',
          'Temperature Range': '-20°C to 80°C',
          'Tolerance': '±0.01mm',
          'Certification': 'ISO 17025 Calibrated'
        }),
        JSON.stringify([
          '5 different thickness blocks',
          'Side-drilled holes',
          'Flat-bottom holes',
          'Notches for sensitivity',
          'Calibration certificate included'
        ])
      ],
      [
        'PAUT Validation Block',
        'VB-PAUT-200',
        'Phased Array Ultrasonic Testing validation block for complex geometry inspections',
        'Advanced validation block for PAUT systems with multiple reflectors and complex geometries. Ideal for weld inspection and corrosion mapping.',
        'Validation Blocks',
        'PAUT Validation',
        'Aluminum 6061',
        '200x150x80mm',
        3.8,
        'ASME V, EN 12668',
        'validation_block',
        450.00,
        495.00,
        220.00,
        25,
        JSON.stringify({
          'Material': 'Aluminum 6061-T6',
          'Dimensions': '200x150x80 mm',
          'Reflectors': '12 SDH, 8 FBH, 6 notches',
          'Accuracy': '±0.02mm',
          'Surface': 'Machined to 0.8μm'
        }),
        JSON.stringify([
          'Multiple side-drilled holes',
          'Flat-bottom holes of varying depths',
          'Angled reflectors',
          'Corrosion simulation',
          'Weld-like geometry'
        ])
      ],
      [
        'Flawed Specimen Training Kit',
        'FS-TK-100',
        'Complete training kit with various flawed specimens for NDT method validation',
        'Comprehensive training kit containing specimens with artificial flaws for UT, PT, MT, and RT methods. Perfect for training and certification.',
        'Flawed Specimens',
        'Training Kits',
        'Carbon Steel',
        'Various',
        15.5,
        'ISO 9712, ASNT',
        'flawed_specimen',
        850.00,
        950.00,
        400.00,
        15,
        JSON.stringify({
          'Flaw Types': 'Cracks, Porosity, Inclusions, Lack of Fusion',
          'Material Types': 'Carbon Steel, Stainless Steel, Aluminum',
          'Flaw Sizes': '0.5mm to 5mm',
          'Certification': 'ASNT Level III Approved'
        }),
        JSON.stringify([
          '10 different flawed specimens',
          'Covers all major NDT methods',
          'Training manual included',
          'Storage case',
          'Calibration certificates'
        ])
      ]
    ];
    
    for (const product of products) {
      const [name, sku, shortDesc, description, category, subcategory, material, dimensions, weight, standards, type, price, comparePrice, costPrice, stockQty, specs, features] = product;
      
      const slug = name.toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/--+/g, '-');
      
      await pool.query(
        `INSERT IGNORE INTO products 
         (name, slug, sku, short_description, description, category, subcategory, material, 
          dimensions, weight, standards, type, price, compare_price, cost_price, stock_quantity, 
          specifications, features) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name, slug, sku, shortDesc, description, category, subcategory, material,
          dimensions, weight, standards, type, price, comparePrice, costPrice, stockQty,
          specs, features
        ]
      );
    }
    
    // 4. Seed Sample User
    console.log('👥 Creating sample user...');
    const userPassword = await bcrypt.hash('User123!', 12);
    await pool.query(
      `INSERT IGNORE INTO users 
       (email, password, full_name, company, phone, email_verified, is_active) 
       VALUES (?, ?, ?, ?, ?, TRUE, TRUE)`,
      ['customer@example.com', userPassword, 'John Doe', 'Acme Corporation', '+1-555-0123']
    );
    
    // 5. Seed Sample Order
    console.log('🛒 Creating sample order...');
    const [userResult] = await pool.query('SELECT id FROM users WHERE email = ?', ['customer@example.com']);
    const userId = userResult[0]?.id;
    
    if (userId) {
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const orderDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
      
      await pool.query(
        `INSERT INTO orders 
         (order_number, user_id, customer_email, customer_name, customer_company, customer_phone,
          shipping_address, billing_address, items, subtotal, tax_amount, shipping_amount,
          total_amount, payment_method, payment_status, order_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNumber,
          userId,
          'customer@example.com',
          'John Doe',
          'Acme Corporation',
          '+1-555-0123',
          JSON.stringify({
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            country: 'USA',
            postal_code: '10001'
          }),
          JSON.stringify({
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            country: 'USA',
            postal_code: '10001'
          }),
          JSON.stringify([
            {
              product_id: 1,
              product_name: 'UT Calibration Block Set',
              product_sku: 'CB-UT-100',
              quantity: 2,
              unit_price: 299.99,
              total_price: 599.98
            },
            {
              product_id: 2,
              product_name: 'PAUT Validation Block',
              product_sku: 'VB-PAUT-200',
              quantity: 1,
              unit_price: 450.00,
              total_price: 450.00
            }
          ]),
          1049.98,
          84.00,
          25.00,
          1158.98,
          'credit_card',
          'paid',
          'delivered'
        ]
      );
    }
    
    console.log('🎉 Database seeding completed successfully!');
    
    // Show summary
    console.log('\n📊 Database Summary:');
    const tables = ['admins', 'categories', 'products', 'users', 'orders'];
    for (const table of tables) {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`  ${table}: ${rows[0].count} rows`);
    }
    
    // Show admin login info
    console.log('\n🔐 Admin Login:');
    console.log('  URL: http://localhost:5000/api/admin/login');
    console.log('  Username: admin');
    console.log('  Password: Admin123!z');
    
    // Show API endpoints
    console.log('\n🌐 API Endpoints:');
    console.log('  Products: GET http://localhost:5000/api/products');
    console.log('  Categories: GET http://localhost:5000/api/categories');
    console.log('  Health: GET http://localhost:5000/health');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
// scripts/seed.js - Add this
const bcrypt = require('bcrypt');

async function createDefaultAdmin() {
  const hashedPassword = await bcrypt.hash('admin123z', 10);
  
  await db.query(
    `INSERT IGNORE INTO admins (username, password, email, role) 
     VALUES (?, ?, ?, ?)`,
    ['admin', hashedPassword, 'admin@daksndt.com', 'super_admin']
  );
  
  console.log('✅ Default admin created');
  console.log('Username: admin');
  console.log('Password: admin123z');
}
seedDatabase();