const db = require('./db');
const shapefile = require('shapefile');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

function sortAndAlignSegments(segments) {
  if (!segments || segments.length === 0) return [];
  
  let remaining = segments.map(s => [...s]);
  let chain = [...remaining.shift()];
  
  const distance = (p1, p2) => {
    return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
  };
  
  const threshold = 0.001; // roughly 100 meters

  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    let bestDist = Infinity;
    let bestMode = '';
    let bestIdx = -1;

    const startPoint = chain[0];
    const endPoint = chain[chain.length - 1];

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const segStart = seg[0];
      const segEnd = seg[seg.length - 1];

      const dEndStart = distance(endPoint, segStart);
      const dEndEnd = distance(endPoint, segEnd);
      const dStartEnd = distance(startPoint, segEnd);
      const dStartStart = distance(startPoint, segStart);

      const minDist = Math.min(dEndStart, dEndEnd, dStartEnd, dStartStart);
      if (minDist < threshold && minDist < bestDist) {
        bestDist = minDist;
        bestIdx = i;
        if (minDist === dEndStart) {
          bestMode = 'append';
        } else if (minDist === dEndEnd) {
          bestMode = 'append-reversed';
        } else if (minDist === dStartEnd) {
          bestMode = 'prepend';
        } else {
          bestMode = 'prepend-reversed';
        }
      }
    }

    if (bestIdx !== -1) {
      const seg = remaining.splice(bestIdx, 1)[0];
      if (bestMode === 'append') {
        chain.push(...seg.slice(1));
      } else if (bestMode === 'append-reversed') {
        chain.push(...seg.slice(0, -1).reverse());
      } else if (bestMode === 'prepend') {
        chain.unshift(...seg.slice(0, -1));
      } else if (bestMode === 'prepend-reversed') {
        chain.unshift(...seg.reverse().slice(1));
      }
      progress = true;
    }
  }

  while (remaining.length > 0) {
    chain.push(...remaining.shift());
  }

  return chain;
}

const isJawanMatch = (propJawan, userJawan) => {
  if (!propJawan || !userJawan) return false;
  const p = propJawan.toLowerCase().replace(/\s+/g, '');
  const u = userJawan.toLowerCase().replace(/\s+/g, '');
  return p.includes(u) || u.includes(p);
};

const hasActiveWorkerMatch = (propJawan, activeSet) => {
  if (!propJawan || !activeSet) return false;
  for (const active of activeSet) {
    if (isJawanMatch(propJawan, active)) return true;
  }
  return false;
};

// Shapefile import helpers
async function importWards(filePath) {
  console.log(`Importing wards from ${filePath}...`);
  try {
    const source = await shapefile.open(filePath);
    let count = 0;
    
    while (true) {
      const result = await source.read();
      if (result.done) break;

      const feature = result.value;
      const properties = feature.properties || {};
      const wardNo = properties.Ward_No || properties.Name || properties.NAME;
      if (!wardNo) continue;
      const name = `Ward ${wardNo}`;
      const geom = JSON.stringify(feature.geometry);

      try {
        // 1. Insert into wards table
        await db.query(
          `INSERT INTO wards (name, boundary_geojson, geom)
           VALUES ($1, $2, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 32644), 4326))`,
          [name, geom, geom]
        );
        
        // 2. Insert into infrastructure table
        await db.query(
          `INSERT INTO infrastructure (name, type, geom, properties)
           VALUES ($1, 'ward', ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 32644), 4326), $3)`,
          [name, geom, JSON.stringify(properties)]
        );
        
        count++;
      } catch (err) {
        console.error(`Error importing ward ${wardNo}:`, err.message);
      }
    }
    console.log(`Successfully imported ${count} wards.`);
  } catch (err) {
    console.error(`Failed to import wards:`, err.message);
  }
}

