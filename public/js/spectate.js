// Spectator screen: the big display, and the only page that plays buzz sounds.

const code = normalizeCode(getParam("room"));
if (!code) location.replace("index.html");

$("#room-code").textContent = code;
$("#gate-code").textContent = code;

let state = null;
let timerEndUrl = null;
const clock = createTimerClock();
const renderFeed = createFeedRenderer($("#feed"));
renderTimerLoop(clock, $("#timer-display"), $("#timer-bar"));

// Same path the server builds in server/sounds.js.
function soundUrl(id) {
  return `sounds/buzzers/${encodeURIComponent(id)}`;
}

// ----- sound -----

const MUTE_KEY = "spectatorMuted";
audio.muted = store.get(MUTE_KEY) === "1";

function updateMuteButton() {
  $("#mute-btn").textContent = audio.muted ? "sound: off" : "sound: on";
}
updateMuteButton();

$("#enable-sound").addEventListener("click", () => {
  audio.unlock();
  audio.muted = false;
  store.set(MUTE_KEY, "0");
  updateMuteButton();
  $("#sound-gate").hidden = true;
});
$("#skip-sound").addEventListener("click", () => ($("#sound-gate").hidden = true));
$("#mute-btn").addEventListener("click", () => {
  audio.unlock();
  audio.muted = !audio.muted;
  store.set(MUTE_KEY, audio.muted ? "1" : "0");
  updateMuteButton();
});

// ----- connecting -----

async function join() {
  const res = await send("spectator:join", { code });
  if (res.error) showGone(res.error);
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

socket.on("connect", join);
socket.on("roomClosed", () => showGone("The host closed the room."));

fetch("/api/info")
  .then((r) => r.json())
  .then(({ urls, sounds, timerEndUrl: endUrl }) => {
    for (const s of sounds) audio.load(s.url);
    timerEndUrl = endUrl;
    audio.load(timerEndUrl);
    const url = (urls[0] || location.origin).replace(/^https?:\/\//, "");
    $("#join-hint").replaceChildren("join at ", el("b", {}, url));
  })
  .catch(() => {});

// ----- live events -----
// Only the first buzz of a round makes a sound; later presses are silent.

socket.on("buzzed", (entry) => {
  if (!entry.isFirst) return;
  if (entry.sound) audio.play(soundUrl(entry.sound));
  const stage = $("#stage");
  stage.classList.remove("flash");
  void stage.offsetWidth; // restart the animation
  stage.classList.add("flash");
});

socket.on("timer:end", () => audio.play(timerEndUrl));

// ----- rendering -----

socket.on("state", (s) => {
  state = s;
  clock.update(s.timer);
  $("#round-label").replaceChildren("round ", el("b", {}, s.round));
  const status = $("#status");
  status.textContent = s.armed ? "armed" : "locked";
  status.classList.toggle("armed", s.armed);

  const order = buzzOrder(s.feed);
  const first = order[0];
  const stage = $("#stage");
  stage.classList.toggle("has-first", Boolean(first));
  stage.classList.toggle("armed", s.armed && !first);
  if (first) {
    stage.style.setProperty("--player", first.color);
    $("#stage-label").textContent = "first in";
    $("#stage-name").textContent = first.name;
    $("#stage-sub").textContent = `buzzer ${first.slot}`;
  } else {
    stage.style.removeProperty("--player");
    $("#stage-label").textContent = s.armed ? "buzzers live" : `round ${s.round}`;
    $("#stage-name").textContent = s.armed ? "buzz in" : "get ready";
    $("#stage-sub").textContent = `${s.players.length} player${s.players.length === 1 ? "" : "s"} in the room`;
  }

  renderOrder($("#order-list"), s.feed);
  $("#order-empty").hidden = order.length > 0;
  renderFeed(s.feed, s.feedEpoch);
});
