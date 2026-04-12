const axios = require('axios');
require('dotenv').config();

let accessToken = null;
let expiresAt = null;

/**
 * Validates environment variables and fetches the initial access token.
 * Throws a descriptive error if variables are missing or auth fails.
 */
async function initAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    const missing = [];
    if (!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
    if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    if (!GOOGLE_REFRESH_TOKEN) missing.push('GOOGLE_REFRESH_TOKEN');
    throw new Error(`Missing OAuth credentials in .env: ${missing.join(', ')}`);
  }

  console.log('🔐 Initializing OAuth session...');
  await refreshAccessToken();
}

/**
 * Exchanges the refresh token for a fresh access token.
 */
async function refreshAccessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;

  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    });

    const data = response.data;
    accessToken = data.access_token;
    // Set expiry with a 60-second buffer
    expiresAt = Date.now() + (data.expires_in * 1000) - 60000;

    console.log('✅ Access token refreshed.');
  } catch (err) {
    const message = err.response?.data?.error_description || err.message;
    throw new Error(`Auth failed — check credentials: ${message}`);
  }
}

/**
 * Returns a valid access token, refreshing it if expired or near expiry.
 */
async function getValidToken() {
  if (!accessToken || !expiresAt || Date.now() >= expiresAt) {
    console.log('🔄 Token expired or missing. Refreshing...');
    await refreshAccessToken();
  }
  return accessToken;
}

module.exports = {
  initAuth,
  getValidToken,
};
