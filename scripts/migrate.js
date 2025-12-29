const pool = require('../config/database-mysql');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  try {
    console.log('🚀 Starting database migrations...');
    
    // Read schema file
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by semicolon to get individual statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await pool.query(statement);
        console.log(`✅ Executed statement ${i + 1}/${statements.length}`);
      } catch (error) {
        // Check if it's a table already exists error
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`⚠️  Table already exists in statement ${i + 1}`);
        } else {
          console.error(`❌ Error in statement ${i + 1}:`, error.message);
          console.log('Statement:', statement.substring(0, 200) + '...');
          throw error;
        }
      }
    }
    
    console.log('🎉 Database migrations completed successfully!');
    
    // Check tables
    const [tables] = await pool.query('SHOW TABLES');
    console.log('\n📊 Database tables:');
    tables.forEach(table => {
      console.log(`  - ${table[`Tables_in_${process.env.DB_NAME}`]}`);
    });
    
    // Check row counts
    const tablesToCheck = ['admins', 'users', 'products', 'categories', 'orders'];
    for (const table of tablesToCheck) {
      try {
        const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  ${table}: ${rows[0].count} rows`);
      } catch (error) {
        // Table might not exist yet
      }
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();