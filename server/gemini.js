const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
require('dotenv').config();

let genAI = null;
let model = null;

/**
 * Initializes the Gemini client.
 */
function initGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY in .env');
  }
  genAI = new GoogleGenerativeAI(apiKey);
  // Using gemini-3-flash-preview as explicitly requested
  // We explicitly set v1beta to ensure the latest preview features are active
  model = genAI.getGenerativeModel(
    { model: 'gemini-3-flash-preview' },
    { apiVersion: 'v1beta' }
  );
  console.log('🤖 Gemini 3 Flash Preview initialized.');
}

/**
 * Generates an activity summary for an image.
 */
async function summarizeImage(cachedPath, timestamp) {
  if (!model) throw new Error('Gemini not initialized.');

  const imageData = fs.readFileSync(cachedPath);
  const imagePart = {
    inlineData: {
      data: imageData.toString('base64'),
      mimeType: 'image/jpeg'
    }
  };

  const prompt = getPrompt(timestamp);
  const result = await model.generateContent([prompt, imagePart]);
  return result.response.text() || fallbackMessage;
}

/**
 * Generates an activity summary for a video.
 * Note: Videos must be uploaded to the File API first.
 */
async function summarizeVideo(cachedPath, timestamp) {
  if (!genAI || !model) throw new Error('Gemini not initialized.');

  const { GoogleAIFileManager } = require('@google/generative-ai/server');
  const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

  // Detect mime type based on extension
  const extension = cachedPath.split('.').pop().toLowerCase();
  const mimeType = extension === 'webm' ? 'video/webm' : 'video/mp4';

  console.log(`📤 Uploading ${mimeType} to Gemini File API: ${cachedPath}...`);
  const uploadResult = await fileManager.uploadFile(cachedPath, {
    mimeType,
    displayName: `Febo activity clip (${extension})`,
  });

  let file = await fileManager.getFile(uploadResult.file.name);
  let attempts = 0;
  while (file.state === 'PROCESSING' && attempts < 15) {
    console.log('⏳ Video still processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    file = await fileManager.getFile(uploadResult.file.name);
    attempts++;
  }

  if (file.state !== 'ACTIVE') {
    throw new Error(`Video processing failed or timed out: ${file.state}`);
  }

  const prompt = getPrompt(timestamp);
  const videoPart = {
    fileData: {
      fileUri: uploadResult.file.uri,
      mimeType
    }
  };

  const result = await model.generateContent([prompt, videoPart]);
  return result.response.text() || fallbackMessage;
}

function getPrompt(timestamp) {
  return `
You are watching footage from a stationary Nest camera in the Living Room.
Your job is to map the activity to one of our core taxonomies, and respond with a SINGLE clear sentence.

CORE TAXONOMY:
1. Sleeping (stationary)
2. Loafing/Alert (stationary)
3. Zoomies/Running (movement)
4. Walking/Patrolling (movement)
5. Eating meal (walk + stationary)
6. Drinking water (walk + stationary)
7. Playing with human (movement)
8. Exiting/Entering frame (movement)

RULES:
- Map what you see to exactly one of the core taxonomy behaviors. Use the terminology from the taxonomy. Add one relevant emoji.
- If you cannot see a cat anywhere in the video, respond exactly with: "Motion was detected but Febo was not in the frame 👀"
- Keep your description to one sentence. Example: "Febo is having Zoomies/Running back and forth across the living room 💨"

Analyze the footage and tell me exactly what is happening:
`.trim();
}

const fallbackMessage = "Motion was detected but Febo was not in the frame 👀";

module.exports = {
  initGemini,
  summarizeImage,
  summarizeVideo
};
