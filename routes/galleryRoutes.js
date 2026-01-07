const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Database connection (import from your main server or config)
const mysql = require('mysql2');
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'daks_ndt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
const db = pool.promise();

// Ensure gallery upload directory exists
const galleryUploadDir = path.join(__dirname, '../uploads/gallery');
if (!fs.existsSync(galleryUploadDir)) {
  fs.mkdirSync(galleryUploadDir, { recursive: true });
}

// Configure multer for gallery uploads
const galleryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, galleryUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'gallery-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const galleryUpload = multer({
  storage: galleryStorage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const allowedVideoTypes = /mp4|webm|ogg|mov|avi/;
    const extname = path.extname(file.originalname).toLowerCase().slice(1);
    const mimetype = file.mimetype;
    
    if (allowedImageTypes.test(extname) || mimetype.startsWith('image/')) {
      req.fileType = 'image';
      cb(null, true);
    } else if (allowedVideoTypes.test(extname) || mimetype.startsWith('video/')) {
      req.fileType = 'video';
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'), false);
    }
  }
});

// GET all gallery items
router.get('/', async (req, res) => {
  try {
    const { type, category, limit = 100 } = req.query;
    let query = 'SELECT * FROM gallery WHERE is_active = TRUE';
    const params = [];

    if (type && type !== 'all') {
      query += ' AND file_type = ?';
      params.push(type);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY sort_order ASC, created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [items] = await db.query(query, params);

    res.json({
      success: true,
      gallery: items
    });
  } catch (error) {
    console.error('Get gallery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching gallery'
    });
  }
});

// GET all gallery items (for admin - includes inactive)
router.get('/admin', async (req, res) => {
  try {
    const { type, category, limit = 500 } = req.query;
    let query = 'SELECT * FROM gallery';
    const params = [];
    let whereAdded = false;

    if (type && type !== 'all') {
      query += ' WHERE file_type = ?';
      params.push(type);
      whereAdded = true;
    }

    if (category) {
      query += whereAdded ? ' AND' : ' WHERE';
      query += ' category = ?';
      params.push(category);
    }

    query += ' ORDER BY sort_order ASC, created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [items] = await db.query(query, params);

    res.json({
      success: true,
      gallery: items
    });
  } catch (error) {
    console.error('Get admin gallery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching gallery'
    });
  }
});

// GET single gallery item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [items] = await db.query('SELECT * FROM gallery WHERE id = ?', [id]);

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    res.json({
      success: true,
      item: items[0]
    });
  } catch (error) {
    console.error('Get gallery item error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching gallery item'
    });
  }
});

// POST - Create new gallery item
router.post('/', galleryUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { title, description, category, tags, is_active } = req.body;
    const fileUrl = `/uploads/gallery/${req.file.filename}`;
    
    // Determine file type from mimetype
    const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    const [result] = await db.query(
      `INSERT INTO gallery (title, description, file_url, file_type, category, tags, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title || req.file.originalname,
        description || '',
        fileUrl,
        fileType,
        category || 'general',
        tags || '',
        is_active !== 'false'
      ]
    );

    const [newItem] = await db.query('SELECT * FROM gallery WHERE id = ?', [result.insertId]);

    console.log(`✅ Gallery item created: ${newItem[0].title}`);

    res.status(201).json({
      success: true,
      message: 'Gallery item created successfully',
      item: newItem[0]
    });
  } catch (error) {
    console.error('Create gallery error:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      const filePath = path.join(galleryUploadDir, req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error creating gallery item'
    });
  }
});

// PUT - Update gallery item
router.put('/:id', galleryUpload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, tags, is_active } = req.body;

    // Check if item exists
    const [existing] = await db.query('SELECT * FROM gallery WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Gallery item not found'
      });
    }

    let fileUrl = existing[0].file_url;
    let fileType = existing[0].file_type;

    // If new file uploaded, delete old one and update
    if (req.file) {
      // Delete old file
      const oldFilePath = path.join(__dirname, '..', existing[0].file_url);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }

      fileUrl = `/uploads/gallery/${req.file.filename}`;
      fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    }

    await db.query(
      `UPDATE gallery SET 
        title = ?, description = ?, file_url = ?, file_type = ?, 
        category = ?, tags = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title || existing[0].title,
        description !== undefined ? description : existing[0].description,
        fileUrl,
        fileType,
        category || existing[0].category,
        tags !== undefined ? tags : existing[0].tags,
        is_active !== 'false',
        id
      ]
    );

    const [updated] = await db.query('SELECT * FROM gallery WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Gallery item updated successfully',
      item: updated[0]
    });
  } catch (error) {
    console.error('Update gallery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating gallery item'
    });
  }
});

// PUT - Reorder gallery items
router.put('/reorder/items', async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request data'
      });
    }

    for (const item of items) {
      if (item.id && typeof item.sort_order === 'number') {
        await db.query(
          'UPDATE gallery SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [item.sort_order, item.id]
        );
      }
    }

    res.json({
      success: true,
      message: 'Gallery order updated successfully'
    });
  } catch (error) {
    console.error('Reorder gallery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error reordering gallery'
    });
  }
});

// DELETE - Delete gallery item
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get item to delete file
    const [items] = await db.query('SELECT file_url FROM gallery WHERE id = ?', [id]);
    
    if (items.length > 0) {
      const filePath = path.join(__dirname, '..', items[0].file_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.query('DELETE FROM gallery WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Gallery item deleted successfully'
    });
  } catch (error) {
    console.error('Delete gallery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting gallery item'
    });
  }
});

// DELETE - Bulk delete gallery items
router.delete('/bulk/delete', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No IDs provided'
      });
    }

    for (const id of ids) {
      const [items] = await db.query('SELECT file_url FROM gallery WHERE id = ?', [id]);
      
      if (items.length > 0) {
        const filePath = path.join(__dirname, '..', items[0].file_url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      await db.query('DELETE FROM gallery WHERE id = ?', [id]);
    }

    res.json({
      success: true,
      message: `${ids.length} gallery items deleted successfully`
    });
  } catch (error) {
    console.error('Bulk delete gallery error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk delete'
    });
  }
});

// GET gallery categories
router.get('/meta/categories', async (req, res) => {
  try {
    const [categories] = await db.query(
      'SELECT DISTINCT category FROM gallery WHERE category IS NOT NULL AND category != "" ORDER BY category'
    );

    res.json({
      success: true,
      categories: categories.map(c => c.category)
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching categories'
    });
  }
});

module.exports = router;