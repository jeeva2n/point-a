const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Create a new cart or add to existing cart
router.post('/', async (req, res) => {
  try {
    const { cartId, productId, quantity = 1 } = req.body;
    
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }
    
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive number'
      });
    }
    
    let finalCartId = cartId;
    
    // Create a new cart if no cartId provided or cart doesn't exist
    if (!cartId) {
      const [result] = await db.query(
        'INSERT INTO carts (status) VALUES (?)',
        ['active']
      );
      finalCartId = result.insertId;
    } else {
      const [carts] = await db.query('SELECT * FROM carts WHERE id = ?', [cartId]);
      if (carts.length === 0) {
        const [result] = await db.query(
          'INSERT INTO carts (status) VALUES (?)',
          ['active']
        );
        finalCartId = result.insertId;
      }
    }
    
    // Get product price
    const [products] = await db.query('SELECT price FROM products WHERE id = ?', [productId]);
    const price = products.length > 0 ? products[0].price : 0;
    
    // Check if item already exists in cart
    const [existingItems] = await db.query(
      'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
      [finalCartId, productId]
    );

    if (existingItems.length > 0) {
      // Update quantity
      const newQuantity = existingItems[0].quantity + qty;
      await db.query(
        'UPDATE cart_items SET quantity = ? WHERE id = ?',
        [newQuantity, existingItems[0].id]
      );
    } else {
      // Insert new item
      await db.query(
        'INSERT INTO cart_items (cart_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [finalCartId, productId, qty, price]
      );
    }
    
    // Get updated item count
    const [countResult] = await db.query(
      'SELECT COALESCE(SUM(quantity), 0) as count FROM cart_items WHERE cart_id = ?',
      [finalCartId]
    );
    const itemCount = parseInt(countResult[0].count) || 0;
    
    res.status(cartId ? 200 : 201).json({
      success: true,
      cartId: finalCartId,
      itemCount,
      message: 'Product added to cart successfully'
    });
  } catch (error) {
    console.error('Cart API error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while processing your request'
    });
  }
});

// Get cart contents
router.get('/:cartId', async (req, res) => {
  try {
    const { cartId } = req.params;
    
    if (!cartId) {
      return res.status(400).json({
        success: false,
        message: 'Cart ID is required'
      });
    }
    
    const [carts] = await db.query('SELECT * FROM carts WHERE id = ?', [cartId]);
    
    if (carts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    const cart = carts[0];
    
    // Get cart items with product details
    const [items] = await db.query(`
      SELECT 
        ci.id,
        ci.product_id,
        ci.quantity,
        ci.price,
        p.name as product_name,
        p.description,
        p.short_description,
        p.image_url,
        p.sku
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at DESC
    `, [cartId]);
    
    cart.items = items;
    
    res.json({
      success: true,
      cart
    });
  } catch (error) {
    console.error('Cart API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the cart'
    });
  }
});

// Update item quantity
router.put('/:cartId/items/:itemId', async (req, res) => {
  try {
    const { cartId, itemId } = req.params;
    const { quantity } = req.body;
    
    if (!cartId || !itemId) {
      return res.status(400).json({
        success: false,
        message: 'Cart ID and Item ID are required'
      });
    }
    
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid quantity is required'
      });
    }
    
    if (qty === 0) {
      // Remove item
      await db.query('DELETE FROM cart_items WHERE id = ? AND cart_id = ?', [itemId, cartId]);
    } else {
      // Update quantity
      await db.query(
        'UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?',
        [qty, itemId, cartId]
      );
    }
    
    // Get updated cart
    const [carts] = await db.query('SELECT * FROM carts WHERE id = ?', [cartId]);
    const cart = carts[0] || {};
    
    const [items] = await db.query(`
      SELECT 
        ci.id,
        ci.product_id,
        ci.quantity,
        ci.price,
        p.name as product_name,
        p.description,
        p.short_description,
        p.image_url,
        p.sku
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at DESC
    `, [cartId]);
    
    cart.items = items;
    
    res.json({
      success: true,
      message: qty === 0 ? 'Item removed from cart' : 'Quantity updated successfully',
      cart
    });
  } catch (error) {
    console.error('Cart API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the quantity'
    });
  }
});

// Remove item from cart
router.delete('/:cartId/items/:itemId', async (req, res) => {
  try {
    const { cartId, itemId } = req.params;
    
    if (!cartId || !itemId) {
      return res.status(400).json({
        success: false,
        message: 'Cart ID and Item ID are required'
      });
    }
    
    const [result] = await db.query(
      'DELETE FROM cart_items WHERE id = ? AND cart_id = ?',
      [itemId, cartId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }
    
    // Get updated cart
    const [carts] = await db.query('SELECT * FROM carts WHERE id = ?', [cartId]);
    const cart = carts[0] || {};
    
    const [items] = await db.query(`
      SELECT 
        ci.id,
        ci.product_id,
        ci.quantity,
        ci.price,
        p.name as product_name,
        p.description,
        p.short_description,
        p.image_url,
        p.sku
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at DESC
    `, [cartId]);
    
    cart.items = items;
    
    res.json({
      success: true,
      message: 'Item removed from cart successfully',
      cart
    });
  } catch (error) {
    console.error('Cart API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while removing the item from cart'
    });
  }
});

// Update cart customer info
router.put('/:cartId/customer', async (req, res) => {
  try {
    const { cartId } = req.params;
    const { email, name } = req.body;
    
    if (!cartId) {
      return res.status(400).json({
        success: false,
        message: 'Cart ID is required'
      });
    }
    
    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email and name are required'
      });
    }
    
    const [result] = await db.query(
      'UPDATE carts SET customer_email = ?, customer_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [email, name, 'converted', cartId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Customer information updated successfully'
    });
  } catch (error) {
    console.error('Cart API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating customer information'
    });
  }
});

module.exports = router;