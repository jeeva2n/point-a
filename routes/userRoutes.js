const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { auth: userAuth } = require('../middleware/userAuth');
const { validateUserRegistration, validateUserLogin } = require('../middleware/validation');

// Public routes
router.post('/register', validateUserRegistration, userController.register);
router.post('/login', validateUserLogin, userController.login);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password/:token', userController.resetPassword);
router.get('/verify-email/:token', userController.verifyEmail);

// Protected routes (user authentication)
router.use(userAuth);

// User profile
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/change-password', userController.changePassword);

// Address management
router.get('/addresses', userController.getAddresses);
router.post('/addresses', userController.addAddress);
router.put('/addresses/:id', userController.updateAddress);
router.delete('/addresses/:id', userController.deleteAddress);
router.put('/addresses/:id/default', userController.setDefaultAddress);

// Orders
router.get('/orders', userController.getUserOrders);
router.get('/orders/:id', userController.getOrderById);
router.post('/orders', userController.createOrder);
router.post('/orders/:id/cancel', userController.cancelOrder);

// Wishlist
router.get('/wishlist', userController.getWishlist);
router.post('/wishlist/:productId', userController.addToWishlist);
router.delete('/wishlist/:productId', userController.removeFromWishlist);

// Reviews
router.get('/reviews', userController.getUserReviews);
router.post('/reviews', userController.createReview);
router.put('/reviews/:id', userController.updateReview);
router.delete('/reviews/:id', userController.deleteReview);

module.exports = router;