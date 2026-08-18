require('../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });
const axios = require('../backend/node_modules/axios');

async function testGemini() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  console.log('Gemini Key:', geminiKey ? `${geminiKey.substring(0, 5)}...` : 'undefined');
  
  if (!geminiKey) {
    console.error('No Gemini API key found in backend/.env');
    return;
  }

  // Tiny 1x1 transparent pixel gif base64
  const dummyBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const models = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

  for (const modelName of models) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;
      console.log(`Testing model: ${modelName}`);
      const response = await axios.post(
        geminiUrl,
        {
          contents: [
            {
              parts: [
                { text: 'Say hello' },
                {
                  inlineData: {
                    mimeType: 'image/gif',
                    data: dummyBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            response_mime_type: 'application/json'
          }
        },
        { timeout: 8000 }
      );
      console.log(`Success with ${modelName}! Response:`, JSON.stringify(response.data));
      break;
    } catch (err) {
      console.error(`Failed with ${modelName}:`, err.message);
      if (err.response) {
        console.error('Error status:', err.response.status);
        console.error('Error body:', JSON.stringify(err.response.data));
      }
    }
  }
}

testGemini();
