// Plays the sound files in public/sounds. Each file is loaded once up front so
// it starts instantly when a buzz comes in.

const audio = (() => {
  const clips = new Map(); // url -> HTMLAudioElement
  let muted = false;
  let current = null;

  function load(url) {
    if (!url || clips.has(url)) return;
    const a = new Audio(url);
    a.preload = "auto";
    clips.set(url, a);
  }

  function play(url) {
    if (muted || !url) return;
    load(url);
    // Stop whatever was playing so sounds never pile up.
    if (current) {
      current.pause();
      current.currentTime = 0;
    }
    current = clips.get(url);
    current.currentTime = 0;
    current.play().catch(() => {});
  }

  // Browsers only allow audio after a click, so call this from a click handler.
  function unlock() {
    for (const a of clips.values()) {
      a.muted = true;
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        })
        .catch(() => (a.muted = false));
    }
  }

  return {
    load,
    play,
    unlock,
    get muted() {
      return muted;
    },
    set muted(value) {
      muted = value;
      if (muted && current) current.pause();
    },
  };
})();
