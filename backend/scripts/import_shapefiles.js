const shapefile = require('shapefile');
const db = require('../src/config/db');
const path = require('path');

async function importShapefile(filePath, type) {
    console.log(`Importing ${type} from ${filePath}...`);
    try {
        const source = await shapefile.open(filePath);
        let count = 0;
        
        while (true) {
            const result = await source.read();
            if (result.done) break;

            const feature = result.value;
            const properties = feature.properties || {};
            const name = properties.name || properties.NAME || properties.ROAD_NAME || null;
            const geom = JSON.stringify(feature.geometry);

            try {
                await db.query(
                    'INSERT INTO infrastructure (name, type, properties, geom) VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))',
                    [name, type, JSON.stringify(properties), geom]
                );
                count++;
                if (count % 100 === 0) console.log(`Imported ${count} features...`);
            } catch (err) {
                console.error(`Error importing feature ${count}:`, err.message);
            }
        }
        console.log(`Successfully imported ${count} ${type} features.`);
    } catch (err) {
        console.error(`Failed to import ${type}:`, err.stack);
    }
}

async function run() {
    const rootPath = 'c:/khammam project';
    
    // Clear existing infrastructure to avoid duplicates during development
    await db.query('DELETE FROM infrastructure');
    console.log('Cleared existing infrastructure.');

    await importShapefile(path.join(rootPath, 'Khammam_Road_Network.shp'), 'road');
    await importShapefile(path.join(rootPath, 'Right of Way.shp'), 'row');
    await importShapefile(path.join(rootPath, 'Building_footprints.shp'), 'building');
    
    console.log('All shapefiles imported successfully!');
    process.exit(0);
}

run();
