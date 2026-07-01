const cron = require('node-cron');
const db = require('../config/db');
const { deletePhysicalPhoto } = require('./cleanupPhotos');

const resetCompletedTasks = async () => {
  try {
    console.log('[Cron Job] Starting daily task reset...');
    
    // 1. Find photos associated with completed tasks
    const photosToReset = await db.query(`
      SELECT * FROM photos 
      WHERE task_id IN (
        SELECT id FROM tasks WHERE status = 'approved'
      )
    `);
    
    console.log(`[Cron Job] Found ${photosToReset.rows.length} photos associated with completed tasks to delete.`);
    
    // 2. Physically delete each photo
    for (const photo of photosToReset.rows) {
      await deletePhysicalPhoto(photo);
    }
    
    // 3. Delete photos records from database
    if (photosToReset.rows.length > 0) {
      await db.query(`
        DELETE FROM photos 
        WHERE task_id IN (
          SELECT id FROM tasks WHERE status = 'approved'
        )
      `);
    }

    // 4. Reset tasks with status = 'approved' to status = 'pending'
    const resetTasksRes = await db.query(`
      UPDATE tasks 
      SET status = 'pending', 
          last_point_reached = 0, 
          review_comment = NULL 
      WHERE status = 'approved'
    `);
    console.log(`[Cron Job] Reset ${resetTasksRes.rowCount} completed tasks to pending.`);
    
    console.log('[Cron Job] Daily task reset completed successfully.');
  } catch (error) {
    console.error('[Cron Job] Error resetting completed tasks:', error);
  }
};

// Schedule to run every day at 04:30 AM Asia/Kolkata
const startResetJob = () => {
  cron.schedule('30 4 * * *', () => {
    resetCompletedTasks();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  console.log('[Cron Job] Daily task reset scheduled for 04:30 AM (Asia/Kolkata).');
};

module.exports = {
  startResetJob,
  resetCompletedTasks
};
