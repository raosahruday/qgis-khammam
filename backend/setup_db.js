const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'qgis_db',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
}); 

async function runSQL() {
  try {
    const sqlPath = path.join(__dirname, 'database.sql');
    const sqlCommands = fs.readFileSync(sqlPath, 'utf8');

    console.log('Connecting to database...');
    // We already assume 'qgis_db' or whichever DB in .env is created.
    // If you need the tables inside the current database, this script runs them.
    console.log('Running SQL commands...');
    await pool.query(sqlCommands);
    console.log('✅ Database tables created successfully!');
  } catch (error) {
    console.error('❌ Error executing SQL script:', error);
  } finally {
    pool.end();
  }
}

runSQL();
