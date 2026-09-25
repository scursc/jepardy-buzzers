// Finds the sound files in public/sounds when the server starts.
// Drop audio files into public/sounds/buzzers/ and restart to add them.

const fs = require("fs");
const path = require("path");

const SOUNDS_DIR = path.join(__dirname, "..", "public", "sounds");
const BUZZERS_DIR = path.join(SOUNDS_DIR, "buzzers");
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a)$/i;

function readDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// "air-horn_2.mp3" -> "air horn 2"
function displayName(file) {
  return file.replace(AUDIO_EXT, "").replace(/[-_]+/g, " ").trim();
}

function loadSounds() {
  return readDir(BUZZERS_DIR)
    .filter((f) => AUDIO_EXT.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((file) => ({
      id: file,
      name: displayName(file),
      url: `sounds/buzzers/${encodeURIComponent(file)}`,
    }));
}

// Finds public/sounds/<base>.(mp3|wav|ogg|m4a), or null if there isn't one.
function findSfxUrl(base) {
  const file = readDir(SOUNDS_DIR).find(
    (f) => AUDIO_EXT.test(f) && f.replace(AUDIO_EXT, "").toLowerCase() === base.toLowerCase()
  );
  return file ? `sounds/${encodeURIComponent(file)}` : null;
}

function findTimerEndUrl() {
  return findSfxUrl("timer-end");
}

module.exports = { loadSounds, findTimerEndUrl, findSfxUrl, BUZZERS_DIR };
