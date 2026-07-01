const db = require('./src/config/db');

async function checkSchema() {
    try {
        const usersColumns = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        console.log('--- Users Table Columns ---');
        console.table(usersColumns.rows);

        const tasksColumns = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tasks'
        `);
        console.log('\n--- Tasks Table Columns ---');
        console.table(tasksColumns.rows);

        const wardsColumns = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'wards'
        `);
        console.log('\n--- Wards Table Columns ---');
        console.table(wardsColumns.rows);

    } catch (error) {
        console.error('Schema check failed:', error);
    } finally {
        process.exit();
    }
}

checkSchema();
