const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { sendEmail } = require('../utils/emailService');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class OrderController {
  // Create order (public - checkout)
  async createOrder(req, res) {
    try {
      const orderData = req.body;

      // Validate items and stock
      for (const item of orderData.items) {
        const product = await Product.findById(item.product_id);
        if (!product || product.stock_quantity < item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product?.name || 'product'}`
          });
        }
      }

      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Create order
      const order = await Order.create({
        ...orderData,
        order_number: orderNumber,
        order_status: 'pending'
      });

      // Update product stock
      for (const item of order.items) {
        await Product.updateStock(item.product_id, item.quantity);
      }

      // Send confirmation email
      if (orderData.customer_email) {
        await sendEmail({
          to: orderData.customer_email,
          subject: `Order Confirmation - #${orderNumber}`,
          template: 'order-confirmation',
          context: {
            name: orderData.customer_name,
            order_number: orderNumber,
            order_date: new Date().toLocaleDateString(),
            total_amount: order.total_amount,
            items: order.items
          }
        });
      }

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        order,
        payment_url: `/api/orders/${order.id}/pay` // Redirect to payment
      });
    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error creating order'
      });
    }
  }

  // Get all orders (admin)
  async getAllOrders(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        payment_status, 
        date_from, 
        date_to, 
        customer_email 
      } = req.query;

      const filters = {};
      if (status) filters.order_status = status;
      if (payment_status) filters.payment_status = payment_status;
      if (date_from) filters.date_from = date_from;
      if (date_to) filters.date_to = date_to;
      if (customer_email) filters.customer_email = customer_email;

      const orders = await Order.findAll(filters, parseInt(page), parseInt(limit));

      res.json({
        success: true,
        ...orders
      });
    } catch (error) {
      console.error('Get orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching orders'
      });
    }
  }

  // Get order by ID
  async getOrderById(req, res) {
    try {
      const { id } = req.params;
      
      const order = await Order.findById(id);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      res.json({
        success: true,
        order
      });
    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching order'
      });
    }
  }

  // Update order status
  async updateOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid order status'
        });
      }

      const order = await Order.updateStatus(id, status, notes);

      // Send status update email
      if (order.customer_email) {
        await sendEmail({
          to: order.customer_email,
          subject: `Order Status Update - #${order.order_number}`,
          template: 'order-status-update',
          context: {
            name: order.customer_name,
            order_number: order.order_number,
            new_status: status,
            notes: notes || '',
            tracking_url: order.tracking_number ? `/track/${order.tracking_number}` : null
          }
        });
      }

      res.json({
        success: true,
        message: 'Order status updated successfully',
        order
      });
    } catch (error) {
      console.error('Update order status error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating order status'
      });
    }
  }

  // Update payment status
  async updatePaymentStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['pending', 'paid', 'failed', 'refunded'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment status'
        });
      }

      const order = await Order.updatePaymentStatus(id, status);

      res.json({
        success: true,
        message: 'Payment status updated successfully',
        order
      });
    } catch (error) {
      console.error('Update payment status error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating payment status'
      });
    }
  }

  // Ship order
  async shipOrder(req, res) {
    try {
      const { id } = req.params;
      const { tracking_number, carrier, estimated_delivery } = req.body;

      const order = await Order.shipOrder(id, tracking_number, carrier, estimated_delivery);

      // Send shipping confirmation email
      if (order.customer_email) {
        await sendEmail({
          to: order.customer_email,
          subject: `Your Order Has Shipped - #${order.order_number}`,
          template: 'order-shipped',
          context: {
            name: order.customer_name,
            order_number: order.order_number,
            tracking_number: tracking_number,
            carrier: carrier,
            estimated_delivery: estimated_delivery,
            tracking_url: `https://tracking.carrier.com/${tracking_number}`
          }
        });
      }

      res.json({
        success: true,
        message: 'Order marked as shipped',
        order
      });
    } catch (error) {
      console.error('Ship order error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error shipping order'
      });
    }
  }

  // Generate invoice
  async generateInvoice(req, res) {
    try {
      const { id } = req.params;
      
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Create PDF invoice
      const doc = new PDFDocument({ margin: 50 });
      const filename = `invoice-${order.order_number}.pdf`;
      const filepath = path.join(__dirname, '..', 'invoices', filename);

      // Ensure invoices directory exists
      if (!fs.existsSync(path.dirname(filepath))) {
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
      }

      // Pipe PDF to file
      const writeStream = fs.createWriteStream(filepath);
      doc.pipe(writeStream);

      // Add invoice content
      doc.fontSize(25).text('INVOICE', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(12)
        .text(`Invoice Number: ${order.order_number}`)
        .text(`Invoice Date: ${new Date(order.created_at).toLocaleDateString()}`)
        .text(`Order Date: ${new Date(order.created_at).toLocaleDateString()}`)
        .moveDown();

      // Customer info
      doc.text('Bill To:', { underline: true }).moveDown(0.5);
      doc.text(order.customer_name)
        .text(order.customer_company || '')
        .text(order.customer_email)
        .text(order.customer_phone || '')
        .moveDown();

      // Order items table
      const tableTop = doc.y;
      const itemX = 50;
      const quantityX = 300;
      const priceX = 350;
      const totalX = 450;

      doc.text('Item', itemX, tableTop, { underline: true })
        .text('Qty', quantityX, tableTop, { underline: true })
        .text('Price', priceX, tableTop, { underline: true })
        .text('Total', totalX, tableTop, { underline: true });

      let y = tableTop + 20;
      order.items.forEach(item => {
        doc.text(item.product_name, itemX, y)
          .text(item.quantity.toString(), quantityX, y)
          .text(`$${item.unit_price.toFixed(2)}`, priceX, y)
          .text(`$${item.total_price.toFixed(2)}`, totalX, y);
        y += 20;
      });

      // Totals
      y += 20;
      doc.text('Subtotal:', totalX - 100, y)
        .text(`$${order.subtotal.toFixed(2)}`, totalX, y);
      y += 20;
      
      if (order.tax_amount > 0) {
        doc.text('Tax:', totalX - 100, y)
          .text(`$${order.tax_amount.toFixed(2)}`, totalX, y);
        y += 20;
      }
      
      if (order.shipping_amount > 0) {
        doc.text('Shipping:', totalX - 100, y)
          .text(`$${order.shipping_amount.toFixed(2)}`, totalX, y);
        y += 20;
      }
      
      if (order.discount_amount > 0) {
        doc.text('Discount:', totalX - 100, y)
          .text(`-$${order.discount_amount.toFixed(2)}`, totalX, y);
        y += 20;
      }
      
      doc.text('Total:', totalX - 100, y, { bold: true })
        .text(`$${order.total_amount.toFixed(2)}`, totalX, y, { bold: true });

      doc.end();

      // Wait for PDF to be written
      writeStream.on('finish', () => {
        res.json({
          success: true,
          message: 'Invoice generated successfully',
          invoice_url: `/invoices/${filename}`
        });
      });

    } catch (error) {
      console.error('Generate invoice error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error generating invoice'
      });
    }
  }

  // Get order statistics
  async getOrderStats(req, res) {
    try {
      const { period = 'month' } = req.query; // day, week, month, year
      
      const stats = await Order.getStats(period);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get order stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching order stats'
      });
    }
  }

  // Get recent orders
  async getRecentOrders(req, res) {
    try {
      const { limit = 10 } = req.query;
      
      const orders = await Order.getRecent(parseInt(limit));

      res.json({
        success: true,
        orders
      });
    } catch (error) {
      console.error('Get recent orders error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching recent orders'
      });
    }
  }

  // Get sales report
  async getSalesReport(req, res) {
    try {
      const { start_date, end_date, group_by = 'day' } = req.query;
      
      const report = await Order.getSalesReport(start_date, end_date, group_by);

      res.json({
        success: true,
        report
      });
    } catch (error) {
      console.error('Get sales report error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error generating sales report'
      });
    }
  }

  // Get product sales report
  async getProductSalesReport(req, res) {
    try {
      const { start_date, end_date, limit = 20 } = req.query;
      
      const report = await Order.getProductSalesReport(start_date, end_date, parseInt(limit));

      res.json({
        success: true,
        report
      });
    } catch (error) {
      console.error('Get product sales report error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error generating product sales report'
      });
    }
  }

  // Get customer report
  async getCustomerReport(req, res) {
    try {
      const { start_date, end_date, limit = 20 } = req.query;
      
      const report = await Order.getCustomerReport(start_date, end_date, parseInt(limit));

      res.json({
        success: true,
        report
      });
    } catch (error) {
      console.error('Get customer report error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error generating customer report'
      });
    }
  }

  // Process refund
  async processRefund(req, res) {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;
      
      const refund = await Order.processRefund(id, amount, reason);

      res.json({
        success: true,
        message: 'Refund processed successfully',
        refund
      });
    } catch (error) {
      console.error('Process refund error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error processing refund'
      });
    }
  }

  // Get refunds
  async getRefunds(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      
      const refunds = await Order.getRefunds(parseInt(page), parseInt(limit));

      res.json({
        success: true,
        ...refunds
      });
    } catch (error) {
      console.error('Get refunds error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching refunds'
      });
    }
  }

  // Handle payment webhook
  async handlePaymentWebhook(req, res) {
    try {
      const event = req.body;
      
      // Verify webhook signature (implement based on payment provider)
      // const isValid = verifyWebhookSignature(req);
      // if (!isValid) {
      //   return res.status(400).json({ success: false, message: 'Invalid signature' });
      // }

      // Handle different event types
      switch (event.type) {
        case 'payment.succeeded':
          await Order.updatePaymentStatus(event.data.order_id, 'paid');
          await Order.updateStatus(event.data.order_id, 'processing');
          break;
          
        case 'payment.failed':
          await Order.updatePaymentStatus(event.data.order_id, 'failed');
          break;
          
        case 'refund.processed':
          await Order.updatePaymentStatus(event.data.order_id, 'refunded');
          break;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Payment webhook error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error processing webhook'
      });
    }
  }

  // Get tracking info
  async getTrackingInfo(req, res) {
    try {
      const { id } = req.params;
      
      const tracking = await Order.getTrackingInfo(id);

      if (!tracking) {
        return res.status(404).json({
          success: false,
          message: 'Tracking information not found'
        });
      }

      res.json({
        success: true,
        tracking
      });
    } catch (error) {
      console.error('Get tracking info error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching tracking info'
      });
    }
  }
}

module.exports = new OrderController();