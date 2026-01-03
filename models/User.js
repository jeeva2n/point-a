const mysql = require('mysql2');
require('dotenv').config();

// Create database connection
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

class User {
  // Create a new user
  static async create(userData) {
    try {
      const [result] = await db.query(
        `INSERT INTO users (email, full_name, phone, company, is_verified) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          userData.email,
          userData.full_name || null,
          userData.phone || null,
          userData.company || null,
          true
        ]
      );
      return result.insertId;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  // Find user by email
  static async findByEmail(email) {
    try {
      const [users] = await db.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  }

  // Find user by ID
  static async findById(userId) {
    try {
      const [users] = await db.query(
        'SELECT * FROM users WHERE id = ?',
        [userId]
      );
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  }

  // Update user profile
  static async update(userId, updateData) {
    try {
      const fields = [];
      const values = [];

      const allowedFields = ['full_name', 'phone', 'company', 'address', 'city', 'state', 'zip', 'country'];
      
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          fields.push(`${field} = ?`);
          values.push(updateData[field]);
        }
      });

      if (fields.length === 0) {
        return true;
      }

      values.push(userId);

      const [result] = await db.query(
        `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // Get or create user by email
  static async getOrCreate(email) {
    try {
      let user = await this.findByEmail(email);
      
      if (!user) {
        const userId = await this.create({ email });
        user = await this.findById(userId);
      }

      return user;
    } catch (error) {
      console.error('Error in getOrCreate:', error);
      throw error;
    }
  }
}

module.exports = User;