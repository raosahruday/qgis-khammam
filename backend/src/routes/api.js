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
    const roadsCount = await db.query("SELECT COUNT(*) FROM infrastructure WHERE type = 'road'");
    const ward3PropsCount = await db.query("SELECT COUNT(*) FROM infrastructure WHERE type = 'road' AND (properties->>'Ward_No' = '3' OR properties->>'ward_no' = '3')");
    const intersectCount = await db.query(`
      SELECT COUNT(r.id) 
      FROM infrastructure r, infrastructure w 
      WHERE r.type = 'road' AND w.type = 'ward' AND w.name = 'Ward 3' AND ST_Intersects(r.geom, w.geom)
    `);
    res.json({
      total_roads: parseInt(roadsCount.rows[0].count),
      ward3_props_count: parseInt(ward3PropsCount.rows[0].count),
      ward3_intersect_count: parseInt(intersectCount.rows[0].count)
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
router.get('/tasks', taskController.getTasks);
router.post('/tasks', authorizeRole(['owner', 'supervisor']), taskController.createTask);
router.get('/workers', authorizeRole(['owner', 'supervisor', 'commissioner']), userController.getWorkers);
router.get('/wards', authorizeRole(['owner', 'supervisor', 'commissioner']), userController.getWards);


// --- QR & Live Flow ---
router.post('/tasks/verify-qr', authorizeRole(['worker', 'owner', 'supervisor']), taskController.verifyQR);
router.post('/tasks/:id/swipe-status', authorizeRole(['worker']), taskController.swipeStatus);
router.post('/tasks/live-progress', authorizeRole(['worker']), taskController.updateLiveProgress);

// --- Task Specific Operations ---
router.get('/tasks/summary', authorizeRole(['owner', 'supervisor', 'commissioner']), taskController.getTaskSummary);
router.get('/tasks/:id', taskController.getTaskById);
router.put('/tasks/:id/assign', authorizeRole(['owner', 'supervisor']), taskController.assignTask);
router.get('/tasks/:id/photos', authorizeRole(['owner', 'supervisor', 'commissioner']), taskController.getTaskPhotos);
router.post('/tasks/:id/upload-photo', authorizeRole(['worker']), upload.single('photo'), taskController.uploadPhoto);
router.put('/tasks/:id/status', authorizeRole(['owner', 'supervisor']), taskController.updateTaskStatus);
router.put('/tasks/:id/reset', authorizeRole(['owner', 'supervisor']), taskController.resetTask);
router.delete('/tasks/:id', authorizeRole(['owner', 'supervisor']), taskController.deleteTask);

// --- Aliases for Status ---
router.put('/tasks/:id/approve', authorizeRole(['owner', 'supervisor']), (req, res) => {
  req.body = req.body || {};
  req.body.status = 'approved';
  taskController.updateTaskStatus(req, res);
});
router.put('/tasks/:id/reject', authorizeRole(['owner', 'supervisor']), (req, res) => {
  req.body = req.body || {};
  req.body.status = 'rejected';
  taskController.updateTaskStatus(req, res);
});

// --- Dashboards & Infrastructure ---
router.get('/wards/stats', authorizeRole(['owner', 'supervisor', 'commissioner']), taskController.getWardStats);
router.get('/machines', authorizeRole(['owner', 'supervisor', 'commissioner', 'worker']), machineController.getMachines);
router.post('/machines/:id/location', authorizeRole(['worker']), machineController.updateMachineLocation);
router.put('/machines/link-worker', authorizeRole(['worker']), machineController.linkWorkerToMachine);

// --- Geospatial Infrastructure ---
router.get('/infrastructure/ward-boundary', authorizeRole(['worker']), infrastructureController.getWorkerWard);
router.get('/infrastructure', authorizeRole(['owner', 'supervisor', 'commissioner', 'worker']), infrastructureController.getInfrastructure);

module.exports = router;
