# jepardy-buzzers
buzzer system for games like Jeopardy. phones can be used as the buzzers, one person can be the host and a seporate screen is for the main view. 

vibe-coded to extreme hell.
## running it
need [Node.js](https://nodejs.org) installed.

```
npm install
npm start
```

console prints two addresses:

example:
- **host:** `http://localhost:3000`
- **on wifi:** something like `http://192.168.1.20:3000`.

## sounds
```
public/sounds/buzzers/       <- buzz sounds, one per player (.mp3 .wav .ogg .m4a)
public/sounds/timer-end.mp3  <- time's-up sound (.wav/.ogg/.m4a also work)
public/sounds/wrong.mp3      <- plays when the host marks an answer wrong
public/sounds/correct.mp3    <- plays when the host marks an answer correct (optional)
```
- the filename becomes the name players see, so `Air Horn.mp3` shows as "Air Horn". Dashes and underscores turn into spaces.
- each sound can only be picked by one player per room.

## notes

- only the game screen can hear sound, however players can hear sound previews.

## how it works

The server decides who was first using its own clock, so it's fair even if devices' clocks differ. Rooms live in memory, so restarting the server clears them.
