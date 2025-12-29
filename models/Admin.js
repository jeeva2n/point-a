const pool = require('../config/database-mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class Admin {
  static async findByUsername(username) {
    const [rows] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT id, username, email, role FROM admins WHERE id = ?', [id]);
    return rows[0];
  }

  static async create({ username, password, email, role = 'admin' }) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO admins (username, password, email, role) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, email, role]
    );
    return { id: result.insertId, username, email, role };
  }

  static async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  static async generateToken(admin) {
    return jwt.sign(
      { 
        id: admin.id, 
        username: admin.username, 
        role: admin.role 
      },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '24h' }
    );
  }

  static async verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    } catch (error) {
      return null;
    }
  }
}

module.exports = Admin;