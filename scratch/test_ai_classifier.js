const { evaluateTaskPhoto } = require('../backend/src/services/aiVisionService');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('--- Testing AI Vision Road Classifier ---');
  // Check if any uploaded photos exist in backend/uploads or test path
  const uploadsDir = path.join(__dirname, '../backend/uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg'));
    for (const f of files.slice(0, 5)) {
      const fullPath = path.join(uploadsDir, f);
      const res = await evaluateTaskPhoto(fullPath);
      console.log(`File: ${f} => Score: ${res.aiScore}%, Status: ${res.status}, Reason: "${res.aiReason}"`);
    }
  } else {
    console.log('Uploads directory empty or not found');
  }
}

runTests();
