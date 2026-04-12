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
You are a friendly cat activity reporter. You're watching footage of a cat named Febo.

Analyze this footage and generate a brief, warm activity summary.
Format your response as timestamped bullet points. Example:
  • 10:32 AM — Febo jumped on the couch 🛋️
  • 10:35 AM — Stared out the window for 3 minutes 🪟

If you can't see a cat in the footage, respond with:
  "No sign of Febo in this clip 🔍"

Keep your tone friendly and a little playful. Be specific about what you observe.
Event timestamp for context: ${timestamp}
`.trim();
}

const fallbackMessage = "Gemini couldn't analyze this footage right now. Try again in a moment.";

module.exports = {
  initGemini,
  summarizeImage,
  summarizeVideo
};
