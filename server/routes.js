const express = require('express');
const router = express.Router();
const auth = require('./auth');
const pubsub = require('./pubsub');
const nest = require('./nest');
const media = require('./media');
const gemini = require('./gemini');

/**
 * GET /api/health
 * Returns ok if OAuth is initialized and working.
 */
router.get('/config', (req, res) => {
  const fullDeviceId = `${process.env.ENTERPRISE_ID}/devices/${process.env.LIVING_ROOM_DEVICE_ID}`;
  res.json({
    deviceId: fullDeviceId
  });
});

/**
 * GET /api/health
 */
router.get('/health', async (req, res) => {
  try {
    const token = await auth.getValidToken();
    res.json({ status: 'ok', tokenValid: !!token });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/events/manual
 * Creates a dummy event in the store for manual cat-checks.
 */
router.post('/events/manual', (req, res) => {
  const { eventId } = req.body;
  const manualEvent = {
    eventId: eventId || `manual-${Date.now()}`,
    timestamp: new Date().toISOString(),
    resourceUpdate: {
      name: 'manual-trigger',
      events: { 'sdm.devices.events.CameraMotion.Motion': {} }
    }
  };
  pubsub.addManualEvent(manualEvent);
  res.json(manualEvent);
});

/**
 * GET /api/events
 * Returns all stored events. Also does a best-effort pull for fresh ones.
 */
router.get('/events', async (req, res) => {
  try {
    // Best-effort pull — don't fail the request if this errors
    try {
      await pubsub.pullEvents();
    } catch (pullErr) {
      console.warn(`⚠️ Pull failed during /events: ${pullErr.message}`);
    }
    const events = pubsub.getAllEvents();
    res.json({ 
      events, 
      empty: events.length === 0 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/summarize?eventId=...
 * The "one-click" pipeline:
 * 1. Find event in store
 * 2. Check if media already cached
 * 3. If not, download from Nest API and cache
 * 4. Pass media to Gemini for summarization
 * 5. Return summary and media metadata
 */
router.get('/summarize', async (req, res) => {
  const { eventId } = req.query;
  if (!eventId) {
    return res.status(400).json({ error: 'Missing eventId parameter' });
  }

  try {
    // 1. Find event
    const event = pubsub.getEvent(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found. It may have been lost on a server restart before persistence was added.' });
    }

    // 1.5. If we already have a saved summary, return it immediately
    if (event.summary) {
      console.log(`♻️ Returning cached summary for ${eventId}`);
      const cachedMedia = media.getCachedMedia(eventId);
      return res.json({
        summary: event.summary,
        mediaUrl: cachedMedia ? media.getMediaUrl(cachedMedia.filename) : null,
        mediaType: cachedMedia ? cachedMedia.mediaType : 'video',
        timestamp: event.timestamp
      });
    }

    // 2. Check media cache
    let cached = media.getCachedMedia(eventId);
    let mediaInfo;

    // 3. Download/Cache if missing
    if (!cached) {
      if (eventId.startsWith('manual-')) {
        // For manual events, wait a moment for the upload to flush to disk
        console.log(`⏳ Manual event ${eventId}: Waiting for video upload to flush...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        cached = media.getCachedMedia(eventId);
      }
      
      if (!cached) {
        console.log(`📦 Media not in cache for ${eventId}. Fetching from Google...`);
        const { buffer, mediaType, extension } = await nest.getMedia(event);
        const filename = await media.cacheMedia(eventId, buffer, extension);
        cached = media.getCachedMedia(eventId);
      }
    }
    
    if (!cached) {
      throw new Error("Could not find any video or photo for this event. Please try again.");
    }
    
    mediaInfo = {
      mediaUrl: media.getMediaUrl(cached.filename),
      mediaType: cached.mediaType,
      localPath: cached.localPath
    };

    // 4. Summarize with Gemini
    console.log(`✨ Summarizing ${mediaInfo.mediaType} for ${eventId}...`);
    let summary;
    if (mediaInfo.mediaType === 'video') {
      summary = await gemini.summarizeVideo(mediaInfo.localPath, event.timestamp);
      
      // AUTO-DELETE: Remove video from cache after processing
      try {
        console.log(`🗑️ Auto-deleting video after processing: ${mediaInfo.localPath}`);
        require('fs').unlinkSync(mediaInfo.localPath);
      } catch (delErr) {
        console.warn(`⚠️ Failed to auto-delete video: ${delErr.message}`);
      }
    } else {
      summary = await gemini.summarizeImage(mediaInfo.localPath, event.timestamp);
    }

    // 5. Save summary to store and Respond
    pubsub.updateEventSummary(eventId, summary);

    res.json({
      summary,
      mediaUrl: mediaInfo.mediaUrl,
      mediaType: mediaInfo.mediaType,
      timestamp: event.timestamp
    });

  } catch (err) {
    console.error(`❌ Pipeline failure for ${eventId}:`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/stream/offer
 * Initiates WebRTC signaling.
 */
router.post('/stream/offer', async (req, res) => {
  const { deviceId, offerSdp } = req.body;
  if (!deviceId || !offerSdp) {
    return res.status(400).json({ error: 'Missing deviceId or offerSdp' });
  }

  try {
    const results = await nest.generateWebRtcStream(deviceId, offerSdp);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/stream/stop
 * Terminates a WebRTC session.
 */
router.post('/stream/stop', async (req, res) => {
  const { deviceId, mediaSessionId } = req.body;
  try {
    await nest.stopWebRtcStream(deviceId, mediaSessionId);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/stream/capture
 * Receives a base64 snapshot from the dashboard and saves it to cache.
 */
router.post('/stream/capture', async (req, res) => {
  const { eventId, imageData } = req.body;
  if (!eventId || !imageData) {
    return res.status(400).json({ error: 'Missing eventId or imageData' });
  }

  try {
    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Save to cache as JPEG
    const filename = await media.cacheMedia(eventId, buffer, 'jpg');
    res.json({ 
      status: 'ok', 
      filename,
      mediaUrl: media.getMediaUrl(filename)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/stream/upload-video
 * Receives a raw WebM video blob from the dashboard and saves it to cache.
 */
router.post('/stream/upload-video', async (req, res) => {
  const eventId = req.headers['x-event-id'];
  if (!eventId || !req.body || req.body.length === 0) {
    return res.status(400).json({ error: 'Missing x-event-id or empty video body' });
  }

  try {
    // req.body is already a Buffer thanks to express.raw() in index.js
    const filename = await media.cacheMedia(eventId, req.body, 'webm');
    res.json({ 
      status: 'ok', 
      filename,
      mediaUrl: media.getMediaUrl(filename)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