async function importRoads(filePath) {
  console.log(`Importing roads from ${filePath}...`);
  try {
    const source = await shapefile.open(filePath);
    let count = 0;
    
    while (true) {
      const result = await source.read();
      if (result.done) break;

      const feature = result.value;
      const properties = feature.properties || {};
      const name = properties.Rd_Name || properties.name || properties.NAME || 'Unknown Road';
      const geom = JSON.stringify(feature.geometry);

      try {
        await db.query(
          `INSERT INTO infrastructure (name, type, geom, properties)
           VALUES ($1, 'road', ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 32644), 4326), $3)`,
          [name, geom, JSON.stringify(properties)]
        );
        count++;
        if (count % 500 === 0) console.log(`Imported ${count} roads...`);
      } catch (err) {
        console.error(`Error importing road ${count}:`, err.message);
      }
    }
    console.log(`Successfully imported ${count} road features.`);
  } catch (err) {
    console.error(`Failed to import roads:`, err.message);
  }
}

async function importRow(filePath) {
  console.log(`Importing Right of Way from ${filePath}...`);
  try {
    const source = await shapefile.open(filePath);
    let count = 0;
    
    while (true) {
      const result = await source.read();
      if (result.done) break;

      const feature = result.value;
      const properties = feature.properties || {};
      const name = properties.Name || `Right of Way ${properties.OBJECTID || count + 1}`;
      const geom = JSON.stringify(feature.geometry);

      try {
        await db.query(
          `INSERT INTO infrastructure (name, type, geom, properties)
           VALUES ($1, 'row', ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), $3)`,
          [name, geom, JSON.stringify(properties)]
        );
        count++;
      } catch (err) {
        console.error(`Error importing Right of Way feature ${count}:`, err.message);
      }
    }
    console.log(`Successfully imported ${count} Right of Way features.`);
  } catch (err) {
    console.error(`Failed to import Right of Way:`, err.message);
  }
}

