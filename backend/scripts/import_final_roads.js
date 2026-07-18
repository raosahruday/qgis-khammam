const shapefile = require('shapefile');
const db = require('../src/config/db');
const path = require('path');

async function run() {
    try {
        console.log('Clearing existing tasks and photos...');
        await db.query('DELETE FROM photos');
        await db.query('DELETE FROM tasks');
        
        console.log('Clearing existing roads from infrastructure...');
        await db.query("DELETE FROM infrastructure WHERE type = 'road'");
        
        const filePath = 'c:/khammam project/QGIS/QGIS/Export_Output_latest.shp';
        console.log(`Importing new roads from ${filePath}...`);
        
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
        console.log(`Successfully imported ${count} new road features.`);
        process.exit(0);
    } catch (err) {
        console.error('Fatal error during import:', err);
        process.exit(1);
    }
}

run();
