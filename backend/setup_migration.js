const db = require('./src/config/db');

const setup = async () => {
  try {
    console.log('Starting Database Migration (JSONB Fallback)...');

    // 1. Check PostGIS (Optional Support)
    let hasPostGIS = false;
    try {
      await db.query('CREATE EXTENSION IF NOT EXISTS postgis;');
      console.log('PostGIS extension enabled.');
      hasPostGIS = true;
    } catch (e) {
      console.warn('PostGIS not available. Falling back to JSONB for coordinates.');
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
    console.log('Wards table created/checked.');

    // 3. Update Users table
    const userColumns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users';");
    const columnNames = userColumns.rows.map(r => r.column_name);

    if (!columnNames.includes('ward_id')) {
      await db.query('ALTER TABLE users ADD COLUMN ward_id INT REFERENCES wards(id) ON DELETE SET NULL;');
    }
    
    // Update role check constraint
    try {
        await db.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;');
        await db.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'worker', 'supervisor', 'commissioner', 'admin'));");
    } catch (e) {
        console.log('Role constraint update warning:', e.message);
    }
    console.log('Users table updated.');

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
    console.log('Machines table created/checked.');

    // 5. Update Tasks table
    const taskColumns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks';");
    const taskColumnNames = taskColumns.rows.map(r => r.column_name);

    if (!taskColumnNames.includes('ward_id')) {
      await db.query('ALTER TABLE tasks ADD COLUMN ward_id INT REFERENCES wards(id) ON DELETE SET NULL;');
    }
    if (!taskColumnNames.includes('task_type')) {
      await db.query("ALTER TABLE tasks ADD COLUMN task_type VARCHAR(50) DEFAULT 'area';");
    }
    if (!taskColumnNames.includes('source_qr_id')) {
      await db.query('ALTER TABLE tasks ADD COLUMN source_qr_id VARCHAR(255);');
    }
    if (!taskColumnNames.includes('destination_qr_id')) {
      await db.query('ALTER TABLE tasks ADD COLUMN destination_qr_id VARCHAR(255);');
    }
    if (!taskColumnNames.includes('last_point_reached')) {
      await db.query('ALTER TABLE tasks ADD COLUMN last_point_reached INT DEFAULT 0;');
    }
    
    // Update status constraint
    try {
        await db.query('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;');
        await db.query("ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected'));");
    } catch (e) {
        console.log('Task status constraint update warning:', e.message);
    }

    // 6. Add Performance Indices
    console.log('Adding performance indices...');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_ward_id ON tasks(ward_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_worker_id ON tasks(assigned_worker_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);');
    
    // Spatial Index (Critical for the map viewport filtering)
    try {
        await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_geom_gist ON tasks USING GIST (geom);');
        await db.query('CREATE INDEX IF NOT EXISTS idx_wards_geom_gist ON wards USING GIST (geom);');
        console.log('Spatial indices created.');
    } catch (e) {
        console.warn('Spatial index creation warning (PostGIS might be required):', e.message);
    }

    console.log('Tasks table updated.');
    console.log('Database Migration successfully completed!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

setup();
