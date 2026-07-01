const db = require('./src/config/db');

async function testAssign() {
    try {
        const res = await db.query(`
           SELECT t.id as task_id, w.id as ward_id, w.name
           FROM tasks t
           JOIN wards w ON ST_Intersects(w.geom, t.geom)
           WHERE t.ward_id IS NULL
           LIMIT 5
        `);
        console.log("Spatial matches for unassigned tasks:", res.rows);
    } catch(err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
testAssign();
