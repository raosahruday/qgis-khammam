const db = require('../src/config/db');

async function run() {
  try {
    // Count roads in Ward 53
    const roadsRes = await db.query(`
      SELECT id, name, properties->>'JAWAN_NAME' as jawan, properties->>'Ward_No' as ward, properties->>'Line_ID' as line_id
      FROM infrastructure
      WHERE type = 'road' AND properties->>'Ward_No' = '53'
    `);
    console.log(`Total roads in Ward 53: ${roadsRes.rows.length}`);

    // Check where they are assigned in the tasks table
    const tasksRes = await db.query(`
      SELECT 
        t.id as task_id, 
        t.title, 
        t.line_id,
        u.name as assigned_worker,
        w.name as ward_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_worker_id = u.id
      LEFT JOIN wards w ON t.ward_id = w.id
      WHERE t.line_id IN (
        SELECT COALESCE(properties->>'Line_ID', 'RD_' || id) 
        FROM infrastructure 
        WHERE type = 'road' AND properties->>'Ward_No' = '53'
      )
    `);

    console.log(`Tasks matching Ward 53 road Line_IDs: ${tasksRes.rows.length}`);
    const mismatches = tasksRes.rows.filter(t => t.assigned_worker !== 'G Prudhvi');
    console.log(`Tasks assigned to someone else:`, mismatches);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
