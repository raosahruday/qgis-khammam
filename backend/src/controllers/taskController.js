const db = require('../config/db');
const crypto = require('crypto');

// Calculate distance between two points in meters
const getDistanceFromLatLonInM = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
};

// --- QR & Progress Flow ---

exports.verifyQR = async (req, res) => {
  try {
    const { taskId, qrCode, type } = req.body; // type: 'source' or 'destination'
    const taskResult = await db.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = taskResult.rows[0];

    const expectedQR = type === 'source' ? task.source_qr_id : task.destination_qr_id;

    if (qrCode === expectedQR) {
      const newStatus = type === 'source' ? 'in_progress' : 'submitted';
      await db.query('UPDATE tasks SET status = $1 WHERE id = $2', [newStatus, taskId]);
      return res.json({ success: true, message: `QR Verified. Task status updated to ${newStatus}.`, status: newStatus });
    } else {
      return res.status(400).json({ error: 'Invalid QR code for this task location.' });
    }
  } catch (error) {
    console.error('Verify QR error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateLiveProgress = async (req, res) => {
  try {
    const { taskId, latitude, longitude, pointIndex } = req.body;
    
    // Update task progress if the machine has reached a new point in the road polyline
    await db.query(
      'UPDATE tasks SET last_point_reached = $1 WHERE id = $2',
      [pointIndex, taskId]
    );

    // Update machine live location
    await db.query(
      'UPDATE machines SET current_lat = $1, current_lng = $2, last_updated = CURRENT_TIMESTAMP WHERE active_task_id = $3',
      [latitude, longitude, taskId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// --- Task Management ---

exports.createTask = async (req, res) => {
  try {
    const { title, description, area_geojson, assignedWorkerId, wardId, taskType, sourceQr, destinationQr } = req.body;
    
    // Prepare geometry from geojson or custom coordinate array
    let geojson = area_geojson;
    if (Array.isArray(area_geojson)) {
        geojson = {
            type: 'LineString',
            coordinates: area_geojson.map(p => [parseFloat(p.longitude), parseFloat(p.latitude)])
        };
    }

    const finalSourceQr = sourceQr || `START_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const finalDestinationQr = destinationQr || `END_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const newTask = await db.query(
      `INSERT INTO tasks (title, description, area_geojson, geom, assigned_worker_id, ward_id, task_type, source_qr_id, destination_qr_id, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, $6, $7, $8, $9, 'pending') RETURNING *, ST_AsGeoJSON(geom) as geom_json`,
      [title, description, JSON.stringify(area_geojson), JSON.stringify(geojson), assignedWorkerId || null, wardId || null, taskType || 'area', finalSourceQr, finalDestinationQr]
    );

    res.status(201).json(newTask.rows[0]);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTasks = async (req, res) => {
  try {
    const user = req.user;
    const { status, limit = 50, offset = 0, minLat, maxLat, minLng, maxLng } = req.query;
    
    let query = `
      SELECT t.*, ST_AsGeoJSON(t.geom) as geom_json, u.name as worker_name, w.name as ward_name
      FROM tasks t 
      LEFT JOIN users u ON t.assigned_worker_id = u.id
      LEFT JOIN wards w ON t.ward_id = w.id
    `;
    let params = [];
    let conditions = [];

    if (user.role === 'worker') {
      conditions.push('t.assigned_worker_id = $' + (params.length + 1));
      params.push(user.id);
    } else if (user.role === 'supervisor') {
      conditions.push('w.supervisor_id = $' + (params.length + 1));
      params.push(user.id);
    }

    if (status) {
      conditions.push('t.status = $' + (params.length + 1));
      params.push(status);
    }

    if (minLat && maxLat && minLng && maxLng) {
      conditions.push(`t.geom && ST_MakeEnvelope($${params.length + 1}, $${params.length + 2}, $${params.length + 3}, $${params.length + 4}, 4326)`);
      params.push(parseFloat(minLng), parseFloat(minLat), parseFloat(maxLng), parseFloat(maxLat));
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));

    const tasks = await db.query(query, params);
    res.json(tasks.rows);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await db.query(`
      SELECT t.*, ST_AsGeoJSON(t.geom) as geom_json, u.name as worker_name, w.name as ward_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_worker_id = u.id
      LEFT JOIN wards w ON t.ward_id = w.id
      WHERE t.id = $1
    `, [id]);
    
    if (task.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(task.rows[0]);
  } catch (error) {
    console.error('Get task by id error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.assignTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { workerId } = req.body;
    const updatedTask = await db.query('UPDATE tasks SET assigned_worker_id = $1 WHERE id = $2 RETURNING *', [workerId, id]);
    res.json(updatedTask.rows[0]);
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// --- Ward Aggregation ---

exports.getWardStats = async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        w.id, w.name, w.boundary_geojson, ST_AsGeoJSON(w.geom) as geom_json,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.status = 'approved' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN t.status IN ('in_progress', 'submitted') THEN 1 END) as active_tasks,
        COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_tasks
      FROM wards w
      LEFT JOIN tasks t ON w.id = t.ward_id
      GROUP BY w.id
    `);
    res.json(stats.rows);
  } catch (error) {
    console.error('Get ward stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// --- Photo Handling & Status ---

exports.uploadPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const taskResult = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    const task = taskResult.rows[0];
    const imageUrl = `/uploads/${req.file.filename}`;

    await db.query(
      'INSERT INTO photos (task_id, worker_id, image_url, latitude, longitude) VALUES ($1, $2, $3, $4, $5)',
      [id, req.user.id, imageUrl, latitude, longitude]
    );

    await db.query("UPDATE tasks SET status = 'submitted' WHERE id = $1", [id]);
    res.status(201).json({ message: 'Photo uploaded successfully' });
  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTaskPhotos = async (req, res) => {
  try {
    const { id } = req.params;
    const photos = await db.query('SELECT * FROM photos WHERE task_id = $1 ORDER BY uploaded_at DESC', [id]);
    res.json(photos.rows);
  } catch (error) {
    console.error('Get task photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log(`Updating task ${id} to status: ${status}`);
    
    const updated = await db.query("UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *", [status, id]);
    
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};
exports.resetTask = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await db.query(
      "UPDATE tasks SET status = 'pending', last_point_reached = 0 WHERE id = $1 RETURNING *",
      [id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Reset task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Optional: Delete related photos/records if needed, but for now simple delete
    const deleted = await db.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);
    
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted successfully', task: deleted.rows[0] });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteAllTasks = async (req, res) => {
  try {
    const user = req.user;
    let query, params, photoQuery;

    if (user.role === 'owner') {
      photoQuery = 'DELETE FROM photos';
      query = 'DELETE FROM tasks';
      params = [];
    } else if (user.role === 'supervisor') {
      // Delete photos for tasks in supervisor's wards
      photoQuery = `
        DELETE FROM photos 
        WHERE task_id IN (
          SELECT t.id FROM tasks t 
          JOIN wards w ON t.ward_id = w.id 
          WHERE w.supervisor_id = $1
        )
      `;
      query = `
        DELETE FROM tasks 
        WHERE ward_id IN (SELECT id FROM wards WHERE supervisor_id = $1)
      `;
      params = [user.id];
    } else {
      return res.status(403).json({ error: 'Permission denied' });
    }

    if (photoQuery) {
        await db.query(photoQuery, params);
    }
    const result = await db.query(query, params);
    console.log(`Bulk delete by ${user.role} (${user.id}): ${result.rowCount} tasks removed.`);
    res.json({ message: 'Success', deletedCount: result.rowCount });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};
