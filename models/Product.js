const pool = require('../config/database-mysql');
const crypto = require('crypto');

class Product {
  static async create(productData) {
    const {
      name,
      description,
      short_description,
      category,
      subcategory,
      material,
      dimensions,
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

    const [result] = await pool.query(
      `INSERT INTO products 
       (name, slug, sku, description, short_description, category, subcategory, 
        material, dimensions, weight, standards, specifications, features, 
        image_url, type, price, compare_price, cost_price, stock_quantity,
        meta_title, meta_description, meta_keywords) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        slug,
        finalSku,
        description,
        short_description || description?.substring(0, 500),
        category,
        subcategory,
        material,
        dimensions,
        weight,
        standards,
        typeof specifications === 'object' ? JSON.stringify(specifications) : null,
        typeof features === 'object' ? JSON.stringify(features) : null,
        image_url,
        type,
        price,
        compare_price,
        cost_price,
        stock_quantity || 0,
        meta_title,
        meta_description,
        meta_keywords
      ]
    );
    
    // Log activity
    await this.logActivity('CREATE', 'products', result.insertId, null, productData);
    
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM products WHERE id = ? AND is_active = TRUE',
      [id]
    );
    
    if (!rows[0]) return null;
    
    return this.parseJsonFields(rows[0]);
  }

  static async findBySlug(slug) {
    const [rows] = await pool.query(
      'SELECT * FROM products WHERE slug = ? AND is_active = TRUE',
      [slug]
    );
    
    if (!rows[0]) return null;
    
    return this.parseJsonFields(rows[0]);
  }

  static async findAll(filters = {}, page = 1, limit = 20) {
    let query = `
      SELECT p.*, 
        COUNT(DISTINCT r.id) as review_count,
        AVG(r.rating) as average_rating,
        (SELECT image_url FROM product_images WHERE product_id = p.id AND is_main = TRUE LIMIT 1) as main_image
      FROM products p
      LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = TRUE
      WHERE p.is_active = TRUE
    `;
    
    const params = [];
    const conditions = [];
    
    if (filters.type) {
      conditions.push('p.type = ?');
      params.push(filters.type);
    }
    
    if (filters.category) {
      conditions.push('p.category = ?');
      params.push(filters.category);
    }
    
    if (filters.subcategory) {
      conditions.push('p.subcategory = ?');
      params.push(filters.subcategory);
    }
    
    if (filters.min_price) {
      conditions.push('p.price >= ?');
      params.push(filters.min_price);
    }
    
    if (filters.max_price) {
      conditions.push('p.price <= ?');
      params.push(filters.max_price);
    }
    
    if (filters.featured === 'true') {
      conditions.push('p.is_featured = TRUE');
    }
    
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }
    
    // Add group by
    query += ' GROUP BY p.id';
    
    // Calculate pagination
    const offset = (page - 1) * limit;
    
    // Get total count
    const countQuery = query.replace(
      'SELECT p.*, COUNT(DISTINCT r.id) as review_count, AVG(r.rating) as average_rating',
      'SELECT COUNT(DISTINCT p.id) as total'
    );
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0]?.total || 0;
    
    // Add ordering and pagination
    query += ' ORDER BY p.is_featured DESC, p.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [rows] = await pool.query(query, params);
    
    // Parse JSON fields
    const products = rows.map(row => this.parseJsonFields(row));
    
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
    
    const [rows] = await pool.query(
      `SELECT p.*, 
        MATCH(p.name, p.description, p.material, p.standards) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance,
        COUNT(DISTINCT r.id) as review_count,
        AVG(r.rating) as average_rating
       FROM products p
       LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = TRUE
       WHERE p.is_active = TRUE 
       AND (MATCH(p.name, p.description, p.material, p.standards) AGAINST(? IN NATURAL LANGUAGE MODE)
            OR p.name LIKE ? OR p.description LIKE ? OR p.material LIKE ? OR p.standards LIKE ?)
       GROUP BY p.id
       ORDER BY relevance DESC, p.created_at DESC
       LIMIT ? OFFSET ?`,
      [
        searchTerm,
        searchTerm,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        limit,
        offset
      ]
    );
    
    const [countResult] = await pool.query(
      `SELECT COUNT(DISTINCT p.id) as total
       FROM products p
       WHERE p.is_active = TRUE 
       AND (MATCH(p.name, p.description, p.material, p.standards) AGAINST(? IN NATURAL LANGUAGE MODE)
            OR p.name LIKE ? OR p.description LIKE ? OR p.material LIKE ? OR p.standards LIKE ?)`,
      [
        searchTerm,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`
      ]
    );
    
    const total = countResult[0]?.total || 0;
    const products = rows.map(row => this.parseJsonFields(row));
    
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
    
    // Build dynamic update query
    const fieldMapping = {
      name: 'name',
      description: 'description',
      short_description: 'short_description',
      category: 'category',
      subcategory: 'subcategory',
      material: 'material',
      dimensions: 'dimensions',
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
        if (['specifications', 'features'].includes(key) && typeof value === 'object') {
          value = JSON.stringify(value);
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
      // Log activity
      await this.logActivity('UPDATE', 'products', id, oldProduct, productData, adminId);
      return this.findById(id);
    }
    
    return null;
  }

  static async delete(id, adminId = null) {
    const product = await this.findById(id);
    if (!product) return false;

    const [result] = await pool.query(
      'UPDATE products SET is_active = FALSE WHERE id = ?',
      [id]
    );

    if (result.affectedRows > 0) {
      // Log activity
      await this.logActivity('DELETE', 'products', id, product, null, adminId);
      return true;
    }
    
    return false;
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
       WHERE is_active = TRUE 
       GROUP BY category, type 
       ORDER BY category, type`
    );
    return rows;
  }

  static async getRelatedProducts(productId, limit = 4) {
    const product = await this.findById(productId);
    if (!product) return [];

    const [rows] = await pool.query(
      `SELECT p.*
       FROM products p
       WHERE p.is_active = TRUE 
       AND p.id != ?
       AND (p.category = ? OR p.type = ?)
       ORDER BY 
         CASE WHEN p.category = ? THEN 1 ELSE 2 END,
         CASE WHEN p.type = ? THEN 1 ELSE 2 END,
         p.created_at DESC
       LIMIT ?`,
      [productId, product.category, product.type, product.category, product.type, limit]
    );
    
    return rows.map(row => this.parseJsonFields(row));
  }

  static async incrementViewCount(id) {
    await pool.query(
      'UPDATE products SET view_count = view_count + 1 WHERE id = ?',
      [id]
    );
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
    const jsonFields = ['specifications', 'features', 'documents'];
    
    jsonFields.forEach(field => {
      if (row[field] && typeof row[field] === 'string') {
        try {
          row[field] = JSON.parse(row[field]);
        } catch (e) {
          row[field] = {};
        }
      } else if (!row[field]) {
        row[field] = {};
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

  // Activity logging
  static async logActivity(action, tableName, recordId, oldData, newData, adminId = null) {
    try {
      await pool.query(
        `INSERT INTO audit_logs 
         (admin_id, action, table_name, record_id, old_data, new_data, ip_address) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          adminId,
          action,
          tableName,
          recordId,
          oldData ? JSON.stringify(oldData) : null,
          newData ? JSON.stringify(newData) : null,
          // IP would come from request context in controller
          null
        ]
      );
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }

  // Get product statistics
  static async getStats() {
    const [results] = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        SUM(CASE WHEN is_featured = TRUE THEN 1 ELSE 0 END) as featured_products,
        SUM(CASE WHEN stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock_products,
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) as out_of_stock_products,
        AVG(price) as average_price,
        SUM(view_count) as total_views
      FROM products 
      WHERE is_active = TRUE
    `);
    
    return results[0];
  }
}

module.exports = Product;