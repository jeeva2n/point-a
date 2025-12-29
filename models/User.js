const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  // Create new user
  static async create(userData) {
    const {
      email,
      password,
      full_name,
      company,
      phone,
      verification_token
    } = userData;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);

    const [result] = await pool.query(
      `INSERT INTO users 
       (email, password, full_name, company, phone, verification_token) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, hashedPassword, full_name, company || null, phone || null, verification_token || null]
    );

    return this.findById(result.insertId);
  }

  // Find user by ID
  static async findById(id) {
    const [rows] = await pool.query(
      `SELECT id, email, full_name, company, phone, address, city, country, postal_code,
              email_verified, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    );
    return rows[0];
  }

  // Find user by ID with password (for authentication)
  static async findByIdWithPassword(id) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
  }

  // Find user by email
  static async findByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0];
  }

  // Find user by verification token
  static async findByVerificationToken(token) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE verification_token = ?',
      [token]
    );
    return rows[0];
  }

  // Find user by reset token
  static async findByResetToken(token) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()',
      [token]
    );
    return rows[0];
  }

  // Update user
  static async update(id, userData) {
    const updateFields = [];
    const updateValues = [];

    const fieldMapping = {
      full_name: 'full_name',
      company: 'company',
      phone: 'phone',
      address: 'address',
      city: 'city',
      country: 'country',
      postal_code: 'postal_code'
    };

    for (const [key, dbField] of Object.entries(fieldMapping)) {
      if (key in userData) {
        updateFields.push(`${dbField} = ?`);
        updateValues.push(userData[key]);
      }
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    updateValues.push(id);

    const [result] = await pool.query(
      `UPDATE users SET 
       ${updateFields.join(', ')},
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      updateValues
    );

    if (result.affectedRows > 0) {
      return this.findById(id);
    }
    
    return null;
  }

  // Change password
  static async changePassword(id, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
    
    await pool.query(
      `UPDATE users SET 
       password = ?,
       password_changed_at = CURRENT_TIMESTAMP,
       reset_token = NULL,
       reset_expires = NULL 
       WHERE id = ?`,
      [hashedPassword, id]
    );
  }

  // Set reset token
  static async setResetToken(id, token, expires) {
    await pool.query(
      'UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?',
      [token, expires, id]
    );
  }

  // Clear reset token
  static async clearResetToken(id) {
    await pool.query(
      'UPDATE users SET reset_token = NULL, reset_expires = NULL WHERE id = ?',
      [id]
    );
  }

  // Verify email
  static async verifyEmail(id) {
    await pool.query(
      `UPDATE users SET 
       email_verified = 1,
       verification_token = NULL,
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [id]
    );
  }

  // Update last login
  static async updateLastLogin(id) {
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  // Get user addresses
  static async getAddresses(userId) {
    const [rows] = await pool.query(
      `SELECT * FROM user_addresses 
       WHERE user_id = ? 
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return rows;
  }

  // Add address
  static async addAddress(addressData) {
    const { user_id, type, street, city, state, country, postal_code, is_default } = addressData;

    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query(
        'UPDATE user_addresses SET is_default = 0 WHERE user_id = ?',
        [user_id]
      );
    }

    const [result] = await pool.query(
      `INSERT INTO user_addresses 
       (user_id, type, street, city, state, country, postal_code, is_default) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, type || 'shipping', street, city, state || null, country, postal_code, is_default ? 1 : 0]
    );

    const [rows] = await pool.query('SELECT * FROM user_addresses WHERE id = ?', [result.insertId]);
    return rows[0];
  }

  // Update address
  static async updateAddress(id, userId, addressData) {
    const { type, street, city, state, country, postal_code, is_default } = addressData;

    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query(
        'UPDATE user_addresses SET is_default = 0 WHERE user_id = ? AND id != ?',
        [userId, id]
      );
    }

    const [result] = await pool.query(
      `UPDATE user_addresses SET 
       type = ?, street = ?, city = ?, state = ?, country = ?, postal_code = ?, 
       is_default = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND user_id = ?`,
      [type, street, city, state, country, postal_code, is_default ? 1 : 0, id, userId]
    );

    if (result.affectedRows > 0) {
      const [rows] = await pool.query('SELECT * FROM user_addresses WHERE id = ?', [id]);
      return rows[0];
    }
    
    return null;
  }

  // Delete address
  static async deleteAddress(id, userId) {
    const [result] = await pool.query(
      'DELETE FROM user_addresses WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.affectedRows > 0;
  }

  // Set default address
  static async setDefaultAddress(id, userId) {
    await pool.query(
      'UPDATE user_addresses SET is_default = 0 WHERE user_id = ?',
      [userId]
    );

    const [result] = await pool.query(
      'UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    return result.affectedRows > 0;
  }

  // Get wishlist
  static async getWishlist(userId) {
    const [rows] = await pool.query(
      `SELECT p.*, w.created_at as added_at 
       FROM wishlists w
       JOIN products p ON w.product_id = p.id
       WHERE w.user_id = ? AND p.is_active = 1
       ORDER BY w.created_at DESC`,
      [userId]
    );
    return rows;
  }

  // Add to wishlist
  static async addToWishlist(userId, productId) {
    try {
      await pool.query(
        'INSERT IGNORE INTO wishlists (user_id, product_id) VALUES (?, ?)',
        [userId, productId]
      );
      return true;
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') {
        throw error;
      }
      return true;
    }
  }

  // Remove from wishlist
  static async removeFromWishlist(userId, productId) {
    await pool.query(
      'DELETE FROM wishlists WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );
  }

  // Check if user has purchased product
  static async hasPurchasedProduct(userId, productId) {
    const [rows] = await pool.query(
      `SELECT 1 
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.user_id = ? AND oi.product_id = ? AND o.payment_status = 'paid'
       LIMIT 1`,
      [userId, productId]
    );
    return rows.length > 0;
  }

  // Get user reviews
  static async getReviews(userId) {
    const [rows] = await pool.query(
      `SELECT r.*, p.name as product_name
       FROM reviews r
       JOIN products p ON r.product_id = p.id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return rows;
  }

  // Get product review by user
  static async getProductReview(userId, productId) {
    const [rows] = await pool.query(
      'SELECT * FROM reviews WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );
    return rows[0];
  }

  // Create review
  static async createReview(reviewData) {
    const { product_id, user_id, user_name, user_email, rating, title, comment } = reviewData;

    const [result] = await pool.query(
      `INSERT INTO reviews 
       (product_id, user_id, user_name, user_email, rating, title, comment) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [product_id, user_id, user_name, user_email, rating, title || null, comment]
    );

    const [rows] = await pool.query('SELECT * FROM reviews WHERE id = ?', [result.insertId]);
    return rows[0];
  }

  // Update review
  static async updateReview(id, userId, reviewData) {
    const { rating, title, comment } = reviewData;

    const [result] = await pool.query(
      `UPDATE reviews SET 
       rating = ?, title = ?, comment = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND user_id = ?`,
      [rating, title, comment, id, userId]
    );

    if (result.affectedRows > 0) {
      const [rows] = await pool.query('SELECT * FROM reviews WHERE id = ?', [id]);
      return rows[0];
    }
    
    return null;
  }

  // Delete review
  static async deleteReview(id, userId) {
    const [result] = await pool.query(
      'DELETE FROM reviews WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.affectedRows > 0;
  }

  // Get user statistics
  static async getStats(userId) {
    const [orderStats] = await pool.query(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount) as total_spent
       FROM orders 
       WHERE user_id = ? AND payment_status = 'paid'`,
      [userId]
    );

    const [wishlistCount] = await pool.query(
      'SELECT COUNT(*) as count FROM wishlists WHERE user_id = ?',
      [userId]
    );

    const [reviewStats] = await pool.query(
      'SELECT COUNT(*) as count, AVG(rating) as avg_rating FROM reviews WHERE user_id = ?',
      [userId]
    );

    return {
      total_orders: orderStats[0]?.total_orders || 0,
      total_spent: orderStats[0]?.total_spent || 0,
      wishlist_count: wishlistCount[0]?.count || 0,
      review_count: reviewStats[0]?.count || 0,
      average_rating: reviewStats[0]?.avg_rating || 0
    };
  }
}

module.exports = User;