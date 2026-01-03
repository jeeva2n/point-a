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

class Contact {
  // Create a new contact message
  static async create(contactData) {
    try {
      const [result] = await db.query(
        `INSERT INTO contact_messages (user_id, name, email, phone, company, message) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          contactData.user_id || null,
          contactData.name,
          contactData.email,
          contactData.phone || null,
          contactData.company || null,
          contactData.message
        ]
      );
      return result.insertId;
    } catch (error) {
      console.error('Error creating contact message:', error);
      throw error;
    }
  }

  // Get all contact messages (admin)
  static async getAll(filters = {}) {
    try {
      let query = 'SELECT * FROM contact_messages WHERE 1=1';
      const params = [];

      if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }

      query += ' ORDER BY created_at DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit));
      }

      const [messages] = await db.query(query, params);
      return messages;
    } catch (error) {
      console.error('Error getting contact messages:', error);
      throw error;
    }
  }

  // Update status
  static async updateStatus(messageId, status) {
    try {
      const [result] = await db.query(
        'UPDATE contact_messages SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, messageId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating contact message status:', error);
      throw error;
    }
  }
}

module.exports = Contact;