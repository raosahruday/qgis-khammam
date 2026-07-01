const db = require('../src/config/db');

async function check() {
  try {
    const res = await db.query(
      `SELECT name, ST_AsText(geom) as geom_text, ST_AsGeoJSON(geom) as geom_json 
       FROM infrastructure 
       WHERE type = 'road' AND properties->>'Ward_No' = '61' 
       LIMIT 3`
    );
    console.log('Coordinates of Ward 61 roads in DB:');
    res.rows.forEach(r => {
      console.log('Name:', r.name);
      console.log('Geom Text:', r.geom_text);
    });
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

check();
