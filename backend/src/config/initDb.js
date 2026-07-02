const db = require('./db');

const initDb = async () => {
  try {
    console.log('--- Initializing database tables and seed data ---');

    // 1. Try to enable PostGIS
    try {
      await db.query('CREATE EXTENSION IF NOT EXISTS postgis;');
      console.log('PostGIS extension checked/enabled.');
    } catch (e) {
      console.warn('PostGIS not available. Using standard coordinate fallbacks.');
    }

    // 2. Create Wards table
    await db.query(`
      CREATE TABLE IF NOT EXISTS wards (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        boundary_geojson JSONB,
        supervisor_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Wards table checked.');

    // 3. Create Users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50) UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        approved BOOLEAN DEFAULT FALSE,
        divisions VARCHAR(255),
        ward_id INT REFERENCES wards(id) ON DELETE SET NULL,
        current_machine_id INT,
        CONSTRAINT users_role_check CHECK (role IN ('owner', 'worker', 'supervisor', 'commissioner', 'admin'))
      );
    `);
    console.log('✅ Users table checked.');

    // 4. Create Machines table
    await db.query(`
      CREATE TABLE IF NOT EXISTS machines (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        current_lat DECIMAL(10, 8),
        current_lng DECIMAL(11, 8),
        active_task_id INT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Machines table checked.');

    // 5. Create Tasks table
    await db.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        area_geojson JSONB NOT NULL,
        assigned_worker_id INT REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ward_id INT REFERENCES wards(id) ON DELETE SET NULL,
        task_type VARCHAR(50) DEFAULT 'area',
        source_qr_id VARCHAR(255),
        destination_qr_id VARCHAR(255),
        last_point_reached INT DEFAULT 0,
        CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected'))
      );
    `);
    console.log('✅ Tasks table checked.');

    // 6. Create Photos table
    await db.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
        worker_id INT REFERENCES users(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        public_id VARCHAR(255)
      );
    `);
    console.log('✅ Photos table checked.');

    // 7. Add Performance Indices
    console.log('Checking database indices...');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_ward_id ON tasks(ward_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_worker_id ON tasks(assigned_worker_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);');

    // 8. Seed default accounts if they don't exist
    // Password is 'password123' bcrypt hash
    const adminPasswordHash = '$2b$10$Xm3h.S/Qy97S9x9kF9z57.CxzpTo0n6S5sWJXZkG.x7rC8Z8w7t8m';
    
    // Seed Commissioner
    await db.query(`
      INSERT INTO users (name, email, password, role, approved) 
      VALUES ('Khammam Commissioner', 'commissioner@test.com', $1, 'commissioner', TRUE)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, approved = TRUE;
    `, [adminPasswordHash]);

    // Seed Supervisor
    await db.query(`
      INSERT INTO users (name, email, password, role, approved) 
      VALUES ('Ward Supervisor', 'supervisor@test.com', $1, 'supervisor', TRUE)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, approved = TRUE;
    `, [adminPasswordHash]);

    console.log('✅ Seed users checked/inserted.');
    console.log('--- Database initialization complete ---');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

module.exports = initDb;
