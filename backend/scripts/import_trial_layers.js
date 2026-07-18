const shapefile = require('shapefile');
const db = require('../src/config/db');
const path = require('path');

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
        console.error(`Failed to import roads:`, err.stack);
    }
}

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
            const name = `Ward ${wardNo}`;
            const geom = JSON.stringify(feature.geometry);

            // Assign supervisors to make them manageable (supervisor ID 7 to Ward 53, supervisor ID 11 to Ward 1)
            let supervisorId = null;
            if (parseInt(wardNo) === 53) {
                supervisorId = 7;
            } else if (parseInt(wardNo) === 1) {
                supervisorId = 11;
            }

            try {
                // 1. Insert into wards table for supervisor management and stats
                const wardRes = await db.query(
                    `INSERT INTO wards (name, boundary_geojson, supervisor_id, geom)
                     VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 32644), 4326))
                     RETURNING id`,
                    [name, geom, supervisorId, geom]
                );
                
                // 2. Insert into infrastructure table for global rendering
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
        console.error(`Failed to import wards:`, err.stack);
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
                // Already in WGS84, no transform needed
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
        console.error(`Failed to import Right of Way:`, err.stack);
    }
}

async function run() {
    try {
        // Clear existing tables
        console.log('Clearing existing infrastructure...');
        await db.query('TRUNCATE TABLE infrastructure CASCADE');
        
        console.log('Clearing existing wards...');
        await db.query('TRUNCATE TABLE wards CASCADE');
        
        const rootPath = 'c:/khammam project/QGIS/QGIS';
        
        await importRoads(path.join(rootPath, 'Export_Output_latest.shp'));
        await importWards(path.join(rootPath, 'Export_Output_2.shp'));
        await importRow(path.join(rootPath, 'Export_Output_3.shp'));
        
        console.log('All shapefiles imported successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Fatal error during import:', err);
        process.exit(1);
    }
}

run();
