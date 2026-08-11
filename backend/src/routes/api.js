const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const taskController = require('../controllers/taskController');
const userController = require('../controllers/userController');
const machineController = require('../controllers/machineController');
const infrastructureController = require('../controllers/infrastructureController');
const { authenticateToken, authorizeRole } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// ----- PUBLIC ROUTES -----
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/otp/send', authController.sendOTP);
router.get('/db-structure', async (req, res) => {
  try {
    const db = require('../config/db');
    
    // 1. Get all table names
    const tablesRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    
    // 2. For each table, get row count and columns
    const structure = {};
    for (const table of tables) {
      const countRes = await db.query(`SELECT COUNT(*) FROM "${table}"`);
      const colsRes = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      structure[table] = {
        rowCount: parseInt(countRes.rows[0].count),
        columns: colsRes.rows.map(c => `${c.column_name} (${c.data_type})`)
      };
    }
    
    res.json({
      status: 'connected',
      bootTime: global.bootTime,
      logs: global.dbLogs,
      structure
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/temp-check-prod-db', async (req, res) => {
  try {
    const db = require('../config/db');
    
    // 1. Basic counts
    const roadsCount = await db.query("SELECT COUNT(*) FROM infrastructure WHERE type = 'road'");
    const ward3PropsCount = await db.query("SELECT COUNT(*) FROM infrastructure WHERE type = 'road' AND (properties->>'Ward_No' = '3' OR properties->>'ward_no' = '3')");
    const intersectCount = await db.query(`
      SELECT COUNT(r.id) 
      FROM infrastructure r, infrastructure w 
      WHERE r.type = 'road' AND w.type = 'ward' AND w.name = 'Ward 3' AND ST_Intersects(r.geom, w.geom)
    `);

    // 2. Geometry nullness checks
    const nullGeomRes = await db.query("SELECT COUNT(*) FROM infrastructure WHERE type = 'road' AND geom IS NULL");
    const nullSimpGeomRes = await db.query("SELECT COUNT(*) FROM infrastructure WHERE type = 'road' AND ST_Simplify(geom, 0.00003) IS NULL");
    
    // 3. Ward 3 specific nullness checks
    const ward3NullGeomRes = await db.query("SELECT COUNT(*) FROM infrastructure WHERE type = 'road' AND (properties->>'Ward_No' = '3' OR properties->>'ward_no' = '3') AND geom IS NULL");
    const ward3NullSimpRes = await db.query("SELECT COUNT(*) FROM infrastructure WHERE type = 'road' AND (properties->>'Ward_No' = '3' OR properties->>'ward_no' = '3') AND ST_Simplify(geom, 0.00003) IS NULL");
    
    // 4. Sample road properties
    const sampleRoadsRes = await db.query("SELECT id, name, properties->>'Ward_No' as ward_no, properties->>'Line_ID' as line_id, ST_AsText(geom) as geom_wkt FROM infrastructure WHERE type = 'road' AND (properties->>'Ward_No' = '3' OR properties->>'ward_no' = '3') LIMIT 10");

    // 5. Test of the query in getInfrastructure (WITH ST_Simplify - old method, drops roads)
    const testInfraQueryRes = await db.query(`
      SELECT COUNT(*) FROM (
        SELECT id, name, type, properties,
               ST_AsGeoJSON(ST_Simplify(geom, 0.00003)) as geom_json
        FROM infrastructure
        ORDER BY CASE WHEN type = 'road' THEN 0 WHEN type = 'row' THEN 1 ELSE 2 END ASC
        LIMIT 6000
      ) sub WHERE type = 'road' AND (properties->>'Ward_No' = '3' OR properties->>'ward_no' = '3') AND geom_json IS NOT NULL
    `);

    // 6. Test with ST_SimplifyPreserveTopology (new method, never drops roads)
    const testPreserveQueryRes = await db.query(`
      SELECT COUNT(*) FROM (
        SELECT id, name, type, properties,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.00003)) as geom_json
        FROM infrastructure
        ORDER BY CASE WHEN type = 'road' THEN 0 WHEN type = 'row' THEN 1 ELSE 2 END ASC
        LIMIT 6000
      ) sub WHERE type = 'road' AND (properties->>'Ward_No' = '3' OR properties->>'ward_no' = '3') AND geom_json IS NOT NULL
    `);

    res.json({
      total_roads: parseInt(roadsCount.rows[0].count),
      ward3_props_count: parseInt(ward3PropsCount.rows[0].count),
      ward3_intersect_count: parseInt(intersectCount.rows[0].count),
      null_geom_count: parseInt(nullGeomRes.rows[0].count),
      null_simplified_geom_count: parseInt(nullSimpGeomRes.rows[0].count),
      ward3_null_geom_count: parseInt(ward3NullGeomRes.rows[0].count),
      ward3_null_simplified_count: parseInt(ward3NullSimpRes.rows[0].count),
      test_query_ward3_with_ST_Simplify: parseInt(testInfraQueryRes.rows[0].count),
      test_query_ward3_with_ST_SimplifyPreserveTopology: parseInt(testPreserveQueryRes.rows[0].count),
      sample_roads: sampleRoadsRes.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ----- PROTECTED ROUTES -----
router.use(authenticateToken); 

// --- Registrations (Commissioner Only) ---
router.get('/registrations/pending', authorizeRole(['commissioner']), userController.getPendingRegistrations);
router.put('/registrations/:id/approve', authorizeRole(['commissioner']), userController.approveRegistration);
router.put('/registrations/:id/reject', authorizeRole(['commissioner']), userController.rejectRegistration);

// --- Tasks (Bulk & Management) ---
router.delete('/tasks/all', authorizeRole(['owner', 'supervisor']), taskController.deleteAllTasks);
router.post('/tasks/bulk-reset', authorizeRole(['owner', 'supervisor']), taskController.bulkResetTasks);
router.post('/admin/trigger-2pm-assessment', authorizeRole(['owner', 'supervisor', 'commissioner']), async (req, res) => {
  try {
    const { assessActiveRoads } = require('../jobs/assessActiveRoads');
    const result = await assessActiveRoads();
    res.json({ success: true, message: '2:00 PM IST active road re-assessment executed successfully.', result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
router.get('/tasks', taskController.getTasks);
router.post('/tasks', authorizeRole(['owner', 'supervisor']), taskController.createTask);
router.get('/workers', authorizeRole(['owner', 'supervisor', 'commissioner', 'park_inspector']), userController.getWorkers);
router.put('/workers/:id/transfer', authorizeRole(['commissioner']), userController.transferWorker);
router.get('/wards', authorizeRole(['owner', 'supervisor', 'commissioner']), userController.getWards);


// --- QR & Live Flow ---
router.post('/tasks/verify-qr', authorizeRole(['worker', 'owner', 'supervisor', 'park_jawan']), taskController.verifyQR);
router.post('/tasks/:id/swipe-status', authorizeRole(['worker', 'park_jawan']), taskController.swipeStatus);
router.post('/tasks/live-progress', authorizeRole(['worker', 'park_jawan']), taskController.updateLiveProgress);

// --- Task Specific Operations ---
router.get('/tasks/summary', authorizeRole(['owner', 'supervisor', 'commissioner']), taskController.getTaskSummary);
router.get('/tasks/:id', taskController.getTaskById);
router.put('/tasks/:id/assign', authorizeRole(['owner', 'supervisor']), taskController.assignTask);
router.get('/tasks/:id/photos', authorizeRole(['owner', 'supervisor', 'commissioner', 'worker', 'park_jawan', 'park_inspector']), taskController.getTaskPhotos);
router.post('/tasks/:id/upload-photo', authorizeRole(['worker', 'park_jawan']), upload.single('photo'), taskController.uploadPhoto);
router.put('/tasks/:id/status', authorizeRole(['owner', 'supervisor']), taskController.updateTaskStatus);
router.put('/tasks/:id/reset', authorizeRole(['owner', 'supervisor']), taskController.resetTask);
router.delete('/tasks/:id', authorizeRole(['owner', 'supervisor']), taskController.deleteTask);

// --- Aliases for Status ---
router.put('/tasks/:id/approve', authorizeRole(['owner', 'supervisor', 'park_inspector']), (req, res) => {
  req.body = req.body || {};
  req.body.status = 'approved';
  taskController.updateTaskStatus(req, res);
});
router.put('/tasks/:id/reject', authorizeRole(['owner', 'supervisor', 'park_inspector']), (req, res) => {
  req.body = req.body || {};
  req.body.status = 'rejected';
  taskController.updateTaskStatus(req, res);
});

// --- Dashboards & Infrastructure ---
router.get('/wards/stats', authorizeRole(['owner', 'supervisor', 'commissioner']), taskController.getWardStats);
router.get('/machines', authorizeRole(['owner', 'supervisor', 'commissioner', 'worker', 'park_jawan', 'park_inspector']), machineController.getMachines);
router.post('/machines/:id/location', authorizeRole(['worker', 'park_jawan']), machineController.updateMachineLocation);
router.put('/machines/link-worker', authorizeRole(['worker', 'park_jawan']), machineController.linkWorkerToMachine);

// --- Geospatial Infrastructure ---
router.get('/infrastructure/ward-boundary', authorizeRole(['worker', 'park_jawan', 'park_inspector']), infrastructureController.getWorkerWard);
router.get('/infrastructure', authorizeRole(['owner', 'supervisor', 'commissioner', 'worker', 'park_jawan', 'park_inspector']), infrastructureController.getInfrastructure);

module.exports = router;
