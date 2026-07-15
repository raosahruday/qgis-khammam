const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

// Pre-hashed 'password123'
const PASSWORD_HASH = '$2b$10$Xm3h.S/Qy97S9x9kF9z57.CxzpTo0n6S5sWJXZkG.x7rC8Z8w7t8m';

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

async function run() {
  try {
    console.log('Altering check constraint on users.role...');
    await db.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
    await db.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'worker', 'supervisor', 'commissioner', 'park_jawan'))");
    console.log('Constraint altered successfully.');

    console.log('Reading landmarks GeoJSON...');
    const geojsonPath = 'c:\\khammam project\\QGIS\\landmarksfinally.geojson';
    const rawData = fs.readFileSync(geojsonPath, 'utf8');
    const geojson = JSON.parse(rawData);

    console.log(`Found ${geojson.features.length} features.`);

    // 1. Create Park Jawan users
    const jawanIds = {};
    for (const [name, info] of Object.entries(JAWAN_MAPPINGS)) {
      console.log(`Upserting user: ${name} (${info.email})`);
      
      // Check if user already exists (by email)
      const userRes = await db.query(
        `INSERT INTO users (name, email, password, role, phone, approved, divisions)
         VALUES ($1, $2, $3, 'park_jawan', $4, TRUE, 'All Wards')
         ON CONFLICT (email) DO UPDATE SET 
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           role = 'park_jawan',
           approved = TRUE
         RETURNING id`,
        [name, info.email, PASSWORD_HASH, info.phone]
      );
      
      jawanIds[name] = userRes.rows[0].id;
    }

    // 2. Insert park tasks
    let taskCount = 0;
    for (const feature of geojson.features) {
      const { properties, geometry } = feature;
      if (!geometry || geometry.type !== 'Point' || !geometry.coordinates) {
        console.log(`Skipping feature fid=${properties.fid} due to missing or invalid geometry.`);
        continue;
      }

      const parkName = properties.Name || `Unnamed Park ${properties.fid}`;
      const wardNo = properties.Ward_no ? parseInt(properties.Ward_no) : null;
      const jawanName = properties.park_jawan;

      let assignedWorkerId = null;
      if (jawanName && jawanIds[jawanName]) {
        assignedWorkerId = jawanIds[jawanName];
      }

      // Try to find the matching ward from the wards database table
      let wardId = null;
      if (wardNo) {
        const wardRes = await db.query(
          "SELECT id FROM wards WHERE name ILIKE $1 LIMIT 1",
          [`%Ward ${wardNo}%`]
        );
        if (wardRes.rows.length > 0) {
          wardId = wardRes.rows[0].id;
        }
      }

      const lng = geometry.coordinates[0];
      const lat = geometry.coordinates[1];
      const areaGeojson = [{ latitude: lat, longitude: lng }];

      // Check if task already exists
      const taskCheck = await db.query(
        "SELECT id FROM tasks WHERE title = $1 AND task_type = 'park'",
        [parkName]
      );

      if (taskCheck.rows.length > 0) {
        // Update existing task
        await db.query(
          `UPDATE tasks 
           SET assigned_worker_id = $1, 
               ward_id = $2, 
               area_geojson = $3,
               geom = ST_SetSRID(ST_Point($4, $5), 4326)
           WHERE id = $6`,
          [assignedWorkerId, wardId, JSON.stringify(areaGeojson), lng, lat, taskCheck.rows[0].id]
        );
        console.log(`Updated park task: ${parkName}`);
      } else {
        // Insert new task
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
        console.log(`Created park task: ${parkName}`);
      }

      // Also map the worker's ward profile if not set
      if (assignedWorkerId && wardId) {
        await db.query(
          "UPDATE users SET ward_id = $1 WHERE id = $2 AND ward_id IS NULL",
          [wardId, assignedWorkerId]
        );
      }

      taskCount++;
    }

    console.log(`\nImport complete! Seeded ${taskCount} park tasks.`);
    process.exit(0);
  } catch (err) {
    console.error('Error importing parks and jawans:', err);
    process.exit(1);
  }
}

run();
