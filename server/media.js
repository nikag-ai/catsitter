const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');

/**
 * Ensures the cache directory exists.
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`📁 Created cache directory at: ${CACHE_DIR}`);
  }
}

/**
 * Writes a buffer to the cache directory with the given eventId and extension.
 */
async function cacheMedia(eventId, buffer, extension) {
  ensureCacheDir();
  const filename = `${eventId}.${extension}`;
  const filePath = path.join(CACHE_DIR, filename);
  
  fs.writeFileSync(filePath, buffer);
  console.log(`💾 Cached media: ${filename}`);
  return filename;
}

/**
 * Checks if a file exists in the cache for a given eventId.
 * Returns the file info { filename, mediaType } or null.
 */
function getCachedMedia(eventId) {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  const match = files.find(f => f.startsWith(eventId));
  
  if (match) {
    const ext = path.extname(match).slice(1);
    return {
      filename: match,
      mediaType: (ext === 'mp4' || ext === 'webm') ? 'video' : 'image',
      localPath: path.join(CACHE_DIR, match)
    };
  }
  return null;
}

/**
 * Returns the public URL for a cached file.
 */
function getMediaUrl(filename) {
  return `/media/${filename}`;
}

module.exports = {
  cacheMedia,
  getCachedMedia,
  getMediaUrl,
  CACHE_DIR
};
