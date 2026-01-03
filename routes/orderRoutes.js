const express = require('express');
const router = express.Router();
const db = require('../config/database');
const nodemailer = require('nodemailer');

// --- Email Configuration ---
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false }
  });
};

// 1. CUSTOMER: CREATE ORDER
router.post('/', async (req, res) => {
  const connection = await db.getConnection(); 
  try {
    await connection.beginTransaction();
    const { cartId, customerDetails, orderType = 'purchase' } = req.body;
    if (!cartId) throw new Error('Cart ID is required');

    const [cartItems] = await connection.query('SELECT product_id, quantity, price FROM cart_items WHERE cart_id = ?', [cartId]);
    if (cartItems.length === 0) throw new Error('Cart is empty');

    let subtotal = 0;
    cartItems.forEach(item => { subtotal += (parseFloat(item.price) * parseInt(item.quantity)); });

    const shipping_cost = 200; 
    const tax = subtotal * 0.18; 
    const total_amount = subtotal + tax + shipping_cost;
    const orderNumber = 'ORD-' + Date.now();

    const [orderResult] = await connection.query(
      `INSERT INTO shop_orders (
        order_number, cart_id, customer_name, customer_email, 
        customer_phone, customer_company, shipping_address, shipping_city,
        shipping_state, shipping_zip, shipping_country, order_notes,
        subtotal, tax, shipping_cost, total_amount, order_type, order_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        orderNumber, cartId, customerDetails.name, customerDetails.email,
        customerDetails.phone, customerDetails.company || '', customerDetails.address || '',
        customerDetails.city || '', customerDetails.state || '', customerDetails.zip || '',
        customerDetails.country || 'India', customerDetails.notes || '',
        subtotal, tax, shipping_cost, total_amount, orderType, 'pending'
      ]
    );

    const newOrderId = orderResult.insertId;
    const orderItemsValues = cartItems.map(item => [newOrderId, item.product_id, item.quantity, item.price, (item.quantity * item.price)]);

    if (orderItemsValues.length > 0) {
      await connection.query('INSERT INTO shop_order_items (order_id, product_id, quantity, price, total) VALUES ?', [orderItemsValues]);
    }

    await connection.query('UPDATE carts SET status = ? WHERE id = ?', ['completed', cartId]);
    await connection.commit();

    res.status(201).json({ success: true, message: 'Order created', orderId: newOrderId, orderNumber: orderNumber });

  } catch (error) {
    await connection.rollback();
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create order' });
  } finally {
    connection.release();
  }
});

// 2. ADMIN: GET ALL ORDERS
router.get('/admin/all', async (req, res) => {
  try {
    const [orders] = await db.query('SELECT * FROM shop_orders ORDER BY created_at DESC');
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// 3. ADMIN: GET SINGLE ORDER DETAILS
router.get('/admin/:id/details', async (req, res) => {
  try {
    const { id } = req.params;
    const [orders] = await db.query('SELECT * FROM shop_orders WHERE id = ?', [id]);
    if (orders.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });
    
    const [items] = await db.query(`
      SELECT oi.*, p.name, p.sku, p.image_url FROM shop_order_items oi
      LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?
    `, [id]);

    res.json({ success: true, order: { ...orders[0], items } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch details' });
  }
});

// 4. ADMIN: UPDATE STATUS
router.put('/admin/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;
    await db.query('UPDATE shop_orders SET order_status = ? WHERE id = ?', [status, id]);
    res.json({ success: true, message: 'Order status updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// 5. ADMIN: SEND EMAIL & SAVE TO DB (UPDATED)
router.post('/admin/:id/email', async (req, res) => {
  try {
    const { message, subject } = req.body;
    const { id } = req.params;

    // Get Customer Details
    const [orders] = await db.query('SELECT customer_email, customer_name, order_number FROM shop_orders WHERE id = ?', [id]);
    if (orders.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orders[0];

    // Send Email
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"DAKS NDT Updates" <${process.env.SMTP_USER}>`,
      to: order.customer_email,
      subject: subject || `Update on Order #${order.order_number}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
          <h2 style="color: #0066cc;">Hello ${order.customer_name},</h2>
          <p style="font-size: 16px;">${message.replace(/\n/g, '<br>')}</p>
          <hr style="margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Order Reference: #${order.order_number}</p>
        </div>
      `
    });

    // SAVE TO DATABASE
    await db.query(
      'INSERT INTO order_emails (order_id, recipient_email, subject, message, sent_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [id, order.customer_email, subject, message]
    );

    res.json({ success: true, message: `Email sent and saved.` });

  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// 6. ADMIN: GET EMAIL HISTORY (NEW)
router.get('/admin/:id/email-history', async (req, res) => {
  try {
    const [emails] = await db.query(
      'SELECT * FROM order_emails WHERE order_id = ? ORDER BY sent_at DESC', 
      [req.params.id]
    );
    res.json({ success: true, emails });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch email history' });
  }
});

// 7. CUSTOMER: GET SINGLE ORDER
router.get('/:orderId', async (req, res) => {
  try {
    const [orders] = await db.query('SELECT * FROM shop_orders WHERE id = ?', [req.params.orderId]);
    if (orders.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });
    const [items] = await db.query(`SELECT oi.*, p.name as product_name, p.image_url FROM shop_order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [req.params.orderId]);
    res.json({ success: true, order: { ...orders[0], items } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching order' });
  }
});

module.exports = router;