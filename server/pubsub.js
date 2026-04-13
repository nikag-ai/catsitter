const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// In-memory event store: Map<eventId, event>
const eventStore = new Map();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
let supabase;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("⚠️  Supabase keys not found in .env. Falling back to in-memory only.");
}

// ───────────── Persistence (Supabase) ─────────────

async function loadPersistedEvents() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('timestamp', { ascending: false });
      
    if (error) throw error;
    
    if (data) {
      data.forEach(row => {
        // Map postgres snake_case to our JS camelCase
        const event = {
          eventId: row.event_id,
          timestamp: row.timestamp,
          type: row.type,
          previewUrl: row.preview_url,
          eventSessionId: row.event_session_id,
          eventToken: row.event_token,
          deviceId: row.device_id,
          summary: row.summary
        };
        eventStore.set(event.eventId, event);
      });
      console.log(`☁️ Loaded ${eventStore.size} persisted events from Supabase.`);
    }
  } catch (err) {
    console.error(`❌ Could not load events from Supabase: ${err.message}`);
  }
}

async function persistEventSingle(event) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('events')
      .upsert({
        event_id: event.eventId,
        timestamp: event.timestamp,
        type: event.type,
        preview_url: event.previewUrl,
        event_session_id: event.eventSessionId,
        event_token: event.eventToken,
        device_id: event.deviceId,
        summary: event.summary
      }, { onConflict: 'event_id' });
      
    if (error) throw error;
  } catch (err) {
    console.error(`❌ Supabase Upsert Error for ${event.eventId}:`, err.message);
  }
}


// ───────────── Init ─────────────

async function initPubSub() {
  const { GOOGLE_CLOUD_PROJECT_ID, PUBSUB_SUBSCRIPTION_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON } = process.env;

  if (!GOOGLE_CLOUD_PROJECT_ID || !PUBSUB_SUBSCRIPTION_ID || !GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const missing = [];
    if (!GOOGLE_CLOUD_PROJECT_ID) missing.push('GOOGLE_CLOUD_PROJECT_ID');
    if (!PUBSUB_SUBSCRIPTION_ID) missing.push('PUBSUB_SUBSCRIPTION_ID');
    if (!GOOGLE_APPLICATION_CREDENTIALS_JSON) missing.push('GOOGLE_APPLICATION_CREDENTIALS_JSON');
    throw new Error(`Missing Pub/Sub config in .env: ${missing.join(', ')}`);
  }

  // Load credentials from the JSON file directly to avoid .env escape issues
  const credPath = path.join(__dirname, '..', 'catsitter-493023-f632a680145c.json');
  let credentials;
  if (fs.existsSync(credPath)) {
    credentials = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    console.log(`📄 Loaded service account from file: ${credentials.client_email}`);
  } else {
    // Fallback to .env
    credentials = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS_JSON);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    console.log(`📄 Loaded service account from .env: ${credentials.client_email}`);
  }

  googleAuth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/pubsub'],
  });

  subscriptionPath = `projects/${GOOGLE_CLOUD_PROJECT_ID}/subscriptions/${PUBSUB_SUBSCRIPTION_ID}`;

  await loadPersistedEvents();
  console.log(`📡 Pub/Sub initialized (REST pull mode). Subscription: ${subscriptionPath}`);

  // Start background polling for Google Home events
  startPolling();
}

function startPolling() {
  console.log(`🔄 Background polling started (every 10s).`);
  
  const tick = async () => {
    try {
      await pullEvents();
    } catch (err) {
      console.error(`❌ Background pull error:`, err.response?.data || err.message);
    }
  };

  // Immediate first pull
  tick();

  pollTimer = setInterval(tick, 10000);
}

// ───────────── Pull via REST ─────────────

