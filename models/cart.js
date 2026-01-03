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

class Cart {
  // Create a new cart
  static async create(userId = null) {
    try {
      const [result] = await db.query(
        'INSERT INTO carts (user_id, status) VALUES (?, ?)',
        [userId, 'active']
      );
      return result.insertId;
    } catch (error) {
      console.error('Error creating cart:', error);
      throw error;
    }
  }

  // Get cart by ID with items
  static async getById(cartId) {
    try {
      const [carts] = await db.query(
        'SELECT * FROM carts WHERE id = ?',
        [cartId]
      );

      if (carts.length === 0) {
        return null;
      }

      const cart = carts[0];

      // Get cart items with product details
      const [items] = await db.query(`
        SELECT 
          ci.id,
          ci.product_id,
          ci.quantity,
          ci.price,
          p.name as product_name,
          p.description,
          p.short_description,
          p.image_url,
          p.sku
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.cart_id = ?
        ORDER BY ci.created_at DESC
      `, [cartId]);

      cart.items = items;
      return cart;
    } catch (error) {
      console.error('Error getting cart:', error);
      throw error;
    }
  }

  // Add item to cart
  static async addItem(cartId, productId, quantity = 1) {
    try {
      // Get product price
      const [products] = await db.query(
        'SELECT price FROM products WHERE id = ?',
        [productId]
      );

      if (products.length === 0) {
        throw new Error('Product not found');
      }

      const price = products[0].price || 0;

      // Check if item already exists in cart
      const [existingItems] = await db.query(
        'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
        [cartId, productId]
      );

      if (existingItems.length > 0) {
        // Update quantity
        const newQuantity = existingItems[0].quantity + quantity;
        await db.query(
          'UPDATE cart_items SET quantity = ? WHERE id = ?',
          [newQuantity, existingItems[0].id]
        );
      } else {
        // Insert new item
        await db.query(
          'INSERT INTO cart_items (cart_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
          [cartId, productId, quantity, price]
        );
      }

      // Update cart timestamp
      await db.query(
        'UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [cartId]
      );

      return true;
    } catch (error) {
      console.error('Error adding item to cart:', error);
      throw error;
    }
  }

  // Remove item from cart
  static async removeItem(cartId, itemId) {
    try {
      const [result] = await db.query(
        'DELETE FROM cart_items WHERE id = ? AND cart_id = ?',
        [itemId, cartId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error removing item from cart:', error);
      throw error;
    }
  }

  // Update item quantity
  static async updateItemQuantity(cartId, itemId, quantity) {
    try {
      if (quantity < 1) {
        return await this.removeItem(cartId, itemId);
      }

      const [result] = await db.query(
        'UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?',
        [quantity, itemId, cartId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating cart item quantity:', error);
      throw error;
    }
  }

  // Update customer info
  static async updateCustomerInfo(cartId, email, name) {
    try {
      const [result] = await db.query(
        'UPDATE carts SET customer_email = ?, customer_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [email, name, cartId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating customer info:', error);
      throw error;
    }
  }

  // Update cart status
  static async updateStatus(cartId, status) {
    try {
      const [result] = await db.query(
        'UPDATE carts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, cartId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating cart status:', error);
      throw error;
    }
  }

  // Get item count
  static async getItemCount(cartId) {
    try {
      const [result] = await db.query(
        'SELECT COALESCE(SUM(quantity), 0) as count FROM cart_items WHERE cart_id = ?',
        [cartId]
      );
      return parseInt(result[0].count) || 0;
    } catch (error) {
      console.error('Error getting item count:', error);
      throw error;
    }
  }

  // Link cart to user
  static async linkToUser(cartId, userId) {
    try {
      const [result] = await db.query(
        'UPDATE carts SET user_id = ? WHERE id = ?',
        [userId, cartId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error linking cart to user:', error);
      throw error;
    }
  }

  // Clear cart
  static async clear(cartId) {
    try {
      await db.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
      return true;
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  }
}

module.exports = Cart;