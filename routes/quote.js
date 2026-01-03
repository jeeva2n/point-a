const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Create a new quote request or add to existing one
router.post('/', async (req, res) => {
  try {
    const { quoteId, productId, quantity = 1, customerInfo } = req.body;
    
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
    
    let finalQuoteId = quoteId;
    
    // Create a new quote request if no quoteId provided
    if (!quoteId) {
      const quoteNumber = 'QUOTE-' + Date.now();
      const [result] = await db.query(
        `INSERT INTO quote_requests (
          quote_number, customer_name, customer_email, customer_phone,
          customer_company, address, city, state, zip, country, message, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quoteNumber,
          customerInfo?.name || null,
          customerInfo?.email || null,
          customerInfo?.phone || null,
          customerInfo?.company || null,
          customerInfo?.address || null,
          customerInfo?.city || null,
          customerInfo?.state || null,
          customerInfo?.zip || null,
          customerInfo?.country || 'India',
          customerInfo?.message || null,
          'pending'
        ]
      );
      finalQuoteId = result.insertId;
    } else {
      const [quotes] = await db.query('SELECT * FROM quote_requests WHERE id = ?', [quoteId]);
      if (quotes.length === 0) {
        const quoteNumber = 'QUOTE-' + Date.now();
        const [result] = await db.query(
          `INSERT INTO quote_requests (quote_number, status) VALUES (?, ?)`,
          [quoteNumber, 'pending']
        );
        finalQuoteId = result.insertId;
      }
    }
    
    // Check if item already exists
    const [existingItems] = await db.query(
      'SELECT id, quantity FROM quote_request_items WHERE quote_request_id = ? AND product_id = ?',
      [finalQuoteId, productId]
    );

    if (existingItems.length > 0) {
      // Update quantity
      const newQuantity = existingItems[0].quantity + qty;
      await db.query(
        'UPDATE quote_request_items SET quantity = ? WHERE id = ?',
        [newQuantity, existingItems[0].id]
      );
    } else {
      // Insert new item
      await db.query(
        'INSERT INTO quote_request_items (quote_request_id, product_id, quantity) VALUES (?, ?, ?)',
        [finalQuoteId, productId, qty]
      );
    }
    
    // Update customer info if provided
    if (customerInfo) {
      const fields = [];
      const values = [];

      if (customerInfo.name) { fields.push('customer_name = ?'); values.push(customerInfo.name); }
      if (customerInfo.email) { fields.push('customer_email = ?'); values.push(customerInfo.email); }
      if (customerInfo.phone) { fields.push('customer_phone = ?'); values.push(customerInfo.phone); }
      if (customerInfo.company) { fields.push('customer_company = ?'); values.push(customerInfo.company); }
      if (customerInfo.message) { fields.push('message = ?'); values.push(customerInfo.message); }

      if (fields.length > 0) {
        values.push(finalQuoteId);
        await db.query(
          `UPDATE quote_requests SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          values
        );
      }
    }
    
    res.status(quoteId ? 200 : 201).json({
      success: true,
      quoteId: finalQuoteId,
      message: 'Product added to quote request successfully'
    });
  } catch (error) {
    console.error('Quote Request API error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while processing your request'
    });
  }
});

// Get quote request details
router.get('/:quoteId', async (req, res) => {
  try {
    const { quoteId } = req.params;
    
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: 'Quote ID is required'
      });
    }
    
    const [quotes] = await db.query('SELECT * FROM quote_requests WHERE id = ?', [quoteId]);
    
    if (quotes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quote request not found'
      });
    }
    
    const quoteRequest = quotes[0];
    
    // Get quote items with product details
    const [items] = await db.query(`
      SELECT 
        qri.id,
        qri.product_id,
        qri.quantity,
        p.name as product_name,
        p.description,
        p.short_description,
        p.image_url,
        p.sku,
        p.price
      FROM quote_request_items qri
      JOIN products p ON qri.product_id = p.id
      WHERE qri.quote_request_id = ?
      ORDER BY qri.created_at DESC
    `, [quoteId]);
    
    quoteRequest.items = items;
    
    res.json({
      success: true,
      quoteRequest
    });
  } catch (error) {
    console.error('Quote Request API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the quote request'
    });
  }
});

