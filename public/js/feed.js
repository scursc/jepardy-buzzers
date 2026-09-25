// Feed rendering shared by the host and spectator pages.
// Each entry is one log line: time, colour, name, offset.

function feedItem(entry) {
  if (entry.type === "event") {
    return el("li", { class: "feed-item feed-event", "data-id": entry.id }, entry.text.toLowerCase());
  }
  return el(
    "li",
    {
      class: `feed-item feed-buzz${entry.isFirst ? " first" : ""}`,
      "data-id": entry.id,
      style: { "--player": entry.color },
    },
    el("span", { class: "feed-at" }, formatTimeOfDay(entry.at)),
    el("span", { class: "dot" }),
    el(
      "span",
      { class: "feed-name" },
      entry.name,
      entry.pressNumber > 1 ? el("span", { class: "feed-press" }, ` ×${entry.pressNumber}`) : null
    ),
    el("span", { class: "feed-time" }, entry.isFirst ? "first" : formatOffset(entry.offsetMs))
  );
}

// The feed only ever grows or gets cleared, so we append new items instead of
// rebuilding the list on every update (buzz spam can mean many updates a second).
function createFeedRenderer(listEl) {
  let lastId = 0;
  let epoch = null;
  return function render(feed, feedEpoch) {
    const firstId = feed.length ? feed[0].id : Infinity;
    const newestId = feed.length ? feed[feed.length - 1].id : 0;

    if (feedEpoch !== epoch) {
      listEl.replaceChildren();
      lastId = 0;
      epoch = feedEpoch;
    }
    // Drop items the server has trimmed off the front.
    while (listEl.firstChild && Number(listEl.firstChild.dataset.id) < firstId) {
      listEl.firstChild.remove();
    }

    const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 60;
    const fresh = feed.filter((e) => e.id > lastId);
    if (!fresh.length) return;
    listEl.append(...fresh.map(feedItem));
    lastId = newestId;
    if (nearBottom) listEl.scrollTop = listEl.scrollHeight;
  };
}

function renderOrder(listEl, feed, limit = 12) {
  const order = buzzOrder(feed).slice(0, limit);
  listEl.replaceChildren(
    ...order.map((e, i) =>
      el(
        "li",
        { class: `order-item${i === 0 ? " first" : ""}`, style: { "--player": e.color } },
        el("span", { class: "order-rank" }, `${i + 1}.`),
        el("span", { class: "dot" }),
        el("span", { class: "order-name" }, e.name),
        el("span", { class: "order-time" }, i === 0 ? "first" : formatOffset(e.offsetMs))
      )
    )
  );
}
