const db = require('../config/database');

// Helper function to parse JSON fields
function parseProductFields(product) {
  if (product.materials) {
    try {
      product.materials = JSON.parse(product.materials);
    } catch (e) {
      product.materials = [];
    }
  } else {
    product.materials = [];
  }

  if (product.specifications) {
    try {
      product.specifications = JSON.parse(product.specifications);
    } catch (e) {
      product.specifications = {};
    }
  } else {
    product.specifications = {};
  }

  if (product.features) {
    try {
      product.features = JSON.parse(product.features);
    } catch (e) {
      product.features = {};
    }
  } else {
    product.features = {};
  }

  return product;
}

// Get all products with optional filters
const getAllProducts = async (filters = {}) => {
  try {
    const { type, category, search, limit = 100 } = filters;
    let query = 'SELECT * FROM products WHERE is_active = TRUE';
    const params = [];

    if (type && type !== 'all') {
      query += ' AND type = ?';
      params.push(type);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ? OR category LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const [products] = await db.query(query, params);

    // Get images for each product
    const productsWithImages = await Promise.all(
      products.map(async (product) => {
        const [images] = await db.query(
          'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
          [product.id]
        );

        const parsedProduct = parseProductFields(product);
        
        parsedProduct.images = images.map(img => ({
          id: img.id,
          url: img.image_url,
          isMain: img.is_main === 1,
          sortOrder: img.sort_order
        }));

        const mainImage = images.find(img => img.is_main === 1);
        parsedProduct.mainImage = mainImage ? mainImage.image_url : 
          (images.length > 0 ? images[0].image_url : product.image_url);
        
        parsedProduct.image_url = parsedProduct.mainImage;

        return parsedProduct;
      })
    );

    return productsWithImages;
  } catch (error) {
    throw new Error(`Database error: ${error.message}`);
  }
};

// Get single product by ID
const getProductById = async (id) => {
  try {
    const [products] = await db.query(
      'SELECT * FROM products WHERE id = ? AND is_active = TRUE',
      [id]
    );

    if (products.length === 0) {
      return null;
    }

    const product = products[0];

    const [images] = await db.query(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, sort_order ASC',
      [id]
    );

    const parsedProduct = parseProductFields(product);
    
    parsedProduct.images = images.map(img => ({
      id: img.id,
      url: img.image_url,
      isMain: img.is_main === 1,
      sortOrder: img.sort_order
    }));

    const mainImage = images.find(img => img.is_main === 1);
    parsedProduct.mainImage = mainImage ? mainImage.image_url : 
      (images.length > 0 ? images[0].image_url : product.image_url);
    
    parsedProduct.image_url = parsedProduct.mainImage;

    return parsedProduct;
  } catch (error) {
    throw new Error(`Database error: ${error.message}`);
  }
};

// Create new product
const createProduct = async (productData, files = []) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      name, description, short_description, category, subcategory, type,
      price, compare_price, cost_price, stock_quantity, sku,
      dimensions, tolerance, flaws, weight, standards,
      materials, specifications, features,
      meta_title, meta_description, meta_keywords,
      is_featured, mainImageIndex = 0
    } = productData;

    let materialsArray = [];
    if (materials) {
      try {
        materialsArray = typeof materials === 'string' ? JSON.parse(materials) : materials;
      } catch (e) {
        materialsArray = Array.isArray(materials) ? materials : [];
      }
    }

    let specificationsObj = {};
    if (specifications) {
      try {
        specificationsObj = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
      } catch (e) {
        specificationsObj = {};
      }
    }

    let featuresObj = {};
    if (features) {
      try {
        featuresObj = typeof features === 'string' ? JSON.parse(features) : features;
      } catch (e) {
        featuresObj = {};
      }
    }

    const [result] = await connection.query(
      `INSERT INTO products (
        name, description, short_description, category, subcategory, type,
        price, compare_price, cost_price, stock_quantity, sku,
        dimensions, tolerance, flaws, weight, standards,
        materials, specifications, features,
        meta_title, meta_description, meta_keywords, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, description || '', short_description || '', category, subcategory || '', type,
        parseFloat(price) || 0, compare_price ? parseFloat(compare_price) : null, 
        cost_price ? parseFloat(cost_price) : null, parseInt(stock_quantity) || 10, sku || '',
        dimensions || null, tolerance || null, flaws || null, weight || null, standards || null,
        JSON.stringify(materialsArray), JSON.stringify(specificationsObj), JSON.stringify(featuresObj),
        meta_title || null, meta_description || null, meta_keywords || null,
        is_featured === 'true' || is_featured === true
      ]
    );

    const productId = result.insertId;

    let mainImageUrl = null;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const imageUrl = `/uploads/products/${file.filename}`;
        const isMain = parseInt(mainImageIndex) === i;
        
        if (isMain) {
          mainImageUrl = imageUrl;
        }

        await connection.query(
          'INSERT INTO product_images (product_id, image_url, is_main, sort_order) VALUES (?, ?, ?, ?)',
          [productId, imageUrl, isMain, i]
        );
      }

      if (mainImageUrl) {
        await connection.query('UPDATE products SET image_url = ? WHERE id = ?', [mainImageUrl, productId]);
      }
    }

    await connection.commit();

    const product = await getProductById(productId);
    return product;
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Update product
const updateProduct = async (id, productData, files = [], deleteImages = []) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    if (deleteImages && deleteImages.length > 0) {
      for (const imageId of deleteImages) {
        await connection.query('DELETE FROM product_images WHERE id = ? AND product_id = ?', [imageId, id]);
      }
    }

    if (files && files.length > 0) {
      const [maxOrder] = await connection.query(
        'SELECT MAX(sort_order) as max_order FROM product_images WHERE product_id = ?',
        [id]
      );
      let sortOrder = (maxOrder[0].max_order || -1) + 1;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await connection.query(
          'INSERT INTO product_images (product_id, image_url, is_main, sort_order) VALUES (?, ?, ?, ?)',
          [id, `/uploads/products/${file.filename}`, 0, sortOrder + i]
        );
      }
    }

    const { mainImageId, mainImageIndex, materials, specifications, features, ...otherData } = productData;
    
    if (mainImageId !== undefined && mainImageId !== null) {
      await connection.query('UPDATE product_images SET is_main = 0 WHERE product_id = ?', [id]);
      await connection.query('UPDATE product_images SET is_main = 1 WHERE id = ? AND product_id = ?', [mainImageId, id]);
      
      const [mainImageRow] = await connection.query('SELECT image_url FROM product_images WHERE id = ?', [mainImageId]);
      if (mainImageRow.length > 0) {
        await connection.query('UPDATE products SET image_url = ? WHERE id = ?', [mainImageRow[0].image_url, id]);
      }
    }

    let materialsArray = [];
    if (materials !== undefined) {
      try {
        materialsArray = typeof materials === 'string' ? JSON.parse(materials) : materials;
      } catch (e) {
        materialsArray = Array.isArray(materials) ? materials : [];
      }
    }

    let specificationsObj = {};
    if (specifications !== undefined) {
      try {
        specificationsObj = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
      } catch (e) {
        specificationsObj = {};
      }
    }

    let featuresObj = {};
    if (features !== undefined) {
      try {
        featuresObj = typeof features === 'string' ? JSON.parse(features) : features;
      } catch (e) {
        featuresObj = {};
      }
    }

    const updates = [];
    const params = [];

    const fields = {
      name: otherData.name,
      description: otherData.description,
      short_description: otherData.short_description,
      category: otherData.category,
      subcategory: otherData.subcategory,
      type: otherData.type,
      price: otherData.price,
      compare_price: otherData.compare_price,
      cost_price: otherData.cost_price,
      stock_quantity: otherData.stock_quantity,
      sku: otherData.sku,
      dimensions: otherData.dimensions,
      tolerance: otherData.tolerance,
      flaws: otherData.flaws,
      weight: otherData.weight,
      standards: otherData.standards,
      meta_title: otherData.meta_title,
      meta_description: otherData.meta_description,
      meta_keywords: otherData.meta_keywords,
      is_featured: otherData.is_featured
    };

    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'price' || key === 'compare_price' || key === 'cost_price') {
          updates.push(`${key} = ?`);
          params.push(value !== '' ? parseFloat(value) : null);
        } else if (key === 'stock_quantity') {
          updates.push(`${key} = ?`);
          params.push(value !== '' ? parseInt(value) : 0);
        } else if (key === 'is_featured') {
          updates.push(`${key} = ?`);
          params.push(value === 'true' || value === true);
        } else {
          updates.push(`${key} = ?`);
          params.push(value || null);
        }
      }
    });

    if (materials !== undefined) {
      updates.push('materials = ?');
      params.push(JSON.stringify(materialsArray));
    }
    
    if (specifications !== undefined) {
      updates.push('specifications = ?');
      params.push(JSON.stringify(specificationsObj));
    }
    
    if (features !== undefined) {
      updates.push('features = ?');
      params.push(JSON.stringify(featuresObj));
    }

    if (updates.length > 0) {
      params.push(id);
      await connection.query(
        `UPDATE products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params
      );
    }

    await connection.commit();

    const product = await getProductById(id);
    return product;
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Delete product
const deleteProduct = async (id) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    const [images] = await connection.query(
      'SELECT image_url FROM product_images WHERE product_id = ?',
      [id]
    );

    await connection.query('DELETE FROM products WHERE id = ?', [id]);

    await connection.commit();

    return images;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};