// Home page: create a room, join one, or open the game screen. Each menu item
// slides its panel open (see .reveal in styles.css); only one is open at a time.

const menuToggles = [...document.querySelectorAll(".menu-item[data-panel]")];

function openPanel(name, { focus = true } = {}) {
  for (const toggle of menuToggles) {
    const panel = document.getElementById(toggle.getAttribute("aria-controls"));
    const open = toggle.dataset.panel === name && !panel.classList.contains("open");
    setRevealed(panel, open);
    toggle.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (open && focus) {
      // A panel can mark what to focus (create room focuses its create button,
      // so Enter creates the room instead of pressing the "-" stepper).
      const target = panel.querySelector("[data-autofocus]") || panel.querySelector("input");
      if (target) target.focus({ preventScroll: true });
    }
  }
}

for (const toggle of menuToggles) {
  toggle.addEventListener("click", () => openPanel(toggle.dataset.panel));
}

// ----- create -----

let buzzerCount = 4;
const countOut = $("#buzzer-count");

$("#stepper").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-step]");
  if (!btn) return;
  buzzerCount = Math.min(12, Math.max(1, buzzerCount + Number(btn.dataset.step)));
  countOut.textContent = String(buzzerCount).padStart(2, "0");
});

$("#create-btn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  // Reuse this browser's last audio settings (saved by the host page).
  let audio = null;
  try {
    audio = JSON.parse(store.get("hostAudio"));
  } catch {}
  const res = await send("host:create", { maxBuzzers: buzzerCount, audio });
  if (res.error) {
    toast(res.error, "error");
    btn.disabled = false;
    return;
  }
  store.set(`host:${res.code}`, res.hostToken);
  location.href = `host.html?room=${res.code}`;
});

// ----- game screen -----

const watchCode = $("#watch-code");
watchCode.addEventListener("input", () => (watchCode.value = normalizeCode(watchCode.value)));

$("#watch-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = normalizeCode(watchCode.value);
  const res = await send("room:peek", { code });
  if (res.error) {
    toast(res.error.toLowerCase(), "error");
    return;
  }
  location.href = `spectate.html?room=${code}`;
});

// ?room=CODE (e.g. the player page's "join again" link) opens the join panel
// with the code filled in; join.js picks the code up from the same parameter.
const linkedCode = normalizeCode(getParam("room"));
if (linkedCode) {
  watchCode.value = linkedCode;
  openPanel("join", { focus: false });
}
