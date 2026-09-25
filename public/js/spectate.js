// Game screen (the TV display): the big view, and the only page that plays sounds.

const code = normalizeCode(getParam("room"));
if (!code) location.replace("index.html");

$("#room-code").textContent = code;

let state = null;
let timerEndUrl = null;
let verdictUrls = { correct: null, wrong: null };
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

// Browsers only allow sound after one interaction with the page (audio.js
// unlocks on the first tap/click/key). Until then, show a small hint.
function updateSoundHint() {
  $("#sound-hint").hidden = audio.ready || audio.muted;
}
audio.onChange = updateSoundHint;
audio.warmUp();
setTimeout(updateSoundHint, 500);

// Plays one of the buzz sounds so you can check the speakers before a game.
let testSoundUrl = null;
$("#test-sound").addEventListener("click", async () => {
  audio.unlock();
  if (audio.muted) return toast("sound is off", "error");
  if (!testSoundUrl) return toast("no sound files found", "error");
  const played = await audio.play(testSoundUrl);
  if (!played) toast("couldn't play sound on this browser", "error");
});
$("#mute-btn").addEventListener("click", () => {
  audio.unlock();
  audio.muted = !audio.muted;
  store.set(MUTE_KEY, audio.muted ? "1" : "0");
  updateMuteButton();
  updateSoundHint();
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
  .then(({ urls, sounds, timerEndUrl: endUrl, wrongUrl, correctUrl }) => {
    for (const s of sounds) audio.load(s.url);
    testSoundUrl = sounds.length ? sounds[0].url : endUrl || wrongUrl || null;
    timerEndUrl = endUrl;
    audio.load(timerEndUrl);
    verdictUrls = { correct: correctUrl, wrong: wrongUrl };
    audio.load(correctUrl);
    audio.load(wrongUrl);
    const url = joinAddress(urls);
    $("#join-hint").replaceChildren("join at ", el("b", {}, url));
  })
  .catch(() => {});

// ----- live events -----
// Every buzz plays that player's sound. Each player has their own channel, so
// spamming restarts their sound instead of stacking copies, while different
// players' sounds overlap.

socket.on("buzzed", (entry) => {
  if (entry.sound) audio.play(soundUrl(entry.sound), `player:${entry.playerId}`);
  if (!entry.isFirst) return;
  // A new first buzz (e.g. right after a wrong answer) replaces the verdict popup.
  clearTimeout(judgeTimeout);
  $("#judge-popup").hidden = true;
  const stage = $("#stage");
  stage.classList.remove("flash");
  void stage.offsetWidth; // restart the animation
  stage.classList.add("flash");
});

socket.on("timer:end", () => audio.play(timerEndUrl, "timer"));

// The host marked an answer: show CORRECT / WRONG for a few seconds.
const JUDGE_POPUP_MS = 4000;
let judgeTimeout = null;

socket.on("judged", ({ verdict, name, color, popupMs }) => {
  audio.stop(); // cut off buzz sounds so the verdict is heard clearly
  audio.play(verdictUrls[verdict], "verdict");
  const popup = $("#judge-popup");
  popup.classList.toggle("correct", verdict === "correct");
  popup.classList.toggle("wrong", verdict === "wrong");
  $("#judge-verdict").textContent = verdict === "correct" ? "CORRECT" : "WRONG";
  $("#judge-name").textContent = name;
  $("#judge-name").style.setProperty("--player", color);
  popup.hidden = false;
  clearTimeout(judgeTimeout);
  judgeTimeout = setTimeout(() => (popup.hidden = true), popupMs || JUDGE_POPUP_MS);
});

// ----- rendering -----

socket.on("state", (s) => {
  state = s;
  clock.update(s.timer);
  $("#round-label").replaceChildren("round ", el("b", {}, s.round));
  const status = $("#status");
  status.textContent = s.armed ? "armed" : s.rearming ? "re-arming" : "locked";
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
