const db = require('./src/config/db');

async function checkTasks() {
    try {
        console.log('--- Tasks in DB ---');
        const tasks = await db.query('SELECT id, title, ward_id, assigned_worker_id, status FROM tasks');
        console.log(JSON.stringify(tasks.rows, null, 2));

        console.log('\n--- Wards in DB ---');
        const wards = await db.query('SELECT id, name, supervisor_id FROM wards');
        console.log(JSON.stringify(wards.rows, null, 2));

        console.log('\n--- Users in DB ---');
        const users = await db.query('SELECT id, name, email, role FROM users');
        console.log(JSON.stringify(users.rows, null, 2));

    } catch (error) {
        console.error('Debug failed:', error);
    } finally {
        process.exit();
    }
}

checkTasks();
