const Category = require('../models/Category');
const Product = require('../models/productModel');

class CategoryController {
  // Get all categories
  async getAllCategories(req, res) {
    try {
      const categories = await Category.findAll();
      
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
  }

  // Get category tree
  async getCategoryTree(req, res) {
    try {
      const tree = await Category.getTree();
      
      res.json({
        success: true,
        tree
      });
    } catch (error) {
      console.error('Get category tree error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching category tree'
      });
    }
  }

  // Get categories with product counts
  async getCategoriesWithProducts(req, res) {
    try {
      const categories = await Category.getWithProductCounts();
      
      res.json({
        success: true,
        categories
      });
    } catch (error) {
      console.error('Get categories with products error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching categories'
      });
    }
  }

  // Get category by slug
  async getCategoryBySlug(req, res) {
    try {
      const { slug } = req.params;
      
      const category = await Category.findBySlug(slug);
      
      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Category not found'
        });
      }

      res.json({
        success: true,
        category
      });
    } catch (error) {
      console.error('Get category error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching category'
      });
    }
  }

  // Get category products
  async getCategoryProducts(req, res) {
    try {
      const { slug } = req.params;
      const { page = 1, limit = 20, sort = 'newest', min_price, max_price } = req.query;
      
      const filters = { category: slug };
      if (min_price) filters.min_price = parseFloat(min_price);
      if (max_price) filters.max_price = parseFloat(max_price);

      // Map sort parameter to database field
      const sortMapping = {
        'newest': 'created_at DESC',
        'price_asc': 'price ASC',
        'price_desc': 'price DESC',
        'name_asc': 'name ASC',
        'name_desc': 'name DESC'
      };

      const sortField = sortMapping[sort] || 'created_at DESC';

      const products = await Product.findAll(filters, parseInt(page), parseInt(limit), sortField);

      res.json({
        success: true,
        ...products
      });
    } catch (error) {
      console.error('Get category products error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error fetching category products'
      });
    }
  }

  // Create category (admin)
  async createCategory(req, res) {
    try {
      const categoryData = {
        ...req.body,
        image_url: req.file?.url || null
      };

      const category = await Category.create(categoryData);

      res.status(201).json({
        success: true,
        message: 'Category created successfully',
        category
      });
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error creating category'
      });
    }
  }

  // Update category (admin)
  async updateCategory(req, res) {
    try {
      const { id } = req.params;
      
      const categoryData = {
        ...req.body,
        image_url: req.file?.url || req.body.current_image
      };

      const category = await Category.update(id, categoryData);

      res.json({
        success: true,
        message: 'Category updated successfully',
        category
      });
    } catch (error) {
      console.error('Update category error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating category'
      });
    }
  }

  // Delete category (admin)
  async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      
      // Check if category has products
      const productCount = await Product.getCountByCategory(id);
      if (productCount > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete category with products. Move products first.'
        });
      }

      await Category.delete(id);

      res.json({
        success: true,
        message: 'Category deleted successfully'
      });
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error deleting category'
      });
    }
  }

  // Update category order (admin)
  async updateCategoryOrder(req, res) {
    try {
      const { id } = req.params;
      const { sort_order } = req.body;
      
      await Category.updateOrder(id, sort_order);

      res.json({
        success: true,
        message: 'Category order updated successfully'
      });
    } catch (error) {
      console.error('Update category order error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error updating category order'
      });
    }
  }

  // Toggle category visibility (admin)
  async toggleCategoryVisibility(req, res) {
    try {
      const { id } = req.params;
      
      const category = await Category.toggleVisibility(id);

      res.json({
        success: true,
        message: `Category ${category.is_active ? 'activated' : 'deactivated'} successfully`,
        category
      });
    } catch (error) {
      console.error('Toggle category visibility error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error toggling category visibility'
      });
    }
  }
}

module.exports = new CategoryController();