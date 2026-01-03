const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../config/database');
const User = require('../models/user');
const Cart = require('../models/cart');
const Order = require('../models/orders');
const QuoteRequest = require('../models/quoteRequest');

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

// Send OTP to email
exports.sendOTP = async (req, res) => {
  try {
    const { email, cartId } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete old OTPs for this email
    await db.query('DELETE FROM otp_codes WHERE email = ?', [email]);

    // Store OTP in database
    await db.query(
      'INSERT INTO otp_codes (email, otp_code, expires_at) VALUES (?, ?, ?)',
      [email, otp, expiresAt]
    );

    // Send OTP via email
    try {
      const transporter = createTransporter();
      
      const mailOptions = {
        from: process.env.SMTP_FROM || `"DAKS NDT" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Your Login Verification Code - DAKS NDT',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 500px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #0066ff, #0052cc); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .header h1 { margin: 0; font-size: 24px; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .otp-code { 
                background: linear-gradient(135deg, #0066ff, #0052cc); 
                color: white; 
                font-size: 36px; 
                font-weight: bold; 
                text-align: center; 
                padding: 20px; 
                border-radius: 10px; 
                letter-spacing: 10px; 
                margin: 25px 0;
                font-family: 'Courier New', monospace;
              }
              .warning { background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107; margin-top: 20px; }
              .footer { margin-top: 25px; text-align: center; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>DAKS NDT Services</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Verification Code</p>
              </div>
              <div class="content">
                <h2 style="margin-top: 0;">Hello!</h2>
                <p>You requested to log in to your DAKS NDT account. Use the following verification code:</p>
                <div class="otp-code">${otp}</div>
                <p style="text-align: center; color: #666;">This code will expire in <strong>10 minutes</strong></p>
                <div class="warning">
                  <strong>⚠️ Security Notice:</strong>
                  <p style="margin: 5px 0 0 0;">If you didn't request this code, please ignore this email. Never share this code with anyone.</p>
                </div>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} DAKS NDT Services. All rights reserved.</p>
                <p>This is an automated message. Please do not reply.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Your DAKS NDT verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`
      };

      await transporter.sendMail(mailOptions);
      console.log('✅ OTP sent successfully to:', email);
      
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError.message);
      // For development, log the OTP
      console.log('📧 DEV MODE - OTP for', email, ':', otp);
    }

    res.json({
      success: true,
      message: 'Verification code sent to your email'
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code. Please try again.'
    });
  }
};

// Verify OTP and login
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, cartId, quoteId } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Find valid OTP
    const [otpRecords] = await db.query(
      'SELECT * FROM otp_codes WHERE email = ? AND otp_code = ? AND expires_at > NOW() AND is_used = FALSE',
      [email, otp]
    );

    if (otpRecords.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Mark OTP as used
    await db.query('UPDATE otp_codes SET is_used = TRUE WHERE id = ?', [otpRecords[0].id]);

    // Get or create user
    const user = await User.getOrCreate(email);

    // Link cart to user if cartId provided
    if (cartId) {
      await Cart.linkToUser(cartId, user.id);
    }

    // Link quote request to user if quoteId provided
    if (quoteId) {
      await QuoteRequest.linkToUser(quoteId, user.id);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log('✅ User logged in:', email);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        company: user.company
      }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify code. Please try again.'
    });
  }
};

// Auth middleware
exports.auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Get user profile with orders and quotes
exports.getProfile = async (req, res) => {
  try {
    const user = req.user;

    // Get user's orders
    const orders = await Order.getByUserId(user.id);

    // Get user's quote requests
    const quoteRequests = await QuoteRequest.getByUserId(user.id);

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
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const updateData = req.body;

    await User.update(user.id, updateData);

    const updatedUser = await User.findById(user.id);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        phone: updatedUser.phone,
        company: updatedUser.company,
        address: updatedUser.address,
        city: updatedUser.city,
        state: updatedUser.state,
        zip: updatedUser.zip,
        country: updatedUser.country
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};