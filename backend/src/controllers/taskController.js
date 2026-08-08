const db = require('../config/db');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { evaluateTaskPhoto } = require('../services/aiVisionService');

// Sort and align segments of a MultiLineString to form a continuous line
function sortAndAlignSegments(segments) {
  if (!segments || segments.length === 0) return [];
  
  let remaining = segments.map(s => [...s]);
  let chain = [...remaining.shift()];
  
  const distance = (p1, p2) => {
    return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
  };
  
  const threshold = 0.001; // roughly 100 meters

  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    let bestDist = Infinity;
    let bestMode = '';
    let bestIdx = -1;

    const startPoint = chain[0];
    const endPoint = chain[chain.length - 1];

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const segStart = seg[0];
      const segEnd = seg[seg.length - 1];

      const dEndStart = distance(endPoint, segStart);
      const dEndEnd = distance(endPoint, segEnd);
      const dStartEnd = distance(startPoint, segEnd);
      const dStartStart = distance(startPoint, segStart);

      const minDist = Math.min(dEndStart, dEndEnd, dStartEnd, dStartStart);
      if (minDist < threshold && minDist < bestDist) {
        bestDist = minDist;
        bestIdx = i;
        if (minDist === dEndStart) {
          bestMode = 'append';
        } else if (minDist === dEndEnd) {
          bestMode = 'append-reversed';
        } else if (minDist === dStartEnd) {
          bestMode = 'prepend';
        } else {
          bestMode = 'prepend-reversed';
        }
      }
    }

    if (bestIdx !== -1) {
      const seg = remaining.splice(bestIdx, 1)[0];
      if (bestMode === 'append') {
        chain.push(...seg.slice(1));
      } else if (bestMode === 'append-reversed') {
        chain.push(...seg.slice(0, -1).reverse());
      } else if (bestMode === 'prepend') {
        chain.unshift(...seg.slice(0, -1));
      } else if (bestMode === 'prepend-reversed') {
        chain.unshift(...seg.reverse().slice(1));
      }
      progress = true;
    }
  }

  while (remaining.length > 0) {
    chain.push(...remaining.shift());
  }

  return chain;
}

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

const normalizeName = (name) => {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
    .replace(/shw/g, 'sw')
    .replace(/narayan$/g, 'narayana')
    .replace(/srinivasa/g, 'srinivas');
};

const isJawanMatch = (name1, name2) => {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) {
    const shorter = n1.length < n2.length ? n1 : n2;
    if (shorter.length >= 6) return true;
  }
  return false;
};

const hasActiveWorkerMatch = (jawanName, activeWorkerNames) => {
  for (const workerName of activeWorkerNames) {
    if (isJawanMatch(jawanName, workerName)) {
      return true;
    }
  }
  return false;
};

// --- QR & Progress Flow ---

