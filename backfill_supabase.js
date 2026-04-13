const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { persistEventSingle } = require('./server/pubsub');

async function backfill() {
  const EVENTS_FILE = path.join(__dirname, 'cache', 'events.json');
  
  if (!fs.existsSync(EVENTS_FILE)) {
    console.log("No events.json found. Skipping backfill.");
    return;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));
    console.log(`🚀 Starting backfill of ${data.length} events...`);
    
    for (const event of data) {
      if (!event.type) {
        if (event.eventId.startsWith('manual-')) event.type = 'manual';
        else if (event.eventId.startsWith('cron-')) event.type = 'cron';
        else event.type = 'motion';
      }
      console.log(`📤 Migrating ${event.eventId} (${event.timestamp})...`);
      await persistEventSingle(event);
    }
    
    console.log("✅ Backfill complete!");
  } catch (err) {
    console.error("❌ Backfill failed:", err.message);
  }
}

backfill();
