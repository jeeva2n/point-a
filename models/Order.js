const pool = require('../config/database-mysql');
const crypto = require('crypto');

class Order {
  // Create new order
  static async create(orderData) {
    const {
      order_number,
      user_id,
      customer_email,
      customer_name,
      customer_company,
      customer_phone,
      shipping_address,
      billing_address,
      items,
      subtotal,
      tax_amount,
      shipping_amount,
      discount_amount,
      total_amount,
      payment_method,
      notes
    } = orderData;

    const [result] = await pool.query(
      `INSERT INTO orders 
       (order_number, user_id, customer_email, customer_name, customer_company, customer_phone,
        shipping_address, billing_address, items, subtotal, tax_amount, shipping_amount,
        discount_amount, total_amount, payment_method, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order_number,
        user_id,
        customer_email,
        customer_name,
        customer_company,
        customer_phone,
        typeof shipping_address === 'object' ? JSON.stringify(shipping_address) : shipping_address,
        typeof billing_address === 'object' ? JSON.stringify(billing_address) : billing_address,
        typeof items === 'object' ? JSON.stringify(items) : items,
        subtotal,
        tax_amount || 0,
        shipping_amount || 0,
        discount_amount || 0,
        total_amount,
        payment_method,
        notes
      ]
    );

    // Create order items
    if (Array.isArray(items)) {
      for (const item of items) {
        await pool.query(
          `INSERT INTO order_items 
           (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price, specifications) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            result.insertId,
            item.product_id,
            item.product_name,
            item.product_sku,
            item.quantity,
            item.unit_price,
            item.total_price,
            typeof item.specifications === 'object' ? JSON.stringify(item.specifications) : null
          ]
        );
      }
    }

    return this.findById(result.insertId);
  }

  // Find order by ID
  static async findById(id) {
    const [rows] = await pool.query(
      `SELECT o.*, 
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'product_sku', oi.product_sku,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'specifications', oi.specifications
          )
        ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = ?
       GROUP BY o.id`,
      [id]
    );

    if (!rows[0]) return null;

    // Parse JSON fields
    const order = rows[0];
    order.shipping_address = this.parseJson(order.shipping_address);
    order.billing_address = this.parseJson(order.billing_address);
    order.items = this.parseJson(order.items) || [];

    return order;
  }

  // Find all orders with filters
  static async findAll(filters = {}, page = 1, limit = 20) {
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    const conditions = [];

    if (filters.order_status) {
      conditions.push('order_status = ?');
      params.push(filters.order_status);
    }

    if (filters.payment_status) {
      conditions.push('payment_status = ?');
      params.push(filters.payment_status);
    }

    if (filters.customer_email) {
      conditions.push('customer_email LIKE ?');
      params.push(`%${filters.customer_email}%`);
    }

    if (filters.date_from) {
      conditions.push('created_at >= ?');
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push('created_at <= ?');
      params.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0]?.total || 0;

    // Add pagination
    const offset = (page - 1) * limit;
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);

    // Parse JSON fields
    const orders = rows.map(order => {
      order.shipping_address = this.parseJson(order.shipping_address);
      order.billing_address = this.parseJson(order.billing_address);
      return order;
    });

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Get user orders
  static async getUserOrders(userId, page = 1, limit = 10) {
    const query = `
      SELECT o.*, 
        COUNT(oi.id) as item_count,
        SUM(oi.total_price) as items_total
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(query, [userId, limit, (page - 1) * limit]);

    // Get total count
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM orders WHERE user_id = ?',
      [userId]
    );
    const total = countResult[0]?.total || 0;

    return {
      orders: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Get user order by ID
  static async getUserOrderById(orderId, userId) {
    const [rows] = await pool.query(
      `SELECT o.*, 
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'product_sku', oi.product_sku,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'specifications', oi.specifications
          )
        ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = ? AND (o.user_id = ? OR ? IS NULL)
       GROUP BY o.id`,
      [orderId, userId, userId]
    );

    if (!rows[0]) return null;

    const order = rows[0];
    order.shipping_address = this.parseJson(order.shipping_address);
    order.billing_address = this.parseJson(order.billing_address);
    order.items = this.parseJson(order.items) || [];

    return order;
  }

  // Update order status
  static async updateStatus(id, status, notes = null) {
    const [result] = await pool.query(
      `UPDATE orders SET 
       order_status = ?, notes = CONCAT(IFNULL(notes, ''), ?), updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [status, notes ? `\nStatus changed to ${status}: ${notes}` : '', id]
    );

    if (result.affectedRows > 0) {
      return this.findById(id);
    }
    
    return null;
  }

  // Update payment status
  static async updatePaymentStatus(id, status) {
    const [result] = await pool.query(
      'UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    if (result.affectedRows > 0) {
      return this.findById(id);
    }
    
    return null;
  }

  // Ship order
  static async shipOrder(id, trackingNumber, carrier, estimatedDelivery) {
    const [result] = await pool.query(
      `UPDATE orders SET 
       order_status = 'shipped',
       tracking_number = ?,
       carrier = ?,
       estimated_delivery = ?,
       shipped_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [trackingNumber, carrier, estimatedDelivery, id]
    );

    if (result.affectedRows > 0) {
      return this.findById(id);
    }
    
    return null;
  }

  // Cancel order
  static async cancelOrder(id, userId = null) {
    const conditions = ['id = ?'];
    const params = [id];

    if (userId !== null) {
      conditions.push('user_id = ?');
      params.push(userId);
    }

    const [result] = await pool.query(
      `UPDATE orders SET 
       order_status = 'cancelled',
       updated_at = CURRENT_TIMESTAMP 
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    if (result.affectedRows > 0) {
      return this.getUserOrderById(id, userId);
    }
    
    return null;
  }

  // Process refund
  static async processRefund(orderId, amount, reason) {
    const order = await this.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (amount > order.total_amount) {
      throw new Error('Refund amount cannot exceed order total');
    }

    const [result] = await pool.query(
      `UPDATE orders SET 
       payment_status = 'refunded',
       refund_amount = ?,
       refund_reason = ?,
       refunded_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [amount, reason, orderId]
    );

    if (result.affectedRows > 0) {
      return this.findById(orderId);
    }
    
    return null;
  }

  // Get order statistics
  static async getStats(period = 'month') {
    let interval;
    switch (period) {
      case 'day':
        interval = '1 DAY';
        break;
      case 'week':
        interval = '7 DAY';
        break;
      case 'year':
        interval = '1 YEAR';
        break;
      default: // month
        interval = '30 DAY';
    }

    const [rows] = await pool.query(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL ${interval}) THEN total_amount ELSE 0 END) as recent_revenue,
        AVG(total_amount) as average_order_value,
        COUNT(DISTINCT customer_email) as unique_customers,
        SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
        SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
        (SELECT COUNT(*) FROM orders WHERE payment_status = 'pending') as pending_payments
       FROM orders 
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${interval})`,
      []
    );

    return rows[0] || {
      total_orders: 0,
      recent_revenue: 0,
      average_order_value: 0,
      unique_customers: 0,
      delivered_orders: 0,
      cancelled_orders: 0,
      pending_payments: 0
    };
  }

  // Get recent orders
  static async getRecent(limit = 10) {
    const [rows] = await pool.query(
      `SELECT o.*, 
        COUNT(oi.id) as item_count,
        SUM(oi.total_price) as items_total
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  }

  // Get sales report
  static async getSalesReport(startDate, endDate, groupBy = 'day') {
    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = '%Y-%m-%d %H:00';
        break;
      case 'week':
        dateFormat = '%Y-%u';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      case 'year':
        dateFormat = '%Y';
        break;
      default: // day
        dateFormat = '%Y-%m-%d';
    }

    let query = `
      SELECT 
        DATE_FORMAT(created_at, ?) as period,
        COUNT(*) as order_count,
        SUM(total_amount) as revenue,
        AVG(total_amount) as average_order_value,
        COUNT(DISTINCT customer_email) as unique_customers
      FROM orders
      WHERE payment_status = 'paid'
    `;

    const params = [dateFormat];

    if (startDate) {
      query += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND created_at <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY period ORDER BY period';

    const [rows] = await pool.query(query, params);
    return rows;
  }

  // Get product sales report
  static async getProductSalesReport(startDate, endDate, limit = 20) {
    let query = `
      SELECT 
        p.id,
        p.name,
        p.sku,
        p.category,
        COUNT(oi.id) as units_sold,
        SUM(oi.total_price) as revenue,
        AVG(oi.unit_price) as average_price
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.payment_status = 'paid'
    `;

    const params = [];

    if (startDate) {
      query += ' AND o.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND o.created_at <= ?';
      params.push(endDate);
    }

    query += `
      GROUP BY p.id, p.name, p.sku, p.category
      ORDER BY revenue DESC
      LIMIT ?
    `;
    params.push(limit);

    const [rows] = await pool.query(query, params);
    return rows;
  }

  // Get customer report
  static async getCustomerReport(startDate, endDate, limit = 20) {
    let query = `
      SELECT 
        customer_email,
        customer_name,
        COUNT(*) as order_count,
        SUM(total_amount) as total_spent,
        AVG(total_amount) as average_order_value,
        MAX(created_at) as last_order_date
      FROM orders
      WHERE payment_status = 'paid'
    `;

    const params = [];

    if (startDate) {
      query += ' AND created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND created_at <= ?';
      params.push(endDate);
    }

    query += `
      GROUP BY customer_email, customer_name
      ORDER BY total_spent DESC
      LIMIT ?
    `;
    params.push(limit);

    const [rows] = await pool.query(query, params);
    return rows;
  }

  // Get refunds
  static async getRefunds(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT o.*, 
        o.refund_amount,
        o.refund_reason,
        o.refunded_at
       FROM orders o
       WHERE o.payment_status = 'refunded'
       ORDER BY o.refunded_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM orders WHERE payment_status = "refunded"'
    );
    const total = countResult[0]?.total || 0;

    return {
      refunds: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Get tracking info
  static async getTrackingInfo(orderId) {
    const [rows] = await pool.query(
      `SELECT 
        tracking_number,
        carrier,
        estimated_delivery,
        shipped_at,
        (SELECT GROUP_CONCAT(status ORDER BY created_at DESC) FROM order_tracking WHERE order_id = ?) as tracking_history
       FROM orders 
       WHERE id = ? AND tracking_number IS NOT NULL`,
      [orderId, orderId]
    );
    return rows[0];
  }

  // Helper method to parse JSON
  static parseJson(str) {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch (e) {
      return str;
    }
  }
}

module.exports = Order;