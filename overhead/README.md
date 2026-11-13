# Overhead Studio

A lightweight, top-down game editor that runs in the browser. One HTML file, no build step, no dependencies.

Open `index.html` in a browser (or serve the folder with any static server) and start dragging things onto the stage.

## How it works

| Part | What it does |
|---|---|
| **Library** (left) | Characters, scenery, pickups, hazards, basic shapes, and your own uploaded images |
| **Stage** (middle) | Drag things in, move them, resize them from the corner square, snap them to the grid |
| **Inspector** (right) | Edit the selected thing: name, kind, look, position, health, speed, traits, script |
| **Console** (bottom) | `log()` output and script errors. Click an error to jump to that object's script |
| **Play / Stop** | Test the game in place. Stopping puts everything back the way it was |

### Traits (no code)

Tick a box to give something a built-in behaviour: **Solid**, **Pushable**, **Player controls**, **Collectible**, **Hurts player**, **Goal**.

### Scripts (when you want custom behaviour)

Any object can have a script with up to three functions:

```js
function onStart() { }          // once, when the game starts
function onUpdate() { }         // 60 times a second
function onTouch(other) { }     // when it starts touching something
```

Helpers do the heavy lifting: `this.moveToward(player)`, `this.patrol(160)`, `this.wander()`, `this.canSee(player)`, `this.shoot(player, 4)`, `this.say("Hi")`, `this.every(1, fn)`, `game.score`, `game.win()`, `log(...)`. The full list is in the editor under **Script helpers**.

Scripts run in a Web Worker (a separate background thread). A script that loops forever freezes the game preview, and the editor stops that preview after 2.5 seconds. The editor itself keeps working.

## Files

- `index.html`: the whole app. It contains three script blocks:
  - `#ov-engine`: game rules (movement, collisions, traits, script helpers). Runs inside the worker.
  - `#ov-runtime`: draws the game and handles keyboard and touch input. Shared by Play mode and exported games.
  - The editor itself.

## Saving

Projects auto-save to the browser's local storage. **File** has export to a standalone game `.html`, plus JSON backup and restore. Storage sits behind a small `Store` object so it can be swapped for a cloud backend later.
