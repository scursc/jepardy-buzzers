// All game state and rules live here. Nothing in this file knows about sockets,
// so the same logic keeps working no matter what front end talks to it.

const crypto = require("crypto");

// Muted tones that sit well on a near-black background.
const PALETTE = [
  "#b36b6b", // red
  "#bf8a5c", // orange
  "#c4ad6e", // sand
  "#93a56c", // olive
  "#6f9c78", // green
  "#5f9994", // teal
  "#6a90ab", // steel blue
  "#7b82b3", // indigo
  "#9780b0", // violet
  "#aa7a9c", // plum
  "#b5868c", // rose
  "#a3a39b", // grey
];

const MIN_BUZZERS = 1;
const MAX_BUZZERS = 12;
const MAX_NAME_LENGTH = 20;
const BUZZ_COOLDOWN_MS = 80; // stops a single player flooding the feed
const MAX_FEED_ENTRIES = 500;
const DEFAULT_TIMER_MS = 30_000;

// Letters that are hard to confuse with each other or with numbers.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

const rooms = new Map();

function randomToken() {
  return crypto.randomBytes(16).toString("hex");
}

function newCode() {
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function clampBuzzers(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return 4;
  return Math.min(MAX_BUZZERS, Math.max(MIN_BUZZERS, n));
}

function createRoom(maxBuzzers) {
  const room = {
    code: newCode(),
    hostToken: randomToken(),
    hostSockets: 0,
    hostLeftAt: null,
    maxBuzzers: clampBuzzers(maxBuzzers),
    players: [],
    armed: false,
    round: 1,
    feed: [],
    feedSeq: 0,
    feedEpoch: 0, // bumped whenever the feed is wiped, so clients know to start over
    firstBuzzAt: null,
    timer: { durationMs: DEFAULT_TIMER_MS, remainingMs: DEFAULT_TIMER_MS, endsAt: null },
    lockOnTimerEnd: true,
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function getRoom(code) {
  if (typeof code !== "string") return null;
  return rooms.get(code.trim().toUpperCase()) || null;
}

function deleteRoom(code) {
  rooms.delete(code);
}

function allRooms() {
  return rooms.values();
}

// ---------- players ----------

function takenColors(room, exceptPlayerId) {
  return room.players.filter((p) => p.id !== exceptPlayerId).map((p) => p.color);
}

function takenSounds(room, exceptPlayerId) {
  return room.players.filter((p) => p.id !== exceptPlayerId && p.sound).map((p) => p.sound);
}

function nextFreeSlot(room) {
  const used = new Set(room.players.map((p) => p.slot));
  for (let s = 1; s <= room.maxBuzzers; s++) {
    if (!used.has(s)) return s;
  }
  return null;
}

function findPlayerByToken(room, token) {
  if (!token) return null;
  return room.players.find((p) => p.token === token) || null;
}

// `soundIds` is the list of sound files the server found. When there are
// none, players can still join without a sound.
function joinPlayer(room, { name, color, sound, token }, soundIds = []) {
  // A returning player (page refresh) gets their old buzzer back.
  const existing = findPlayerByToken(room, token);
  if (existing) return { player: existing, rejoined: true };

  name = String(name || "").trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return { error: "Please enter a name." };
  if (!PALETTE.includes(color)) return { error: "Please pick a color." };
  if (takenColors(room).includes(color)) return { error: "That color is already taken." };
  if (soundIds.length) {
    if (!soundIds.includes(sound)) return { error: "Please pick a buzz sound." };
    if (takenSounds(room).includes(sound)) return { error: "That sound is already taken." };
  } else {
    sound = null;
  }

  const slot = nextFreeSlot(room);
  if (slot === null) return { error: "This room is full." };

  const player = {
    id: randomToken().slice(0, 8),
    token: randomToken(),
    name,
    color,
    sound,
    slot,
    sockets: 0,
    lastBuzzAt: 0,
  };
  room.players.push(player);
  room.players.sort((a, b) => a.slot - b.slot);
  addEvent(room, `${name} joined`);
  return { player, rejoined: false };
}

function removePlayer(room, playerId) {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return null;
  room.players = room.players.filter((p) => p.id !== playerId);
  addEvent(room, `${player.name} was removed`);
  return player;
}

function setMaxBuzzers(room, n) {
  n = clampBuzzers(n);
  const highestUsed = Math.max(0, ...room.players.map((p) => p.slot));
  if (n < highestUsed) {
    return { error: `Buzzer ${highestUsed} is in use. Remove that player first.` };
  }
  room.maxBuzzers = n;
  return { ok: true };
}

// ---------- feed ----------

function pushFeed(room, entry) {
  entry.id = ++room.feedSeq;
  room.feed.push(entry);
  if (room.feed.length > MAX_FEED_ENTRIES) room.feed.shift();
  return entry;
}

function addEvent(room, text) {
  return pushFeed(room, { type: "event", text, at: Date.now() });
}

// ---------- buzzing ----------

function arm(room) {
  if (room.armed) return;
  room.armed = true;
  addEvent(room, "Buzzers armed");
}

function lock(room, reason = "Buzzers locked") {
  if (!room.armed) return;
  room.armed = false;
  addEvent(room, reason);
}

// Returns the new feed entry, or null if the press was ignored.
function buzz(room, playerId, now = Date.now()) {
  if (!room.armed) return null;
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return null;
  if (now - player.lastBuzzAt < BUZZ_COOLDOWN_MS) return null;
  player.lastBuzzAt = now;

  const isFirst = room.firstBuzzAt === null;
  if (isFirst) room.firstBuzzAt = now;

  const pressNumber =
    room.feed.filter((e) => e.type === "buzz" && e.playerId === playerId).length + 1;

  return pushFeed(room, {
    type: "buzz",
    playerId,
    name: player.name,
    color: player.color,
    sound: player.sound,
    slot: player.slot,
    at: now,
    offsetMs: now - room.firstBuzzAt,
    isFirst,
    pressNumber,
  });
}

function resetRound(room) {
  room.armed = false;
  room.round += 1;
  room.feed = [];
  room.feedEpoch += 1;
  room.firstBuzzAt = null;
  addEvent(room, `Round ${room.round}`);
}

function clearFeed(room) {
  room.feed = [];
  room.feedEpoch += 1;
  room.firstBuzzAt = null;
}

// ---------- timer ----------
// While running, the server keeps `endsAt` on its own clock. Clients receive
// `remainingMs` and count down locally, so device clocks never need to agree.

function timerRemaining(room, now = Date.now()) {
  const t = room.timer;
  if (t.endsAt === null) return t.remainingMs;
  return Math.max(0, t.endsAt - now);
}

function timerSet(room, seconds) {
  seconds = Math.round(Number(seconds));
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) {
    return { error: "Timer must be between 1 and 3600 seconds." };
  }
  room.timer = { durationMs: seconds * 1000, remainingMs: seconds * 1000, endsAt: null };
  return { ok: true };
}

function timerStart(room, now = Date.now()) {
  const t = room.timer;
  if (t.endsAt !== null) return;
  if (t.remainingMs <= 0) t.remainingMs = t.durationMs;
  t.endsAt = now + t.remainingMs;
  addEvent(room, "Timer started");
}

function timerPause(room, now = Date.now()) {
  const t = room.timer;
  if (t.endsAt === null) return;
  t.remainingMs = Math.max(0, t.endsAt - now);
  t.endsAt = null;
  addEvent(room, "Timer paused");
}

function timerReset(room) {
  room.timer.remainingMs = room.timer.durationMs;
  room.timer.endsAt = null;
}

// Called on an interval. Returns true if this room's timer just ran out.
function checkTimer(room, now = Date.now()) {
  const t = room.timer;
  if (t.endsAt === null || now < t.endsAt) return false;
  t.endsAt = null;
  t.remainingMs = 0;
  addEvent(room, "Time's up");
  if (room.lockOnTimerEnd) lock(room, "Buzzers locked (time's up)");
  return true;
}

// ---------- what clients see ----------
// Tokens never leave the server.

function publicState(room, now = Date.now()) {
  return {
    code: room.code,
    maxBuzzers: room.maxBuzzers,
    armed: room.armed,
    round: room.round,
    lockOnTimerEnd: room.lockOnTimerEnd,
    hostConnected: room.hostSockets > 0,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      sound: p.sound,
      slot: p.slot,
      connected: p.sockets > 0,
    })),
    feed: room.feed,
    feedEpoch: room.feedEpoch,
    timer: {
      durationMs: room.timer.durationMs,
      remainingMs: timerRemaining(room, now),
      running: room.timer.endsAt !== null,
    },
    palette: PALETTE,
  };
}

module.exports = {
  PALETTE,
  MIN_BUZZERS,
  MAX_BUZZERS,
  createRoom,
  getRoom,
  deleteRoom,
  allRooms,
  takenColors,
  takenSounds,
  nextFreeSlot,
  joinPlayer,
  removePlayer,
  setMaxBuzzers,
  arm,
  lock,
  buzz,
  resetRound,
  clearFeed,
  timerSet,
  timerStart,
  timerPause,
  timerReset,
  checkTimer,
  publicState,
};
