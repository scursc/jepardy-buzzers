// Plays the sound files in public/sounds.
//
// Uses the Web Audio API: each file is downloaded and decoded once, then played
// from memory. This is far more reliable than <audio> elements on phones, TVs
// and Samsung Internet, which often silently block <audio>.play().
//
// Browsers won't start sound until the viewer has interacted with the page, so
// the first tap, click or key press anywhere unlocks audio automatically.

const audio = (() => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let muted = false;
  const channels = new Map(); // channel name -> source playing on it
  const buffers = new Map(); // url -> Promise<AudioBuffer | null>

  // iPhone/iPad: treat this as media playback so the silent switch doesn't mute
  // it (Safari 17+; older versions ignore this).
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {}

  function context() {
    if (!ctx && AudioCtx) {
      ctx = new AudioCtx();
      ctx.onstatechange = notify;
    }
    return ctx;
  }

  function notify() {
    if (api.onChange) api.onChange();
  }

  // Older Safari/Samsung builds only support the callback form of decodeAudioData.
  function decode(data) {
    return new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(data, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  function load(url) {
    if (!url) return Promise.resolve(null);
    if (!buffers.has(url)) {
      const c = context();
      const promise = !c
        ? Promise.resolve(null)
        : fetch(url)
            .then((r) => {
              if (!r.ok) throw new Error(`${r.status} for ${url}`);
              return r.arrayBuffer();
            })
            .then(decode)
            .catch((err) => {
              console.warn("[audio] could not load", url, err);
              buffers.delete(url); // allow a retry later
              return null;
            });
      buffers.set(url, promise);
    }
    return buffers.get(url);
  }

  // Must run inside a tap/click/key press. Resumes the audio engine and plays one
  // silent sample, which is what iOS and some TV browsers need to fully unlock.
  function unlock() {
    const c = context();
    if (!c) return;
    if (c.state !== "running") c.resume().then(notify, () => {});
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  }

  // Unlock on the first interaction anywhere on the page (and again later if the
  // browser suspends audio, which some TVs do when idle).
  for (const type of ["pointerdown", "touchend", "keydown", "click"]) {
    document.addEventListener(
      type,
      () => {
        if (!ctx || ctx.state !== "running") unlock();
      },
      { capture: true, passive: true }
    );
  }

  function stop(channel) {
    const names = channel === undefined ? [...channels.keys()] : [channel];
    for (const name of names) {
      const src = channels.get(name);
      if (!src) continue;
      try {
        src.stop();
      } catch {}
      channels.delete(name);
    }
  }

  // Plays a file on a channel. A new sound on the same channel cuts off the old
  // one; different channels overlap. Resolves true when it finishes playing,
  // false if it couldn't play.
  async function play(url, channel = "main") {
    if (muted || !url) return false;
    const c = context();
    if (!c) return false;
    if (c.state !== "running") {
      try {
        await c.resume();
      } catch {}
    }
    if (c.state !== "running") {
      notify();
      return false;
    }
    const buffer = await load(url);
    if (!buffer || muted) return false;

    stop(channel);
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    channels.set(channel, src);
    return new Promise((resolve) => {
      src.onended = () => {
        if (channels.get(channel) === src) channels.delete(channel);
        resolve(true);
      };
      src.start(0);
    });
  }

  // Starts the audio engine early; browsers that allow autoplay (or already saw
  // an interaction on this site) will start running straight away.
  function warmUp() {
    const c = context();
    if (c && c.state !== "running") c.resume().then(notify, () => {});
  }

  const api = {
    load,
    play,
    stop,
    unlock,
    warmUp,
    onChange: null, // called when sound becomes allowed or blocked
    get ready() {
      return Boolean(ctx && ctx.state === "running");
    },
    get muted() {
      return muted;
    },
    set muted(value) {
      muted = value;
      if (muted) stop();
    },
  };
  return api;
})();
