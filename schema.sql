-- ==============================
-- CREATE DATABASE
-- ==============================
CREATE DATABASE IF NOT EXISTS daks_ndt;
USE daks_ndt;

-- ==============================
-- 1. ADMINS TABLE
-- ==============================
CREATE TABLE IF NOT EXISTS admins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  role ENUM('superz_admin', 'admin') DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL,
  INDEX idx_username (username)
);

-- REAL bcrypt hash for password: admin123
-- Hash generated using bcrypt(10)
-- admin123 => $2b$10$Fd25VL4YmT8M0HgqPuk..uIlqZ7e1v5yQVu5oYVxol3NBrfO4EsY2

INSERT INTO admins (username, password, email, role)
VALUES 
('admin', '$2b$10$Fd25VL4YmT8M0HgqPuk..uIlqZ7e1v5yQVu5oYVxol3NBrfO4EsY2', 'admin@daksndt.com', 'super_admin')
ON DUPLICATE KEY UPDATE username = username;

-- ==============================
-- 2. PRODUCTS TABLE
-- ==============================
CREATE TABLE IF NOT EXISTS products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) DEFAULT 0.00,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_type (type)
);

-- ==============================
-- INSERT SAMPLE PRODUCTS
-- ==============================
INSERT INTO products (name, description, category, type, price)
VALUES
('UT Calibration Block Set', 'Complete ultrasonic testing calibration block set', 'Reference Standards', 'calibration_block', 299.99),
('PAUT Validation Block', 'Phased Array Ultrasonic Testing validation block', 'Validation Blocks', 'validation_block', 450.00),
('Flawed Specimen Training Kit', 'Complete training kit with various flawed specimens', 'Flawed Specimens', 'flawed_specimen', 850.00)
ON DUPLICATE KEY UPDATE name = name;
