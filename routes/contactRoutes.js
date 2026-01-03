const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Create contact message
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, company, message, user_id } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }
    
    const [result] = await db.query(
      `INSERT INTO contact_messages (user_id, name, email, phone, company, message) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id || null, name, email, phone || null, company || null, message]
    );
    
    console.log('✅ Contact message saved:', result.insertId);
    
    res.status(201).json({
      success: true,
      message: 'Contact message saved successfully',
      contactId: result.insertId
    });
  } catch (error) {
    console.error('Contact API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while saving your message'
    });
  }
});

// Get all contact messages (admin only)
router.get('/', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM contact_messages WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const [messages] = await db.query(query, params);
    
    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Contact API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching messages'
    });
  }
});

// Update message status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const [result] = await db.query(
      'UPDATE contact_messages SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Status updated successfully'
    });
  } catch (error) {
    console.error('Contact API error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating status'
    });
  }
});

module.exports = router;