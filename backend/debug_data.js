const db = require('./src/config/db');

async function debugData() {
    try {
        console.log('--- Users ---');
        const users = await db.query('SELECT id, name, email, role, current_machine_id FROM users');
        console.log(JSON.stringify(users.rows, null, 2));

        console.log('\n--- Wards ---');
        const wards = await db.query('SELECT id, name, supervisor_id FROM wards');
        console.log(JSON.stringify(wards.rows, null, 2));

        console.log('\n--- Recent Tasks ---');
        const tasks = await db.query('SELECT id, title, ward_id, assigned_worker_id, status FROM tasks ORDER BY created_at DESC LIMIT 5');
        console.log(JSON.stringify(tasks.rows, null, 2));

    } catch (error) {
        console.error('Debug failed:', error);
    } finally {
        process.exit();
    }
}

debugData();
