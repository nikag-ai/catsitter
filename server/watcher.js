require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { summarizeVideo } = require('./gemini');
const { updateEventSummary, addManualEvent } = require('./pubsub');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
let go2rtcProcess = null;

// State management for cooldowns
let lastMotionTime = 0;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Last known state for 15-minute cron comparison
let lastKnownState = null;

// Cron tracking
const CRON_INTERVAL_MS = 15 * 60 * 1000;
let nextCronTime = Date.now() + CRON_INTERVAL_MS;

// Processing state
let isProcessing = false;
let processingStage = null; // 'recording', 'analyzing'

function getWatcherStatus() {
  return {
    nextCronTime,
    lastKnownState,
    isCooldownActive: (Date.now() - lastMotionTime) < COOLDOWN_MS,
    cooldownEndsAt: lastMotionTime + COOLDOWN_MS,
    isProcessing,
    processingStage
  };
}

/**
 * 1. Go2RTC Lifecycle Management
 */
function startGo2rtc() {
  const yamlPath = path.join(CACHE_DIR, 'go2rtc.yaml');
  
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  // SDM project ID is the UUID inside ENTERPRISE_ID
  const projectId = process.env.ENTERPRISE_ID.split('/').pop();
  
  // Write the clean, auth-injected YAML
  const yamlContent = `
streams:
  living_room: "nest:?client_id=${process.env.GOOGLE_CLIENT_ID}&client_secret=${process.env.GOOGLE_CLIENT_SECRET}&project_id=${projectId}&refresh_token=${process.env.GOOGLE_REFRESH_TOKEN}&device_id=${process.env.LIVING_ROOM_DEVICE_ID}"
`;
  fs.writeFileSync(yamlPath, yamlContent.trim());

  console.log('🔄 Starting headless go2rtc stream bridge...');
  
  // Assuming go2rtc binary is in the root directory (we downloaded it earlier)
  const binaryPath = path.join(__dirname, '..', 'go2rtc');
  
  go2rtcProcess = spawn(binaryPath, ['-config', yamlPath], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'ignore', 'ignore'] // ignore logs so it doesn't spam server console
  });

  go2rtcProcess.on('exit', (code) => {
    console.log(`⚠️ go2rtc exited with code ${code}. Restarting...`);
    setTimeout(startGo2rtc, 5000);
  });
}

/**
 * Capture a 10s clip from the RTSP stream using ffmpeg
 */
async function captureVideoClip(outputPath, durationSec = 10) {
  return new Promise((resolve, reject) => {
    console.log(`🎥 Capturing ${durationSec}s video to ${outputPath}...`);
    
    // We capture directly from local go2rtc rtsp stream
    const ffmpeg = spawn('ffmpeg', [
      '-t', durationSec.toString(),
      '-i', 'rtsp://127.0.0.1:8554/living_room',
      '-c', 'copy', // extremely fast, no transcode
      '-y',
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

/**
 * 2. Event-Driven Pipeline (Called directly from pubsub.js)
 */
async function handleMotionEvent(event) {
  // Only process motion/person from the Living Room cam
  if (process.env.LIVING_ROOM_DEVICE_ID && event.deviceId && !event.deviceId.includes(process.env.LIVING_ROOM_DEVICE_ID)) {
    return;
  }

  const now = Date.now();
  if (now - lastMotionTime < COOLDOWN_MS) {
    console.log(`⏳ Cooldown active. Skipping burst for event ${event.eventId}.`);
    return;
  }

  console.log(`🚨 Motion triggered! Starting Zoomie Burst for event ${event.eventId}`);
  lastMotionTime = now;

  const videoPath = path.join(CACHE_DIR, `${event.eventId}.mp4`);
  
  try {
    isProcessing = true;
    processingStage = 'recording';
    await captureVideoClip(videoPath, 10);
    
    processingStage = 'analyzing';
    console.log(`🤖 Analyzing motion video...`);
    const summary = await summarizeVideo(videoPath, event.timestamp);
    
    console.log(`✨ Result: ${summary}`);
    lastKnownState = summary;
    
    // update the database event so the timeline UI gets the summary
    updateEventSummary(event.eventId, summary);
    
  } catch (err) {
    console.error(`❌ Event capture/analysis failed:`, err.message);
  } finally {
    isProcessing = false;
    processingStage = null;
  }
}

/**
 * 3. Background Polling (15-min Cron)
 */
function startCron() {
  console.log(`⏰ Started 15-minute cron scheduler.`);
  
  setInterval(async () => {
    // Reset the target for the next tick
    nextCronTime = Date.now() + CRON_INTERVAL_MS;
    
    const now = Date.now();
    // If we JUST had a motion event, don't overlap with a redundant cron check
    if (now - lastMotionTime < COOLDOWN_MS) {
      console.log('⏰ Skipping cron check (recent motion handled).');
      return;
    }

    console.log('⏰ Running 15-minute background check...');
    const cronEventId = `cron-${crypto.randomUUID()}`;
    const videoPath = path.join(CACHE_DIR, `${cronEventId}.mp4`);
    
    // We create a "dummy" event for the timeline so the UI knows we checked
    const cronEvent = {
        eventId: cronEventId,
        timestamp: new Date().toISOString(),
        type: 'cron',
        deviceId: process.env.LIVING_ROOM_DEVICE_ID
    };
    
    try {
      isProcessing = true;
      processingStage = 'recording';
      await captureVideoClip(videoPath, 5); // 5 sec is plenty for a static check
      
      processingStage = 'analyzing';
      const summary = await summarizeVideo(videoPath, cronEvent.timestamp);
      
      console.log(`✨ Cron Result: ${summary}`);
      
      // Log the background event unconditionally
      cronEvent.summary = summary;
      addManualEvent(cronEvent);
      lastKnownState = summary;
    } catch (err) {
      console.error(`❌ Cron capture/analysis failed:`, err.message);
    } finally {
      isProcessing = false;
      processingStage = null;
    }
    
  }, CRON_INTERVAL_MS);
}

/**
 * 4. Manual Analysis Trigger
 */
async function handleManualEvent(eventId) {
  console.log(`🙋‍♂️ Manual analysis requested: ${eventId}`);
  const event = {
    eventId,
    timestamp: new Date().toISOString(),
    type: 'manual',
    deviceId: process.env.LIVING_ROOM_DEVICE_ID
  };
  
  const videoPath = path.join(CACHE_DIR, `${eventId}.mp4`);
  
  try {
    isProcessing = true;
    processingStage = 'recording';
    
    // Capture 10s clip for manual events
    await captureVideoClip(videoPath, 10);
    
    processingStage = 'analyzing';
    const summary = await summarizeVideo(videoPath, event.timestamp);
    
    console.log(`✨ Manual Result: ${summary}`);
    
    event.summary = summary;
    addManualEvent(event);
    lastKnownState = summary;
    
    // We update lastMotionTime so the cron ignores an immediate check right after this
    lastMotionTime = Date.now();
    return event;
  } catch (err) {
    console.error(`❌ Manual capture/analysis failed:`, err.message);
    throw err;
  } finally {
    isProcessing = false;
    processingStage = null;
  }
}

module.exports = {
  startGo2rtc,
  handleMotionEvent,
  startCron,
  handleManualEvent,
  getWatcherStatus
};
