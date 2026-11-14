/* Overhead Studio: the catalogue of behaviours, conditions and actions.
   This file only DESCRIBES them (labels, parameters) for the editor. What they actually do lives
   in engine.js under the same keys.

   Parameter types:
     num, expr   a number or any JavaScript expression (score + 1, Player.x, random(1, 6))
     text        plain text; {curly braces} insert a value: "Score: {score}"
     js          a block of JavaScript
     type        an object type or a kind ("any enemy"); typeOnly = object types only
     kind, room, sound, key, global, prop, cmp, choice, bool, burst, beh: pickers            */
(function () {
  'use strict';
  const OV = window.OV;

  OV.BURSTS = [['spark', 'Sparks'], ['sparkle', 'Sparkles'], ['hit', 'Hit'], ['smoke', 'Smoke'], ['dust', 'Dust'], ['explosion', 'Explosion'], ['heal', 'Hearts']];
  OV.KEYS = [['Space', 'Space'], ['Enter', 'Enter'], ['KeyE', 'E'], ['KeyQ', 'Q'], ['KeyF', 'F'], ['KeyR', 'R'], ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'],
    ['ShiftLeft', 'Shift'], ['ArrowUp', 'Up arrow'], ['ArrowDown', 'Down arrow'], ['ArrowLeft', 'Left arrow'], ['ArrowRight', 'Right arrow'],
    ['KeyW', 'W'], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3']];
  OV.CMPS = [['==', '='], ['!=', '≠'], ['<', '<'], ['<=', '≤'], ['>', '>'], ['>=', '≥']];

  const kindParam = (key, label, def) => ({ key: key, label: label, type: 'kind', def: def });

  OV.BEHAVIORS = [
    { key: 'player', group: 'Movement', label: 'Player controls', desc: 'Arrow keys, WASD or the touch stick move it.',
      params: [{ key: 'speed', label: 'Speed (px/s)', type: 'num', def: 80 }, { key: 'dirs', label: 'Directions', type: 'choice', def: '8', options: [['8', '8 directions'], ['4', '4 directions']] }] },
    { key: 'chase', group: 'Movement', label: 'Chase', desc: 'Goes after a target when it is close enough.',
      params: [kindParam('target', 'Chases', 'player'), { key: 'speed', label: 'Speed (px/s)', type: 'num', def: 45 }, { key: 'range', label: 'Notice range (px)', type: 'num', def: 110 },
        { key: 'sight', label: 'Needs to see the target', type: 'bool', def: true }, { key: 'smart', label: 'Finds a way around walls', type: 'bool', def: true },
        { key: 'idle', label: 'When idle', type: 'choice', def: 'wander', options: [['stay', 'Stand still'], ['wander', 'Wander']] }] },
    { key: 'patrol', group: 'Movement', label: 'Patrol', desc: 'Walks back and forth. Turns around at walls.',
      params: [{ key: 'distance', label: 'Distance (px)', type: 'num', def: 48 }, { key: 'axis', label: 'Direction', type: 'choice', def: 'x', options: [['x', 'Left and right'], ['y', 'Up and down']] }, { key: 'speed', label: 'Speed (px/s)', type: 'num', def: 30 }] },
    { key: 'wander', group: 'Movement', label: 'Wander', desc: 'Walks around at random.', params: [{ key: 'speed', label: 'Speed (px/s)', type: 'num', def: 25 }] },
    { key: 'bullet', group: 'Movement', label: 'Bullet', desc: 'Flies in a straight line and hurts what it hits.',
      params: [{ key: 'speed', label: 'Speed (px/s)', type: 'num', def: 180 }, { key: 'damage', label: 'Damage', type: 'num', def: 1 }, kindParam('hits', 'Hurts', 'enemy'),
        { key: 'life', label: 'Lifetime (s)', type: 'num', def: 2 }, { key: 'pierce', label: 'Passes through targets', type: 'bool', def: false }, { key: 'burst', label: 'On impact', type: 'burst', def: 'spark' }] },
    { key: 'sine', group: 'Movement', label: 'Bob / pulse', desc: 'Smoothly swings a property back and forth.',
      params: [{ key: 'prop', label: 'What', type: 'choice', def: 'y', options: [['y', 'Up and down'], ['x', 'Left and right'], ['size', 'Size'], ['opacity', 'Opacity'], ['angle', 'Angle']] },
        { key: 'amount', label: 'Amount', type: 'num', def: 2 }, { key: 'period', label: 'Seconds per swing', type: 'num', def: 1.2 }] },
    { key: 'spin', group: 'Movement', label: 'Spin', desc: 'Rotates all the time.', params: [{ key: 'speed', label: 'Degrees per second', type: 'num', def: 180 }] },

    { key: 'solid', group: 'Collision', label: 'Solid', desc: 'Blocks anything that moves.', params: [] },
    { key: 'pushable', group: 'Collision', label: 'Pushable', desc: 'Solid, but it can be shoved around.', params: [] },
    { key: 'ghost', group: 'Collision', label: 'Walks through walls', desc: 'Ignores solid things and solid tiles.', params: [] },
    { key: 'edge', group: 'Collision', label: 'At the room edge', desc: 'What happens when it leaves the room.',
      params: [{ key: 'mode', label: 'Then', type: 'choice', def: 'destroy', options: [['destroy', 'Destroy it'], ['wrap', 'Wrap to the other side'], ['stop', 'Keep it inside']] }] },

    { key: 'health', group: 'Combat', label: 'Health', desc: 'Can be hurt. Destroyed at zero.',
      params: [{ key: 'hp', label: 'Health', type: 'num', def: 3 }, { key: 'invuln', label: 'Safe time after a hit (s)', type: 'num', def: 0.8 },
        { key: 'hurtSound', label: 'Hurt sound', type: 'sound', def: '' }, { key: 'deathBurst', label: 'On death', type: 'burst', def: 'smoke' }, { key: 'deathSound', label: 'Death sound', type: 'sound', def: '' },
        { key: 'drop', label: 'Drops', type: 'typeOnly', def: '' }, { key: 'gameOver', label: 'Game over when destroyed', type: 'bool', def: false }] },
    { key: 'hurts', group: 'Combat', label: 'Hurts on touch', desc: 'Damages what touches it.',
      params: [kindParam('target', 'Hurts', 'player'), { key: 'damage', label: 'Damage', type: 'num', def: 1 }, { key: 'knockback', label: 'Knockback', type: 'num', def: 90 }] },
    { key: 'shooter', group: 'Combat', label: 'Shoot with a key', desc: 'Fires a bullet the way it is facing.',
      params: [{ key: 'bullet', label: 'Bullet', type: 'typeOnly', def: '' }, { key: 'key', label: 'Key', type: 'key', def: 'Space' }, { key: 'rate', label: 'Seconds between shots', type: 'num', def: 0.3 },
        { key: 'speed', label: 'Bullet speed', type: 'num', def: 180 }, { key: 'sound', label: 'Sound', type: 'sound', def: '' }] },
    { key: 'turret', group: 'Combat', label: 'Turret', desc: 'Shoots at a target that comes in range.',
      params: [{ key: 'bullet', label: 'Bullet', type: 'typeOnly', def: '' }, kindParam('target', 'Shoots at', 'player'), { key: 'range', label: 'Range (px)', type: 'num', def: 130 },
        { key: 'rate', label: 'Seconds between shots', type: 'num', def: 1.5 }, { key: 'speed', label: 'Bullet speed', type: 'num', def: 110 },
        { key: 'sight', label: 'Needs to see the target', type: 'bool', def: true }, { key: 'sound', label: 'Sound', type: 'sound', def: '' }] },
    { key: 'spawner', group: 'Combat', label: 'Spawner', desc: 'Creates another object every so often.',
      params: [{ key: 'type', label: 'Creates', type: 'typeOnly', def: '' }, { key: 'every', label: 'Every (s)', type: 'num', def: 3 }, { key: 'max', label: 'At most alive', type: 'num', def: 4 }, { key: 'radius', label: 'Within (px)', type: 'num', def: 24 }] },

    { key: 'collectible', group: 'Interaction', label: 'Collectible', desc: 'The player picks it up by touching it.',
      params: [{ key: 'variable', label: 'Adds to', type: 'global', def: 'score' }, { key: 'amount', label: 'Amount', type: 'num', def: 1 }, { key: 'heals', label: 'Heals', type: 'num', def: 0 },
        { key: 'sound', label: 'Sound', type: 'sound', def: '' }, { key: 'burst', label: 'Effect', type: 'burst', def: 'sparkle' }] },
    { key: 'door', group: 'Interaction', label: 'Door', desc: 'Takes the player to another room. Variables named toRoom and arriveAt on a copy override these.',
      params: [{ key: 'room', label: 'Goes to', type: 'room', def: '' }, { key: 'spawn', label: 'Arrive at (instance name)', type: 'text', def: '' }, { key: 'sound', label: 'Sound', type: 'sound', def: '' }] },
    { key: 'talk', group: 'Interaction', label: 'Talk', desc: 'Shows a message when the player is next to it and presses Space or E. A variable named message gives each copy its own text.',
      params: [{ key: 'text', label: 'Message (one page per line)', type: 'area', def: 'Hello!' }] },
    { key: 'goal', group: 'Interaction', label: 'Goal', desc: 'The player wins by touching it.', params: [{ key: 'text', label: 'Message', type: 'text', def: 'You win!' }] },

    { key: 'camera', group: 'Camera & effects', label: 'Camera follows', desc: 'The view scrolls to keep it on screen.', params: [{ key: 'lag', label: 'Smoothing (s)', type: 'num', def: 0.12 }] },
    { key: 'fade', group: 'Camera & effects', label: 'Fade', desc: 'Fades in, waits, fades out.',
      params: [{ key: 'fadeIn', label: 'Fade in (s)', type: 'num', def: 0 }, { key: 'wait', label: 'Wait (s)', type: 'num', def: 0 }, { key: 'fadeOut', label: 'Fade out (s)', type: 'num', def: 0.4 }, { key: 'destroy', label: 'Destroy when done', type: 'bool', def: true }] },
  ];
  OV.behaviorDef = key => OV.BEHAVIORS.find(b => b.key === key) || null;
  OV.newBehavior = key => {
    const d = OV.behaviorDef(key), b = { id: OV.uid('b'), type: key };
    d.params.forEach(p => (b[p.key] = p.def));
    return b;
  };

  const P = (key, label, type, def, extra) => Object.assign({ key: key, label: label, type: type, def: def }, extra || {});

  OV.CONDITIONS = [
    /* system */
    { key: 'always', on: 'system', group: 'Time', label: 'Every tick', text: 'Every tick', params: [] },
    { key: 'start', on: 'system', group: 'Time', label: 'On start of room', text: 'On start of room', params: [] },
    { key: 'every', on: 'system', group: 'Time', label: 'Every X seconds', text: 'Every {sec} seconds', params: [P('sec', 'Seconds', 'num', 1)] },
    { key: 'keyPressed', on: 'system', group: 'Input', label: 'On key pressed', text: 'On {key} pressed', params: [P('key', 'Key', 'key', 'Space')] },
    { key: 'keyDown', on: 'system', group: 'Input', label: 'Key is held down', text: '{key} is down', params: [P('key', 'Key', 'key', 'Space')] },
    { key: 'keyReleased', on: 'system', group: 'Input', label: 'On key released', text: 'On {key} released', params: [P('key', 'Key', 'key', 'Space')] },
    { key: 'tap', on: 'system', group: 'Input', label: 'On tap or click', text: 'On tap or click', params: [] },
    { key: 'compare', on: 'system', group: 'Values', label: 'Compare two values', text: '{a} {cmp} {b}', params: [P('a', 'First value', 'expr', 'score'), P('cmp', 'Is', 'cmp', '>='), P('b', 'Second value', 'expr', '10')] },
    { key: 'chance', on: 'system', group: 'Values', label: 'Random chance', text: 'With a {pct}% chance', params: [P('pct', 'Percent', 'num', 50)] },
    { key: 'test', on: 'system', group: 'Values', label: 'JavaScript is true', text: 'Is true: {expr}', params: [P('expr', 'Expression', 'expr', 'score > 5 && keys > 0')] },
    /* object */
    { key: 'touches', on: 'object', group: 'Collisions', label: 'Is touching', text: '{t} is touching {other}', params: [P('other', 'Touching', 'type', '')] },
    { key: 'touchStart', on: 'object', group: 'Collisions', label: 'Starts touching', text: '{t} starts touching {other}', params: [P('other', 'Touching', 'type', '')] },
    { key: 'near', on: 'object', group: 'Collisions', label: 'Is within distance of', text: '{t} is within {dist} px of {other}', params: [P('other', 'Of', 'type', ''), P('dist', 'Distance (px)', 'num', 48)] },
    { key: 'sees', on: 'object', group: 'Collisions', label: 'Can see', text: '{t} can see {other}', params: [P('other', 'Sees', 'type', ''), P('range', 'Up to (px)', 'num', 120)] },
    { key: 'prop', on: 'object', group: 'Values', label: 'Compare a value', text: '{t}.{prop} {cmp} {value}', params: [P('prop', 'Value', 'prop', 'hp'), P('cmp', 'Is', 'cmp', '<='), P('value', 'Compared to', 'expr', '0')] },
    { key: 'otest', on: 'object', group: 'Values', label: 'JavaScript is true', text: '{t}: {expr} is true', params: [P('expr', 'Expression (self is the object)', 'expr', 'self.hp < 2')] },
    { key: 'created', on: 'object', group: 'Life', label: 'On created', text: 'On {t} created', params: [] },
    { key: 'destroyed', on: 'object', group: 'Life', label: 'On destroyed', text: 'On {t} destroyed', params: [] },
    { key: 'exists', on: 'object', group: 'Life', label: 'Exists', text: '{t} exists', notText: 'No {t} exists', params: [] },
    { key: 'moving', on: 'object', group: 'State', label: 'Is moving', text: '{t} is moving', params: [] },
    { key: 'animDone', on: 'object', group: 'State', label: 'Finishes an animation', text: '{t} finishes animation {name}', params: [P('name', 'Animation name', 'text', '')] },
    { key: 'offscreen', on: 'object', group: 'State', label: 'Is off screen', text: '{t} is off screen', params: [] },
    { key: 'tapped', on: 'object', group: 'Input', label: 'On tapped or clicked', text: 'On {t} tapped', params: [] },
    { key: 'nearest', on: 'object', group: 'Pick', label: 'Pick the nearest to', text: 'Pick the {t} nearest to {other}', params: [P('other', 'Nearest to', 'type', '')] },
    { key: 'randomOne', on: 'object', group: 'Pick', label: 'Pick one at random', text: 'Pick one random {t}', params: [] },
  ];

  OV.ACTIONS = [
    /* system */
    { key: 'setVar', on: 'system', group: 'Variables', label: 'Set a global variable', text: 'Set {name} to {value}', params: [P('name', 'Variable', 'global', 'score'), P('value', 'Value', 'expr', '0')] },
    { key: 'addVar', on: 'system', group: 'Variables', label: 'Add to a global variable', text: 'Add {value} to {name}', params: [P('name', 'Variable', 'global', 'score'), P('value', 'Amount', 'expr', '1')] },
    { key: 'create', on: 'system', group: 'Objects', label: 'Create an object', text: 'Create {type} at ({x}, {y})', params: [P('type', 'Object', 'typeOnly', ''), P('x', 'X', 'num', 100), P('y', 'Y', 'num', 100)] },
    { key: 'goRoom', on: 'system', group: 'Game', label: 'Go to a room', text: 'Go to room {room}', params: [P('room', 'Room', 'room', ''), P('spawn', 'Arrive at (instance name, optional)', 'text', '')] },
    { key: 'restart', on: 'system', group: 'Game', label: 'Restart this room', text: 'Restart this room', params: [] },
    { key: 'endGame', on: 'system', group: 'Game', label: 'End the game', text: 'End the game ({result}): {text}', params: [P('result', 'Result', 'choice', 'win', { options: [['win', 'Win'], ['lose', 'Lose']] }), P('text', 'Message', 'text', 'You win!')] },
    { key: 'dialog', on: 'system', group: 'Game', label: 'Show a message box', text: 'Show message: {text}', params: [P('text', 'Message (one page per line)', 'area', 'Hello!')] },
    { key: 'wait', on: 'system', group: 'Time', label: 'Wait', text: 'Wait {sec} seconds', params: [P('sec', 'Seconds', 'num', 1)] },
    { key: 'sound', on: 'system', group: 'Sound & camera', label: 'Play a sound', text: 'Play sound {sound}', params: [P('sound', 'Sound', 'sound', '')] },
    { key: 'music', on: 'system', group: 'Sound & camera', label: 'Play music (loops)', text: 'Play music {sound}', params: [P('sound', 'Sound', 'sound', '')] },
    { key: 'stopMusic', on: 'system', group: 'Sound & camera', label: 'Stop the music', text: 'Stop the music', params: [] },
    { key: 'shake', on: 'system', group: 'Sound & camera', label: 'Shake the camera', text: 'Shake the camera by {amount} for {sec}s', params: [P('amount', 'Strength (px)', 'num', 3), P('sec', 'Seconds', 'num', 0.3)] },
    { key: 'zoom', on: 'system', group: 'Sound & camera', label: 'Zoom the camera', text: 'Zoom the camera to {scale}x', params: [P('scale', 'Zoom', 'num', 1.5), P('sec', 'Over (s)', 'num', 0.5)] },
    { key: 'log', on: 'system', group: 'Code', label: 'Log to the console', text: 'Log {text}', params: [P('text', 'Text', 'text', 'score is {score}')] },
    { key: 'js', on: 'system', group: 'Code', label: 'Run JavaScript', text: 'Run JavaScript', params: [P('code', 'Code', 'js', '// Globals and object names work directly:\n// score += 10;\n// Player.say("Nice!");\n')] },
    /* object */
    { key: 'destroy', on: 'object', group: 'Life', label: 'Destroy', text: 'Destroy {t}', params: [] },
    { key: 'spawn', on: 'object', group: 'Life', label: 'Spawn another object here', text: '{t} spawns {type}', params: [P('type', 'Object', 'typeOnly', '')] },
    { key: 'setPos', on: 'object', group: 'Position', label: 'Set position', text: 'Move {t} to ({x}, {y})', params: [P('x', 'X', 'num', 0), P('y', 'Y', 'num', 0)] },
    { key: 'moveBy', on: 'object', group: 'Position', label: 'Move by', text: 'Move {t} by ({dx}, {dy})', params: [P('dx', 'Right (px)', 'num', 0), P('dy', 'Down (px)', 'num', 0)] },
    { key: 'moveToward', on: 'object', group: 'Position', label: 'Move toward', text: 'Move {t} toward {other} at {speed} px/s', params: [P('other', 'Toward', 'type', ''), P('speed', 'Speed (px/s)', 'num', 40)] },
    { key: 'knockback', on: 'object', group: 'Position', label: 'Knock back from', text: 'Knock {t} back from {other}', params: [P('other', 'Away from', 'type', ''), P('force', 'Force', 'num', 120)] },
    { key: 'lookAt', on: 'object', group: 'Position', label: 'Turn to face', text: 'Turn {t} to face {other}', params: [P('other', 'Face', 'type', '')] },
    { key: 'setProp', on: 'object', group: 'Values', label: 'Set a value', text: 'Set {t}.{prop} to {value}', params: [P('prop', 'Value', 'prop', 'hp'), P('value', 'To', 'expr', '3')] },
    { key: 'addProp', on: 'object', group: 'Values', label: 'Add to a value', text: 'Add {value} to {t}.{prop}', params: [P('prop', 'Value', 'prop', 'hp'), P('value', 'Amount', 'expr', '1')] },
    { key: 'damage', on: 'object', group: 'Combat', label: 'Hurt', text: 'Hurt {t} by {amount}', params: [P('amount', 'Damage', 'num', 1)] },
    { key: 'heal', on: 'object', group: 'Combat', label: 'Heal', text: 'Heal {t} by {amount}', params: [P('amount', 'Amount', 'num', 1)] },
    { key: 'shoot', on: 'object', group: 'Combat', label: 'Shoot at', text: '{t} shoots {type} at {other}', params: [P('type', 'Bullet', 'typeOnly', ''), P('other', 'At', 'type', ''), P('speed', 'Speed (px/s)', 'num', 150)] },
    { key: 'setAnim', on: 'object', group: 'Look', label: 'Set animation', text: 'Set {t} animation to {name}', params: [P('name', 'Animation name', 'text', 'idle')] },
    { key: 'flash', on: 'object', group: 'Look', label: 'Flash', text: 'Flash {t} for {sec}s', params: [P('sec', 'Seconds', 'num', 0.4)] },
    { key: 'say', on: 'object', group: 'Look', label: 'Speech bubble', text: '{t} says {text}', params: [P('text', 'Text', 'text', 'Hi!'), P('sec', 'Seconds', 'num', 2)] },
    { key: 'setText', on: 'object', group: 'Look', label: 'Set text', text: 'Set {t} text to {text}', params: [P('text', 'Text', 'text', '')] },
    { key: 'burst', on: 'object', group: 'Look', label: 'Burst of particles', text: '{t} bursts: {preset}', params: [P('preset', 'Effect', 'burst', 'spark')] },
    { key: 'enable', on: 'object', group: 'Behaviours', label: 'Turn a behaviour on or off', text: 'Turn {beh} {on} for {t}', params: [P('beh', 'Behaviour', 'beh', 'chase'), P('on', 'Switch', 'choice', 'off', { options: [['on', 'on'], ['off', 'off']] })] },
    { key: 'ojs', on: 'object', group: 'Code', label: 'Run JavaScript on each', text: 'Run JavaScript on each {t}', params: [P('code', 'Code (self is the object)', 'js', '// self.hp -= 1;\n')] },
  ];
  OV.condDef = (key, on) => OV.CONDITIONS.find(c => c.key === key && (!on || c.on === on)) || null;
  OV.actDef = (key, on) => OV.ACTIONS.find(c => c.key === key && (!on || c.on === on)) || null;
  OV.itemDef = (item, isCond) => (isCond ? OV.condDef : OV.actDef)(item.key, item.target === 'system' ? 'system' : 'object');
  OV.newItem = (def, target) => {
    const it = { id: OV.uid('c'), target: target, key: def.key, p: {} };
    def.params.forEach(p => (it.p[p.key] = p.def));
    return it;
  };

  /* ---------- names shown in the editor ---------- */
  OV.targetLabel = (project, target) => {
    if (target === 'system') return 'System';
    if (!target) return '(choose)';
    if (target.startsWith('kind:')) { const k = OV.KINDS.find(x => x[0] === target.slice(5)); return 'Any ' + (k ? k[1].toLowerCase() : target.slice(5)); }
    const t = OV.byId(project.types, target);
    return t ? t.name : '(deleted)';
  };
  const optLabel = (list, v) => { const o = (list || []).find(x => x[0] === v); return o ? o[1] : String(v == null ? '' : v); };
  OV.paramLabel = (project, param, value) => {
    switch (param.type) {
      case 'type': case 'typeOnly': return OV.targetLabel(project, value);
      case 'kind': return value === 'any' ? 'anything' : optLabel(OV.KINDS, value).toLowerCase();
      case 'room': { const r = OV.byId(project.rooms, value); return r ? r.name : '(choose)'; }
      case 'sound': { const s = OV.byId(project.sounds, value); return s ? s.name : '(none)'; }
      case 'key': return optLabel(OV.KEYS, value);
      case 'cmp': return optLabel(OV.CMPS, value);
      case 'choice': return optLabel(param.options, value);
      case 'burst': return optLabel(OV.BURSTS, value).toLowerCase();
      case 'beh': { const b = OV.behaviorDef(value); return b ? b.label : String(value); }
      case 'bool': return value ? 'yes' : 'no';
      case 'text': case 'area': return '"' + String(value == null ? '' : value).split('\n')[0] + (String(value).includes('\n') ? ' …' : '') + '"';
      default: return String(value == null ? '' : value);
    }
  };

  /* ---------- compile: turn scripts and expressions into loadable code ----------
     Each unit is a tiny script that registers functions with the engine. Units are loaded
     one by one, so a typo in one event or script cannot break the others.
     Inside them, `with ($S)` makes globals (score), object names (Player) and helpers
     (random, log) readable as plain names. */
  const isNumeric = v => typeof v === 'number' || (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v));
  const template = str => {
    const parts = []; let last = 0; const re = /\{([^{}]+)\}/g; let m;
    while ((m = re.exec(str))) {
      if (m.index > last) parts.push(JSON.stringify(str.slice(last, m.index)));
      parts.push('$t(' + m[1] + '\n)'); last = m.index + m[0].length;
    }
    if (last < str.length) parts.push(JSON.stringify(str.slice(last)));
    return parts.length ? parts.join(' + ') : '""';
  };
  OV.compile = project => {
    const units = [];
    const def = (key, body) => 'self.__def(' + JSON.stringify(key) + ', function ($S) { with ($S) {\n' + body + '\n} });';
    project.types.forEach(t => {
      if (t.script && t.script.trim()) {
        units.push({ key: 'ts:' + t.id, kind: 'script', typeId: t.id, name: t.name, lineOffset: 1,
          src: def('ts:' + t.id, t.script + '\n;return { onCreate: typeof onCreate === "function" ? onCreate : null, onUpdate: typeof onUpdate === "function" ? onUpdate : null, onTouch: typeof onTouch === "function" ? onTouch : null, onDestroy: typeof onDestroy === "function" ? onDestroy : null };') });
      }
      if (t.look === 'text' && /\{[^{}]+\}/.test(t.text.value || '')) {
        units.push({ key: 'tt:' + t.id, kind: 'text', typeId: t.id, name: t.name, src: def('tt:' + t.id, 'return function (self) { return ' + template(t.text.value) + '; };') });
      }
    });
    project.sheets.forEach(sheet => {
      sheet.events.forEach((top, index) => {
        const fns = [];
        const add = (item, isCond) => {
          const d = OV.itemDef(item, isCond); if (!d) return;
          d.params.forEach(p => {
            const v = item.p[p.key];
            if (v == null || v === '') return;
            const k = JSON.stringify(item.id + '.' + p.key);
            if ((p.type === 'num' || p.type === 'expr') && !isNumeric(v)) fns.push(k + ': function (self) { return (' + v + '\n); }');
            else if ((p.type === 'text' || p.type === 'area') && /\{[^{}]+\}/.test(v)) fns.push(k + ': function (self) { return ' + template(String(v)) + '; }');
            else if (p.type === 'js') fns.push(k + ': function (self) {\n' + v + '\n}');
          });
        };
        const walk = ev => { ev.conds.forEach(c => add(c, true)); ev.acts.forEach(a => add(a, false)); (ev.sub || []).forEach(walk); };
        walk(top);
        if (fns.length) units.push({ key: 'ev:' + top.id, kind: 'event', sheetId: sheet.id, eventId: top.id, name: sheet.name + ', event ' + (index + 1), src: def('ev:' + top.id, 'return {\n' + fns.join(',\n') + '\n};') });
      });
    });
    return units;
  };
})();
