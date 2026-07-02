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
    
    // Add additional columns if missing
    try {
      await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);`);
      await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS line_id VARCHAR(255);`);
      await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rd_name VARCHAR(255);`);
    } catch (e) {
      console.warn('Could not add geometry or utility columns to tasks:', e.message);
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
    
    try {
      await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_geom_gist ON tasks USING GIST (geom);');
      await db.query('CREATE INDEX IF NOT EXISTS idx_wards_geom_gist ON wards USING GIST (geom);');
      await db.query('CREATE INDEX IF NOT EXISTS idx_infra_geom_gist ON infrastructure USING GIST (geom);');
    } catch (e) {
      console.warn('Could not create spatial indices (PostGIS required):', e.message);
    }

    // 9. Seed default admin accounts
    const adminPasswordHash = '$2b$10$4MBC37ck8zyFaOFdZs2eBOyNQlxg8PVFZKK88Bfe83rRG8cUdWXx6'; // bcrypt hash for password123
    
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

    console.log('✅ Default users checked/inserted.');

    // 10. Shapefile auto-import and user/task seeding if empty
    const infraCheck = await db.query('SELECT COUNT(*) FROM infrastructure');
    const infraCount = parseInt(infraCheck.rows[0].count);
    
    if (infraCount === 0) {
      console.log('--- Database is empty. Commencing Shapefile import & seeding... ---');
      
      const rootPath = path.join(__dirname, '..', '..', '..'); // Repository root
      
      const wardsShpFile = path.join(rootPath, 'Export_Output_2.shp');
      const rowShpFile = path.join(rootPath, 'Export_Output_3.shp');
      const roadsShpFile = path.join(rootPath, 'Export_Output_4.shp');
      
      if (fs.existsSync(wardsShpFile) && fs.existsSync(rowShpFile) && fs.existsSync(roadsShpFile)) {
        // Run imports
        await importRoads(roadsShpFile);
        await importWards(wardsShpFile);
        await importRow(rowShpFile);
        console.log('✅ GIS Shapefiles successfully imported.');
        
        // Seed supervisors and workers
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

        // Auto-generate pending tasks for all jawans
        console.log('Auto-generating pending tasks for seeded jawans...');
        const workersRes = await db.query(`
          SELECT u.id, u.name, u.ward_id, w.name as ward_name
          FROM users u
          LEFT JOIN wards w ON u.ward_id = w.id
          WHERE u.role = 'worker' AND u.ward_id IS NOT NULL
        `);

        // Fetch duplicate Line_IDs globally
        const dupRes = await db.query(
          `SELECT properties->>'Line_ID' as line_id 
           FROM infrastructure 
           WHERE properties->>'Line_ID' IS NOT NULL 
           GROUP BY properties->>'Line_ID' 
           HAVING COUNT(*) > 1`
        );
        const duplicateLineIds = new Set(dupRes.rows.map(row => row.line_id));

        // Get all active worker names
        const activeWorkerNames = new Set(workersRes.rows.map(w => w.name));

        let totalTasksCreated = 0;
        for (const worker of workersRes.rows) {
          const workerId = worker.id;
          const wardId = worker.ward_id;
          const wardName = worker.ward_name;
          const workerName = worker.name;
          
          let wardNum = '';
          const match = wardName.match(/Ward\s+(\d+)/i);
          if (match) {
            wardNum = match[1];
          }
          
          const isJawan61 = workerName.includes('61') || worker.name === 'jawan_61';
          
          let roadsRes;
          if (isJawan61) {
            roadsRes = await db.query(
              `SELECT r.id, r.name, r.properties, ST_AsGeoJSON(r.geom) as geom_json, r.geom
               FROM infrastructure r
               WHERE r.type = 'road' AND (
                   r.properties->>'Ward_No' = $1 
                   OR LOWER(r.properties->>'JAWAN_NAME') = LOWER($2)
               )`,
              [wardNum, workerName]
            );
          } else {
            roadsRes = await db.query(
              `WITH worker_ward AS (
                   SELECT geom FROM infrastructure WHERE type = 'ward' AND LOWER(name) = LOWER($1) LIMIT 1
               )
               SELECT r.id, r.name, r.properties, ST_AsGeoJSON(r.geom) as geom_json, r.geom
               FROM infrastructure r
               LEFT JOIN worker_ward w ON true
               WHERE r.type = 'road' AND (
                   r.properties->>'Ward_No' = $2 
                   OR (w.geom IS NOT NULL AND ST_Intersects(r.geom, w.geom))
                   OR LOWER(r.properties->>'JAWAN_NAME') = LOWER($3)
               )`,
              [wardName, wardNum, workerName]
            );
          }

          for (const road of roadsRes.rows) {
            const props = road.properties || {};
            let lineId = props.Line_ID || props.line_id || `RD_${road.id}`;
            const rdName = props.Rd_Name || props.rd_name || road.name || `Road ${road.id}`;
            
            if (isJawan61 && lineId && duplicateLineIds.has(lineId)) {
              lineId = `${lineId}_${road.id}`;
            }

            const jawanNameInProps = props.JAWAN_NAME || props.jawan_name;
            if (jawanNameInProps && !isJawanMatch(jawanNameInProps, workerName)) {
              if (hasActiveWorkerMatch(jawanNameInProps, activeWorkerNames)) {
                // Assigned to another active worker - skip
                continue;
              }
            }

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

            const sourceQr = `START_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
            const destinationQr = `END_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

            await db.query(
              `INSERT INTO tasks (title, description, area_geojson, geom, assigned_worker_id, ward_id, task_type, source_qr_id, destination_qr_id, status, line_id, rd_name)
               VALUES ($1, $2, $3, $4, $5, $6, 'road', $7, $8, 'pending', $9, $10)`,
              [rdName, `Clean ${rdName}`, JSON.stringify(areaGeojson), road.geom, workerId, wardId, sourceQr, destinationQr, lineId, rdName]
            );
            totalTasksCreated++;
          }
        }
        console.log(`✅ Seeded ${totalTasksCreated} pending road tasks for jawans.`);
      } else {
        console.warn(`⚠️ Shapefiles not found in repo root at ${rootPath}. Skipping import.`);
      }
    } else {
      console.log(`✅ Database already populated with ${infraCount} infrastructure features.`);
    }

    console.log('--- Database initialization complete ---');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

module.exports = initDb;
