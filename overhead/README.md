# Overhead Studio

A top-down 2D game editor that runs in the browser, in the spirit of GameMaker and Construct 2.
Plain JavaScript, no dependencies, no build step. Open `index.html` and start making a game.

- **Run it:** open `index.html` in a browser (double-click works), or serve this folder with any static server.
- **One-file version:** `python3 build.py` writes `dist/overhead-studio.html` with everything inlined.
- **Your games:** File → Export gives one HTML file that runs anywhere. The sample game exports to about 156 KB.

## The ideas

| Idea | What it means |
|---|---|
| **Object types and copies** | An object type is a cookie cutter: its look, variables, behaviours and script. You stamp copies into rooms. Change the type and every copy changes. Each copy can still override its variables. |
| **Rooms and layers** | A game has rooms (levels). A room has layers, like stacked sheets of glass: tile layers you paint, object layers that hold copies, and fixed-on-screen layers for score and hearts (scroll speed 0). |
| **Tilemaps** | Paint floors and walls with a brush, box or flood fill. Tiles marked solid in the tileset block movement automatically. |
| **Sprites** | Built-in pixel editor with animations, onion skin, per-frame timing, an origin point and a hitbox. A sprite with `idle` and `walk` animations switches between them by itself. |
| **Importing art** | Drop files onto the editor or use Sprites + → Import images. Many files at once are grouped into sprites and animations by file name (`hero_walk_01.png`). Animated GIFs keep their frames and timing. Aseprite sheet exports (PNG + JSON) keep their tags as animations. Sheets can be sliced with borders and gaps, and a solid background colour can be made see-through. |
| **Behaviours** | Ready-made abilities you tick on: player controls, chase (with pathfinding), patrol, wander, bullet, turret, health, hurts on touch, collectible, door, talk, goal, camera follow, spawner, solid, pushable and more. |
| **Event sheets** | Logic as rows: conditions on the left, actions on the right. "Player is touching Gate + keys > 0 → Destroy Gate, Add -1 to keys". Sub-events, notes, on/off, and a "Run JavaScript" action when you want code. |
| **Scripts** | Any object type can also have plain JavaScript: `onCreate`, `onUpdate`, `onTouch(other)`, `onDestroy`. |
| **Sounds** | A tiny built-in synth (coin, hit, shoot, explosion, fanfare…) so games stay small, plus audio file import. |
| **Debugger** | Pause, step one frame, slow motion, show hitboxes and paths, click any object in the running game to watch and change its values. |

## Writing logic

Numbers in events and all scripts are JavaScript. Three things make that pleasant:

- **Global variables are plain names:** `score += 10`, `keys > 0`.
- **Object types are plain names** (the first matching copy): `Player.x`, `Player.hp`, `Coin.exists`.
- **Helpers:** `random(1, 6)`, `choose("a", "b")`, `count("Coin")`, `find("Door1")`, `distance(a, b)`, `hearts(Player)`, `log(...)`, and `game.goTo("Cellar")`, `game.win()`, `game.sound("Coin")`, `game.shake(3, 0.3)`, `game.message("Hello")`.

Text uses curly braces to insert values: `Score: {score}`.

In an object script, `this` is the copy:

```js
function onUpdate() {
  if (this.distanceTo(player) < 100 && this.canSee(player)) this.pathTo(player);
  else this.wander();
}
function onTouch(other) {
  if (other.is("player")) this.say("Gotcha!", 1);
}
```

The full list of helpers is in the object editor under "What you can use in scripts and expressions".

Game code runs in a Web Worker (a background thread). A script with an endless loop freezes only the game
preview, which is stopped after 2.5 seconds; the editor keeps working. A typo in one script or event is
reported in the console (click it to jump there) and everything else still runs.

## Files

| File | What it is |
|---|---|
| `index.html`, `css/app.css` | The page shell and styles |
| `js/core.js` | Shared helpers: DOM builder, dialogs, menus, form fields |
| `js/model.js` | The project data model (plain JSON) and undo snapshots |
| `js/catalog.js` | The list of behaviours, conditions and actions, and the compiler that turns scripts and expressions into loadable code |
| `js/engine.js` | The game engine: movement, collisions, behaviours, pathfinding, event sheets, rooms. Runs in the worker |
| `js/runtime.js` | Drawing, sound, input, and the worker host. Shared by Play mode and exported games |
| `js/editor.js` | Editor shell: undo, tabs, play mode, File dialog, export |
| `js/tree.js`, `js/room.js`, `js/inspector.js`, `js/sheet.js`, `js/debug.js` | Project panel, room editor and layers, properties and object editor, event sheet editor, console and debugger |
| `js/sprite-editor.js`, `css/sprite-editor.css` | Sprite and tileset pixel editors |
| `js/importers.js` | Import dialog, file-name grouping, GIF decoder, Aseprite sheet reader |
| `js/assets.js` | Built-in pixel art: 27 sprites and a 24-tile set, drawn in code |
| `js/sample.js` | The ready-made object library, the starter kit and the sample game |
| `js/store.js` | Where projects are saved (this browser's IndexedDB). Swap this file for cloud saving later |
| `dev/` | Test pages for the art and the pixel editors |

## Not there yet

Opening `.aseprite` files directly (export a sheet with JSON from Aseprite instead), autotiling, rotated or polygon hitboxes, "else" and "or" in event sheets, object families beyond kinds,
physics, animation events, a timeline, cloud saving and sharing. Projects made in the first single-file
prototype (v0.1) do not open in this version.
