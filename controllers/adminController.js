const Admin = require('../models/Admin');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const admin = await Admin.findByUsername(username);
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const isPasswordValid = await Admin.comparePassword(password, admin.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const token = await Admin.generateToken(admin);
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    res.json({
      success: true,
      admin: req.admin
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.logout = async (req, res) => {
  try {
    // In a stateless JWT system, logout is client-side
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    
    // Check if admin exists
    const existingAdmin = await Admin.findByUsername(username);
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin already exists'
      });
    }
    
    const newAdmin = await Admin.create({ username, password, email, role });
    
    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      admin: newAdmin
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating admin'
    });
  }
};