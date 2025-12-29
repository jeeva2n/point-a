const Product = require('../models/Product');
const fs = require('fs');
const path = require('path');

exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      type,
      price,
      dimensions,
      tolerance,
      flaws,
      materials,
      specifications,
      mainImageIndex
    } = req.body;

    // Parse materials
    let materialsArray = [];
    if (materials) {
      try {
        materialsArray = typeof materials === 'string' ? JSON.parse(materials) : materials;
      } catch (e) {
        materialsArray = Array.isArray(materials) ? materials : [materials];
      }
    }

    // Parse specifications
    let specificationsObj = {};
    if (specifications) {
      try {
        specificationsObj = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
      } catch (e) {
        specificationsObj = {};
      }
    }

    // Get main image URL
    const mainIdx = parseInt(mainImageIndex) || 0;
    const mainImageUrl = req.files && req.files.length > 0 
      ? `/uploads/products/${req.files[Math.min(mainIdx, req.files.length - 1)].filename}`
      : null;

    const productData = {
      name,
      description,
      category,
      type,
      price: parseFloat(price) || 0,
      dimensions: dimensions || null,
      tolerance: tolerance || null,
      flaws: flaws || null,
      materials: materialsArray,
      specifications: specificationsObj,
      image_url: mainImageUrl
    };

    const product = await Product.create(productData);

    // Add images
    if (req.files && req.files.length > 0) {
      const imageUrls = req.files.map(file => `/uploads/products/${file.filename}`);
      await Product.addImages(product.id, imageUrls);
      
      // Set main image
      if (mainIdx >= 0 && mainIdx < imageUrls.length) {
        const [images] = await require('../config/database').query(
          'SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
          [product.id]
        );
        if (images[mainIdx]) {
          await Product.setMainImage(product.id, images[mainIdx].id);
        }
      }
    }

    // Fetch updated product with images
    const updatedProduct = await Product.findById(product.id);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Create product error:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        const filePath = path.join(__dirname, '..', 'uploads/products', file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error creating product'
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { type, category, page = 1, limit = 20, sort = 'newest' } = req.query;
    const filters = {};
    
    if (type) filters.type = type;
    if (category) filters.category = category;

    const sortMapping = {
      'newest': 'created_at DESC',
      'oldest': 'created_at ASC',
      'price_asc': 'price ASC',
      'price_desc': 'price DESC',
      'name_asc': 'name ASC',
      'name_desc': 'name DESC'
    };

    const sortField = sortMapping[sort] || 'created_at DESC';
    
    const result = await Product.findAll(filters, parseInt(page), parseInt(limit), sortField);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching products'
    });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching product'
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      category,
      type,
      price,
      dimensions,
      tolerance,
      flaws,
      materials,
      specifications,
      mainImageIndex,
      deleteImages
    } = req.body;

    // Check if product exists
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Handle image deletions
    if (deleteImages) {
      let imagesToDelete = [];
      try {
        imagesToDelete = typeof deleteImages === 'string' ? JSON.parse(deleteImages) : deleteImages;
      } catch (e) {
        imagesToDelete = [];
      }

      for (const imageId of imagesToDelete) {
        const imageUrl = await Product.deleteImage(id, imageId);
        if (imageUrl) {
          const imagePath = path.join(__dirname, '..', imageUrl);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
      }
    }

    // Add new images
    if (req.files && req.files.length > 0) {
      const imageUrls = req.files.map(file => `/uploads/products/${file.filename}`);
      await Product.addImages(id, imageUrls);
    }

    // Update main image if specified
    if (mainImageIndex !== undefined) {
      const pool = require('../config/database');
      const [allImages] = await pool.query(
        'SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
        [id]
      );
      
      if (allImages.length > 0) {
        const mainIdx = Math.min(parseInt(mainImageIndex), allImages.length - 1);
        await Product.setMainImage(id, allImages[mainIdx].id);
      }
    }

    // Parse materials
    let materialsArray;
    if (materials !== undefined) {
      try {
        materialsArray = typeof materials === 'string' ? JSON.parse(materials) : materials;
      } catch (e) {
        materialsArray = Array.isArray(materials) ? materials : [materials];
      }
    }

    // Parse specifications
    let specificationsObj;
    if (specifications !== undefined) {
      try {
        specificationsObj = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
      } catch (e) {
        specificationsObj = {};
      }
    }

    // Build update data
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (type !== undefined) updateData.type = type;
    if (price !== undefined) updateData.price = parseFloat(price) || 0;
    if (dimensions !== undefined) updateData.dimensions = dimensions || null;
    if (tolerance !== undefined) updateData.tolerance = tolerance || null;
    if (flaws !== undefined) updateData.flaws = flaws || null;
    if (materialsArray !== undefined) updateData.materials = materialsArray;
    if (specificationsObj !== undefined) updateData.specifications = specificationsObj;

    const product = await Product.update(id, updateData);
    
    res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating product'
    });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Delete all image files
    if (product.images && product.images.length > 0) {
      product.images.forEach(img => {
        const imagePath = path.join(__dirname, '..', img.url);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      });
    }
    
    // Delete main image
    if (product.image_url) {
      const imagePath = path.join(__dirname, '..', product.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    const deleted = await Product.delete(id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting product'
    });
  }
};

exports.searchProducts = async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json({
        success: true,
        products: [],
        pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 }
      });
    }
    
    const result = await Product.search(q, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error searching products'
    });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Product.getCategories();
    
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching categories'
    });
  }
};

exports.addProductImages = async (req, res) => {
  try {
    const { id } = req.params;
    const { mainImageIndex } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No images provided'
      });
    }

    const imageUrls = req.files.map(file => `/uploads/products/${file.filename}`);
    const insertedImages = await Product.addImages(id, imageUrls);

    // Set main image if specified
    if (mainImageIndex !== undefined && insertedImages.length > 0) {
      const mainIdx = Math.min(parseInt(mainImageIndex), insertedImages.length - 1);
      await Product.setMainImage(id, insertedImages[mainIdx].id);
    }

    res.status(201).json({
      success: true,
      message: 'Images added successfully',
      images: insertedImages
    });
  } catch (error) {
    console.error('Add images error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding images'
    });
  }
};

exports.deleteProductImage = async (req, res) => {
  try {
    const { productId, imageId } = req.params;

    const imageUrl = await Product.deleteImage(productId, imageId);
    
    if (!imageUrl) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    // Delete file
    const imagePath = path.join(__dirname, '..', imageUrl);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting image'
    });
  }
};

exports.setMainImage = async (req, res) => {
  try {
    const { productId, imageId } = req.params;

    const success = await Product.setMainImage(productId, imageId);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    res.json({
      success: true,
      message: 'Main image updated successfully'
    });
  } catch (error) {
    console.error('Set main image error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error setting main image'
    });
  }
};

exports.reorderImages = async (req, res) => {
  try {
    const { productId } = req.params;
    const { imageOrder } = req.body;

    if (!Array.isArray(imageOrder)) {
      return res.status(400).json({
        success: false,
        message: 'imageOrder must be an array of image IDs'
      });
    }

    await Product.reorderImages(productId, imageOrder);

    res.json({
      success: true,
      message: 'Image order updated successfully'
    });
  } catch (error) {
    console.error('Reorder images error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error reordering images'
    });
  }
};

exports.getRelatedProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 4 } = req.query;

    const products = await Product.getRelatedProducts(id, parseInt(limit));

    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Get related products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching related products'
    });
  }
};