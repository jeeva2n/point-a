const Product = require('../models/Product');
const fs = require('fs');
const path = require('path');

exports.createProduct = async (req, res) => {
  try {
    let image_url = null;
    
    if (req.file) {
      image_url = `/uploads/${req.file.filename}`;
    }
    
    const productData = {
      ...req.body,
      image_url,
      specifications: req.body.specifications ? JSON.parse(req.body.specifications) : {}
    };
    
    const product = await Product.create(productData);
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating product'
    });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { type, category } = req.query;
    const filters = {};
    
    if (type) filters.type = type;
    if (category) filters.category = category;
    
    const products = await Product.findAll(filters);
    
    res.json({
      success: true,
      count: products.length,
      products
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
    let image_url = req.body.currentImage;
    
    if (req.file) {
      // Delete old image if exists
      if (image_url) {
        const oldImagePath = path.join(__dirname, '..', image_url);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      image_url = `/uploads/${req.file.filename}`;
    }
    
    const productData = {
      ...req.body,
      image_url,
      specifications: req.body.specifications ? JSON.parse(req.body.specifications) : {}
    };
    
    const product = await Product.update(req.params.id, productData);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
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
    // Get product first to delete image
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Delete image if exists
    if (product.image_url) {
      const imagePath = path.join(__dirname, '..', product.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    const deleted = await Product.delete(req.params.id);
    
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
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json({
        success: true,
        products: []
      });
    }
    
    const products = await Product.search(q);
    
    res.json({
      success: true,
      count: products.length,
      products
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