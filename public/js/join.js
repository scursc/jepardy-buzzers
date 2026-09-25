// Join panel on the home page: room code, name, colour and buzz sound.
// Colour and sound stay hidden until the code matches a room.

const joinCode = $("#join-code");
const joinStatus = $("#join-status");
const joinExtras = $("#join-extras");
const swatchBox = $("#swatches");
const soundList = $("#sound-list");

let selectedColor = null;
let selectedSound = null;
let peeked = null; // last room:peek result for the current code

// ----- sound preview (plays on this device only) -----

let previewRow = null;

// Called from the row's tap, so the browser allows sound to start.
async function playPreview(sound, row) {
  audio.unlock();
  if (previewRow) previewRow.classList.remove("playing");
  previewRow = row;
  row.classList.add("playing");
  const played = await audio.play(sound.url);
  row.classList.remove("playing");
  if (!played) toast("couldn't play that sound on this browser", "error");
}

// ----- status line + pickers -----

// One full-width line under the name field, e.g. "no room with that code".
function setStatus(text, kind = "dim") {
  joinStatus.textContent = text;
  joinStatus.classList.toggle("dim", kind === "dim");
  joinStatus.classList.toggle("red", kind === "red");
  joinStatus.classList.toggle("green", kind === "green");
}

function showPickers(show) {
  setRevealed(joinExtras, show);
}

// The join button only works once there's a room with a free buzzer.
function setJoinable(joinable) {
  $("#join-btn").disabled = !joinable;
}

function renderPickers() {
  if (!peeked) return;
  const { code, palette, takenColors, sounds, takenSounds, full } = peeked;

  if (full) {
    setStatus(`room ${code} is full`, "red");
    showPickers(false);
    setJoinable(false);
    selectedColor = null; // don't send a stale pick if a slot frees up later
    selectedSound = null;
    return;
  }
  setStatus(`room ${code} found · pick a colour and a sound`, "green");
  showPickers(true);
  setJoinable(true);

  // Colours
  const colorTaken = new Set(takenColors);
  if (!selectedColor || colorTaken.has(selectedColor)) {
    selectedColor = palette.find((c) => !colorTaken.has(c)) || null;
  }
  swatchBox.replaceChildren(
    ...palette.map((color) => {
      const taken = colorTaken.has(color);
      return el("button", {
        type: "button",
        class: `swatch${taken ? " taken" : ""}${color === selectedColor ? " selected" : ""}`,
        style: { "--swatch": color },
        disabled: taken,
        "aria-label": taken ? "colour taken" : "choose colour",
        "aria-pressed": String(color === selectedColor),
        onclick: () => {
          selectedColor = color;
          renderPickers();
        },
      });
    })
  );

  // Sounds
  if (!sounds.length) {
    selectedSound = null;
    soundList.replaceChildren(
      el("li", { class: "sound-empty dim small" }, "no sounds found — you can still join")
    );
    return;
  }
  const soundTaken = new Set(takenSounds);
  if (selectedSound && soundTaken.has(selectedSound)) selectedSound = null;
  soundList.replaceChildren(
    ...sounds.map((sound) => {
      const taken = soundTaken.has(sound.id);
      const selected = sound.id === selectedSound;
      const row = el(
        "button",
        {
          type: "button",
          class: `sound-row${selected ? " selected" : ""}`,
          disabled: taken,
          "aria-pressed": String(selected),
          onclick: () => {
            selectedSound = sound.id;
            // Update the marks in place so the preview keeps playing.
            for (const r of soundList.querySelectorAll(".sound-row")) {
              const isThis = r === row;
              r.classList.toggle("selected", isThis);
              r.setAttribute("aria-pressed", String(isThis));
              $(".mark", r).textContent = isThis ? "(*)" : "( )";
            }
            playPreview(sound, row);
          },
        },
        el("span", { class: "mark" }, selected ? "(*)" : "( )"),
        el("span", {}, sound.name),
        el("span", { class: "play-state" }, taken ? "taken" : "▶")
      );
      return el("li", {}, row);
    })
  );
}

async function peek() {
  const code = normalizeCode(joinCode.value);
  joinCode.value = code;
  if (code.length !== 4) {
    peeked = null;
    setStatus("enter the room code from the host");
    showPickers(false);
    setJoinable(true);
    return;
  }
  const res = await send("room:peek", { code });
  if (normalizeCode(joinCode.value) !== code) return; // user kept typing
  // A network blip keeps the pickers as they are; the next poll tries again.
  if (res.timeout) return;
  if (res.error) {
    peeked = null;
    setStatus(res.error.toLowerCase(), "red");
    showPickers(false);
    setJoinable(true);
    return;
  }
  // Only rebuild the pickers if something changed, so a tap isn't lost mid-press.
  const changed = !peeked || JSON.stringify(peeked) !== JSON.stringify(res);
  peeked = res;
  if (changed) renderPickers();
}

joinCode.addEventListener("input", peek);

// ----- join -----

$("#join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = normalizeCode(joinCode.value);
  const name = $("#join-name").value.trim();
  if (!peeked || peeked.code !== code) return toast("enter a valid room code", "error");
  if (!name) return toast("enter your name", "error");
  if (!selectedColor) return toast("pick a colour", "error");
  if (peeked.sounds.length && !selectedSound) return toast("pick a buzz sound", "error");

  const btn = $("#join-btn");
  btn.disabled = true;
  const res = await send("player:join", {
    code,
    name,
    color: selectedColor,
    sound: selectedSound,
    token: store.get(`player:${code}`),
  });
  btn.disabled = false;
  if (res.error) {
    toast(res.error.toLowerCase(), "error");
    peeked = null; // force a fresh render
    peek(); // someone may have just taken that colour or sound
    return;
  }
  store.set(`player:${code}`, res.token);
  store.set("lastName", name);
  location.href = `play.html?room=${code}`;
});

// ----- prefill -----

const lastName = store.get("lastName");
if (lastName) $("#join-name").value = lastName;

// ?room=CODE links (home.js opens the panel for them).
const joinLinkCode = normalizeCode(getParam("room"));
if (joinLinkCode) {
  joinCode.value = joinLinkCode;
  peek();
}

// Keep taken colours/sounds fresh while the player is choosing: only while the
// join panel is open and a full code has been typed (this also retries after a
// timeout or a "full" room freeing up).
setInterval(() => {
  const panelOpen = $("#join-panel").classList.contains("open");
  if (panelOpen && !document.hidden && normalizeCode(joinCode.value).length === 4) peek();
}, 4000);
