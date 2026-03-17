const db = require('../config/db');

exports.getMachines = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM machines ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get machines error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateMachineLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    
    await db.query(
      'UPDATE machines SET current_lat = $1, current_lng = $2, last_updated = CURRENT_TIMESTAMP WHERE id = $3',
      [latitude, longitude, id]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update machine error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.linkWorkerToMachine = async (req, res) => {
  try {
    const { machineId } = req.body;
    const userId = req.user.id;
    
    await db.query(
      'UPDATE users SET current_machine_id = $1 WHERE id = $2',
      [machineId, userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Link worker to machine error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
