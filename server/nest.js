const axios = require('axios');
const auth = require('./auth');
require('dotenv').config();

const ENTERPRISE_ID = process.env.ENTERPRISE_ID;

/**
 * Downloads a clip preview (MP4) from the given previewUrl.
 */
async function downloadClipPreview(previewUrl) {
  const token = await auth.getValidToken();
  const response = await axios.get(previewUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
    responseType: 'arraybuffer'
  });
  return response.data;
}

/**
 * Generates and downloads a snapshot (JPEG) using CameraEventImage.GenerateImage.
 * The eventToken is the eventId from the Pub/Sub event.
 * NOTE: This only works within ~30 seconds of the event being published.
 */
async function generateSnapshot(deviceId, eventToken) {
  const token = await auth.getValidToken();
  const url = `https://smartdevicemanagement.googleapis.com/v1/${deviceId}:executeCommand`;

  console.log(`📸 Calling GenerateImage with eventToken: ${eventToken}`);

  try {
    const response = await axios.post(url, {
      command: 'sdm.devices.commands.CameraEventImage.GenerateImage',
      params: { eventId: eventToken }
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const imageUrl = response.data.results.url;
    const imageToken = response.data.results.token;

    // Download the image immediately — URL expires in ~30 seconds
    // Use the returned token for auth (Basic auth, not Bearer)
    const imageResponse = await axios.get(imageUrl, {
      headers: { 'Authorization': `Basic ${imageToken}` },
      responseType: 'arraybuffer'
    });

    return imageResponse.data;
  } catch (err) {
    const errData = err.response?.data;
    const errMsg = typeof errData === 'object' ? JSON.stringify(errData) : errData;
    console.error(`❌ GenerateImage failed: status=${err.response?.status}, body=${errMsg}`);
    throw new Error(`Snapshot generation failed (${err.response?.status}): ${errMsg || err.message}`);
  }
}

/**
 * High-level helper to get media buffer and type for an event.
 * Tries clip preview first, falls back to snapshot.
 */
async function getMedia(event) {
  // Path 1: Clip preview (MP4 from previewUrl)
  if (event.previewUrl) {
    try {
      console.log(`🎬 Downloading clip preview for event ${event.eventId}...`);
      const buffer = await downloadClipPreview(event.previewUrl);
      return { buffer, mediaType: 'video', extension: 'mp4' };
    } catch (err) {
      console.warn(`⚠️ Clip download failed for ${event.eventId}: ${err.message}`);
      // Fall through to snapshot
    }
  }

  // Path 2: Snapshot (JPEG via GenerateImage)
  if (event.eventToken) {
    console.log(`📸 Generating snapshot for event ${event.eventId}...`);
    const buffer = await generateSnapshot(event.deviceId, event.eventToken);
    return { buffer, mediaType: 'image', extension: 'jpg' };
  }

  throw new Error(
    `No media available for event ${event.eventId}. ` +
    `Your camera model does not support snapshots, and no clip preview was provided by Google. ` +
    `Ensure Nest Aware is active and "Clip Previews" are enabled in permissions.`
  );
}

/**
 * Initiates a WebRTC stream.
 * Requires a local SDP offer from the browser.
 */
async function generateWebRtcStream(deviceId, offerSdp) {
  const token = await auth.getValidToken();
  const url = `https://smartdevicemanagement.googleapis.com/v1/${deviceId}:executeCommand`;

  console.log(`📡 Signaling WebRTC for device: ${deviceId}`);

  // Google Nest requires the SDP to end with a newline
  const formattedSdp = offerSdp.endsWith('\n') ? offerSdp : `${offerSdp}\n`;

  try {
    const response = await axios.post(url, {
      command: 'sdm.devices.commands.CameraLiveStream.GenerateWebRtcStream',
      params: { offerSdp: formattedSdp }
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    return response.data.results; // Contains answerSdp and mediaSessionId
  } catch (err) {
    const errData = err.response?.data;
    console.error(`❌ GenerateWebRtcStream failed:`, errData || err.message);
    throw new Error(`WebRTC signaling failed: ${JSON.stringify(errData) || err.message}`);
  }
}

/**
 * Stops an active WebRTC stream.
 */
async function stopWebRtcStream(deviceId, mediaSessionId) {
  const token = await auth.getValidToken();
  const url = `https://smartdevicemanagement.googleapis.com/v1/${deviceId}:executeCommand`;

  try {
    await axios.post(url, {
      command: 'sdm.devices.commands.CameraLiveStream.StopWebRtcStream',
      params: { mediaSessionId }
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (err) {
    console.warn(`⚠️ StopWebRtcStream failed (session may have already closed):`, err.message);
  }
}

module.exports = {
  downloadClipPreview,
  generateSnapshot,
  generateWebRtcStream,
  stopWebRtcStream,
  getMedia
};
