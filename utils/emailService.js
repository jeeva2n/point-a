const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Email templates
const templates = {
  'order-confirmation': (context) => ({
    subject: `Order Confirmation - #${context.order_number}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Order Confirmation</h1>
        <p>Dear ${context.name},</p>
        <p>Thank you for your order! Your order <strong>#${context.order_number}</strong> has been received.</p>
        <p><strong>Order Date:</strong> ${context.order_date}</p>
        <p><strong>Total Amount:</strong> $${parseFloat(context.total_amount).toFixed(2)}</p>
        <h3>Order Items:</h3>
        <ul>
          ${context.items.map(item => `
            <li>${item.product_name} x ${item.quantity} - $${parseFloat(item.total_price).toFixed(2)}</li>
          `).join('')}
        </ul>
        <p>We will notify you when your order ships.</p>
        <p>Thank you for shopping with us!</p>
      </div>
    `
  }),
  
  'order-status-update': (context) => ({
    subject: `Order Status Update - #${context.order_number}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Order Status Update</h1>
        <p>Dear ${context.name},</p>
        <p>Your order <strong>#${context.order_number}</strong> status has been updated to: <strong>${context.new_status.toUpperCase()}</strong></p>
        ${context.notes ? `<p><strong>Notes:</strong> ${context.notes}</p>` : ''}
        ${context.tracking_url ? `<p><a href="${context.tracking_url}">Track your order</a></p>` : ''}
        <p>Thank you for your patience!</p>
      </div>
    `
  }),
  
  'order-shipped': (context) => ({
    subject: `Your Order Has Shipped - #${context.order_number}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Your Order Has Shipped!</h1>
        <p>Dear ${context.name},</p>
        <p>Great news! Your order <strong>#${context.order_number}</strong> has been shipped.</p>
        <p><strong>Carrier:</strong> ${context.carrier}</p>
        <p><strong>Tracking Number:</strong> ${context.tracking_number}</p>
        ${context.estimated_delivery ? `<p><strong>Estimated Delivery:</strong> ${context.estimated_delivery}</p>` : ''}
        <p><a href="${context.tracking_url}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Track Your Package</a></p>
      </div>
    `
  }),
  
  'verify-email': (context) => ({
    subject: 'Verify Your Email - DAKS NDT',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Verify Your Email</h1>
        <p>Dear ${context.name},</p>
        <p>Thank you for registering! Please verify your email address by clicking the button below:</p>
        <p><a href="${context.verification_url}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `
  }),
  
  'reset-password': (context) => ({
    subject: 'Reset Your Password - DAKS NDT',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Reset Your Password</h1>
        <p>Dear ${context.name},</p>
        <p>You requested to reset your password. Click the button below to proceed:</p>
        <p><a href="${context.reset_url}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email.</p>
      </div>
    `
  })
};

const sendEmail = async ({ to, subject, template, context, html }) => {
  try {
    // Skip if email is not configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('Email not configured. Skipping email send.');
      console.log('Would send to:', to);
      console.log('Subject:', subject || templates[template]?.(context)?.subject);
      return { success: true, skipped: true };
    }

    const transporter = createTransporter();
    
    let emailContent;
    if (template && templates[template]) {
      emailContent = templates[template](context);
    } else {
      emailContent = { subject, html };
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: emailContent.subject,
      html: emailContent.html
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    // Don't throw error to prevent blocking the main operation
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };