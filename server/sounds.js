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

function findTimerEndUrl() {
  const file = readDir(SOUNDS_DIR).find((f) => /^timer-end\.(mp3|wav|ogg|m4a)$/i.test(f));
  return file ? `sounds/${encodeURIComponent(file)}` : null;
}

module.exports = { loadSounds, findTimerEndUrl, BUZZERS_DIR };
