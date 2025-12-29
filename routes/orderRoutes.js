const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { auth } = require('../middleware/auth');
const { hasPermission } = require('../middleware/auth');
const { validateOrder } = require('../middleware/validation');

// Public routes (checkout)
router.post('/checkout', validateOrder, orderController.createOrder);
router.post('/webhook/payment', orderController.handlePaymentWebhook);

// Protected routes (admin access)
router.use(auth);

// Order management
router.get('/', hasPermission('view_orders'), orderController.getAllOrders);
router.get('/stats', hasPermission('view_orders'), orderController.getOrderStats);
router.get('/recent', hasPermission('view_orders'), orderController.getRecentOrders);
router.get('/:id', hasPermission('view_orders'), orderController.getOrderById);
router.put('/:id/status', hasPermission('update_orders'), orderController.updateOrderStatus);
router.put('/:id/payment', hasPermission('update_orders'), orderController.updatePaymentStatus);
router.put('/:id/ship', hasPermission('update_orders'), orderController.shipOrder);
router.post('/:id/invoice', hasPermission('manage_orders'), orderController.generateInvoice);
router.get('/:id/tracking', hasPermission('view_orders'), orderController.getTrackingInfo);

// Reports
router.get('/reports/sales', hasPermission('view_reports'), orderController.getSalesReport);
router.get('/reports/products', hasPermission('view_reports'), orderController.getProductSalesReport);
router.get('/reports/customers', hasPermission('view_reports'), orderController.getCustomerReport);

// Refunds
router.post('/:id/refund', hasPermission('manage_refunds'), orderController.processRefund);
router.get('/refunds', hasPermission('view_refunds'), orderController.getRefunds);

module.exports = router;