exports.verifyQR = async (req, res) => {
  try {
    const { taskId, qrCode, type } = req.body; // type: 'source' or 'destination'
    const taskResult = await db.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = taskResult.rows[0];

    const isParkTask = (task.task_type === 'park');
    const isParkUser = (req.user && (req.user.role === 'park_jawan' || req.user.role === 'park_inspector'));

    if (isParkTask && !isParkUser) {
      return res.status(403).json({ error: 'Access denied to park task' });
    }
    if (!isParkTask && isParkUser) {
      return res.status(403).json({ error: 'Access denied to road task' });
    }

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

exports.swipeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, latitude, longitude } = req.body; // type: 'start' or 'complete'
    
    const taskResult = await db.query(
      `SELECT t.*, w.name as ward_name 
       FROM tasks t 
       LEFT JOIN wards w ON t.ward_id = w.id 
       WHERE t.id = $1`, 
      [id]
    );
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = taskResult.rows[0];

    const isParkTask = (task.task_type === 'park');
    const isParkUser = (req.user && (req.user.role === 'park_jawan' || req.user.role === 'park_inspector'));

    if (isParkTask && !isParkUser) {
      return res.status(403).json({ error: 'Access denied to park task' });
    }
    if (!isParkTask && isParkUser) {
      return res.status(403).json({ error: 'Access denied to road task' });
    }

    const points = (typeof task.area_geojson === 'string' ? JSON.parse(task.area_geojson) : task.area_geojson) || [];
    if (points.length === 0) {
      return res.status(400).json({ error: 'Task coordinates are missing.' });
    }

    if (type === 'start') {
      const isPark = task.task_type === 'park';
      const isWard61 = task.ward_name && task.ward_name.includes('61');
      if (!isPark && !isWard61) {
        const targetPoint = points[0];
        const dist = getDistanceFromLatLonInM(
          parseFloat(latitude), 
          parseFloat(longitude), 
          parseFloat(targetPoint.latitude), 
          parseFloat(targetPoint.longitude)
        );

        if (dist > 150) {
          return res.status(400).json({ 
            error: `Too far away. You are ${Math.round(dist)}m away from the Start Point. You must be within 150m to start the task.` 
          });
        }
      }

      // Retain all uploaded photo proofs for historical inspection audit
    }

    if (type === 'complete' || type === 'submit') {
      const isPark = task.task_type === 'park';
      const minPhotosRequired = isPark ? 4 : 1;
      const photosCheck = await db.query('SELECT image_url FROM photos WHERE task_id = $1 ORDER BY uploaded_at DESC', [id]);
      const currentCount = photosCheck.rows.length;
      
      if (currentCount < minPhotosRequired) {
        return res.status(400).json({ 
          error: isPark 
            ? `Please upload at least 4 photo proofs (current: ${currentCount}/4) first before completing the task.`
            : 'Please upload a photo proof first before completing the task.' 
        });
      }

      // Automated AI Inspection triggered ONLY when Complete Task button is pressed
      const photoUrl = photosCheck.rows[0].image_url;
      const fullPhotoUrl = photoUrl.startsWith('http') 
        ? photoUrl 
        : `${req.protocol}://${req.get('host')}${photoUrl}`;

      console.log(`[AI Assessment] Inspecting task photo upon completion click: ${fullPhotoUrl}`);
      const aiResult = await evaluateTaskPhoto(fullPhotoUrl, task.task_type, task.title);

      await db.query(
        `UPDATE tasks 
         SET status = $1, ai_score = $2, ai_reason = $3, review_comment = $3 
         WHERE id = $4`,
        [aiResult.status, aiResult.aiScore, aiResult.aiReason, id]
      );

      return res.json({ 
        success: true, 
        status: aiResult.status, 
        ai_score: aiResult.aiScore,
        ai_reason: aiResult.aiReason,
        message: aiResult.status === 'approved' 
          ? `Task completed & AI approved (${aiResult.aiScore}%).`
          : `Task completed but AI rejected (${aiResult.aiScore}%): ${aiResult.aiReason}` 
      });
    }

    const newStatus = type === 'start' ? 'in_progress' : 'submitted';
    await db.query('UPDATE tasks SET status = $1 WHERE id = $2', [newStatus, id]);
    
    res.json({ success: true, status: newStatus, message: `Task status updated to ${newStatus} successfully.` });
  } catch (error) {
    console.error('Swipe status error:', error);
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
    const { title, description, area_geojson, assignedWorkerId, wardId, taskType, sourceQr, destinationQr, lineId, rdName } = req.body;
    const user = req.user;
    
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

    // Fix for supervisor dashboard: auto-assign to a managed ward if wardId is null
    let finalWardId = wardId;
    if (!finalWardId && user && user.role === 'supervisor') {
        const wardQuery = await db.query('SELECT id FROM wards WHERE supervisor_id = $1 LIMIT 1', [user.id]);
        if (wardQuery.rows.length > 0) {
            finalWardId = wardQuery.rows[0].id;
        }
    }

    const newTask = await db.query(
      `INSERT INTO tasks (title, description, area_geojson, geom, assigned_worker_id, ward_id, task_type, source_qr_id, destination_qr_id, status, line_id, rd_name)
       VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, $6, $7, $8, $9, 'pending', $10, $11) RETURNING *, ST_AsGeoJSON(geom) as geom_json`,
      [title, description, JSON.stringify(area_geojson), JSON.stringify(geojson), assignedWorkerId || null, finalWardId || null, taskType || 'area', finalSourceQr, finalDestinationQr, lineId || null, rdName || title]
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
    const { status, task_type, limit = 1000, offset = 0, minLat, maxLat, minLng, maxLng } = req.query;


    
    let query = `
      SELECT t.*, ST_AsGeoJSON(t.geom) as geom_json, u.name as worker_name,
             COALESCE(w.name, CASE WHEN t.assigned_worker_id = (SELECT id FROM users WHERE email = 'jawan_highway@test.com') THEN 'Highway' ELSE NULL END) as ward_name
      FROM tasks t 
      LEFT JOIN users u ON t.assigned_worker_id = u.id
      LEFT JOIN wards w ON t.ward_id = w.id
    `;
    let params = [];
    let conditions = [];

    // Filter task type strictly based on user roles
    if (user.role === 'park_jawan' || user.role === 'park_inspector') {
      conditions.push("t.task_type = 'park'");
    } else if (user.role === 'worker' || user.role === 'supervisor' || user.role === 'owner') {
      conditions.push("t.task_type != 'park'");
    }

    if (user.role === 'worker' || user.role === 'park_jawan') {
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

    if (task_type) {
      const isParkRole = (user.role === 'park_jawan' || user.role === 'park_inspector');
      if (task_type === 'park' && !isParkRole) {
        conditions.push("1 = 0");
      } else if (task_type !== 'park' && isParkRole) {
        conditions.push("1 = 0");
      } else {
        conditions.push('t.task_type = $' + (params.length + 1));
        params.push(task_type);
      }
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
    const user = req.user;
    
    if (typeof id === 'string' && id.startsWith('virtual-')) {
      const roadId = parseInt(id.split('-')[1]);
      const roadResult = await db.query('SELECT *, ST_AsGeoJSON(geom) as geom_json FROM infrastructure WHERE id = $1', [roadId]);
      if (roadResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
      const road = roadResult.rows[0];

      let lineId = road.properties?.Line_ID || road.properties?.line_id || null;
      if (lineId) {
        const isWard61 = road.properties?.Ward_No === '61' || road.properties?.ward_no === '61';
        const dupCheck = await db.query(
          `SELECT COUNT(*) FROM infrastructure WHERE properties->>'Line_ID' = $1`,
          [lineId]
        );
        const isDuplicate = parseInt(dupCheck.rows[0].count) > 1;
        const targetLineId = (isWard61 && isDuplicate) ? `${lineId}_${road.id}` : lineId;

        const existingTask = await db.query(`
          SELECT t.*, ST_AsGeoJSON(t.geom) as geom_json, u.name as worker_name,
                 COALESCE(w.name, CASE WHEN t.assigned_worker_id = (SELECT id FROM users WHERE email = 'jawan_highway@test.com') THEN 'Highway' ELSE NULL END) as ward_name
          FROM tasks t
          LEFT JOIN users u ON t.assigned_worker_id = u.id
          LEFT JOIN wards w ON t.ward_id = w.id
          WHERE t.line_id = $1
        `, [targetLineId]);
        if (existingTask.rows.length > 0) {
          return res.json(existingTask.rows[0]);
        }
      }

      const geom = JSON.parse(road.geom_json);
      let areaGeojson = [];
      if (geom.type === 'LineString') {
        areaGeojson = geom.coordinates.map(c => ({ longitude: c[0], latitude: c[1] }));
      } else if (geom.type === 'MultiLineString') {
        const aligned = sortAndAlignSegments(geom.coordinates);
        areaGeojson = aligned.map(c => ({ longitude: c[0], latitude: c[1] }));
      }

      const wardNo = road.properties?.Ward_No || road.properties?.ward_no;
      let wardId = null;
      let wardName = '';
      if (wardNo) {
        const wardRes = await db.query('SELECT id, name FROM wards WHERE name ILIKE $1 LIMIT 1', [`%Ward ${wardNo}%`]);
        if (wardRes.rows.length > 0) {
          wardId = wardRes.rows[0].id;
          wardName = wardRes.rows[0].name;
        }
      }

      const jawanName = road.properties?.JAWAN_NAME || road.properties?.jawan_name || null;
      let workerId = null;
      let workerName = 'Unassigned';
      if (jawanName) {
        const jawanRes = await db.query("SELECT id, name FROM users WHERE role = 'worker' AND name ILIKE $1 LIMIT 1", [jawanName.trim()]);
        if (jawanRes.rows.length > 0) {
          workerId = jawanRes.rows[0].id;
          workerName = jawanRes.rows[0].name;
        } else {
          workerName = jawanName;
        }
      }

      const title = road.name || road.properties?.Rd_Name || 'Unnamed Road';
      const description = 'Assigned from road network';
      const rdName = road.properties?.Rd_Name || road.properties?.rd_name || road.name || null;

      const crypto = require('crypto');
      const finalSourceQr = `START_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const finalDestinationQr = `END_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      // Check if duplicate globally and in Ward 61 to ensure we insert with the correct targetLineId
      let targetLineId = lineId;
      if (lineId) {
        const isWard61 = road.properties?.Ward_No === '61' || road.properties?.ward_no === '61';
        const dupCheck = await db.query(
          `SELECT COUNT(*) FROM infrastructure WHERE properties->>'Line_ID' = $1`,
          [lineId]
        );
        if (isWard61 && parseInt(dupCheck.rows[0].count) > 1) {
          targetLineId = `${lineId}_${road.id}`;
        }
      }

      const insertResult = await db.query(
        `INSERT INTO tasks (title, description, area_geojson, geom, assigned_worker_id, ward_id, task_type, source_qr_id, destination_qr_id, status, line_id, rd_name)
         VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4), $5, $6, 'road', $7, $8, 'pending', $9, $10)
         RETURNING *`,
        [title, description, JSON.stringify(areaGeojson), road.geom_json, workerId, wardId, finalSourceQr, finalDestinationQr, targetLineId, rdName]
      );

      const materialized = insertResult.rows[0];
      return res.json({
        ...materialized,
        worker_name: workerName,
        ward_name: wardName,
        geom_json: road.geom_json
      });
    }

    const taskRes = await db.query(`
      SELECT t.*, ST_AsGeoJSON(t.geom) as geom_json, u.name as worker_name,
             COALESCE(w.name, CASE WHEN t.assigned_worker_id = (SELECT id FROM users WHERE email = 'jawan_highway@test.com') THEN 'Highway' ELSE NULL END) as ward_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_worker_id = u.id
      LEFT JOIN wards w ON t.ward_id = w.id
      WHERE t.id = $1
    `, [id]);
    
    if (taskRes.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = taskRes.rows[0];
    
    // Segregation check for task details access
    const isParkUser = (user && (user.role === 'park_jawan' || user.role === 'park_inspector'));
    if (task.task_type === 'park' && !isParkUser) {
      return res.status(403).json({ error: 'Access denied to park task' });
    }
    if (task.task_type !== 'park' && isParkUser) {
      return res.status(403).json({ error: 'Access denied to road task' });
    }
    
    res.json(task);
  } catch (error) {
    console.error('Get task by id error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.assignTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { workerId } = req.body;
    const user = req.user;

    // Validate role permissions for assignment
    if (workerId) {
      const workerRes = await db.query('SELECT role FROM users WHERE id = $1', [workerId]);
      if (workerRes.rows.length === 0) {
        return res.status(400).json({ error: 'Worker not found' });
      }
      const workerRole = workerRes.rows[0].role;
      
      let isParkTask = false;
      if (!(typeof id === 'string' && id.startsWith('virtual-'))) {
        const taskCheck = await db.query('SELECT task_type FROM tasks WHERE id = $1', [id]);
        if (taskCheck.rows.length > 0 && taskCheck.rows[0].task_type === 'park') {
          isParkTask = true;
        }
      }

      if (isParkTask) {
        if (user.role !== 'park_inspector') {
          return res.status(403).json({ error: 'Only Park Inspectors can assign park tasks.' });
        }
        if (workerRole !== 'park_jawan') {
          return res.status(400).json({ error: 'Park tasks can only be assigned to Park Jawans.' });
        }
      } else {
        if (user.role !== 'supervisor' && user.role !== 'owner') {
          return res.status(403).json({ error: 'Only Sanitary Inspectors can assign road tasks.' });
        }
        if (workerRole !== 'worker') {
          return res.status(400).json({ error: 'Road tasks can only be assigned to Road Jawans.' });
        }
      }
    }

    if (typeof id === 'string' && id.startsWith('virtual-')) {
      const roadId = parseInt(id.split('-')[1]);
      const roadResult = await db.query('SELECT *, ST_AsGeoJSON(geom) as geom_json FROM infrastructure WHERE id = $1', [roadId]);
      if (roadResult.rows.length === 0) return res.status(404).json({ error: 'Road segment not found' });
      const road = roadResult.rows[0];

      const geom = JSON.parse(road.geom_json);
      let areaGeojson = [];
      if (geom.type === 'LineString') {
        areaGeojson = geom.coordinates.map(c => ({ longitude: c[0], latitude: c[1] }));
      } else if (geom.type === 'MultiLineString') {
        const aligned = sortAndAlignSegments(geom.coordinates);
        areaGeojson = aligned.map(c => ({ longitude: c[0], latitude: c[1] }));
      }

      const wardNo = road.properties?.Ward_No || road.properties?.ward_no;
      let wardId = null;
      if (wardNo) {
        const wardRes = await db.query('SELECT id FROM wards WHERE name ILIKE $1 LIMIT 1', [`%Ward ${wardNo}%`]);
        if (wardRes.rows.length > 0) {
          wardId = wardRes.rows[0].id;
        }
      }

      const title = road.name || road.properties?.Rd_Name || 'Unnamed Road';
      const description = 'Assigned from road network';
      let lineId = road.properties?.Line_ID || road.properties?.line_id || null;
      const rdName = road.properties?.Rd_Name || road.properties?.rd_name || road.name || null;
      
      if (lineId) {
        const isWard61 = road.properties?.Ward_No === '61' || road.properties?.ward_no === '61';
        const dupCheck = await db.query(
          `SELECT COUNT(*) FROM infrastructure WHERE properties->>'Line_ID' = $1`,
          [lineId]
        );
        if (isWard61 && parseInt(dupCheck.rows[0].count) > 1) {
          lineId = `${lineId}_${road.id}`;
        }
      }

      const crypto = require('crypto');
      const finalSourceQr = `START_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const finalDestinationQr = `END_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const insertResult = await db.query(
        `INSERT INTO tasks (title, description, area_geojson, geom, assigned_worker_id, ward_id, task_type, source_qr_id, destination_qr_id, status, line_id, rd_name)
         VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4), $5, $6, 'road', $7, $8, 'pending', $9, $10) RETURNING *`,
        [title, description, JSON.stringify(areaGeojson), road.geom_json, workerId, wardId, finalSourceQr, finalDestinationQr, lineId, rdName]
      );
      
      return res.json(insertResult.rows[0]);
    }

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
        COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_tasks,
        (
          SELECT json_agg(json_build_object('name', u.name, 'phone', u.phone))
          FROM users u
          WHERE u.ward_id = w.id AND u.role = 'worker'
        ) as jawans
      FROM wards w
      LEFT JOIN tasks t ON w.id = t.ward_id AND t.task_type != 'park'
      GROUP BY w.id
    `);
    res.json(stats.rows);
  } catch (error) {
    console.error('Get ward stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTaskSummary = async (req, res) => {
    try {
        const user = req.user;
        let query = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as completed,
                COUNT(CASE WHEN status IN ('in_progress', 'submitted') THEN 1 END) as active,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
            FROM tasks
        `;
        
        if (user && (user.role === 'park_jawan' || user.role === 'park_inspector')) {
            query += " WHERE task_type = 'park'";
        } else if (user && (user.role === 'worker' || user.role === 'supervisor' || user.role === 'owner')) {
            query += " WHERE task_type != 'park'";
        }
        
        const stats = await db.query(query);
        res.json(stats.rows[0]);
    } catch (error) {
        console.error('Get task summary error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// --- Photo Handling & Status ---

exports.uploadPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    const taskResult = await db.query('SELECT task_type FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = taskResult.rows[0];

    const isParkTask = (task.task_type === 'park');
    const isParkUser = (req.user && (req.user.role === 'park_jawan' || req.user.role === 'park_inspector'));

    if (isParkTask && !isParkUser) {
      return res.status(403).json({ error: 'Access denied: Only park jawans can upload photos for park tasks.' });
    }
    if (!isParkTask && isParkUser) {
      return res.status(403).json({ error: 'Access denied: Only road jawans can upload photos for road tasks.' });
    }

    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    // Auto-compress the image to keep size under ~150KB
    try {
      console.log('Compressing image with Jimp...');
      const { Jimp } = require('jimp');
      const image = await Jimp.read(req.file.path);
      
      // Limit resolution to max 1200px width/height
      if (image.width > 1200 || image.height > 1200) {
        image.scaleToFit({ w: 1200, h: 1200 });
      }
      
      // Get compressed JPEG buffer (75% quality)
      const compressedBuffer = await image.getBuffer('image/jpeg', { quality: 75 });
      
      // Overwrite the temporary local file with the compressed version
      fs.writeFileSync(req.file.path, compressedBuffer);
      console.log(`Compression successful. New size: ${(compressedBuffer.length / 1024).toFixed(2)} KB`);
    } catch (compressError) {
      console.error('Image compression failed, using original file:', compressError);
    }

    let imageUrl = `/uploads/${req.file.filename}`;
    let publicId = null;

    // Check if Supabase is configured
    const isSupabaseConfigured = process.env.SUPABASE_URL && process.env.SUPABASE_KEY && process.env.SUPABASE_BUCKET;
    const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;

    if (isSupabaseConfigured) {
      try {
        console.log('Uploading image to Supabase Storage...');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const fileBuffer = fs.readFileSync(req.file.path);
        const ext = path.extname(req.file.path) || '.jpg';
        const filename = `photo-${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;

        const { data, error } = await supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .upload(filename, fileBuffer, {
            contentType: req.file.mimetype || 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from(process.env.SUPABASE_BUCKET)
          .getPublicUrl(filename);

        imageUrl = publicUrl;
        publicId = filename;
        console.log('Supabase upload successful:', imageUrl, publicId);

        // Delete the temporary local file asynchronously to clean up disk space
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting local temp file:', err);
        });
      } catch (uploadError) {
        console.error('Supabase upload failed, falling back to local file:', uploadError);
      }
    } else if (isCloudinaryConfigured) {
      try {
        console.log('Uploading image to Cloudinary...');
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET
        });
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
          folder: 'khammam_cleanup_tasks'
        });
        imageUrl = uploadResult.secure_url;
        publicId = uploadResult.public_id;
        console.log('Cloudinary upload successful:', imageUrl, publicId);
      } catch (uploadError) {
        console.error('Cloudinary upload failed, falling back to local file:', uploadError);
      }
    }

    await db.query(
      'INSERT INTO photos (task_id, worker_id, image_url, latitude, longitude, public_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, req.user.id, imageUrl, latitude, longitude, publicId]
    );

    // Clean up temporary local upload file after saving
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting local temp file:', err);
      });
    }

    res.status(201).json({ 
      message: 'Photo uploaded successfully. Press Complete Task to initiate AI inspection.', 
      image_url: imageUrl
    });
  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTaskPhotos = async (req, res) => {
  try {
    let { id } = req.params;
    
    // Check type of task for segregation & resolve virtual road IDs to primary task IDs
    if (typeof id === 'string' && id.startsWith('virtual-')) {
      const roadId = parseInt(id.split('-')[1]);
      const roadResult = await db.query('SELECT properties FROM infrastructure WHERE id = $1', [roadId]);
      if (roadResult.rows.length > 0) {
        const lineId = roadResult.rows[0].properties?.Line_ID || roadResult.rows[0].properties?.line_id;
        if (lineId) {
          const existingTask = await db.query('SELECT id FROM tasks WHERE line_id = $1', [lineId]);
          if (existingTask.rows.length > 0) {
            id = existingTask.rows[0].id;
          } else {
            return res.json([]);
          }
        } else {
          return res.json([]);
        }
      } else {
        return res.json([]);
      }
    }

    const taskResult = await db.query('SELECT task_type FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = taskResult.rows[0];

    const isParkTask = (task.task_type === 'park');
    const isParkUser = (req.user && (req.user.role === 'park_jawan' || req.user.role === 'park_inspector'));

    if (isParkTask && !isParkUser) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to view park photos.' });
    }
    if (!isParkTask && isParkUser) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to view road photos.' });
    }

    const photos = await db.query('SELECT * FROM photos WHERE task_id = $1 ORDER BY uploaded_at DESC', [id]);
    res.json(photos.rows);
  } catch (error) {
    console.error('Get task photos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    let { id } = req.params;
    const { status, comment } = req.body;
    
    console.log(`Updating task ${id} to status: ${status}, comment: ${comment}`);

    if (typeof id === 'string' && id.startsWith('virtual-')) {
      const roadId = parseInt(id.split('-')[1]);
      const roadResult = await db.query('SELECT *, ST_AsGeoJSON(geom) as geom_json FROM infrastructure WHERE id = $1', [roadId]);
      if (roadResult.rows.length > 0) {
        const road = roadResult.rows[0];
        let lineId = road.properties?.Line_ID || road.properties?.line_id || null;
        if (lineId) {
          const existingTask = await db.query('SELECT id FROM tasks WHERE line_id = $1', [lineId]);
          if (existingTask.rows.length > 0) {
            id = existingTask.rows[0].id;
          }
        }
      }
    }
    
    const updated = await db.query(
      "UPDATE tasks SET status = $1, review_comment = COALESCE($2, review_comment) WHERE id = $3 RETURNING *",
      [status, comment || null, id]
    );
    
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

exports.bulkResetTasks = async (req, res) => {
  try {
    const { resetCompletedTasks } = require('../jobs/resetTasks');
    await resetCompletedTasks();
    res.json({ success: true, message: 'All completed tasks have been reset to pending.' });
  } catch (error) {
    console.error('Bulk reset error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};
