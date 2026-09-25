// Shared helpers used by every page.

const socket = io();

// Promise wrapper around socket.emit with an acknowledgement.
function send(event, payload = {}) {
  return new Promise((resolve) => {
    socket.timeout(5000).emit(event, payload, (err, res) => {
      if (err) resolve({ error: "The server didn't respond. Is it still running?" });
      else resolve(res || { ok: true });
    });
  });
}

function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

// localStorage can throw (private windows, blocked storage), so never trust it.
const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "style" && typeof value === "object") {
      // setProperty is needed for CSS variables like --player.
      for (const [prop, v] of Object.entries(value)) node.style.setProperty(prop, v);
    }
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function formatClock(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 14:03:07.512
function formatTimeOfDay(ms) {
  const d = new Date(ms);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

// ██████░░░░ style progress bar, `fraction` from 0 to 1.
function textBar(fraction, width = 24) {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// The address players should open, shown as "join at …". Whatever address this
// page was opened with works for everyone (Wi-Fi IP or public domain), except
// localhost, which only works on this PC, so then use the Wi-Fi address.
function joinAddress(lanUrls) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const url = local && lanUrls && lanUrls[0] ? lanUrls[0] : location.origin;
  return url.replace(/^https?:\/\//, "");
}

function formatOffset(ms) {
  return `+${(ms / 1000).toFixed(2)}s`;
}

function toast(message, kind = "info") {
  let box = $(".toasts");
  if (!box) {
    box = el("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(box);
  }
  const t = el("div", { class: `toast toast-${kind}` }, message);
  box.append(t);
  setTimeout(() => t.classList.add("leaving"), 2800);
  setTimeout(() => t.remove(), 3200);
}

// Players ranked by their first press this round. A wrong answer
// (an entry with resetsOrder) starts the ranking over.
function buzzOrder(feed) {
  let start = 0;
  for (let i = feed.length - 1; i >= 0; i--) {
    if (feed[i].resetsOrder) {
      start = i + 1;
      break;
    }
  }
  const seen = new Set();
  const order = [];
  for (const e of feed.slice(start)) {
    if (e.type !== "buzz" || seen.has(e.playerId)) continue;
    seen.add(e.playerId);
    order.push(e);
  }
  return order;
}

// Counts the timer down locally between server updates.
function createTimerClock() {
  let base = { remainingMs: 0, running: false, durationMs: 0, at: performance.now() };
  return {
    update(timer) {
      base = { ...timer, at: performance.now() };
    },
    remaining() {
      if (!base.running) return base.remainingMs;
      return Math.max(0, base.remainingMs - (performance.now() - base.at));
    },
    get running() {
      return base.running;
    },
    get durationMs() {
      return base.durationMs;
    },
  };
}

// Draws the timer into an element every frame, with warning colours near the end.
function renderTimerLoop(clock, displayEl, barEl) {
  const barFontSize = barEl ? parseFloat(getComputedStyle(barEl).fontSize) || 14 : 14;
  function frame() {
    const ms = clock.remaining();
    const text = formatClock(ms);
    if (displayEl.textContent !== text) displayEl.textContent = text;
    const low = clock.running && ms <= 5000 && ms > 0;
    displayEl.classList.toggle("timer-low", low);
    displayEl.classList.toggle("timer-done", ms <= 0);
    if (barEl && clock.durationMs > 0) {
      // Fit the bar to its box: monospace glyphs are 0.6em wide.
      const cols = Math.max(8, Math.floor(barEl.clientWidth / (barFontSize * 0.6)));
      const bar = textBar(ms / clock.durationMs, cols);
      if (barEl.textContent !== bar) barEl.textContent = bar;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Shows a banner while the connection to the server is down.
(function connectionBanner() {
  const banner = el("div", { class: "conn-banner", hidden: true }, "connection lost — reconnecting…");
  document.addEventListener("DOMContentLoaded", () => document.body.append(banner));
  socket.on("disconnect", () => (banner.hidden = false));
  socket.on("connect", () => (banner.hidden = true));
})();
