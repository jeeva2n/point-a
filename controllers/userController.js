const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../utils/emailService');

class UserController {
  // Register new user
  async register(req, res) {
    try {
      const { email, password, full_name, company, phone } = req.body;

      // Check if user exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email'
        });
      }

      // Create verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      // Create user
      const user = await User.create({
        email,
        password,
        full_name,
        company,
        phone,
        verification_token: verificationToken
      });

      // Send verification email
      const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
      await sendEmail({
        to: email,
        subject: 'Verify Your Email - DAKS NDT',
        template: 'verify-email',
        context: {
          name: full_name,
          verification_url: verificationUrl
        }
      });

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email for verification.',
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          company: user.company,
          phone: user.phone,
          is_verified: user.email_verified
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during registration'
      });
    }
  }

  // Login user
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account is disabled. Please contact support.'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Update last login
      await User.updateLastLogin(user.id);

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          company: user.company,
          phone: user.phone,
          is_verified: user.email_verified
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during login'
      });
    }
  }

  // Get user profile
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      res.json({
        success: true,
        user
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching profile'
      });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      const { full_name, company, phone, address, city, country, postal_code } = req.body;
      
      const updatedUser = await User.update(req.user.id, {
        full_name,
        company,
        phone,
        address,
        city,
        country,
        postal_code
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating profile'
      });
    }
  }

  // Change password
  async changePassword(req, res) {
    try {
      const { current_password, new_password } = req.body;

      // Get user with password
      const user = await User.findByIdWithPassword(req.user.id);
      
      // Verify current password
      const isValidPassword = await bcrypt.compare(current_password, user.password);
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Update password
      await User.changePassword(req.user.id, new_password);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error changing password'
      });
    }
  }

  // Forgot password
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const user = await User.findByEmail(email);
      if (!user) {
        // Don't reveal if user exists for security
        return res.json({
          success: true,
          message: 'If an account exists with this email, you will receive a reset link.'
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      await User.setResetToken(user.id, resetToken, resetExpires);

      // Send reset email
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
      await sendEmail({
        to: email,
        subject: 'Reset Your Password - DAKS NDT',
        template: 'reset-password',
        context: {
          name: user.full_name,
          reset_url: resetUrl
        }
      });

      res.json({
        success: true,
        message: 'Password reset link sent to your email'
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error processing request'
      });
    }
  }

  // Reset password
  async resetPassword(req, res) {
    try {
      const { token } = req.params;
      const { password } = req.body;

      // Find user by reset token
      const user = await User.findByResetToken(token);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }

      // Update password
      await User.changePassword(user.id, password);
      
      // Clear reset token
      await User.clearResetToken(user.id);

      res.json({
        success: true,
        message: 'Password reset successful. You can now login with your new password.'
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error resetting password'
      });
    }
  }

  // Verify email
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;

      const user = await User.findByVerificationToken(token);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification token'
        });
      }

      await User.verifyEmail(user.id);

      res.json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      console.error('Verify email error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error verifying email'
      });
    }
  }

  // Get user addresses
  async getAddresses(req, res) {
    try {
      const addresses = await User.getAddresses(req.user.id);
      
      res.json({
        success: true,
        addresses
      });
    } catch (error) {
      console.error('Get addresses error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching addresses'
      });
    }
  }

  // Add address
  async addAddress(req, res) {
    try {
      const addressData = {
        ...req.body,
        user_id: req.user.id
      };

      const address = await User.addAddress(addressData);

      res.status(201).json({
        success: true,
        message: 'Address added successfully',
        address
      });
    } catch (error) {
      console.error('Add address error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error adding address'
      });
    }
  }

  // Update address
  async updateAddress(req, res) {
    try {
      const { id } = req.params;
      
      const address = await User.updateAddress(id, req.user.id, req.body);

      res.json({
        success: true,
        message: 'Address updated successfully',
        address
      });
    } catch (error) {
      console.error('Update address error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating address'
      });
    }
  }

  // Delete address
  async deleteAddress(req, res) {
    try {
      const { id } = req.params;
      
      await User.deleteAddress(id, req.user.id);

      res.json({
        success: true,
        message: 'Address deleted successfully'
      });
    } catch (error) {
      console.error('Delete address error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error deleting address'
      });
    }
  }

  // Set default address
  async setDefaultAddress(req, res) {
    try {
      const { id } = req.params;
      
      await User.setDefaultAddress(id, req.user.id);

      res.json({
        success: true,
        message: 'Default address updated successfully'
      });
    } catch (error) {
      console.error('Set default address error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error setting default address'
      });
    }
  }

  // Get user orders
  async getUserOrders(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const orders = await Order.getUserOrders(req.user.id, parseInt(page), parseInt(limit));

      res.json({
        success: true,
        ...orders
      });
    } catch (error) {
      console.error('Get user orders error:', error);
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
      
      const order = await Order.getUserOrderById(id, req.user.id);
      
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

  // Create order
  async createOrder(req, res) {
    try {
      const orderData = {
        ...req.body,
        user_id: req.user.id,
        customer_email: req.user.email,
        customer_name: req.user.full_name
      };

      const order = await Order.create(orderData);

      // Update product stock
      for (const item of order.items) {
        await Product.updateStock(item.product_id, item.quantity);
      }

      // Send order confirmation email
      await sendEmail({
        to: req.user.email,
        subject: `Order Confirmation - #${order.order_number}`,
        template: 'order-confirmation',
        context: {
          name: req.user.full_name,
          order_number: order.order_number,
          order_date: new Date(order.created_at).toLocaleDateString(),
          total_amount: order.total_amount,
          items: order.items
        }
      });

      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        order
      });
    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error creating order'
      });
    }
  }

  // Cancel order
  async cancelOrder(req, res) {
    try {
      const { id } = req.params;
      
      const order = await Order.cancelOrder(id, req.user.id);

      // Restore product stock
      for (const item of order.items) {
        await Product.updateStock(item.product_id, -item.quantity);
      }

      res.json({
        success: true,
        message: 'Order cancelled successfully',
        order
      });
    } catch (error) {
      console.error('Cancel order error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error cancelling order'
      });
    }
  }

  // Get wishlist
  async getWishlist(req, res) {
    try {
      const wishlist = await User.getWishlist(req.user.id);
      
      res.json({
        success: true,
        wishlist
      });
    } catch (error) {
      console.error('Get wishlist error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching wishlist'
      });
    }
  }

  // Add to wishlist
  async addToWishlist(req, res) {
    try {
      const { productId } = req.params;
      
      await User.addToWishlist(req.user.id, productId);

      res.json({
        success: true,
        message: 'Product added to wishlist'
      });
    } catch (error) {
      console.error('Add to wishlist error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error adding to wishlist'
      });
    }
  }

  // Remove from wishlist
  async removeFromWishlist(req, res) {
    try {
      const { productId } = req.params;
      
      await User.removeFromWishlist(req.user.id, productId);

      res.json({
        success: true,
        message: 'Product removed from wishlist'
      });
    } catch (error) {
      console.error('Remove from wishlist error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error removing from wishlist'
      });
    }
  }

  // Get user reviews
  async getUserReviews(req, res) {
    try {
      const reviews = await User.getReviews(req.user.id);
      
      res.json({
        success: true,
        reviews
      });
    } catch (error) {
      console.error('Get reviews error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching reviews'
      });
    }
  }

  // Create review
  async createReview(req, res) {
    try {
      const reviewData = {
        ...req.body,
        user_id: req.user.id,
        user_name: req.user.full_name,
        user_email: req.user.email
      };

      // Check if user has purchased the product
      const hasPurchased = await User.hasPurchasedProduct(req.user.id, reviewData.product_id);
      if (!hasPurchased) {
        return res.status(400).json({
          success: false,
          message: 'You must purchase the product before reviewing'
        });
      }

      // Check if already reviewed
      const existingReview = await User.getProductReview(req.user.id, reviewData.product_id);
      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: 'You have already reviewed this product'
        });
      }

      const review = await User.createReview(reviewData);

      res.status(201).json({
        success: true,
        message: 'Review submitted successfully',
        review
      });
    } catch (error) {
      console.error('Create review error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error creating review'
      });
    }
  }

  // Update review
  async updateReview(req, res) {
    try {
      const { id } = req.params;
      
      const review = await User.updateReview(id, req.user.id, req.body);

      res.json({
        success: true,
        message: 'Review updated successfully',
        review
      });
    } catch (error) {
      console.error('Update review error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating review'
      });
    }
  }

  // Delete review
  async deleteReview(req, res) {
    try {
      const { id } = req.params;
      
      await User.deleteReview(id, req.user.id);

      res.json({
        success: true,
        message: 'Review deleted successfully'
      });
    } catch (error) {
      console.error('Delete review error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error deleting review'
      });
    }
  }
}

module.exports = new UserController();