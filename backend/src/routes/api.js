const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const taskController = require('../controllers/taskController');
const userController = require('../controllers/userController');
const machineController = require('../controllers/machineController');
const { authenticateToken, authorizeRole } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// ----- PUBLIC ROUTES -----
router.post('/register', authController.register);
router.post('/login', authController.login);

// ----- PROTECTED ROUTES -----
router.use(authenticateToken); 

// --- Tasks (Bulk & Management) ---
router.delete('/tasks/all', authorizeRole(['owner', 'supervisor']), taskController.deleteAllTasks);
router.get('/tasks', taskController.getTasks);
router.post('/tasks', authorizeRole(['owner', 'supervisor']), taskController.createTask);
router.get('/workers', authorizeRole(['owner', 'supervisor', 'commissioner']), userController.getWorkers);

// --- QR & Live Flow ---
router.post('/tasks/verify-qr', authorizeRole(['worker', 'owner', 'supervisor']), taskController.verifyQR);
router.post('/tasks/live-progress', authorizeRole(['worker']), taskController.updateLiveProgress);

// --- Task Specific Operations ---
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

module.exports = router;
