const db = require('./src/config/db');

async function migrate() {
    try {
        console.log('Starting spatial migration...');

        // 1. Add Geometry columns to Wards
        await db.query(`
            ALTER TABLE wards ADD COLUMN IF NOT EXISTS geom GEOMETRY(Polygon, 4326);
        `);
        console.log('Added geom column to wards.');

        // 2. Add Geometry column to Tasks
        await db.query(`
            ALTER TABLE tasks ADD COLUMN IF NOT EXISTS geom GEOMETRY(Geometry, 4326);
        `);
        console.log('Added geom column to tasks.');

        // 3. Migrate data from JSONB to Geometry for Wards
        // We assume boundary_geojson is a Polygon
        await db.query(`
            UPDATE wards 
            SET geom = ST_SetSRID(ST_GeomFromGeoJSON(boundary_geojson::text), 4326)
            WHERE boundary_geojson IS NOT NULL AND geom IS NULL;
        `);
        console.log('Migrated ward boundaries.');

        // 4. Migrate data from JSONB to Geometry for Tasks
        // We handle both Area (Polygon) and Road (LineString) types
        // The script needs to handle the custom format we used [ {lat, lng}, ... ]
        // I'll create a helper function to convert our custom array format to GeoJSON LineString
        
        const tasks = await db.query('SELECT id, area_geojson, task_type FROM tasks WHERE area_geojson IS NOT NULL AND geom IS NULL');
        
        for (const task of tasks.rows) {
            try {
                let geojson;
                const data = typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson;
                
                if (Array.isArray(data)) {
                    // Convert [{latitude, longitude}] to GeoJSON LineString
                    geojson = {
                        type: 'LineString',
                        coordinates: data.map(p => [parseFloat(p.longitude), parseFloat(p.latitude)])
                    };
                } else {
                    geojson = data;
                }

                await db.query('UPDATE tasks SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) WHERE id = $2', [JSON.stringify(geojson), task.id]);
            } catch (err) {
                console.error(`Failed to migrate task ${task.id}:`, err.message);
            }
        }
        console.log('Migrated task areas/roads.');

        console.log('Spatial migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
