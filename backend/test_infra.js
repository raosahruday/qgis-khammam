const db = require('./src/config/db');

async function testInfra() {
  try {
    const types = await db.query('SELECT type, COUNT(*) FROM infrastructure GROUP BY type');
    console.log('Types:', types.rows);

    const sample = await db.query("SELECT id, type, name, properties FROM infrastructure WHERE type = 'road' LIMIT 2");
    console.log('Sample Roads:', JSON.stringify(sample.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
testInfra();
