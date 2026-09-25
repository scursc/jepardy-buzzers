// Home page: a small menu to create a room, go to the join page, or spectate.

function setupToggle(buttonSel, panelSel, focusSel) {
  const button = $(buttonSel);
  const panel = $(panelSel);
  button.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    if (open && focusSel) $(focusSel).focus();
  });
}

setupToggle("#create-toggle", "#create-panel");
setupToggle("#watch-toggle", "#watch-panel", "#watch-code");

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
  const res = await send("host:create", { maxBuzzers: buzzerCount });
  if (res.error) {
    toast(res.error, "error");
    btn.disabled = false;
    return;
  }
  store.set(`host:${res.code}`, res.hostToken);
  location.href = `host.html?room=${res.code}`;
});

// ----- spectate -----

const watchCode = $("#watch-code");
watchCode.addEventListener("input", () => (watchCode.value = normalizeCode(watchCode.value)));

$("#watch-panel").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = normalizeCode(watchCode.value);
  const res = await send("room:peek", { code });
  if (res.error) {
    toast(res.error, "error");
    return;
  }
  location.href = `spectate.html?room=${code}`;
});

// ?room=CODE links pass straight through to the join page.
const presetCode = normalizeCode(getParam("room"));
if (presetCode) {
  $("#join-link").href = `join.html?room=${presetCode}`;
  watchCode.value = presetCode;
}
