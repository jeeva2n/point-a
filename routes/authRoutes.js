const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'daks-ndt-super-secret-jwt-key-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); 

    await db.query('DELETE FROM otp_codes WHERE email = ?', [email]);
    await db.query('INSERT INTO otp_codes (email, otp_code, expires_at) VALUES (?, ?, ?)', [email, otp, expiresAt]);

    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"DAKS NDT" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Your Login Verification Code - DAKS NDT',
        html: `<h2>Your OTP is: ${otp}</h2><p>Expires in 10 minutes.</p>`
      });
      console.log('✅ OTP sent to:', email);
    } catch (emailError) {
      console.error('❌ Email failed:', emailError.message);
      console.log('📧 DEV MODE OTP:', otp);
    }

    res.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, cartId, quoteId } = req.body;

    const [otpRecords] = await db.query(
      'SELECT * FROM otp_codes WHERE email = ? AND otp_code = ? AND expires_at > NOW() AND is_used = FALSE',
      [email, otp]
    );

    if (otpRecords.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid code' });
    }

    await db.query('UPDATE otp_codes SET is_used = TRUE WHERE id = ?', [otpRecords[0].id]);

    let [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    let user;
    
    if (users.length === 0) {
      const [result] = await db.query('INSERT INTO users (email, is_verified) VALUES (?, ?)', [email, true]);
      [users] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    }
    user = users[0];

    // Update Cart/Quote ownership if needed
    if (cartId) await db.query('UPDATE carts SET user_id = ? WHERE id = ?', [user.id, cartId]);
    if (quoteId) await db.query('UPDATE quote_requests SET user_id = ? WHERE id = ?', [user.id, quoteId]);

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// Auth Middleware
const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'Auth required' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    if (users.length === 0) return res.status(401).json({ success: false, message: 'User not found' });

    req.user = users[0];
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Get Profile (UPDATED FOR NEW DB SCHEMA)
router.get('/profile', auth, async (req, res) => {
  try {
    const user = req.user;

    // 1. Get User's Orders from 'shop_orders'
    // We match by email because shop_orders stores customer_email
    const [orders] = await db.query(`
      SELECT 
        o.id, 
        o.order_number, 
        o.total_amount, 
        o.order_status as status, 
        o.created_at,
        (
          SELECT GROUP_CONCAT(p.name SEPARATOR ', ')
          FROM shop_order_items oi
          JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = o.id
        ) as product_names
      FROM shop_orders o
      WHERE o.customer_email = ?
      ORDER BY o.created_at DESC
    `, [user.email]);

    // 2. Get Quote Requests
    const [quoteRequests] = await db.query(`
      SELECT 
        q.id, 
        q.quote_number, 
        q.status, 
        q.created_at,
        (
          SELECT GROUP_CONCAT(p.name SEPARATOR ', ')
          FROM quote_request_items qi
          JOIN products p ON qi.product_id = p.id
          WHERE qi.quote_request_id = q.id
        ) as product_names
      FROM quote_requests q
      WHERE q.customer_email = ?
      ORDER BY q.created_at DESC
    `, [user.email]);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        company: user.company,
        address: user.address,
        city: user.city,
        state: user.state,
        zip: user.zip,
        country: user.country,
        created_at: user.created_at
      },
      orders,
      quoteRequests
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
});

// Update Profile
router.put('/profile', auth, async (req, res) => {
  try {
    const user = req.user;
    const { full_name, phone, company, address, city, state, zip, country } = req.body;

    await db.query(
      `UPDATE users SET full_name=?, phone=?, company=?, address=?, city=?, state=?, zip=?, country=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [full_name, phone, company, address, city, state, zip, country, user.id]
    );

    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({ success: true, message: 'Profile updated', user: users[0] });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

module.exports = router;