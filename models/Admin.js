// models/Admin.js
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class Admin {
  // Find admin by username
  static async findByUsername(username) {
    try {
      const [rows] = await db.execute(
        'SELECT * FROM admins WHERE username = ?', 
        [username]
      );
      return rows[0] || null;
    } catch (error) {
      console.error('findByUsername error:', error.message);
      throw error;
    }
  }

  // Find admin by ID
  static async findById(id) {
    try {
      const [rows] = await db.execute(
        'SELECT id, username, email, role, is_active, last_login, created_at FROM admins WHERE id = ?', 
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      console.error('findById error:', error.message);
      throw error;
    }
  }

  // Compare password - SIMPLIFIED VERSION
  static async comparePassword(inputPassword, storedPassword) {
    console.log('🔑 Comparing passwords...');
    console.log('   Input password:', inputPassword);
    console.log('   Stored password (first 20 chars):', storedPassword?.substring(0, 20));
    console.log('   Is hashed (starts with $2):', storedPassword?.startsWith('$2'));
    
    // If no stored password
    if (!storedPassword) {
      console.log('   ❌ No stored password!');
      return false;
    }

    // Method 1: Bcrypt hashed password
    if (storedPassword.startsWith('$2')) {
      try {
        const result = await bcrypt.compare(inputPassword, storedPassword);
        console.log('   Bcrypt compare result:', result);
        return result;
      } catch (err) {
        console.log('   Bcrypt error:', err.message);
        return false;
      }
    }
    
    // Method 2: Plain text password (for legacy/testing)
    const plainMatch = (inputPassword === storedPassword);
    console.log('   Plain text compare result:', plainMatch);
    return plainMatch;
  }

  // Activate account
  static async activateAccount(id) {
    try {
      await db.execute('UPDATE admins SET is_active = 1 WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('activateAccount error:', error.message);
      throw error;
    }
  }

  // Generate JWT token
  static generateToken(admin) {
    const secret = process.env.JWT_SECRET || 'daks-ndt-secret-key-2024';
    return jwt.sign(
      { 
        id: admin.id, 
        username: admin.username, 
        email: admin.email,
        role: admin.role 
      },
      secret,
      { expiresIn: '7d' }
    );
  }

  // Update last login
  static async updateLastLogin(id) {
    try {
      await db.execute('UPDATE admins SET last_login = NOW() WHERE id = ?', [id]);
    } catch (error) {
      // Non-critical, don't throw
    }
  }

  // Create admin with hashed password
  static async create(adminData) {
    const { username, email, password, role = 'admin' } = adminData;
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const [result] = await db.execute(
      'INSERT INTO admins (username, email, password, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [username, email, hashedPassword, role]
    );
    
    return result.insertId;
  }
}

module.exports = Admin;