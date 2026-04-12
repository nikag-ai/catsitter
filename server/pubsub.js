const { PubSub } = require('@google-cloud/pubsub');
require('dotenv').config();

let pubsubClient = null;
let subscription = null;

// In-memory event store: Map<eventId, event>
const eventStore = new Map();

/**
 * Initializes the Pub/Sub client with credentials from .env.
 */
async function initPubSub() {
  const { GOOGLE_CLOUD_PROJECT_ID, PUBSUB_SUBSCRIPTION_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON } = process.env;

  if (!GOOGLE_CLOUD_PROJECT_ID || !PUBSUB_SUBSCRIPTION_ID || !GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const missing = [];
    if (!GOOGLE_CLOUD_PROJECT_ID) missing.push('GOOGLE_CLOUD_PROJECT_ID');
    if (!PUBSUB_SUBSCRIPTION_ID) missing.push('PUBSUB_SUBSCRIPTION_ID');
    if (!GOOGLE_APPLICATION_CREDENTIALS_JSON) missing.push('GOOGLE_APPLICATION_CREDENTIALS_JSON');
    throw new Error(`Missing Pub/Sub config in .env: ${missing.join(', ')}`);
  }

  try {
    const credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS_JSON);
    pubsubClient = new PubSub({
      projectId: GOOGLE_CLOUD_PROJECT_ID,
      credentials,
    });
    subscription = pubsubClient.subscription(PUBSUB_SUBSCRIPTION_ID);
    console.log(`📡 Pub/Sub initialized. Subscription: ${PUBSUB_SUBSCRIPTION_ID}`);
  } catch (err) {
    throw new Error(`Pub/Sub init failed: ${err.message}`);
  }
}

/**
 * Pulls recent messages from the subscription, normalizes them, 
 * and merges them into the in-memory store.
 */
async function pullEvents() {
  if (!subscription) throw new Error('Pub/Sub not initialized.');

  const livingRoomDeviceId = process.env.LIVING_ROOM_DEVICE_ID;

  try {
    // Pull up to 20 messages
    const [response] = await subscription.pull({
      maxMessages: 20,
      returnImmediately: true,
    });

    const messages = response.receivedMessages || [];
    const ackIds = [];

    messages.forEach((receivedMessage) => {
      const message = receivedMessage.message;
      const data = JSON.parse(Buffer.from(message.data, 'base64').toString());

      // Filter by device ID if specified
      const resourceName = data.resourceUpdate?.name;
      if (livingRoomDeviceId && resourceName && !resourceName.includes(livingRoomDeviceId)) {
        ackIds.push(receivedMessage.ackId);
        return;
      }

      const eventId = data.eventId;
      const timestamp = data.timestamp;
      const events = data.resourceUpdate?.events || {};

      let type = 'motion'; // Default
      let previewUrl = null;
      let eventSessionId = null;

      // Detect event type and extract clip preview info
      if (events['sdm.devices.events.CameraPerson.Person']) {
        type = 'person';
      } else if (events['sdm.devices.events.CameraSound.Sound']) {
        type = 'sound';
      } else if (events['sdm.devices.events.CameraMotion.Motion']) {
        type = 'motion';
      }

      const clipPreview = events['sdm.devices.events.CameraClipPreview.ClipPreview'];
      if (clipPreview) {
        previewUrl = clipPreview.previewUrl;
        eventSessionId = clipPreview.eventSessionId;
      }

      // Normalize event
      const normalizedEvent = {
        eventId,
        timestamp,
        type,
        previewUrl,
        eventSessionId,
        deviceId: resourceName,
      };

      // Merge into store (dedupe by eventId)
      eventStore.set(eventId, normalizedEvent);
      ackIds.push(receivedMessage.ackId);
    });

    // Acknowledge processed messages
    if (ackIds.length > 0) {
      await subscription.acknowledge({ ackIds });
    }

    console.log(`📥 Pulled ${messages.length} messages, ${ackIds.length} acknowledged.`);
    return Array.from(messages);
  } catch (err) {
    console.error(`❌ Pub/Sub pull failed: ${err.message}`);
    throw err;
  }
}

/**
 * Returns all events from the in-memory store, sorted newest-first.
 */
function getAllEvents() {
  return Array.from(eventStore.values()).sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
}

module.exports = {
  initPubSub,
  pullEvents,
  getAllEvents,
};
