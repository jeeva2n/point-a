const mysql = require('mysql2/promise');
require('dotenv').config();

// Check if we are in a production environment (Real Internet)
const isProduction = process.env.NODE_ENV === 'production';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // This is crucial for "Real Internet" usage (Railway, Render, AWS, etc.)
  ssl: isProduction ? { rejectUnauthorized: false } : undefined
});

// Simple connection check
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`✅ Database connected successfully to: ${process.env.DB_HOST}`);
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
})();

module.exports = pool;