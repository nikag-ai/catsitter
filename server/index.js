require('dotenv').config();
const express = require('express');
const path = require('path');
const { initAuth } = require('./auth');
const { initPubSub } = require('./pubsub');
const { initGemini } = require('./gemini');
const apiRoutes = require('./routes');
const { CACHE_DIR } = require('./media');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
// Allow any variation of video/webm (e.g. with charset)
app.use(express.raw({ 
  type: (req) => req.headers['content-type']?.includes('video/webm'), 
  limit: '100mb' 
}));

// Serve cached media (images/videos)
app.use('/media', express.static(CACHE_DIR));

// API Routes
app.use('/api', apiRoutes);

// Startup sequence
(async () => {
  try {
    console.log('🚀 Starting Febo Dashboard Backend...');
    
    // 1. Auth check
    await initAuth();
    
    // 2. Pub/Sub listener
    await initPubSub();
    
    // 3. AI client
    initGemini();
    
    app.listen(PORT, () => {
      console.log(`✅ Febo backend is running on http://localhost:${PORT}`);
      console.log(`📂 Serving media from: ${CACHE_DIR}`);
    });
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  }
})();
