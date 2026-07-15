const db = require('../src/config/db');

async function run() {
  try {
    const res = await db.query(`
      SELECT id, name, properties->>'Ward_No' as ward, properties->>'JAWAN_NAME' as jawan, properties->>'Line_ID' as line_id
      FROM infrastructure
      WHERE type = 'road' AND (properties->>'Line_ID' IN ('RD_2893', 'RD_2270', 'RD_2312', 'RD_2299', 'RD_2300') OR id IN (2893, 2270, 2312, 2299, 2300))
    `);
    console.log(res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
