const db = require('./src/config/db');

async function debug() {
    try {
        const users = await db.query('SELECT * FROM users ORDER BY id DESC LIMIT 5');
        console.log("USERS:", users.rows.map(u => ({id: u.id, name: u.name, role: u.role})));

        const wards = await db.query('SELECT id, name, supervisor_id FROM wards');
        console.log("WARDS:", wards.rows);

        const tasks = await db.query('SELECT id, title, ward_id, assigned_worker_id FROM tasks ORDER BY id DESC LIMIT 3');
        console.log("TASKS:", tasks.rows);
    } catch(err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
debug();
