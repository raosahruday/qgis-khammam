const cron = require('node-cron');
const db = require('../config/db');
const { evaluateTaskPhoto } = require('../services/aiVisionService');

/**
 * Re-assesses all currently active road tasks at 2:00 PM IST daily.
 * Evaluates uploaded photos via AI vision service.
 * - AI Score >= 75%: Task status set to 'completed' (Approved).
 * - AI Score < 75% or No Photo: Task status set to 'rejected' (Orange - Re-do required).
 */
const assessActiveRoads = async () => {
  try {
    console.log('[Cron Job] Starting 2:00 PM IST automated active road re-assessment...');

    // 1. Fetch all active/submitted/in-progress tasks
    const activeTasksRes = await db.query(`
      SELECT * 
      FROM tasks 
      WHERE status IN ('active', 'submitted', 'in_progress')
    `);

    const activeTasks = activeTasksRes.rows;
    console.log(`[2:00 PM IST Audit] Found ${activeTasks.length} active road tasks for re-assessment.`);

    if (activeTasks.length === 0) {
      console.log('[2:00 PM IST Audit] No active road tasks to assess today.');
      return { total: 0, passed: 0, rejected: 0 };
    }

    let passedCount = 0;
    let rejectedCount = 0;

    for (const task of activeTasks) {
      const roadName = task.rd_name || task.title || `Road Task #${task.id}`;

      // Fetch latest uploaded photo for this task
      const photoRes = await db.query(
        'SELECT * FROM photos WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1',
        [task.id]
      );

      if (photoRes.rows.length === 0) {
        // No photo uploaded by 2:00 PM deadline -> Auto Reject
        const rejectMsg = '2:00 PM IST Re-Assessment Rejection: No photo uploaded by 2:00 PM deadline.';
        await db.query(
          `UPDATE tasks 
           SET status = 'rejected', ai_score = 0, review_comment = $1 
           WHERE id = $2`,
          [rejectMsg, task.id]
        );
        rejectedCount++;
        console.log(`[2:00 PM IST Audit] Task #${task.id} (${roadName}) -> REJECTED (Missing photo).`);
        continue;
      }

      const photo = photoRes.rows[0];
      const imageInput = photo.photo_url || photo.filepath;

      // Run AI Vision Evaluation
      const aiRes = await evaluateTaskPhoto(imageInput, task.task_type || 'road', roadName);

      if (aiRes.aiScore >= 75 && aiRes.status === 'approved') {
        // Passed AI Inspection
        await db.query(
          `UPDATE tasks 
           SET status = 'completed', ai_score = $1, ai_reason = $2, review_comment = $3 
           WHERE id = $4`,
          [aiRes.aiScore, aiRes.aiReason, '2:00 PM IST Re-Assessment: PASSED', task.id]
        );
        await db.query(
          `UPDATE photos SET status = 'approved', ai_score = $1, ai_reason = $2 WHERE id = $3`,
          [aiRes.aiScore, aiRes.aiReason, photo.id]
        );
        passedCount++;
        console.log(`[2:00 PM IST Audit] Task #${task.id} (${roadName}) -> PASSED (AI Score: ${aiRes.aiScore}%). Marked as COMPLETED.`);
      } else {
        // Failed AI Inspection (<75% or Non-Road / Dust / Litter detected)
        const rejectComment = `2:00 PM IST Re-Assessment Rejection: ${aiRes.aiReason || 'Cleanliness score below 75%'}`;
        await db.query(
          `UPDATE tasks 
           SET status = 'rejected', ai_score = $1, ai_reason = $2, review_comment = $3 
           WHERE id = $4`,
          [aiRes.aiScore, aiRes.aiReason, rejectComment, task.id]
        );
        await db.query(
          `UPDATE photos SET status = 'rejected', ai_score = $1, ai_reason = $2 WHERE id = $3`,
          [aiRes.aiScore, aiRes.aiReason, photo.id]
        );
        rejectedCount++;
        console.log(`[2:00 PM IST Audit] Task #${task.id} (${roadName}) -> REJECTED (AI Score: ${aiRes.aiScore}%). Marked as REJECTED (Re-do required).`);
      }
    }

    console.log(`[2:00 PM IST Audit] Completed! Total: ${activeTasks.length}, Passed: ${passedCount}, Rejected: ${rejectedCount}.`);
    return { total: activeTasks.length, passed: passedCount, rejected: rejectedCount };
  } catch (error) {
    console.error('[2:00 PM IST Audit] Error during automated active road re-assessment:', error);
    throw error;
  }
};

// Schedule job for 2:00 PM (14:00) IST daily
const start2PMAssessmentJob = () => {
  cron.schedule('0 14 * * *', () => {
    assessActiveRoads();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  console.log('[Cron Job] Daily 2:00 PM IST active road re-assessment job scheduled (Asia/Kolkata).');
};

module.exports = {
  start2PMAssessmentJob,
  assessActiveRoads
};