async function pullEvents() {
  console.log(`📥 Pulling events from ${subscriptionPath}...`);
  
  const client = await googleAuth.getClient();
  const tokenResult = await client.getAccessToken();
  const token = tokenResult.token;

  const url = `https://pubsub.googleapis.com/v1/${subscriptionPath}:pull`;
  
  const res = await axios.post(url, {
    maxMessages: 20,
    returnImmediately: true,
  }, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000
  });

  const messages = res.data.receivedMessages || [];
  console.log(`📥 Pull complete. Received ${messages.length} messages.`);

  if (messages.length === 0) return [];

  const ackIds = [];
  let newCount = 0;

  for (const msg of messages) {
    const data = JSON.parse(Buffer.from(msg.message.data, 'base64').toString());
    const livingRoomDeviceId = process.env.LIVING_ROOM_DEVICE_ID;
    const resourceName = data.resourceUpdate?.name;

    console.log(`🔍 Received raw event:`, JSON.stringify(data, null, 2));

    // Filter by device
    if (livingRoomDeviceId && resourceName && !resourceName.includes(livingRoomDeviceId)) {
      console.log(`⏩ Filtering out event from device: ${resourceName}`);
      ackIds.push(msg.ackId);
      continue;
    }

    const eventId = data.eventId;
    const timestamp = data.timestamp;
    const rawEvents = data.resourceUpdate?.events;

    let type = 'motion';
    let previewUrl = null;
    let eventSessionId = null;
    let eventToken = eventId;

    if (rawEvents && typeof rawEvents === 'object' && !Array.isArray(rawEvents)) {
      const keys = Object.keys(rawEvents);
      if (keys.some(k => k.includes('CameraPerson'))) type = 'person';
      else if (keys.some(k => k.includes('CameraSound'))) type = 'sound';
      else if (keys.some(k => k.includes('CameraMotion'))) type = 'motion';

      const clipKey = keys.find(k => k.includes('CameraClipPreview'));
      if (clipKey && rawEvents[clipKey]) {
        previewUrl = rawEvents[clipKey].previewUrl;
        eventSessionId = rawEvents[clipKey].eventSessionId;
      }

      for (const key of keys) {
        if (rawEvents[key]?.eventId) {
          eventToken = rawEvents[key].eventId;
          break;
        }
      }
    } else if (Array.isArray(rawEvents)) {
      if (rawEvents.some(e => e.includes('CameraPerson'))) type = 'person';
      else if (rawEvents.some(e => e.includes('CameraSound'))) type = 'sound';
      else if (rawEvents.some(e => e.includes('CameraMotion'))) type = 'motion';
    }

    const normalizedEvent = {
      eventId,
      timestamp,
      type,
      previewUrl,
      eventSessionId,
      eventToken,
      deviceId: resourceName,
    };

    console.log(`✅ Stored event: ${type} at ${timestamp} (id: ${eventId})`);
    eventStore.set(eventId, normalizedEvent);
    
    // Persist to Supabase
    persistEventSingle(normalizedEvent);
    
    ackIds.push(msg.ackId);
    newCount++;

    // Trigger the Smart Watcher (deferred require to avoid circular dep)
    if (type === 'motion' || type === 'person') {
       const { handleMotionEvent } = require('./watcher');
       // Run in background without blocking the loop
       handleMotionEvent(normalizedEvent).catch(err => console.error("Watcher error:", err.message));
    }
  }

  // Acknowledge
  if (ackIds.length > 0) {
    console.log(`📡 Acknowledging ${ackIds.length} messages...`);
    const client2 = await googleAuth.getClient();
    const tokenResult2 = await client2.getAccessToken();
    const token2 = tokenResult2.token;
    
    await axios.post(`https://pubsub.googleapis.com/v1/${subscriptionPath}:acknowledge`, {
      ackIds,
    }, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    console.log(`✅ Acknowledged.`);
  }

  if (newCount > 0) {
    console.log(`📥 Pulled ${newCount} new events. Store size: ${eventStore.size}`);
  }

  return messages;
}

// ───────────── Accessors ─────────────

function getAllEvents() {
  return Array.from(eventStore.values()).sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );
}

function getEvent(eventId) {
  return eventStore.get(eventId) || null;
}

function updateEvent(eventId, updates) {
  const event = eventStore.get(eventId);
  if (event) {
    Object.assign(event, updates);
    eventStore.set(eventId, event);
    persistEventSingle(event);
  }
}

function addManualEvent(event) {
  eventStore.set(event.eventId, event);
  persistEventSingle(event);
}

/**
 * Updates an event in the store with an AI summary.
 */
function updateEventSummary(eventId, summary) {
  const event = eventStore.get(eventId);
  if (event) {
    event.summary = summary;
    persistEventSingle(event);
    console.log(`📝 Saved summary to persistent store for event: ${eventId}`);
  }
}

module.exports = {
  initPubSub,
  pullEvents,
  getAllEvents,
  getEvent,
  updateEvent,
  addManualEvent,
  updateEventSummary,
  persistEventSingle, // Exported for backfill
  loadPersistedEvents
};
