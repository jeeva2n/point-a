const pool = require('../config/database');

class Category {
  // Create new category
  static async create(categoryData) {
    const {
      name,
      slug,
      description,
      parent_id,
      image_url,
      sort_order,
      meta_title,
      meta_description,
      meta_keywords
    } = categoryData;

    const [result] = await pool.query(
      `INSERT INTO categories 
       (name, slug, description, parent_id, image_url, sort_order, 
        meta_title, meta_description, meta_keywords) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        slug || this.generateSlug(name),
        description,
        parent_id || null,
        image_url,
        sort_order || 0,
        meta_title,
        meta_description,
        meta_keywords
      ]
    );

    return this.findById(result.insertId);
  }

  // Find category by ID
  static async findById(id) {
    const [rows] = await pool.query(
      `SELECT c.*, 
        p.name as parent_name,
        p.slug as parent_slug,
        (SELECT COUNT(*) FROM products WHERE category = c.name AND is_active = 1) as product_count
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE c.id = ?`,
      [id]
    );
    return rows[0];
  }

  // Find category by slug
  static async findBySlug(slug) {
    const [rows] = await pool.query(
      `SELECT c.*, 
        p.name as parent_name,
        p.slug as parent_slug,
        (SELECT COUNT(*) FROM products WHERE category = c.name AND is_active = 1) as product_count
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE c.slug = ? AND c.is_active = 1`,
      [slug]
    );
    return rows[0];
  }

  // Find all categories
  static async findAll() {
    const [rows] = await pool.query(
      `SELECT c.*, 
        p.name as parent_name,
        (SELECT COUNT(*) FROM products WHERE category = c.name AND is_active = 1) as product_count
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE c.is_active = 1
       ORDER BY c.sort_order ASC, c.name ASC`
    );
    return rows;
  }

  // Get category tree
  static async getTree() {
    const [rows] = await pool.query(
      `SELECT id, name, slug, parent_id, image_url, sort_order
       FROM categories 
       WHERE is_active = 1
       ORDER BY sort_order ASC, name ASC`
    );

    // Convert flat list to tree structure
    const tree = [];
    const map = {};

    rows.forEach(node => {
      map[node.id] = { ...node, children: [] };
    });

    rows.forEach(node => {
      if (node.parent_id && map[node.parent_id]) {
        map[node.parent_id].children.push(map[node.id]);
      } else {
        tree.push(map[node.id]);
      }
    });

    return tree;
  }

  // Get categories with product counts
  static async getWithProductCounts() {
    const [rows] = await pool.query(
      `SELECT 
        c.id,
        c.name,
        c.slug,
        c.description,
        c.image_url,
        COUNT(p.id) as product_count,
        MIN(p.price) as min_price,
        MAX(p.price) as max_price
       FROM categories c
       LEFT JOIN products p ON c.name = p.category AND p.is_active = 1
       WHERE c.is_active = 1
       GROUP BY c.id, c.name, c.slug, c.description, c.image_url
       ORDER BY c.sort_order ASC, c.name ASC`
    );
    return rows;
  }

  // Update category
  static async update(id, categoryData) {
    const updateFields = [];
    const updateValues = [];

    const fieldMapping = {
      name: 'name',
      slug: 'slug',
      description: 'description',
      parent_id: 'parent_id',
      image_url: 'image_url',
      sort_order: 'sort_order',
      is_active: 'is_active',
      meta_title: 'meta_title',
      meta_description: 'meta_description',
      meta_keywords: 'meta_keywords'
    };

    for (const [key, dbField] of Object.entries(fieldMapping)) {
      if (key in categoryData) {
        updateFields.push(`${dbField} = ?`);
        updateValues.push(categoryData[key]);
      }
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    updateValues.push(id);

    const [result] = await pool.query(
      `UPDATE categories SET 
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

  // Delete category
  static async delete(id) {
    // Check for child categories
    const [childRows] = await pool.query(
      'SELECT COUNT(*) as child_count FROM categories WHERE parent_id = ?',
      [id]
    );

    if (childRows[0].child_count > 0) {
      throw new Error('Cannot delete category with child categories');
    }

    const [result] = await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  // Update category order
  static async updateOrder(id, sortOrder) {
    const [result] = await pool.query(
      'UPDATE categories SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [sortOrder, id]
    );
    return result.affectedRows > 0;
  }

  // Toggle category visibility
  static async toggleVisibility(id) {
    const [result] = await pool.query(
      `UPDATE categories SET 
       is_active = NOT is_active,
       updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [id]
    );

    if (result.affectedRows > 0) {
      return this.findById(id);
    }
    
    return null;
  }

  // Generate slug from name
  static generateSlug(name) {
    return name.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
  }

  // Get breadcrumb for category
  static async getBreadcrumb(categoryId) {
    const breadcrumb = [];
    let currentId = categoryId;

    while (currentId) {
      const [rows] = await pool.query(
        'SELECT id, name, slug, parent_id FROM categories WHERE id = ?',
        [currentId]
      );
      
      if (rows.length === 0) break;
      
      breadcrumb.unshift(rows[0]);
      currentId = rows[0].parent_id;
    }

    return breadcrumb;
  }
}


module.exports = Category;