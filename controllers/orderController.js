const Order = require('../models/orders');
const Cart = require('../models/cart');
const db = require('../config/database');

// Create order
exports.createOrder = async (req, res) => {
  try {
    const { cartId, customerDetails, orderType = 'purchase' } = req.body;

    if (!customerDetails || !customerDetails.email || !customerDetails.name) {
      return res.status(400).json({
        success: false,
        message: 'Customer name and email are required'
      });
    }

    // Get cart if cartId provided
    let items = [];
    let subtotal = 0;

    if (cartId) {
      const cart = await Cart.getById(cartId);
      if (cart && cart.items) {
        items = cart.items;
        subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      }
    }

    // Use items from request body if no cart
    if (items.length === 0 && req.body.items) {
      items = req.body.items;
      subtotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items in order'
      });
    }

    // Calculate totals
    const tax = subtotal * 0.18; // 18% GST
    const shippingCost = subtotal > 5000 ? 0 : 200;
    const totalAmount = subtotal + tax + shippingCost;

    // Create order
    const orderData = {
      userId: req.user?.id || null,
      cartId,
      customerDetails,
      subtotal,
      tax,
      shippingCost,
      totalAmount,
      orderType
    };

    const { orderId, orderNumber } = await Order.create(orderData);

    // Add order items
    const orderItems = items.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name || item.name,
      sku: item.sku,
      quantity: item.quantity || 1,
      price: item.price || 0
    }));

    await Order.addItems(orderId, orderItems);

    // Clear cart if cartId provided
    if (cartId) {
      await Cart.updateStatus(cartId, 'converted');
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      orderId,
      orderNumber
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order'
    });
  }
};

// Get order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.getById(id);

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
      message: 'Failed to get order'
    });
  }
};

// Get user orders
exports.getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const orders = await Order.getByUserId(userId);

    res.json({
      success: true,
      orders
    });

  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get orders'
    });
  }
};

// Update order status (admin)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order status'
      });
    }

    const success = await Order.updateStatus(id, status);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully'
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};