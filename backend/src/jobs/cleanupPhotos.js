const cron = require('node-cron');
const db = require('../config/db');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary if credentials exist
const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Helper to physically delete a photo from Cloudinary and/or Local Filesystem
const deletePhysicalPhoto = async (photo) => {
  try {
    // 1. Delete from Cloudinary
    if (photo.public_id && isCloudinaryConfigured) {
      console.log(`[Photo Cleanup] Deleting from Cloudinary: ${photo.public_id}`);
      await cloudinary.uploader.destroy(photo.public_id);
    }
    
    // 2. Delete from Local Filesystem
    if (photo.image_url && photo.image_url.startsWith('/uploads/')) {
      const filename = photo.image_url.replace('/uploads/', '');
      const localPath = path.join(__dirname, '../../uploads', filename);
      if (fs.existsSync(localPath)) {
        console.log(`[Photo Cleanup] Deleting from Local Disk: ${localPath}`);
        fs.unlinkSync(localPath);
      }
    }
  } catch (err) {
    console.error(`[Photo Cleanup] Error deleting physical photo ${photo.id}:`, err);
  }
};

const cleanupExpiredPhotos = async () => {
  try {
    console.log('[Photo Cleanup] Checking for photos older than 24 hours...');
    
    // Find photos uploaded more than 24 hours ago
    const result = await db.query(
      "SELECT * FROM photos WHERE uploaded_at < NOW() - INTERVAL '24 hours'"
    );
    
    console.log(`[Photo Cleanup] Found ${result.rows.length} expired photos to delete.`);
    
    for (const photo of result.rows) {
      // Physically delete files
      await deletePhysicalPhoto(photo);
      
      // Delete from DB
      await db.query("DELETE FROM photos WHERE id = $1", [photo.id]);
    }
    
    console.log('[Photo Cleanup] Finished cleanup of expired photos.');
  } catch (error) {
    console.error('[Photo Cleanup] Error running photo cleanup job:', error);
  }
};

const startCleanupJob = () => {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    cleanupExpiredPhotos();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  console.log('[Photo Cleanup] Hourly photo cleanup job scheduled (Asia/Kolkata).');
};

module.exports = {
  startCleanupJob,
  cleanupExpiredPhotos,
  deletePhysicalPhoto
};
