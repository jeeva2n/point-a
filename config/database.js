const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'dakstool_dakstool',
  password: process.env.DB_PASSWORD || '040995aBI@',
  database: process.env.DB_NAME || 'dakstool_daks_ndt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const db = pool.promise();

// Test connection on load
db.query('SELECT 1')
  .then(() => console.log('✅ Database module loaded'))
  .catch(err => console.error('❌ Database error:', err.message));

module.exports = db;