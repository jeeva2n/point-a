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

class Order {
  // Create a new order
  static async create(orderData) {
    try {
      const orderNumber = 'ORD-' + Date.now();
      
      const [result] = await db.query(
        `INSERT INTO orders (
          order_number, user_id, cart_id, customer_name, customer_email, 
          customer_phone, customer_company, shipping_address, shipping_city,
          shipping_state, shipping_zip, shipping_country, order_notes,
          subtotal, tax, shipping_cost, total_amount, order_type, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNumber,
          orderData.userId || null,
          orderData.cartId || null,
          orderData.customerDetails.name,
          orderData.customerDetails.email,
          orderData.customerDetails.phone || null,
          orderData.customerDetails.company || null,
          orderData.customerDetails.address || null,
          orderData.customerDetails.city || null,
          orderData.customerDetails.state || null,
          orderData.customerDetails.zip || null,
          orderData.customerDetails.country || 'India',
          orderData.customerDetails.notes || null,
          orderData.subtotal || 0,
          orderData.tax || 0,
          orderData.shippingCost || 0,
          orderData.totalAmount || 0,
          orderData.orderType || 'purchase',
          orderData.status || 'pending'
        ]
      );

      return { orderId: result.insertId, orderNumber };
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  // Add items to order
  static async addItems(orderId, items) {
    try {
      for (const item of items) {
        await db.query(
          `INSERT INTO order_items (
            order_id, product_id, product_name, product_sku,
            quantity, unit_price, total_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.product_id,
            item.product_name,
            item.sku || null,
            item.quantity || 1,
            item.price || 0,
            (item.price || 0) * (item.quantity || 1)
          ]
        );
      }
      return true;
    } catch (error) {
      console.error('Error adding order items:', error);
      throw error;
    }
  }

  // Get order by ID
  static async getById(orderId) {
    try {
      const [orders] = await db.query(
        'SELECT * FROM orders WHERE id = ?',
        [orderId]
      );

      if (orders.length === 0) {
        return null;
      }

      const order = orders[0];

      // Get order items
      const [items] = await db.query(
        'SELECT * FROM order_items WHERE order_id = ?',
        [orderId]
      );

      order.items = items;
      return order;
    } catch (error) {
      console.error('Error getting order:', error);
      throw error;
    }
  }

  // Get orders by user ID
  static async getByUserId(userId) {
    try {
      const [orders] = await db.query(`
        SELECT o.*, 
          GROUP_CONCAT(oi.product_name SEPARATOR ', ') as product_names
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `, [userId]);
      return orders;
    } catch (error) {
      console.error('Error getting orders by user ID:', error);
      throw error;
    }
  }

  // Update order status
  static async updateStatus(orderId, status) {
    try {
      const [result] = await db.query(
        'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, orderId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }
}

module.exports = Order;