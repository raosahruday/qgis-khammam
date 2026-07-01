/**
 * Creates user "Jawan 5" (worker) and assigns sample road tasks in Ward 5.
 * Reads the Ward 5 boundary from the wards table and creates 3 tasks along
 * major road segments that intersect Ward 5.
 */
const db = require('../src/config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function run() {
    try {
        // 1. Create Jawan 5 user if not exists
        console.log('Creating Jawan 5 user...');
        const hash = await bcrypt.hash('password123', 10);
        const userRes = await db.query(`
            INSERT INTO users (name, email, password, role)
            VALUES ('Jawan 5', 'jawan5@gmail.com', $1, 'worker')
            ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
            RETURNING id, name, email
        `, [hash]);
        const worker = userRes.rows[0];
        console.log(`Worker: ${worker.name} (id=${worker.id})`);

        // 2. Find Ward 5 in the wards table
        console.log('\nFinding Ward 5...');
        const wardRes = await db.query(`
            SELECT id, name, ST_AsGeoJSON(geom) as geom_json
            FROM wards 
            WHERE name = 'Ward 5'
            LIMIT 1
        `);
        if (wardRes.rows.length === 0) {
            console.error('Ward 5 not found! Available wards:');
            const allWards = await db.query('SELECT id, name FROM wards ORDER BY name LIMIT 20');
            console.table(allWards.rows);
            process.exit(1);
        }
        const ward = wardRes.rows[0];
        console.log(`Ward: ${ward.name} (id=${ward.id})`);

        // 3. Find road segments that pass through Ward 5
        console.log('\nFinding roads in Ward 5...');
        const roadsRes = await db.query(`
            SELECT i.id, i.name, ST_AsGeoJSON(i.geom) as geom_json,
                   ST_AsGeoJSON(ST_Intersection(i.geom, w.geom)) as clipped_geom_json
            FROM infrastructure i
            JOIN wards w ON w.id = $1
            WHERE i.type = 'road'
              AND ST_Intersects(i.geom, w.geom)
              AND ST_Length(ST_Intersection(i.geom, w.geom)::geography) > 50
            ORDER BY ST_Length(i.geom::geography) DESC
            LIMIT 5
        `, [ward.id]);

        console.log(`Found ${roadsRes.rows.length} major road segments in Ward 5`);

        if (roadsRes.rows.length === 0) {
            console.error('No roads found in Ward 5. Creating generic task...');
            // Fallback: create one task using ward centroid
            const centRes = await db.query(`
                SELECT ST_Y(ST_Centroid(geom)) as lat, ST_X(ST_Centroid(geom)) as lng FROM wards WHERE id = $1
            `, [ward.id]);
            const { lat, lng } = centRes.rows[0];
            await createTask(db, worker.id, ward.id, `Ward 5 General Task`, 'General road maintenance task in Ward 5', [
                { longitude: parseFloat(lng) - 0.002, latitude: parseFloat(lat) },
                { longitude: parseFloat(lng) + 0.002, latitude: parseFloat(lat) },
            ]);
        } else {
            // 4. Create one road task per top road segment
            let count = 0;
            for (const road of roadsRes.rows) {
                const geomJson = JSON.parse(road.clipped_geom_json || road.geom_json);
                if (!geomJson || !geomJson.coordinates || geomJson.coordinates.length < 2) continue;

                // Get start and end coordinates
                let coords;
                if (geomJson.type === 'LineString') {
                    coords = geomJson.coordinates;
                } else if (geomJson.type === 'MultiLineString') {
                    coords = geomJson.coordinates[0];
                } else {
                    continue;
                }

                // Build area_geojson as array of {latitude, longitude}
                const areaPoints = coords.map(c => ({ latitude: c[1], longitude: c[0] }));
                const taskName = `Ward 5 Road - ${road.name || `Segment ${count + 1}`}`;
                await createTask(db, worker.id, ward.id, taskName, `Road maintenance task in Ward 5 (${road.name || 'unnamed segment'})`, areaPoints);
                count++;
                console.log(`Created task: ${taskName}`);
            }
        }

        // 5. Summary
        const taskCheck = await db.query(`
            SELECT t.id, t.title, t.status, w.name as ward_name
            FROM tasks t
            JOIN wards w ON t.ward_id = w.id
            WHERE t.assigned_worker_id = $1
            ORDER BY t.created_at DESC
        `, [worker.id]);
        console.log('\n=== Tasks assigned to Jawan 5 ===');
        console.table(taskCheck.rows);

        process.exit(0);
    } catch (err) {
        console.error('Fatal error:', err);
        process.exit(1);
    }
}

async function createTask(db, workerId, wardId, title, description, areaPoints) {
    const geojson = {
        type: 'LineString',
        coordinates: areaPoints.map(p => [p.longitude, p.latitude])
    };
    const sourceQr = `START_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const destQr   = `END_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    await db.query(`
        INSERT INTO tasks (title, description, area_geojson, geom, assigned_worker_id, ward_id, task_type, source_qr_id, destination_qr_id, status)
        VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, $6, 'road', $7, $8, 'pending')
    `, [
        title,
        description,
        JSON.stringify(areaPoints),
        JSON.stringify(geojson),
        workerId,
        wardId,
        sourceQr,
        destQr
    ]);
}

run();
