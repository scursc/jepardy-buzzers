// Join page: room code, name, colour and buzz sound.

const joinCode = $("#join-code");
const swatchBox = $("#swatches");
const soundList = $("#sound-list");

let selectedColor = null;
let selectedSound = null;
let peeked = null; // last room:peek result for the current code

// ----- sound preview (plays on this device only) -----

let preview = null;
let previewRow = null;

function playPreview(sound, row) {
  if (preview) {
    preview.pause();
    previewRow?.classList.remove("playing");
  }
  preview = new Audio(sound.url);
  previewRow = row;
  row.classList.add("playing");
  preview.addEventListener("ended", () => row.classList.remove("playing"));
  preview.play().catch(() => {
    row.classList.remove("playing");
    toast("couldn't play that sound", "error");
  });
}

// ----- pickers -----

function hint(text, cls = "dim small") {
  return el("p", { class: cls }, text);
}

function renderPickers() {
  if (!peeked) return;
  const { palette, takenColors, sounds, takenSounds, full } = peeked;

  if (full) {
    swatchBox.replaceChildren(hint("this room is full", "red small"));
    soundList.replaceChildren(el("li", { class: "sound-empty red small" }, "this room is full"));
    return;
  }

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
    swatchBox.replaceChildren(hint("enter a room code first"));
    soundList.replaceChildren(el("li", { class: "sound-empty dim small" }, "enter a room code first"));
    return;
  }
  const res = await send("room:peek", { code });
  if (normalizeCode(joinCode.value) !== code) return; // user kept typing
  if (res.error) {
    peeked = null;
    swatchBox.replaceChildren(hint(res.error.toLowerCase(), "red small"));
    soundList.replaceChildren();
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

const presetCode = normalizeCode(getParam("room"));
if (presetCode) {
  joinCode.value = presetCode;
  peek();
}

// Keep taken colours/sounds fresh while the player is choosing.
setInterval(() => {
  if (peeked && !document.hidden) peek();
}, 4000);