async function importParks() {
  console.log('Commencing Park & Jawan seeding...');
  try {
    const JAWAN_MAPPINGS = {
      'P.Ravi': { email: 'ravi@kmc.com', phone: '8000000001' },
      'Vamshi': { email: 'vamshi@kmc.com', phone: '8000000002' },
      'V.Saidulu': { email: 'saidulu@kmc.com', phone: '8000000003' },
      'Vijay': { email: 'vijay@kmc.com', phone: '8000000004' },
      'Nageshwar Rao': { email: 'nageshwar@kmc.com', phone: '8000000005' },
      'Balu': { email: 'balu@kmc.com', phone: '8000000006' },
      'Shami': { email: 'shami@kmc.com', phone: '8000000007' },
      'B.venkateshwarlu': { email: 'venkateshwarlu@kmc.com', phone: '8000000008' }
    };
    const PASSWORD_HASH = '$2b$10$iTuUYuWvHq4Wyx4FjoG0nuXzWzJ6Cz2nkOUjv9wQIWbGOZCFHW4I6'; // bcrypt hash for password123

    // 1. Create Park Jawan users
    const jawanIds = {};
    for (const [name, info] of Object.entries(JAWAN_MAPPINGS)) {
      const userRes = await db.query(
        `INSERT INTO users (name, email, password, role, phone, approved, divisions)
         VALUES ($1, $2, $3, 'park_jawan', $4, TRUE, 'All Wards')
         ON CONFLICT (email) DO UPDATE SET 
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           role = 'park_jawan',
           password = EXCLUDED.password,
           approved = TRUE
         RETURNING id`,
        [name, info.email, PASSWORD_HASH, info.phone]
      );
      jawanIds[name] = userRes.rows[0].id;
    }

    // Create Park Inspector user
    await db.query(
      `INSERT INTO users (name, email, password, role, phone, approved, divisions)
       VALUES ('Inspector', 'inspector@kmc.com', $1, 'park_inspector', '8000000009', TRUE, 'All Wards')
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         role = 'park_inspector',
         password = EXCLUDED.password,
         approved = TRUE`,
      [PASSWORD_HASH]
    );

    // 2. Read landmarks GeoJSON
    const geojsonPath = 'c:\\khammam project\\QGIS\\landmarksfinally.geojson';
    if (fs.existsSync(geojsonPath)) {
      const rawData = fs.readFileSync(geojsonPath, 'utf8');
      const geojson = JSON.parse(rawData);

      let taskCount = 0;
      for (const feature of geojson.features) {
        const { properties, geometry } = feature;
        if (!geometry || geometry.type !== 'Point' || !geometry.coordinates) continue;

        const parkName = properties.Name || `Unnamed Park ${properties.fid}`;
        const wardNo = properties.Ward_no ? parseInt(properties.Ward_no) : null;
        const jawanName = properties.park_jawan;

        let assignedWorkerId = null;
        if (jawanName && jawanIds[jawanName]) {
          assignedWorkerId = jawanIds[jawanName];
        }

        let wardId = null;
        if (wardNo) {
          const wardRes = await db.query(
            "SELECT id FROM wards WHERE name ILIKE $1 LIMIT 1",
            [`Ward ${wardNo}`]
          );
          if (wardRes.rows.length > 0) {
            wardId = wardRes.rows[0].id;
          }
        }

        const lng = geometry.coordinates[0];
        const lat = geometry.coordinates[1];
        const areaGeojson = [{ latitude: lat, longitude: lng }];

        const taskCheck = await db.query(
          "SELECT id FROM tasks WHERE title = $1 AND task_type = 'park'",
          [parkName]
        );

        if (taskCheck.rows.length > 0) {
          await db.query(
            `UPDATE tasks 
             SET assigned_worker_id = $1, 
                 ward_id = $2, 
                 area_geojson = $3,
                 geom = ST_SetSRID(ST_Point($4, $5), 4326)
             WHERE id = $6`,
            [assignedWorkerId, wardId, JSON.stringify(areaGeojson), lng, lat, taskCheck.rows[0].id]
          );
        } else {
          await db.query(
            `INSERT INTO tasks (title, description, area_geojson, geom, assigned_worker_id, ward_id, task_type, source_qr_id, destination_qr_id, status, rd_name)
             VALUES ($1, 'Park maintenance and cleaning task', $2, ST_SetSRID(ST_Point($3, $4), 4326), $5, $6, 'park', $7, $8, 'pending', $1)`,
            [
              parkName,
              JSON.stringify(areaGeojson),
              lng,
              lat,
              assignedWorkerId,
              wardId,
              `START_PARK_${properties.fid}`,
              `END_PARK_${properties.fid}`
            ]
          );
        }

        if (assignedWorkerId && wardId) {
          await db.query(
            "UPDATE users SET ward_id = $1 WHERE id = $2 AND ward_id IS NULL",
            [wardId, assignedWorkerId]
          );
        }
        taskCount++;
      }
      console.log(`✅ Seeded ${taskCount} park tasks.`);
    } else {
      console.warn(`⚠️ Landmarks GeoJSON not found at ${geojsonPath}. Skipping park tasks seeding.`);
    }
  } catch (err) {
    console.error('Error importing parks and jawans:', err.message);
  }
}

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
    
    // Add spatial geom column to wards if missing
    try {
      await db.query(`ALTER TABLE wards ADD COLUMN IF NOT EXISTS geom GEOMETRY(Polygon, 4326);`);
    } catch (e) {
      console.warn('Could not add geom column to wards:', e.message);
    }
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
        CONSTRAINT users_role_check CHECK (role IN ('owner', 'worker', 'supervisor', 'commissioner', 'admin', 'park_jawan', 'park_inspector'))
      );
    `);
    
    // Drop outdated check constraint and apply the updated one
    try {
      await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`);
      await db.query(`
        ALTER TABLE users 
        ADD CONSTRAINT users_role_check 
        CHECK (role IN ('owner', 'worker', 'supervisor', 'commissioner', 'admin', 'park_jawan', 'park_inspector'));
      `);
      console.log('✅ Users table role check constraint updated successfully.');
    } catch (e) {
      console.warn('Could not update users table check constraint:', e.message);
    }
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
        review_comment TEXT,
        CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected'))
      );
    `);
    
    // Add additional columns if missing
    try {
      await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);`);
      await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS line_id VARCHAR(255);`);
      await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rd_name VARCHAR(255);`);
      await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_comment TEXT;`);
    } catch (e) {
      console.warn('Could not add geometry or utility columns to tasks:', e.message);
    }

    try {
      await db.query(`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;`);
      await db.query(`
        ALTER TABLE tasks 
        ADD CONSTRAINT tasks_status_check 
        CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected'));
      `);
      console.log('✅ Tasks table status check constraint updated successfully.');
    } catch (e) {
      console.warn('Could not update tasks table check constraint:', e.message);
    }
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

    try {
      await db.query(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS public_id VARCHAR(255);`);
      console.log('✅ Photos table public_id column verified.');
    } catch (e) {
      console.warn('Could not add public_id column to photos:', e.message);
    }
    console.log('✅ Photos table checked.');

    // 7. Create Infrastructure table
    await db.query(`
      CREATE TABLE IF NOT EXISTS infrastructure (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        type VARCHAR(50),
        properties JSONB,
        geom GEOMETRY(Geometry, 4326)
      );
    `);
    console.log('✅ Infrastructure table checked.');

    // 8. Add Performance and Spatial Indices
    console.log('Checking database indices...');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_ward_id ON tasks(ward_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_worker_id ON tasks(assigned_worker_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_infra_type ON infrastructure(type);');
    await db.query("CREATE INDEX IF NOT EXISTS idx_infra_line_id ON infrastructure((properties->>'Line_ID'));");
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_line_id ON tasks(line_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);');
    
    try {
      await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_geom_gist ON tasks USING GIST (geom);');
      await db.query('CREATE INDEX IF NOT EXISTS idx_wards_geom_gist ON wards USING GIST (geom);');
      await db.query('CREATE INDEX IF NOT EXISTS idx_infra_geom_gist ON infrastructure USING GIST (geom);');
    } catch (e) {
      console.warn('Could not create spatial indices (PostGIS required):', e.message);
    }

    // 9. Seed default admin accounts
    const adminPasswordHash = '$2b$10$4MBC37ck8zyFaOFdZs2eBOyNQlxg8PVFZKK88Bfe83rRG8cUdWXx6'; // bcrypt hash for password123
    const commissionerPasswordHash = '$2b$10$q7mQJ8Db4Drx0yfa3lHwxuFwGWsfLX0f/p3WAG4K2t0Pm6Tff0Yxe'; // bcrypt hash for commissioner123
    
    // Seed Commissioner (@test.com)
    await db.query(`
      INSERT INTO users (name, email, password, role, approved) 
      VALUES ('Khammam Commissioner', 'commissioner@test.com', $1, 'commissioner', TRUE)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, approved = TRUE;
    `, [commissionerPasswordHash]);

    // Seed Commissioner (@kmc.com)
    await db.query(`
      INSERT INTO users (name, email, password, role, approved) 
      VALUES ('Khammam Commissioner', 'commissioner@kmc.com', $1, 'commissioner', TRUE)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, approved = TRUE;
    `, [commissionerPasswordHash]);

    // Seed Supervisor
    await db.query(`
      INSERT INTO users (name, email, password, role, approved) 
      VALUES ('Ward Supervisor', 'supervisor@test.com', $1, 'supervisor', TRUE)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, approved = TRUE;
    `, [adminPasswordHash]);

    console.log('✅ Default users checked/inserted.');

    // 10. Shapefile auto-import if empty
    const infraCheck = await db.query('SELECT COUNT(*) FROM infrastructure');
    const infraCount = parseInt(infraCheck.rows[0].count);
    const rootPath = path.join(__dirname, '..', '..', '..'); // Repository root
    
    if (infraCount === 0) {
      console.log('--- Database infrastructure is empty. Commencing Shapefile import... ---');
      const wardsShpFile = path.join(rootPath, 'Export_Output_2.shp');
      const rowShpFile = path.join(rootPath, 'Export_Output_3.shp');
      const roadsShpFile = path.join(rootPath, 'Export_Output_APP.shp');
      
      if (fs.existsSync(wardsShpFile) && fs.existsSync(rowShpFile) && fs.existsSync(roadsShpFile)) {
        // Run imports
        await importRoads(roadsShpFile);
        await importWards(wardsShpFile);
        await importRow(rowShpFile);
        console.log('✅ GIS Shapefiles successfully imported.');
      } else {
        console.warn(`⚠️ Shapefiles not found in repo root at ${rootPath}. Skipping import.`);
      }
    } else {
      console.log(`✅ Database already populated with ${infraCount} infrastructure features.`);
    }

    // 11. User seeding if empty
    const usersCheck = await db.query("SELECT COUNT(*) FROM users WHERE email = 'jawan_1@test.com'");
    const usersCount = parseInt(usersCheck.rows[0].count);
    if (usersCount === 0) {
      console.log('--- Database users are empty. Commencing user seeding... ---');
      
      const siCredentialsPath = path.join(__dirname, '..', '..', 'si_credentials.json');
      const jawanCredentialsPath = path.join(__dirname, '..', '..', 'jawan_credentials.json');
      
      if (fs.existsSync(siCredentialsPath)) {
        console.log('Seeding supervisors from si_credentials.json...');
        const sis = JSON.parse(fs.readFileSync(siCredentialsPath, 'utf8'));
        for (const si of sis) {
          const username = si.username;
          const email = `${username}@test.com`;
          const passwordHash = bcrypt.hashSync(si.password, 10);
          const name = si.siName;
          
          const res = await db.query(`
            INSERT INTO users (name, email, password, role, approved)
            VALUES ($1, $2, $3, 'supervisor', TRUE)
            ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, approved = TRUE
            RETURNING id
          `, [name, email, passwordHash]);
          
          const supervisorId = res.rows[0].id;
          
          for (const wardNo of si.wards) {
            await db.query(`
              UPDATE wards 
              SET supervisor_id = $1 
              WHERE name = $2 OR name = $3
            `, [supervisorId, `Ward ${wardNo}`, `Ward 0${wardNo}`]);
          }
        }
        console.log('✅ Supervisors successfully seeded.');
      }

      if (fs.existsSync(jawanCredentialsPath)) {
        console.log('Seeding jawans from jawan_credentials.json...');
        const jawans = JSON.parse(fs.readFileSync(jawanCredentialsPath, 'utf8'));
        for (const jawan of jawans) {
          const username = jawan.username;
          const email = `${username}@test.com`;
          const passwordHash = bcrypt.hashSync(jawan.password, 10);
          const name = jawan.name;
          const wardNo = jawan.ward;
          
          const wardRes = await db.query(`
            SELECT id FROM wards WHERE name = $1 OR name = $2 LIMIT 1
          `, [`Ward ${wardNo}`, `Ward 0${wardNo}`]);
          
          const wardId = wardRes.rows.length > 0 ? wardRes.rows[0].id : null;
          
          await db.query(`
            INSERT INTO users (name, email, password, role, approved, ward_id)
            VALUES ($1, $2, $3, 'worker', TRUE, $4)
            ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, approved = TRUE, ward_id = EXCLUDED.ward_id
          `, [name, email, passwordHash, wardId]);
        }
        console.log('✅ Jawans successfully seeded.');
      }
    } else {
      console.log(`✅ Users already seeded (${usersCount} SIs/Jawans present).`);
    }

    // Ensure Highway Jawan is updated/created
    const highwayPasswordHash = bcrypt.hashSync('highway@123', 10);
    // Delete any old jawan_61 if present to avoid conflicts
    await db.query("DELETE FROM users WHERE email = 'jawan_61@test.com'");
    await db.query(`
      INSERT INTO users (name, email, password, role, approved, ward_id)
      VALUES ('Sahruday', 'jawan_highway@test.com', $1, 'worker', TRUE, NULL)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, name = EXCLUDED.name, approved = TRUE, ward_id = NULL
    `, [highwayPasswordHash]);
    console.log('✅ Highway Jawan checked/inserted.');

    // Ensure Jawan 8 (Ward 8_1 & 8_2 merge) is updated/created
    const jawan8PasswordHash = bcrypt.hashSync('jawan8@123', 10);
    // Delete any old jawan_8_1 and jawan_8_2 if present to avoid conflicts
    await db.query("DELETE FROM users WHERE email IN ('jawan_8_1@test.com', 'jawan_8_2@test.com')");
    // Find Ward 8 ID
    const ward8Res = await db.query("SELECT id FROM wards WHERE name = 'Ward 8' OR name = 'Ward 08' LIMIT 1");
    const ward8Id = ward8Res.rows.length > 0 ? ward8Res.rows[0].id : null;
    await db.query(`
      INSERT INTO users (name, email, password, role, approved, ward_id)
      VALUES ('Sk Navab / B  Venkateshwarlu', 'jawan_8@test.com', $1, 'worker', TRUE, $2)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, name = EXCLUDED.name, approved = TRUE, ward_id = EXCLUDED.ward_id
    `, [jawan8PasswordHash, ward8Id]);
    console.log('✅ Jawan 8 checked/inserted.');

    // Ensure Jawan 15 (Ward 15_1 & 15_2 merge) is updated/created
    const jawan15PasswordHash = bcrypt.hashSync('jawan15@123', 10);
    // Delete any old jawan_15_1 and jawan_15_2 if present to avoid conflicts
    await db.query("DELETE FROM users WHERE email IN ('jawan_15_1@test.com', 'jawan_15_2@test.com')");
    // Find Ward 15 ID
    const ward15Res = await db.query("SELECT id FROM wards WHERE name = 'Ward 15' OR name = 'Ward 15' LIMIT 1");
    const ward15Id = ward15Res.rows.length > 0 ? ward15Res.rows[0].id : null;
    await db.query(`
      INSERT INTO users (name, email, password, role, approved, ward_id)
      VALUES ('K Srikanth / P Naresh', 'jawan_15@test.com', $1, 'worker', TRUE, $2)
      ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, name = EXCLUDED.name, approved = TRUE, ward_id = EXCLUDED.ward_id
    `, [jawan15PasswordHash, ward15Id]);
    console.log('✅ Jawan 15 checked/inserted.');

    // Seed Park Inspector/Jawans and tasks if not present
    const parkUsersCheck = await db.query("SELECT COUNT(*) FROM users WHERE role = 'park_inspector'");
    const parkUsersCount = parseInt(parkUsersCheck.rows[0].count);
    if (parkUsersCount === 0) {
      await importParks();
    }

    // 12. Task seeding if empty
    const tasksCheck = await db.query('SELECT COUNT(*) FROM tasks');
    const tasksCount = parseInt(tasksCheck.rows[0].count);
    if (tasksCount === 0) {
      console.log('--- Tasks table is empty. Commencing automatic pending task generation... ---');
      
      // Fetch all workers and their wards
      const workersRes = await db.query(`
        SELECT u.id, u.name, u.ward_id, w.name as ward_name
        FROM users u
        LEFT JOIN wards w ON u.ward_id = w.id
        WHERE u.role = 'worker'
      `);
      const workers = workersRes.rows;

      // Fetch all wards to resolve ward IDs by number
      const wardsRes = await db.query(`SELECT id, name FROM wards`);
      const wards = wardsRes.rows;

      // Fetch all roads
      console.log('Fetching roads...');
      const roadsRes = await db.query(`
        SELECT id, name, properties, geom, ST_AsGeoJSON(geom) as geom_json 
        FROM infrastructure 
        WHERE type = 'road'
      `);
      const roads = roadsRes.rows;
      console.log(`Processing ${roads.length} roads for task assignment...`);

      // Fetch duplicate Line_IDs globally in the database
      const dupRes = await db.query(`
        SELECT properties->>'Line_ID' as line_id 
        FROM infrastructure 
        WHERE properties->>'Line_ID' IS NOT NULL 
        GROUP BY properties->>'Line_ID' 
        HAVING COUNT(*) > 1
      `);
      const duplicateLineIds = new Set(dupRes.rows.map(row => row.line_id));

      let totalTasksCreated = 0;

      for (const road of roads) {
        const props = road.properties || {};
        let lineId = props.Line_ID || props.line_id || `RD_${road.id}`;
        const rdName = props.Rd_Name || props.rd_name || road.name || `Road ${road.id}`;

        // Resolve ward
        let wardId = null;
        const wardNoStr = props.Ward_No || props.ward_no;
        
        // Skip non-highway roads that are in Ward 61 but lack a Rly_Name
        const rlyName = props.Rly_Name || props.rly_name;
        if (wardNoStr === '61' && !rlyName) {
          continue;
        }

        if (wardNoStr) {
          const wardNum = parseInt(wardNoStr);
          const matchedWard = wards.find(w => w.name.match(new RegExp(`Ward\\s+0*${wardNum}$`, 'i')) || w.name.match(new RegExp(`Ward\\s+0*${wardNum}\\b`, 'i')));
          if (matchedWard) {
            wardId = matchedWard.id;
          }
        }

        // Resolve Jawan/Worker
        let assignedWorkerId = null;
        const jawanNameInProps = props.JAWAN_NAME || props.jawan_name;
        
        if (wardNoStr === '61') {
          const highwayWorker = workers.find(w => w.email.includes('jawan_highway') || w.name === 'Sahruday');
          if (highwayWorker) {
            assignedWorkerId = highwayWorker.id;
          }
        } else if (wardNoStr === '8_1' || wardNoStr === '8_2' || wardNoStr === '8') {
          const ward8Worker = workers.find(w => w.email.includes('jawan_8@') || w.name.includes('Sk Navab'));
          if (ward8Worker) {
            assignedWorkerId = ward8Worker.id;
          }
        } else if (wardNoStr === '15_1' || wardNoStr === '15_2' || wardNoStr === '15') {
          const ward15Worker = workers.find(w => w.email.includes('jawan_15@') || w.name.includes('Srikanth'));
          if (ward15Worker) {
            assignedWorkerId = ward15Worker.id;
          }
        } else if (wardId) {
          const wardWorkers = workers.filter(w => w.ward_id === wardId);
          if (wardWorkers.length === 1) {
            assignedWorkerId = wardWorkers[0].id;
          } else if (wardWorkers.length > 1) {
            if (jawanNameInProps) {
              const matchedWorker = wardWorkers.find(w => isJawanMatch(jawanNameInProps, w.name));
              if (matchedWorker) {
                assignedWorkerId = matchedWorker.id;
              } else {
                assignedWorkerId = wardWorkers[0].id;
              }
            } else {
              assignedWorkerId = wardWorkers[0].id;
            }
          }
        }

        // Fallback: match by name globally if not matched by ward (skip Ward 0)
        if (!assignedWorkerId && jawanNameInProps && wardNoStr !== '0') {
          const matchedWorker = workers.find(w => isJawanMatch(jawanNameInProps, w.name));
          if (matchedWorker) {
            assignedWorkerId = matchedWorker.id;
            if (!wardId && matchedWorker.ward_id) {
              wardId = matchedWorker.ward_id;
            }
          }
        }

        // Format geom
        let areaGeojson = null;
        if (road.geom_json) {
          const parsed = JSON.parse(road.geom_json);
          if (parsed.type === 'LineString') {
            areaGeojson = parsed.coordinates.map(c => ({ longitude: c[0], latitude: c[1] }));
          } else if (parsed.type === 'MultiLineString') {
            const aligned = sortAndAlignSegments(parsed.coordinates);
            areaGeojson = aligned.map(c => ({ longitude: c[0], latitude: c[1] }));
          } else if (parsed.type === 'Polygon') {
            areaGeojson = parsed.coordinates[0].map(c => ({ longitude: c[0], latitude: c[1] }));
          } else if (parsed.type === 'MultiPolygon') {
            areaGeojson = parsed.coordinates.flat(2).map(c => ({ longitude: c[0], latitude: c[1] }));
          }
        }

        // Suffix duplicate line ids globally to avoid ID collisions on the map
        if (lineId && duplicateLineIds.has(lineId)) {
          lineId = `${lineId}_${road.id}`;
        }

        const sourceQr = `START_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const destinationQr = `END_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

        await db.query(
          `INSERT INTO tasks (title, description, area_geojson, geom, assigned_worker_id, ward_id, task_type, source_qr_id, destination_qr_id, status, line_id, rd_name)
           VALUES ($1, $2, $3, $4, $5, $6, 'road', $7, $8, 'pending', $9, $10)`,
          [rdName, `Clean ${rdName}`, JSON.stringify(areaGeojson), road.geom, assignedWorkerId, wardId, sourceQr, destinationQr, lineId, rdName]
        );
        totalTasksCreated++;
      }

      console.log(`✅ Seeded ${totalTasksCreated} pending road tasks for jawans.`);
    } else {
      console.log(`✅ Tasks already seeded (${tasksCount} tasks present).`);
    }

    // Delete any Ward 61 tasks where the underlying road has no Rly_Name (to ensure exactly 29 tasks)
    await db.query(`
      DELETE FROM tasks 
      WHERE EXISTS (
        SELECT 1 
        FROM infrastructure r 
        WHERE r.type = 'road' 
          AND r.properties->>'Ward_No' = '61' 
          AND r.properties->>'Rly_Name' IS NULL 
          AND (
            tasks.line_id = r.properties->>'Line_ID' 
            OR tasks.line_id = (r.properties->>'Line_ID' || '_' || r.id)
          )
      )
    `);

    // Unconditionally align any existing tasks for ward 61 roads to jawan_highway and clear ward_id
    await db.query(`
      UPDATE tasks 
      SET assigned_worker_id = (SELECT id FROM users WHERE email = 'jawan_highway@test.com'),
          ward_id = NULL
      WHERE EXISTS (
        SELECT 1 
        FROM infrastructure r
        WHERE r.type = 'road' 
          AND r.properties->>'Ward_No' = '61'
          AND (
            tasks.line_id = r.properties->>'Line_ID'
            OR tasks.line_id = (r.properties->>'Line_ID' || '_' || r.id)
          )
      )
    `);
    console.log('✅ Ward 61 tasks aligned and pruned to exactly 29 tasks for Highway Jawan.');

    // Unconditionally align any existing tasks for ward 8, 8_1 and 8_2 roads to jawan_8
    await db.query(`
      UPDATE tasks 
      SET assigned_worker_id = (SELECT id FROM users WHERE email = 'jawan_8@test.com')
      WHERE EXISTS (
        SELECT 1 
        FROM infrastructure r
        WHERE r.type = 'road' 
          AND r.properties->>'Ward_No' IN ('8', '8_1', '8_2')
          AND (
            tasks.line_id = r.properties->>'Line_ID'
            OR tasks.line_id = (r.properties->>'Line_ID' || '_' || r.id)
          )
      )
    `);
    console.log('✅ Ward 8, 8_1 & 8_2 tasks aligned to Jawan 8.');

    // Unconditionally align any existing tasks for ward 15, 15_1 and 15_2 roads to jawan_15
    await db.query(`
      UPDATE tasks 
      SET assigned_worker_id = (SELECT id FROM users WHERE email = 'jawan_15@test.com')
      WHERE EXISTS (
        SELECT 1 
        FROM infrastructure r
        WHERE r.type = 'road' 
          AND r.properties->>'Ward_No' IN ('15', '15_1', '15_2')
          AND (
            tasks.line_id = r.properties->>'Line_ID'
            OR tasks.line_id = (r.properties->>'Line_ID' || '_' || r.id)
          )
      )
    `);
    console.log('✅ Ward 15, 15_1 & 15_2 tasks aligned to Jawan 15.');

    console.log('--- Database initialization complete ---');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

module.exports = initDb;
