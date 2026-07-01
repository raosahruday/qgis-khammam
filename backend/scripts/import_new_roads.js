const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

async function importNewRoads() {
    try {
        const geojsonPath = path.join(__dirname, '..', '..', 'roadsqgis.geojson');
        console.log('Reading GeoJSON from:', geojsonPath);
        
        const data = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

        console.log('Clearing existing infrastructure data...');
        await db.query('TRUNCATE TABLE infrastructure');

        console.log(`Importing ${data.features.length} features...`);
        
        let count = 0;
        for (const feature of data.features) {
            const geom = feature.geometry;
            if (!geom) continue;

            const props = feature.properties;
            const name = props.Rd_Name || 'Unknown Road';
            const type = 'road';

            const geomJson = JSON.stringify(geom);

            // ST_Transform converts UTM (32644) to GPS (4326)
            const query = `
                INSERT INTO infrastructure (name, type, geom, properties)
                VALUES ($1, $2, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 32644), 4326), $4)
            `;
            
            try {
                await db.query(query, [name, type, geomJson, JSON.stringify(props)]);
                count++;
                if (count % 500 === 0) console.log(`Imported ${count} roads...`);
            } catch (innerErr) {
                console.warn(`Skipping feature ${count}: ${innerErr.message}`);
            }
        }

        console.log(`Successfully imported ${count} roads onto the satellite map!`);
        process.exit(0);
    } catch (err) {
        console.error('Fatal error importing roads:', err);
        process.exit(1);
    }
}

importNewRoads();
