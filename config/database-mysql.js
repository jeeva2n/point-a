// config/database-sqlite.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite:', err.message);
  } else {
    console.log('✅ Connected to SQLite database');
    createTables();
  }
});

function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    type TEXT,
    price REAL,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Insert sample data
  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (row.count === 0) {
      const sampleProducts = [
        ['UT Calibration Block Set', 'Complete ultrasonic testing calibration block set', 'Reference Standards', 'calibration_block', 299.99],
        ['PAUT Validation Block', 'Phased Array Ultrasonic Testing validation block', 'Validation Blocks', 'validation_block', 450.00],
        ['Flawed Specimen Training Kit', 'Complete training kit with various flawed specimens', 'Flawed Specimens', 'flawed_specimen', 850.00]
      ];
      
      sampleProducts.forEach(product => {
        db.run(
          'INSERT INTO products (name, description, category, type, price) VALUES (?, ?, ?, ?, ?)',
          product
        );
      });
      console.log('✅ Inserted sample products');
    }
  });
}

module.exports = db;