// Update item quantity
router.put('/:quoteId/items/:itemId', async (req, res) => {
  try {
    const { quoteId, itemId } = req.params;
    const { quantity } = req.body;
    
    if (!quoteId || !itemId) {
      return res.status(400).json({
        success: false,
        message: 'Quote ID and Item ID are required'
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
      await db.query('DELETE FROM quote_request_items WHERE id = ? AND quote_request_id = ?', [itemId, quoteId]);
    } else {
      await db.query(
        'UPDATE quote_request_items SET quantity = ? WHERE id = ? AND quote_request_id = ?',
        [qty, itemId, quoteId]
      );
    }
    
    // Get updated quote
    const [quotes] = await db.query('SELECT * FROM quote_requests WHERE id = ?', [quoteId]);
    const quoteRequest = quotes[0] || {};
    
    const [items] = await db.query(`
      SELECT 
        qri.id,
        qri.product_id,
        qri.quantity,
        p.name as product_name,
        p.description,
        p.short_description,
        p.image_url,
        p.sku,
        p.price
      FROM quote_request_items qri
      JOIN products p ON qri.product_id = p.id
      WHERE qri.quote_request_id = ?
      ORDER BY qri.created_at DESC
    `, [quoteId]);
    
    quoteRequest.items = items;
    
    res.json({
      success: true,
      message: qty === 0 ? 'Item removed from quote' : 'Quantity updated successfully',
      quoteRequest
    });
  } catch (error) {
    console.error('Quote Request API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating the quantity'
    });
  }
});

// Remove item from quote request
router.delete('/:quoteId/items/:itemId', async (req, res) => {
  try {
    const { quoteId, itemId } = req.params;
    
    if (!quoteId || !itemId) {
      return res.status(400).json({
        success: false,
        message: 'Quote ID and Item ID are required'
      });
    }
    
    const [result] = await db.query(
      'DELETE FROM quote_request_items WHERE id = ? AND quote_request_id = ?',
      [itemId, quoteId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in quote request'
      });
    }
    
    // Get updated quote
    const [quotes] = await db.query('SELECT * FROM quote_requests WHERE id = ?', [quoteId]);
    const quoteRequest = quotes[0] || {};
    
    const [items] = await db.query(`
      SELECT 
        qri.id,
        qri.product_id,
        qri.quantity,
        p.name as product_name,
        p.description,
        p.short_description,
        p.image_url,
        p.sku,
        p.price
      FROM quote_request_items qri
      JOIN products p ON qri.product_id = p.id
      WHERE qri.quote_request_id = ?
      ORDER BY qri.created_at DESC
    `, [quoteId]);
    
    quoteRequest.items = items;
    
    res.json({
      success: true,
      message: 'Item removed from quote request successfully',
      quoteRequest
    });
  } catch (error) {
    console.error('Quote Request API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while removing the item'
    });
  }
});

// Finalize quote request with customer info
router.put('/:quoteId/finalize', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const customerInfo = req.body;
    
    if (!quoteId) {
      return res.status(400).json({
        success: false,
        message: 'Quote ID is required'
      });
    }
    
    if (!customerInfo.email || !customerInfo.name) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }
    
    const [quotes] = await db.query('SELECT * FROM quote_requests WHERE id = ?', [quoteId]);
    if (quotes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Quote request not found'
      });
    }
    
    await db.query(
      `UPDATE quote_requests SET 
        customer_name = ?, customer_email = ?, customer_phone = ?,
        customer_company = ?, address = ?, city = ?, state = ?, zip = ?,
        country = ?, message = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [
        customerInfo.name,
        customerInfo.email,
        customerInfo.phone || null,
        customerInfo.company || null,
        customerInfo.address || null,
        customerInfo.city || null,
        customerInfo.state || null,
        customerInfo.zip || null,
        customerInfo.country || 'India',
        customerInfo.message || null,
        customerInfo.status || 'submitted',
        quoteId
      ]
    );
    
    res.json({
      success: true,
      quoteNumber: quotes[0].quote_number,
      message: 'Quote request finalized successfully. Our team will contact you shortly.'
    });
  } catch (error) {
    console.error('Quote Request API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while finalizing the quote request'
    });
  }
});

module.exports = router;