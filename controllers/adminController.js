// controllers/adminController.js
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('========================================');
    console.log('🔐 Login attempt');
    console.log('   Username:', username);
    console.log('   Password:', password);
    console.log('========================================');
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password required' 
      });
    }
    
    // Find admin
    let admin = await Admin.findByUsername(username);
    console.log('📍 Admin found:', !!admin);
    
    // If no admin exists and using default credentials, create one
    if (!admin && username === 'admin') {
      console.log('📝 No admin found, creating default admin...');
      
      try {
        // First, try to delete any existing admin with this username
        await db.execute('DELETE FROM admins WHERE username = ?', ['admin']);
        
        // Create new admin
        const hashedPassword = await bcrypt.hash('admin123', 12);
        await db.execute(
          'INSERT INTO admins (username, email, password, role, is_active) VALUES (?, ?, ?, ?, ?)',
          ['admin', 'admin@example.com', hashedPassword, 'admin', 1]
        );
        
        admin = await Admin.findByUsername('admin');
        console.log('✅ Default admin created');
      } catch (createError) {
        console.error('Error creating admin:', createError.message);
      }
    }
    
    if (!admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Activate if disabled
    if (!admin.is_active) {
      console.log('⚠️ Activating disabled account...');
      await Admin.activateAccount(admin.id);
    }
    
    // Compare password
    console.log('🔑 Checking password...');
    let isMatch = await Admin.comparePassword(password, admin.password);
    
    // If password doesn't match and it's the default admin, reset password
    if (!isMatch && username === 'admin' && password === 'admin123') {
      console.log('🔄 Resetting admin password to default...');
      
      const hashedPassword = await bcrypt.hash('admin123', 12);
      await db.execute(
        'UPDATE admins SET password = ?, is_active = 1 WHERE username = ?',
        [hashedPassword, 'admin']
      );
      
      isMatch = true;
      console.log('✅ Password reset successful');
    }
    
    if (!isMatch) {
      console.log('❌ Password mismatch');
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    // Generate token
    const token = Admin.generateToken(admin);
    
    // Update last login
    await Admin.updateLastLogin(admin.id);
    
    console.log('✅ Login successful!');
    
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
    console.error('❌ Login error:', error);
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