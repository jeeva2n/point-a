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

class QuoteRequest {
  // Create a new quote request
  static async create(customerInfo = {}) {
    try {
      const quoteNumber = 'QUOTE-' + Date.now();
      
      const [result] = await db.query(
        `INSERT INTO quote_requests (
          quote_number, user_id, customer_name, customer_email, customer_phone,
          customer_company, address, city, state, zip, country, message, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quoteNumber,
          customerInfo.user_id || null,
          customerInfo.name || null,
          customerInfo.email || null,
          customerInfo.phone || null,
          customerInfo.company || null,
          customerInfo.address || null,
          customerInfo.city || null,
          customerInfo.state || null,
          customerInfo.zip || null,
          customerInfo.country || 'India',
          customerInfo.message || null,
          'pending'
        ]
      );
      return result.insertId;
    } catch (error) {
      console.error('Error creating quote request:', error);
      throw error;
    }
  }

  // Get quote request by ID with items
  static async getById(quoteId) {
    try {
      const [quotes] = await db.query(
        'SELECT * FROM quote_requests WHERE id = ?',
        [quoteId]
      );

      if (quotes.length === 0) {
        return null;
      }

      const quoteRequest = quotes[0];

      // Get quote items with product details
      const [items] = await db.query(`
        SELECT 
          qri.id,
          qri.product_id,
          qri.quantity,
          p.name as product_name,
          p.description,
          p.short_description,
          p.image_url,
          p.sku,
          p.price
        FROM quote_request_items qri
        JOIN products p ON qri.product_id = p.id
        WHERE qri.quote_request_id = ?
        ORDER BY qri.created_at DESC
      `, [quoteId]);

      quoteRequest.items = items;
      return quoteRequest;
    } catch (error) {
      console.error('Error getting quote request:', error);
      throw error;
    }
  }

  // Add item to quote request
  static async addItem(quoteId, productId, quantity = 1) {
    try {
      // Check if item already exists
      const [existingItems] = await db.query(
        'SELECT id, quantity FROM quote_request_items WHERE quote_request_id = ? AND product_id = ?',
        [quoteId, productId]
      );

      if (existingItems.length > 0) {
        // Update quantity
        const newQuantity = existingItems[0].quantity + quantity;
        await db.query(
          'UPDATE quote_request_items SET quantity = ? WHERE id = ?',
          [newQuantity, existingItems[0].id]
        );
      } else {
        // Insert new item
        await db.query(
          'INSERT INTO quote_request_items (quote_request_id, product_id, quantity) VALUES (?, ?, ?)',
          [quoteId, productId, quantity]
        );
      }

      // Update quote request timestamp
      await db.query(
        'UPDATE quote_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [quoteId]
      );

      return true;
    } catch (error) {
      console.error('Error adding item to quote request:', error);
      throw error;
    }
  }

  // Remove item from quote request
  static async removeItem(quoteId, itemId) {
    try {
      const [result] = await db.query(
        'DELETE FROM quote_request_items WHERE id = ? AND quote_request_id = ?',
        [itemId, quoteId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error removing item from quote request:', error);
      throw error;
    }
  }

  // Update item quantity
  static async updateItemQuantity(quoteId, itemId, quantity) {
    try {
      if (quantity < 1) {
        return await this.removeItem(quoteId, itemId);
      }

      const [result] = await db.query(
        'UPDATE quote_request_items SET quantity = ? WHERE id = ? AND quote_request_id = ?',
        [quantity, itemId, quoteId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating quote item quantity:', error);
      throw error;
    }
  }

  // Update customer info
  static async updateCustomerInfo(quoteId, customerInfo) {
    try {
      const fields = [];
      const values = [];

      const fieldMap = {
        user_id: 'user_id',
        name: 'customer_name',
        email: 'customer_email',
        phone: 'customer_phone',
        company: 'customer_company',
        address: 'address',
        city: 'city',
        state: 'state',
        zip: 'zip',
        country: 'country',
        message: 'message',
        status: 'status'
      };

      Object.entries(fieldMap).forEach(([key, dbField]) => {
        if (customerInfo[key] !== undefined) {
          fields.push(`${dbField} = ?`);
          values.push(customerInfo[key]);
        }
      });

      if (fields.length === 0) return true;

      values.push(quoteId);

      const [result] = await db.query(
        `UPDATE quote_requests SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating customer info:', error);
      throw error;
    }
  }

  // Update quote request status
  static async updateStatus(quoteId, status) {
    try {
      const [result] = await db.query(
        'UPDATE quote_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, quoteId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating quote request status:', error);
      throw error;
    }
  }

  // Get quote requests by user ID
  static async getByUserId(userId) {
    try {
      const [quotes] = await db.query(`
        SELECT qr.*, 
          GROUP_CONCAT(p.name SEPARATOR ', ') as product_names
        FROM quote_requests qr
        LEFT JOIN quote_request_items qri ON qr.id = qri.quote_request_id
        LEFT JOIN products p ON qri.product_id = p.id
        WHERE qr.user_id = ?
        GROUP BY qr.id
        ORDER BY qr.created_at DESC
      `, [userId]);
      return quotes;
    } catch (error) {
      console.error('Error getting quote requests by user ID:', error);
      throw error;
    }
  }

  // Link to user
  static async linkToUser(quoteId, userId) {
    try {
      const [result] = await db.query(
        'UPDATE quote_requests SET user_id = ? WHERE id = ?',
        [userId, quoteId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error linking quote to user:', error);
      throw error;
    }
  }
}

module.exports = QuoteRequest;