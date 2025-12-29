const pool = require('../config/database');
const crypto = require('crypto');

class Product {
  static async create(productData) {
    const {
      name,
      description,
      short_description,
      category,
      subcategory,
      materials,
      dimensions,
      tolerance,
      flaws,
      weight,
      standards,
      specifications,
      features,
      image_url,
      type,
      price,
      compare_price,
      cost_price,
      stock_quantity,
      sku,
      meta_title,
      meta_description,
      meta_keywords
    } = productData;

    // Generate SKU if not provided
    const finalSku = sku || `PROD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    // Generate slug from name
    const slug = name.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-');

    // Handle materials array
    let materialsJson = '[]';
    if (materials) {
      if (Array.isArray(materials)) {
        materialsJson = JSON.stringify(materials);
      } else if (typeof materials === 'string') {
        try {
          JSON.parse(materials);
          materialsJson = materials;
        } catch (e) {
          materialsJson = JSON.stringify([materials]);
        }
      }
    }

    const [result] = await pool.query(
      `INSERT INTO products 
       (name, slug, sku, description, short_description, category, subcategory, 
        materials, dimensions, tolerance, flaws, weight, standards, specifications, features, 
        image_url, type, price, compare_price, cost_price, stock_quantity,
        meta_title, meta_description, meta_keywords) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        slug,
        finalSku,
        description || null,
        short_description || (description ? description.substring(0, 500) : null),
        category,
        subcategory || null,
        materialsJson,
        dimensions || null,
        tolerance || null,
        flaws || null,
        weight || null,
        standards || null,
        typeof specifications === 'object' ? JSON.stringify(specifications) : (specifications || null),
        typeof features === 'object' ? JSON.stringify(features) : (features || null),
        image_url || null,
        type,
        price || 0,
        compare_price || null,
        cost_price || null,
        stock_quantity || 0,
        meta_title || null,
        meta_description || null,
        meta_keywords || null
      ]
    );
    
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM products WHERE id = ? AND is_active = 1',
      [id]
    );
    
    if (!rows[0]) return null;

    // Get images
    const [images] = await pool.query(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
      [id]
    );
    
    const product = this.parseJsonFields(rows[0]);
    product.images = images.map(img => ({
      id: img.id,
      url: img.image_url,
      isMain: img.is_main === 1,
      sortOrder: img.sort_order
    }));
    product.mainImage = images.find(img => img.is_main === 1)?.image_url || product.image_url;
    
    return product;
  }

  static async findBySlug(slug) {
    const [rows] = await pool.query(
      'SELECT * FROM products WHERE slug = ? AND is_active = 1',
      [slug]
    );
    
    if (!rows[0]) return null;

    const [images] = await pool.query(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
      [rows[0].id]
    );
    
    const product = this.parseJsonFields(rows[0]);
    product.images = images.map(img => ({
      id: img.id,
      url: img.image_url,
      isMain: img.is_main === 1,
      sortOrder: img.sort_order
    }));
    product.mainImage = images.find(img => img.is_main === 1)?.image_url || product.image_url;
    
    return product;
  }

  static async findAll(filters = {}, page = 1, limit = 20, sortField = 'created_at DESC') {
    let query = 'SELECT * FROM products WHERE is_active = 1';
    const params = [];
    
    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    
    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }
    
    if (filters.subcategory) {
      query += ' AND subcategory = ?';
      params.push(filters.subcategory);
    }
    
    if (filters.min_price) {
      query += ' AND price >= ?';
      params.push(filters.min_price);
    }
    
    if (filters.max_price) {
      query += ' AND price <= ?';
      params.push(filters.max_price);
    }
    
    if (filters.featured === 'true') {
      query += ' AND is_featured = 1';
    }
    
    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0]?.total || 0;
    
    // Add ordering and pagination
    const offset = (page - 1) * limit;
    query += ` ORDER BY ${sortField} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const [rows] = await pool.query(query, params);
    
    // Get images for each product
    const products = await Promise.all(rows.map(async row => {
      const [images] = await pool.query(
        'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
        [row.id]
      );
      
      const product = this.parseJsonFields(row);
      product.images = images.map(img => ({
        id: img.id,
        url: img.image_url,
        isMain: img.is_main === 1,
        sortOrder: img.sort_order
      }));
      product.mainImage = images.find(img => img.is_main === 1)?.image_url || product.image_url;
      
      return product;
    }));
    
    return {
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async search(searchTerm, page = 1, limit = 20) {
    if (!searchTerm || searchTerm.trim() === '') {
      return { products: [], pagination: { page, limit, total: 0, pages: 0 } };
    }
    
    const offset = (page - 1) * limit;
    const likeTerm = `%${searchTerm}%`;
    
    const [rows] = await pool.query(
      `SELECT * FROM products 
       WHERE is_active = 1 
       AND (name LIKE ? OR description LIKE ? OR materials LIKE ? OR standards LIKE ? OR category LIKE ?)
       ORDER BY 
         CASE WHEN name LIKE ? THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT ? OFFSET ?`,
      [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, limit, offset]
    );
    
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM products 
       WHERE is_active = 1 
       AND (name LIKE ? OR description LIKE ? OR materials LIKE ? OR standards LIKE ? OR category LIKE ?)`,
      [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm]
    );
    
    const total = countResult[0]?.total || 0;
    
    // Get images for each product
    const products = await Promise.all(rows.map(async row => {
      const [images] = await pool.query(
        'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
        [row.id]
      );
      
      const product = this.parseJsonFields(row);
      product.images = images.map(img => ({
        id: img.id,
        url: img.image_url,
        isMain: img.is_main === 1,
        sortOrder: img.sort_order
      }));
      product.mainImage = images.find(img => img.is_main === 1)?.image_url || product.image_url;
      
      return product;
    }));
    
    return {
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async update(id, productData, adminId = null) {
    const oldProduct = await this.findById(id);
    if (!oldProduct) return null;

    const updateFields = [];
    const updateValues = [];
    
    const fieldMapping = {
      name: 'name',
      description: 'description',
      short_description: 'short_description',
      category: 'category',
      subcategory: 'subcategory',
      materials: 'materials',
      dimensions: 'dimensions',
      tolerance: 'tolerance',
      flaws: 'flaws',
      weight: 'weight',
      standards: 'standards',
      specifications: 'specifications',
      features: 'features',
      image_url: 'image_url',
      type: 'type',
      price: 'price',
      compare_price: 'compare_price',
      cost_price: 'cost_price',
      stock_quantity: 'stock_quantity',
      is_featured: 'is_featured',
      is_active: 'is_active',
      meta_title: 'meta_title',
      meta_description: 'meta_description',
      meta_keywords: 'meta_keywords'
    };

    for (const [key, dbField] of Object.entries(fieldMapping)) {
      if (key in productData) {
        let value = productData[key];
        
        // Handle JSON fields
        if (['specifications', 'features', 'materials'].includes(key)) {
          if (typeof value === 'object') {
            value = JSON.stringify(value);
          } else if (typeof value === 'string' && key === 'materials') {
            try {
              JSON.parse(value);
            } catch (e) {
              value = JSON.stringify([value]);
            }
          }
        }
        
        updateFields.push(`${dbField} = ?`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      return oldProduct;
    }

    updateValues.push(id);
    
    const [result] = await pool.query(
      `UPDATE products SET 
       ${updateFields.join(', ')},
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      updateValues
    );

    if (result.affectedRows > 0) {
      return this.findById(id);
    }
    
    return null;
  }

  static async delete(id, adminId = null) {
    const product = await this.findById(id);
    if (!product) return false;

    const [result] = await pool.query(
      'UPDATE products SET is_active = 0 WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  }

  static async addImages(productId, images) {
    const [maxOrder] = await pool.query(
      'SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?',
      [productId]
    );
    let sortOrder = (maxOrder[0].max_order || -1) + 1;

    const [existingImages] = await pool.query(
      'SELECT COUNT(*) as count FROM product_images WHERE product_id = ?',
      [productId]
    );
    const isFirstImage = existingImages[0].count === 0;

    const insertedImages = [];
    for (let i = 0; i < images.length; i++) {
      const isMain = isFirstImage && i === 0 ? 1 : 0;
      
      const [result] = await pool.query(
        `INSERT INTO product_images (product_id, image_url, is_main, sort_order)
         VALUES (?, ?, ?, ?)`,
        [productId, images[i], isMain, sortOrder + i]
      );

      insertedImages.push({
        id: result.insertId,
        url: images[i],
        isMain: isMain === 1,
        sortOrder: sortOrder + i
      });

      if (isMain) {
        await pool.query('UPDATE products SET image_url = ? WHERE id = ?', [images[i], productId]);
      }
    }

    return insertedImages;
  }

  static async deleteImage(productId, imageId) {
    const [images] = await pool.query(
      'SELECT * FROM product_images WHERE id = ? AND product_id = ?',
      [imageId, productId]
    );

    if (images.length === 0) return null;

    const image = images[0];
    await pool.query('DELETE FROM product_images WHERE id = ?', [imageId]);

    if (image.is_main === 1) {
      const [remainingImages] = await pool.query(
        'SELECT id, image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC LIMIT 1',
        [productId]
      );

      if (remainingImages.length > 0) {
        await pool.query('UPDATE product_images SET is_main = 1 WHERE id = ?', [remainingImages[0].id]);
        await pool.query('UPDATE products SET image_url = ? WHERE id = ?', [remainingImages[0].image_url, productId]);
      } else {
        await pool.query('UPDATE products SET image_url = NULL WHERE id = ?', [productId]);
      }
    }

    return image.image_url;
  }

  static async setMainImage(productId, imageId) {
    const [images] = await pool.query(
      'SELECT image_url FROM product_images WHERE id = ? AND product_id = ?',
      [imageId, productId]
    );

    if (images.length === 0) return false;

    await pool.query('UPDATE product_images SET is_main = 0 WHERE product_id = ?', [productId]);
    await pool.query('UPDATE product_images SET is_main = 1 WHERE id = ?', [imageId]);
    await pool.query('UPDATE products SET image_url = ? WHERE id = ?', [images[0].image_url, productId]);

    return true;
  }

  static async reorderImages(productId, imageOrder) {
    for (let i = 0; i < imageOrder.length; i++) {
      await pool.query(
        'UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?',
        [i, imageOrder[i], productId]
      );
    }
    return true;
  }

  static async getCategories() {
    const [rows] = await pool.query(
      `SELECT 
        category, 
        type, 
        COUNT(*) as product_count,
        MIN(price) as min_price,
        MAX(price) as max_price
       FROM products 
       WHERE is_active = 1 
       GROUP BY category, type 
       ORDER BY category, type`
    );
    return rows;
  }

  static async getCountByCategory(categoryName) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE category = ? AND is_active = 1',
      [categoryName]
    );
    return rows[0]?.count || 0;
  }

  static async getRelatedProducts(productId, limit = 4) {
    const product = await this.findById(productId);
    if (!product) return [];

    const [rows] = await pool.query(
      `SELECT * FROM products
       WHERE is_active = 1 
       AND id != ?
       AND (category = ? OR type = ?)
       ORDER BY 
         CASE WHEN category = ? THEN 1 ELSE 2 END,
         CASE WHEN type = ? THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT ?`,
      [productId, product.category, product.type, product.category, product.type, limit]
    );
    
    return Promise.all(rows.map(async row => {
      const [images] = await pool.query(
        'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC LIMIT 1',
        [row.id]
      );
      
      const parsed = this.parseJsonFields(row);
      parsed.mainImage = images[0]?.image_url || row.image_url;
      return parsed;
    }));
  }

  static async updateStock(id, quantity) {
    const [result] = await pool.query(
      'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?',
      [quantity, id, quantity]
    );
    
    return result.affectedRows > 0;
  }

  // Helper method to parse JSON fields
  static parseJsonFields(row) {
    const jsonFields = ['specifications', 'features', 'materials'];
    
    jsonFields.forEach(field => {
      if (row[field] && typeof row[field] === 'string') {
        try {
          row[field] = JSON.parse(row[field]);
        } catch (e) {
          if (field === 'materials') {
            row[field] = [];
          } else {
            row[field] = {};
          }
        }
      } else if (!row[field]) {
        if (field === 'materials') {
          row[field] = [];
        } else {
          row[field] = {};
        }
      }
    });
    
    // Parse numbers
    if (row.price) row.price = parseFloat(row.price);
    if (row.compare_price) row.compare_price = parseFloat(row.compare_price);
    if (row.cost_price) row.cost_price = parseFloat(row.cost_price);
    if (row.stock_quantity) row.stock_quantity = parseInt(row.stock_quantity);
    if (row.view_count) row.view_count = parseInt(row.view_count);
    if (row.average_rating) row.average_rating = parseFloat(row.average_rating);
    if (row.review_count) row.review_count = parseInt(row.review_count);
    
    return row;
  }

  static async getStats() {
    const [results] = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        SUM(CASE WHEN is_featured = 1 THEN 1 ELSE 0 END) as featured_products,
        SUM(CASE WHEN stock_quantity <= 5 THEN 1 ELSE 0 END) as low_stock_products,
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_products,
        AVG(price) as average_price
      FROM products 
      WHERE is_active = 1
    `);
    
    return results[0];
  }
}

module.exports = Product;