# jepardy-buzzers
Buzzer system for games like Jeopardy. Every phone becomes a buzzer, the host sees who buzzed in first, and a spectator screen shows it all with sound.

## Running it
You need [Node.js](https://nodejs.org) installed.

```
npm install
npm start
```

The console prints two addresses:

- **On this PC:** `http://localhost:3000`
- **On your Wi-Fi:** something like `http://192.168.1.20:3000`. Phones on the same Wi-Fi open this one.

The first time you run it, Windows may ask whether Node.js can use the network. Allow it for **private networks**, or phones won't be able to connect.

## Sounds
```
public/sounds/buzzers/       <- buzz sounds, one per player (.mp3 .wav .ogg .m4a)
public/sounds/timer-end.mp3  <- time's-up sound (.wav/.ogg/.m4a also work)
```
- The filename becomes the name players see, so `Air Horn.mp3` shows as "Air Horn". Dashes and underscores turn into spaces.
- Each sound can only be picked by one player per room.
- Players hear a preview on their own device when they pick a sound.
- Only the **first** buzzer's sound plays, and it plays on the spectator screen.
- New files are picked up without restarting the server; just reload the join page.

## Pages
| Page | Who uses it |
| --- | --- |
| Home (`/`) | Menu: create a room, join a room, or spectate. |
| Join (`join.html`) | Room code, name, colour and buzz sound. |
| Host (`host.html`) | Arm/lock buzzers, next round, timer, player list (kick, change buzzer count), live feed. Shortcuts: `Space` arm/lock, `N` next round, `T` timer. |
| Player (`play.html`) | One big buzzer. Works only while the host has armed it. Can be pressed repeatedly. |
| Spectator (`spectate.html`) | Big-screen view with the first buzzer, timer and buzz order. **This is the page that plays sound.** |

The host page only opens in the browser that created the room.

## How it works
- `server/rooms.js` holds all the game rules (rooms, players, buzzing, timer).
- `server/sounds.js` finds the sound files.
- `server/index.js` runs the web server and passes real-time messages between devices with Socket.IO.
- `public/` holds the pages (plain HTML, CSS and JavaScript).

The server decides who was first using its own clock, so it's fair even if devices' clocks differ. Rooms live in memory, so restarting the server clears them.
