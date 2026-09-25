// Host page: controls the room and watches the live feed.

const code = normalizeCode(getParam("room"));
const hostToken = store.get(`host:${code}`);
if (!code || !hostToken) location.replace("index.html");

$("#room-code").textContent = code;

let state = null;
let soundNames = new Map(); // sound id -> display name
const clock = createTimerClock();
const renderFeed = createFeedRenderer($("#feed"));
renderTimerLoop(clock, $("#timer-display"), $("#timer-bar"));

// ----- connecting -----

async function rejoin() {
  const res = await send("host:rejoin", { code, hostToken });
  if (res.error) {
    store.remove(`host:${code}`);
    showGone(res.error);
  }
}

function showGone(message) {
  document.body.replaceChildren(
    el(
      "main",
      { class: "shell center-screen" },
      el(
        "div",
        { class: "box" },
        el("h2", { class: "box-title" }, "room closed"),
        el("p", {}, message.toLowerCase()),
        el("a", { class: "btn btn-primary btn-block", href: "index.html" }, "home")
      )
    )
  );
}

socket.on("connect", rejoin);
socket.on("roomClosed", () => {
  store.remove(`host:${code}`);
  showGone("This room has been closed.");
});

fetch("/api/info")
  .then((r) => r.json())
  .then(({ urls, sounds }) => {
    soundNames = new Map(sounds.map((s) => [s.id, s.name]));
    const url = joinAddress(urls);
    $("#join-hint").replaceChildren("join at ", el("b", {}, url));
    if (state) render();
  })
  .catch(() => {});

// ----- actions -----

async function act(event, payload) {
  const res = await send(event, payload);
  if (res.error) toast(res.error.toLowerCase(), "error");
  return res;
}

function toggleArm() {
  if (!state) return;
  act(state.armed ? "host:lock" : "host:arm");
}

function toggleTimer() {
  if (!state) return;
  act(state.timer.running ? "host:timer:pause" : "host:timer:start");
}

// Marks the first buzz "correct" or "wrong". Wrong re-arms the buzzers.
function judge(verdict) {
  if (!state || state.judged || !buzzOrder(state.feed)[0]) return;
  act("host:judge", { verdict });
}

$("#arm-btn").addEventListener("click", toggleArm);
$("#next-round").addEventListener("click", () => act("host:resetRound"));
$("#clear-feed").addEventListener("click", () => act("host:clearFeed"));
$("#timer-toggle").addEventListener("click", toggleTimer);
$("#timer-reset").addEventListener("click", () => act("host:timer:reset"));
$("#auto-lock").addEventListener("change", () => act("host:toggleLockOnTimerEnd"));

$("#timer-presets").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-seconds]");
  if (btn) act("host:timer:set", { seconds: Number(btn.dataset.seconds) });
});

$("#timer-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#timer-seconds");
  if (!input.value) return;
  act("host:timer:set", { seconds: Number(input.value) });
  input.value = "";
  input.blur();
});

$("#max-stepper").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-step]");
  if (btn && state) act("host:setMaxBuzzers", { n: state.maxBuzzers + Number(btn.dataset.step) });
});

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  const res = await act("chat:send", { text });
  if (!res.error) input.value = "";
});

$("#close-room").addEventListener("click", async () => {
  if (!confirm("Close this room for everyone?")) return;
  await act("host:closeRoom");
});

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "Space") {
    e.preventDefault();
    toggleArm();
  } else if (e.key === "n" || e.key === "N") {
    act("host:resetRound");
  } else if (e.key === "t" || e.key === "T") {
    toggleTimer();
  } else if (e.key === "c" || e.key === "C") {
    judge("correct");
  } else if (e.key === "w" || e.key === "W") {
    judge("wrong");
  }
});

// ----- rendering -----

socket.on("state", (s) => {
  state = s;
  render();
});

function render() {
  const s = state;

  // Status
  const status = $("#status");
  status.textContent = s.armed ? "armed" : s.rearming ? "re-arming" : "locked";
  status.classList.toggle("armed", s.armed);
  const armBtn = $("#arm-btn");
  armBtn.textContent = s.armed ? "lock" : "arm";
  armBtn.classList.toggle("is-armed", s.armed);
  $("#round-label").replaceChildren("round ", el("b", {}, s.round));

  // Timer
  clock.update(s.timer);
  const t = s.timer;
  $("#timer-toggle").textContent = t.running
    ? "pause"
    : t.remainingMs > 0 && t.remainingMs < t.durationMs
      ? "resume"
      : "start";
  $("#auto-lock").checked = s.lockOnTimerEnd;
  for (const chip of document.querySelectorAll("#timer-presets [data-seconds]")) {
    chip.classList.toggle("active", Number(chip.dataset.seconds) * 1000 === t.durationMs);
  }

  // Players
  $("#max-buzzers").textContent = s.maxBuzzers;
  const bySlot = new Map(s.players.map((p) => [p.slot, p]));
  const slots = [];
  for (let slot = 1; slot <= s.maxBuzzers; slot++) {
    const p = bySlot.get(slot);
    const num = el("span", { class: "slot-num" }, String(slot).padStart(2, "0"));
    slots.push(
      p
        ? el(
            "li",
            { class: `slot${p.connected ? "" : " offline"}`, style: { "--player": p.color } },
            num,
            el("span", { class: "dot" }),
            el("span", { class: "slot-name" }, p.name),
            el("span", { class: "slot-sound", title: "buzz sound" }, p.sound ? soundNames.get(p.sound) || p.sound : ""),
            el(
              "button",
              {
                type: "button",
                class: "icon-btn",
                title: `remove ${p.name}`,
                "aria-label": `Remove ${p.name}`,
                onclick: () => {
                  if (confirm(`Remove ${p.name} from the room?`)) act("host:kick", { playerId: p.id });
                },
              },
              "×"
            )
          )
        : el("li", { class: "slot empty" }, num, el("span"), el("span", { class: "slot-name" }, "open"))
    );
  }
  $("#slot-list").replaceChildren(...slots);

  // Feed
  const first = buzzOrder(s.feed)[0];
  const firstLine = $("#first-line");
  firstLine.classList.toggle("has-first", Boolean(first));
  firstLine.replaceChildren(
    ...(first
      ? [
          el("span", {}, "> first"),
          el("span", { class: "first-name", style: { "--player": first.color } }, first.name),
          el("span", { class: "dim" }, `buzzer ${first.slot}`),
          s.judged
            ? el("span", { class: "judge-done" }, `> ${first.name} — correct`)
            : el(
                "span",
                { class: "judge-btns" },
                el("button", { type: "button", class: "btn btn-sm btn-primary", onclick: () => judge("correct") }, "correct"),
                el("button", { type: "button", class: "btn btn-sm btn-danger", onclick: () => judge("wrong") }, "wrong")
              ),
        ]
      : [s.armed ? "waiting for a buzz" : "buzzers locked", el("span", { class: "cursor" }, "▌")])
  );
  renderOrder($("#order-list"), s.feed);
  renderFeed(s.feed, s.feedEpoch);
}
