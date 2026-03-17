const db = require('./src/config/db');

const seed = async () => {
  try {
    console.log('Seeding initial municipal data...');

    // 1. Create Wards
    const wards = await db.query(`
      INSERT INTO wards (name, boundary_geojson) VALUES 
      ('Ward 1 - Khammam Fort', '{"type": "Polygon", "coordinates": [[[80.151, 17.247], [80.153, 17.247], [80.153, 17.249], [80.151, 17.249], [80.151, 17.247]]]}'),
      ('Ward 2 - NSP Colony', '{"type": "Polygon", "coordinates": [[[80.153, 17.247], [80.155, 17.247], [80.155, 17.249], [80.153, 17.249], [80.153, 17.247]]]}'),
      ('Ward 3 - Wyra Road', '{"type": "Polygon", "coordinates": [[[80.151, 17.245], [80.153, 17.245], [80.153, 17.247], [80.151, 17.247], [80.151, 17.245]]]}')
      RETURNING id;
    `);
    const w1Id = wards.rows[0].id;
    console.log('Wards seeded.');

    // 2. Create Machines
    const machines = await db.query(`
      INSERT INTO machines (name, type) VALUES 
      ('Road Cleaner MVC-01', 'Heavy Duty Sweeper'),
      ('Road Cleaner MVC-02', 'Compact Sweeper')
      RETURNING id;
    `);
    console.log('Machines seeded.');

    // 3. Create 3 Sample Roads (Tasks)
    // Road coordinates in Khammam
    const road1 = [
        {latitude: 17.24716, longitude: 80.15144},
        {latitude: 17.24850, longitude: 80.15250},
        {latitude: 17.25000, longitude: 80.15400}
    ];
    const road2 = [
        {latitude: 17.24600, longitude: 80.15000},
        {latitude: 17.24650, longitude: 80.15300},
        {latitude: 17.24700, longitude: 80.15600}
    ];
    const road3 = [
        {latitude: 17.25100, longitude: 80.15500},
        {latitude: 17.25300, longitude: 80.15700},
        {latitude: 17.25500, longitude: 80.15900}
    ];

    await db.query(`
      INSERT INTO tasks (title, description, area_geojson, ward_id, task_type, source_qr_id, destination_qr_id, status) VALUES 
      ('Main Fort Road Cleaning', 'Complete sanitization of Fort Road', $1, $2, 'road', 'FORT_START_01', 'FORT_END_01', 'pending'),
      ('Wyra Road Stretch', 'Sanitary cleaning from Junction to Colony', $3, $2, 'road', 'WYRA_START_01', 'WYRA_END_01', 'pending'),
      ('NSP Colony Interior', 'Internal road cleaning for Ward 2', $4, $2, 'road', 'NSP_START_01', 'NSP_END_01', 'pending')
    `, [JSON.stringify(road1), w1Id, JSON.stringify(road2), JSON.stringify(road3)]);

    console.log('Sample roads seeded.');
    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seed();
