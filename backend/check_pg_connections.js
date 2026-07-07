const db = require('./src/config/db');

async function checkConnections() {
  try {
    const res = await db.query('SELECT count(*), state FROM pg_stat_activity GROUP BY state');
    console.log('Postgres Active Connections:', res.rows);
  } catch (err) {
    console.error('Failed to query pg_stat_activity:', err);
  } finally {
    process.exit();
  }
}
checkConnections();
