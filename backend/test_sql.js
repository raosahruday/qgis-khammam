const db = require('./src/config/db');

async function checkOwnerTasks() {
    try {
        let query = `
          SELECT t.*, ST_AsGeoJSON(t.geom) as geom_json, u.name as worker_name, w.name as ward_name
          FROM tasks t 
          LEFT JOIN users u ON t.assigned_worker_id = u.id
          LEFT JOIN wards w ON t.ward_id = w.id
        `;
        let params = [];
        let conditions = [];

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        
        const limit = 50;
        const offset = 0;
        // Adding the space before ORDER BY...
        query += ' ORDER BY t.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(parseInt(limit), parseInt(offset));

        console.log("Q:", query);
        console.log("P:", params);

        const tasks = await db.query(query, params);
        console.log(`Found ${tasks.rows.length} tasks!`);
        if(tasks.rows.length > 0) console.log("First:", tasks.rows[0].id, tasks.rows[0].title);
        
    } catch(err) {
        console.error(err.message);
    } finally {
        process.exit();
    }
}
checkOwnerTasks();
