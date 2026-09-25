// Web server + real-time messaging. Game rules are in rooms.js; this file only
// wires socket messages to those rules and broadcasts the result.

const path = require("path");
const os = require("os");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const rooms = require("./rooms");
const { loadSounds, findTimerEndUrl } = require("./sounds");

const PORT = Number(process.env.PORT) || 3000;
const ROOM_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // delete a room 10 min after the host leaves

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "..", "public")));

function lanAddresses() {
  const out = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface || []) {
      if (addr.family === "IPv4" && !addr.internal) out.push(addr.address);
    }
  }
  return out;
}

// The host page uses this to show players which address to open.
app.get("/api/info", (req, res) => {
  res.json({
    urls: lanAddresses().map((ip) => `http://${ip}:${PORT}`),
    sounds: loadSounds(),
    timerEndUrl: findTimerEndUrl(),
  });
});

function broadcast(room) {
  io.to(room.code).emit("state", rooms.publicState(room));
}

// Wraps a handler so it always replies through the ack callback, if one was given.
function handle(socket, event, fn) {
  socket.on(event, (payload, ack) => {
    if (typeof payload === "function") {
      ack = payload;
      payload = {};
    }
    let result;
    try {
      result = fn(payload || {}) || { ok: true };
    } catch (err) {
      console.error(`Error handling ${event}:`, err);
      result = { error: "Something went wrong." };
    }
    if (typeof ack === "function") ack(result);
  });
}

