// scripts/reset-db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

async function resetDatabase() {
  let connection;
  
  try {
    // Create connection without database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });
    
    console.log('✅ Connected to MySQL server');
    
    // Create database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'daks_ndt'}`);
    console.log(`✅ Database ${process.env.DB_NAME || 'daks_ndt'} created/verified`);
    
    // Use the database
    await connection.query(`USE ${process.env.DB_NAME || 'daks_ndt'}`);
    
    console.log('🔍 Checking existing tables...');
    
    // First disable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Get all tables
    const [tables] = await connection.query('SHOW TABLES');
    
    // Drop all tables one by one
    for (const table of tables) {
      const tableName = table[`Tables_in_${process.env.DB_NAME || 'daks_ndt'}`];
      console.log(`   Dropping table: ${tableName}`);
      try {
        await connection.query(`DROP TABLE IF EXISTS ${tableName}`);
      } catch (error) {
        console.log(`   ⚠️  Could not drop ${tableName}: ${error.message}`);
      }
    }
    
    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('✅ All old tables dropped');
    
    // Create fresh tables
    console.log('🗃️ Creating new tables...');
    
    // Create admins table first (no foreign keys)
    await connection.query(`
      CREATE TABLE admins (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Admins table created');
    
    // Create products table
    await connection.query(`
      CREATE TABLE products (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) NOT NULL,
        subcategory VARCHAR(100),
        material VARCHAR(100),
        dimensions VARCHAR(100),
        standards VARCHAR(255),
        specifications JSON,
        image_url VARCHAR(500),
        type VARCHAR(50) NOT NULL,
        price DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);
    console.log('✅ Products table created');
    
    // Insert default admin
    console.log('👤 Creating default admin...');
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    try {
      await connection.query(
        'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
        ['admin', hashedPassword, 'admin@daksndt.com', 'super_admin']
      );
      console.log('✅ Default admin created: admin / admin123');
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        console.log('✅ Admin already exists');
      } else {
        throw error;
      }
    }
    
    // Insert sample products
    console.log('📦 Inserting sample products...');
    const sampleProducts = [
      ['UT Calibration Block Set', 'Complete ultrasonic testing calibration block set', 'Reference Standards', 'UT Calibration Blocks', 'Steel', '100x100x50mm', 'ASTM E317', 'calibration_block', 299.99],
      ['PAUT Validation Block', 'Phased Array Ultrasonic Testing validation block', 'Validation Blocks', 'PAUT Validation', 'Aluminum', '200x150x80mm', 'ASME V', 'validation_block', 450.00],
      ['Flawed Specimen Training Kit', 'Complete training kit with various flawed specimens', 'Flawed Specimens', 'Training Kits', 'Carbon Steel', 'Various', 'ISO 9712', 'flawed_specimen', 850.00]
    ];
    
    for (const product of sampleProducts) {
      try {
        await connection.query(
          `INSERT INTO products (name, description, category, subcategory, material, dimensions, standards, type, price) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          product
        );
        console.log(`   Added: ${product[0]}`);
      } catch (error) {
        console.log(`   ⚠️  Could not add ${product[0]}: ${error.message}`);
      }
    }
    
    console.log(`✅ ${sampleProducts.length} sample products inserted`);
    
    console.log('\n🎉 Database reset complete!');
    console.log('\n📊 Verification:');
    
    // Count products
    const [productRows] = await connection.query('SELECT COUNT(*) as count FROM products');
    console.log(`   Products: ${productRows[0].count}`);
    
    // Count admins
    const [adminRows] = await connection.query('SELECT COUNT(*) as count FROM admins');
    console.log(`   Admins: ${adminRows[0].count}`);
    
    // Show table structure
    console.log('\n📋 Table Structure:');
    const [tablesAfter] = await connection.query('SHOW TABLES');
    tablesAfter.forEach(table => {
      const tableName = table[`Tables_in_${process.env.DB_NAME || 'daks_ndt'}`];
      console.log(`   - ${tableName}`);
    });
    
    // Show sample data
    console.log('\n📝 Sample Products:');
    const [products] = await connection.query('SELECT id, name, type, price FROM products LIMIT 5');
    products.forEach(p => {
      console.log(`   #${p.id}: ${p.name} (${p.type}) - $${p.price}`);
    });
    
  } catch (error) {
    console.error('❌ Error resetting database:', error.message);
    console.error('Error details:', error);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n🔧 Please check your MySQL credentials in .env file');
      console.log('   Current config:', {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        database: process.env.DB_NAME
      });
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('\n🔧 Please create the database manually first');
      console.log(`   SQL: CREATE DATABASE ${process.env.DB_NAME || 'daks_ndt'};`);
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log('\n🔧 Tables don\'t exist yet, continuing...');
    }
  } finally {
    if (connection) {
      try {
        // Re-enable foreign key checks before closing
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.end();
        console.log('\n🔌 Database connection closed');
      } catch (error) {
        console.log('Error closing connection:', error.message);
      }
    }
  }
}

resetDatabase();