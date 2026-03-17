const db = require('../config/db');

exports.getWorkers = async (req, res) => {
  try {
    // Get all users with role 'worker' and count their assigned tasks
    const query = `
      SELECT u.id, u.name, u.email, 
             COUNT(t.id) as active_task_count
      FROM users u
      LEFT JOIN tasks t ON u.id = t.assigned_worker_id AND t.status IN ('pending', 'submitted')
      WHERE u.role = 'worker'
      GROUP BY u.id, u.name, u.email
      ORDER BY u.name ASC;
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Get workers error:', error);
    res.status(500).json({ error: 'Server error retrieving workers' });
  }
};
