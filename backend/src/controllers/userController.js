const db = require('../config/db');

exports.getWorkers = async (req, res) => {
  try {
    const user = req.user;
    const targetRole = (user && user.role === 'park_inspector') ? 'park_jawan' : 'worker';
    const query = `
      SELECT u.id, u.name, u.email, u.ward_id, w.name as ward_name,
             COALESCE(u.is_active, TRUE) as is_active,
             COUNT(t.id) as active_task_count
      FROM users u
      LEFT JOIN wards w ON u.ward_id = w.id
      LEFT JOIN tasks t ON u.id = t.assigned_worker_id AND t.status IN ('pending', 'submitted')
      WHERE u.role = $1
      GROUP BY u.id, u.name, u.email, u.ward_id, w.name, u.is_active
      ORDER BY u.name ASC;
    `;
    const result = await db.query(query, [targetRole]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get workers error:', error);
    res.status(500).json({ error: 'Server error retrieving workers' });
  }
};

exports.getWards = async (req, res) => {
  try {
    const user = req.user;
    let query = 'SELECT id, name FROM wards ORDER BY name ASC';
    let params = [];

    // Supervisors only see their own wards
    if (user.role === 'supervisor') {
      query = 'SELECT id, name FROM wards WHERE supervisor_id = $1 ORDER BY name ASC';
      params = [user.id];
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get wards error:', error);
    res.status(500).json({ error: 'Server error retrieving wards' });
  }
};

exports.getPendingRegistrations = async (req, res) => {
  try {
    const query = `
      SELECT id, name, phone, role, divisions
      FROM users
      WHERE approved = false
      ORDER BY id DESC;
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Get pending registrations error:', error);
    res.status(500).json({ error: 'Server error retrieving pending registrations' });
  }
};

exports.approveRegistration = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get user details
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];

    // 2. Perform mappings if divisions are set
    if (user.role === 'worker' && user.divisions) {
      // Find ward matching the worker's single division number
      const divisionNum = user.divisions.trim();
      const wardRes = await db.query(
        "SELECT id FROM wards WHERE name ILIKE $1 LIMIT 1",
        [`%Ward ${divisionNum}%`]
      );
      if (wardRes.rows.length > 0) {
        const wardId = wardRes.rows[0].id;
        await db.query('UPDATE users SET ward_id = $1 WHERE id = $2', [wardId, id]);
        console.log(`Mapped worker ID ${id} to ward ID ${wardId} (Division ${divisionNum})`);
      } else {
        console.warn(`Could not find a ward matching division ${divisionNum} for worker ID ${id}`);
      }
    } else if (user.role === 'supervisor' && user.divisions) {
      // Find wards matching the supervisor's comma-separated division numbers
      const divisionsList = user.divisions.split(',').map(d => d.trim()).filter(Boolean);
      for (const divisionNum of divisionsList) {
        const wardRes = await db.query(
          "SELECT id FROM wards WHERE name ILIKE $1 LIMIT 1",
          [`%Ward ${divisionNum}%`]
        );
        if (wardRes.rows.length > 0) {
          const wardId = wardRes.rows[0].id;
          await db.query('UPDATE wards SET supervisor_id = $1 WHERE id = $2', [id, wardId]);
          console.log(`Mapped ward ID ${wardId} to supervisor ID ${id} (Division ${divisionNum})`);
        } else {
          console.warn(`Could not find a ward matching division ${divisionNum} for supervisor ID ${id}`);
        }
      }
    }

    // 3. Mark user as approved
    await db.query('UPDATE users SET approved = true WHERE id = $1', [id]);

    res.json({ message: 'Registration approved successfully' });
  } catch (error) {
    console.error('Approve registration error:', error);
    res.status(500).json({ error: 'Server error approving registration' });
  }
};

exports.rejectRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user exists and is pending
    const userRes = await db.query('SELECT * FROM users WHERE id = $1 AND approved = false', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pending registration not found' });
    }

    // Delete the pending user
    await db.query('DELETE FROM users WHERE id = $1', [id]);

    res.json({ message: 'Registration rejected and deleted successfully' });
  } catch (error) {
    console.error('Reject registration error:', error);
    res.status(500).json({ error: 'Server error rejecting registration' });
  }
};

exports.transferWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { ward_id } = req.body;

    if (!ward_id) {
      return res.status(400).json({ error: 'ward_id is required' });
    }

    // Verify if ward exists
    const wardRes = await db.query('SELECT * FROM wards WHERE id = $1', [ward_id]);
    if (wardRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ward not found' });
    }

    // Verify if user exists and is a worker/jawan
    const userRes = await db.query('SELECT * FROM users WHERE id = $1 AND role IN (\'worker\', \'park_jawan\')', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Jawan not found' });
    }

    // Update worker's ward
    await db.query('UPDATE users SET ward_id = $1 WHERE id = $2', [ward_id, id]);

    // Also update any of the Jawan's pending/active tasks to have this new ward_id, to keep database consistency
    await db.query('UPDATE tasks SET ward_id = $1 WHERE assigned_worker_id = $2 AND status IN (\'pending\', \'submitted\', \'in_progress\')', [ward_id, id]);

    res.json({ message: 'Jawan transferred successfully' });
  } catch (error) {
    console.error('Transfer worker error:', error);
    res.status(500).json({ error: 'Server error transferring jawan' });
  }
};

exports.toggleWorkerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify if user exists and is a worker/jawan
    const userRes = await db.query("SELECT id, is_active FROM users WHERE id = $1 AND role IN ('worker', 'park_jawan')", [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Jawan not found' });
    }
    
    const currentActive = userRes.rows[0].is_active === false ? false : true;
    const newActive = !currentActive;
    
    await db.query("UPDATE users SET is_active = $1 WHERE id = $2", [newActive, id]);
    
    res.json({ message: `Jawan ${newActive ? 'activated' : 'deactivated'} successfully`, is_active: newActive });
  } catch (error) {
    console.error('Toggle worker status error:', error);
    res.status(500).json({ error: 'Server error toggling worker status' });
  }
};