io.on("connection", (socket) => {
  // What this connection is: { code, role: "host" | "player" | "spectator", playerId }
  // Sound files are re-scanned on each join, so new files show up without a restart.
  socket.data = {};

  function currentRoom() {
    return socket.data.code ? rooms.getRoom(socket.data.code) : null;
  }

  function enter(room, role, playerId) {
    leave();
    socket.data = { code: room.code, role, playerId };
    socket.join(room.code);
    if (role === "host") {
      room.hostSockets += 1;
      room.hostLeftAt = null;
    } else if (role === "player") {
      const p = room.players.find((pl) => pl.id === playerId);
      if (p) p.sockets += 1;
    }
  }

  function leave() {
    const room = currentRoom();
    if (!room) return;
    const { role, playerId } = socket.data;
    if (role === "host") {
      room.hostSockets = Math.max(0, room.hostSockets - 1);
      if (room.hostSockets === 0) room.hostLeftAt = Date.now();
    } else if (role === "player") {
      const p = room.players.find((pl) => pl.id === playerId);
      if (p) p.sockets = Math.max(0, p.sockets - 1);
    }
    socket.leave(room.code);
    socket.data = {};
    broadcast(room);
  }

  // Runs fn(room) only if this socket is the host of a room, then broadcasts.
  function asHost(fn) {
    return (payload) => {
      const room = currentRoom();
      if (!room || socket.data.role !== "host") return { error: "Not the host." };
      const result = fn(room, payload);
      broadcast(room);
      return result;
    };
  }

  // ----- joining -----

  handle(socket, "room:peek", ({ code }) => {
    const room = rooms.getRoom(code);
    if (!room) return { error: "No room with that code." };
    return {
      ok: true,
      code: room.code,
      takenColors: rooms.takenColors(room),
      takenSounds: rooms.takenSounds(room),
      full: rooms.nextFreeSlot(room) === null,
      palette: rooms.PALETTE,
      sounds: loadSounds(),
    };
  });

  handle(socket, "host:create", ({ maxBuzzers }) => {
    const room = rooms.createRoom(maxBuzzers);
    enter(room, "host");
    broadcast(room);
    console.log(`Room ${room.code} created with ${room.maxBuzzers} buzzers`);
    return { ok: true, code: room.code, hostToken: room.hostToken };
  });

  handle(socket, "host:rejoin", ({ code, hostToken }) => {
    const room = rooms.getRoom(code);
    if (!room) return { error: "That room no longer exists." };
    if (room.hostToken !== hostToken) return { error: "You are not the host of this room." };
    enter(room, "host");
    broadcast(room);
    return { ok: true, code: room.code };
  });

  handle(socket, "player:join", ({ code, name, color, sound, token }) => {
    const room = rooms.getRoom(code);
    if (!room) return { error: "No room with that code." };
    const soundIds = loadSounds().map((s) => s.id);
    const result = rooms.joinPlayer(room, { name, color, sound, token }, soundIds);
    if (result.error) return result;
    enter(room, "player", result.player.id);
    broadcast(room);
    const { id, token: playerToken, name: n, color: c, sound: snd, slot } = result.player;
    return {
      ok: true,
      code: room.code,
      player: { id, name: n, color: c, sound: snd, slot },
      token: playerToken,
    };
  });

  handle(socket, "spectator:join", ({ code }) => {
    const room = rooms.getRoom(code);
    if (!room) return { error: "No room with that code." };
    enter(room, "spectator");
    broadcast(room);
    return { ok: true, code: room.code };
  });

  handle(socket, "leave", () => {
    const room = currentRoom();
    if (room && socket.data.role === "player") {
      rooms.removePlayer(room, socket.data.playerId);
    }
    leave();
  });

  // ----- buzzing -----
  // No ack here: buzzes should be as light as possible.

  socket.on("buzz", () => {
    const room = currentRoom();
    if (!room || socket.data.role !== "player") return;
    const entry = rooms.buzz(room, socket.data.playerId);
    if (!entry) return;
    io.to(room.code).emit("buzzed", entry);
    broadcast(room);
  });

  // ----- host controls -----

  handle(socket, "host:arm", asHost((room) => rooms.arm(room)));
  handle(socket, "host:lock", asHost((room) => rooms.lock(room)));
  handle(socket, "host:resetRound", asHost((room) => rooms.resetRound(room)));
  handle(socket, "host:clearFeed", asHost((room) => rooms.clearFeed(room)));
  handle(socket, "host:timer:set", asHost((room, { seconds }) => rooms.timerSet(room, seconds)));
  handle(socket, "host:timer:start", asHost((room) => rooms.timerStart(room)));
  handle(socket, "host:timer:pause", asHost((room) => rooms.timerPause(room)));
  handle(socket, "host:timer:reset", asHost((room) => rooms.timerReset(room)));
  handle(
    socket,
    "host:toggleLockOnTimerEnd",
    asHost((room) => {
      room.lockOnTimerEnd = !room.lockOnTimerEnd;
    })
  );
  handle(socket, "host:setMaxBuzzers", asHost((room, { n }) => rooms.setMaxBuzzers(room, n)));
  handle(
    socket,
    "host:kick",
    asHost((room, { playerId }) => {
      const player = rooms.removePlayer(room, playerId);
      if (!player) return { error: "Player not found." };
      // Tell the kicked player's devices, then drop them from the room.
      for (const s of io.sockets.sockets.values()) {
        if (s.data.code === room.code && s.data.playerId === playerId) {
          s.emit("kicked");
          s.leave(room.code);
          s.data = {};
        }
      }
    })
  );
  handle(
    socket,
    "host:closeRoom",
    asHost((room) => {
      io.to(room.code).emit("roomClosed");
      for (const s of io.sockets.sockets.values()) {
        if (s.data.code === room.code) {
          s.leave(room.code);
          s.data = {};
        }
      }
      rooms.deleteRoom(room.code);
      console.log(`Room ${room.code} closed by host`);
    })
  );

  socket.on("disconnect", () => leave());
});

// Timer ends and idle-room cleanup.
setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.allRooms()]) {
    if (rooms.checkTimer(room, now)) {
      io.to(room.code).emit("timer:end");
      broadcast(room);
    }
    if (room.hostSockets === 0 && room.hostLeftAt && now - room.hostLeftAt > ROOM_IDLE_TIMEOUT_MS) {
      io.to(room.code).emit("roomClosed");
      rooms.deleteRoom(room.code);
      console.log(`Room ${room.code} closed (host gone)`);
    }
  }
}, 50);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nBuzzers running!`);
  console.log(`  On this PC:     http://localhost:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`  On your Wi-Fi:  http://${ip}:${PORT}`);
  }
  console.log("");
});
