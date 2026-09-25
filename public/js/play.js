// Player page: one big buzzer.

const code = normalizeCode(getParam("room"));
const token = store.get(`player:${code}`);
if (!code || !token) location.replace(`join.html${code ? `?room=${code}` : ""}`);

let me = null;
let state = null;
const buzzer = $("#buzzer");
const clock = createTimerClock();
renderTimerLoop(clock, $("#timer-display"));

// ----- connecting -----

async function rejoin() {
  const res = await send("player:join", { code, token });
  if (res.error) {
    store.remove(`player:${code}`);
    showGone(res.error === "No room with that code." ? "This room no longer exists." : res.error);
    return;
  }
  me = res.player;
  $("#my-name").textContent = me.name;
  $("#my-dot").style.setProperty("--player", me.color);
  document.body.style.setProperty("--player", me.color);
  document.title = `${me.name} · buzz`;
  $("#my-slot").textContent = `#${me.slot}`;
  // The room state usually arrives just before this reply, so draw it now.
  render();

  // Show the chosen sound's name next to the buzzer number.
  if (me.sound) {
    fetch("/api/info")
      .then((r) => r.json())
      .then(({ sounds }) => {
        const sound = sounds.find((s) => s.id === me.sound);
        if (sound) $("#my-slot").textContent = `#${me.slot} · ${sound.name}`;
      })
      .catch(() => {});
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
        el("h2", { class: "box-title" }, "disconnected"),
        el("p", {}, message.toLowerCase()),
        el("a", { class: "btn btn-primary btn-block", href: `join.html?room=${code}` }, "join again")
      )
    )
  );
}

socket.on("connect", rejoin);
socket.on("kicked", () => {
  store.remove(`player:${code}`);
  showGone("The host removed you from the room.");
});
socket.on("roomClosed", () => {
  store.remove(`player:${code}`);
  showGone("The host closed the room.");
});

$("#leave-btn").addEventListener("click", async () => {
  await send("leave");
  store.remove(`player:${code}`);
  location.href = "index.html";
});

// ----- buzzing -----
// pointerdown fires the instant a finger touches the screen, faster than click.

function press() {
  if (!state || !state.armed) return;
  socket.emit("buzz");
  buzzer.classList.remove("pressed");
  void buzzer.offsetWidth; // restart the press animation
  buzzer.classList.add("pressed");
  if (navigator.vibrate) navigator.vibrate(25);
}

buzzer.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  press();
});
// Keyboard players (laptops): Space or Enter. Typing in chat never buzzes.
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, .chat-form")) return;
  if ((e.code === "Space" || e.key === "Enter") && !e.repeat) {
    e.preventDefault();
    press();
  }
});
// Stop long-press menus on phones.
buzzer.addEventListener("contextmenu", (e) => e.preventDefault());

// ----- chat -----

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  const res = await send("chat:send", { text });
  if (res.error) toast(res.error.toLowerCase(), "error");
  else input.value = "";
});

// ----- rendering -----

socket.on("state", (s) => {
  state = s;
  clock.update(s.timer);
  render();
});

function render() {
  const s = state;
  if (!me || !s) return;

  const order = buzzOrder(s.feed);
  const myRank = order.findIndex((e) => e.playerId === me.id);
  const mine = order[myRank];
  // Count presses since the last wrong answer, matching how buzzOrder ranks.
  let resetAt = -1;
  s.feed.forEach((e, i) => {
    if (e.resetsOrder) resetAt = i;
  });
  const myPresses = s.feed
    .slice(resetAt + 1)
    .filter((e) => e.type === "buzz" && e.playerId === me.id).length;
  const lastVerdict = [...s.feed].reverse().find((e) => e.verdict);

  buzzer.classList.toggle("armed", s.armed);
  buzzer.classList.toggle("locked", !s.armed);
  buzzer.classList.toggle("won", myRank === 0);

  const label = $("#buzzer-label");
  const status = $("#play-status");

  if (myRank === 0) {
    label.textContent = "FIRST";
    status.textContent = `you buzzed in first${myPresses > 1 ? ` · ${myPresses} presses` : ""}`;
  } else if (myRank > 0) {
    label.textContent = `#${myRank + 1}`;
    status.textContent = `${formatOffset(mine.offsetMs)} behind ${order[0].name}`;
  } else if (s.rearming) {
    label.textContent = "WAIT";
    status.textContent = "wrong answer · buzzers re-arm in a moment";
  } else if (s.armed) {
    label.textContent = "BUZZ";
    status.textContent = order.length
      ? `${order[0].name} was first · you can still buzz`
      : lastVerdict && lastVerdict.verdict === "wrong"
        ? "wrong — buzzers re-armed"
        : "go";
  } else {
    label.textContent = "LOCKED";
    status.textContent = order.length
      ? `${order[0].name} buzzed in first`
      : "waiting for the host to arm the buzzers";
  }
}
