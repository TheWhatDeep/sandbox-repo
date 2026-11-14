/* Overhead Studio: built-in pixel art.
   Every picture is written below as rows of characters. Each character is one pixel and
   stands for a palette colour ('.' is see-through). Nothing is drawn until a function on
   OV.Assets is called; results are cached and callers always get fresh copies. */
(function () {
  'use strict';
  const OV = (window.OV = window.OV || {});

  /* ---------- palette: one character per colour ---------- */
  const PAL = [
    ['0', '#16121c'], // outline
    ['1', '#34304a'], ['2', '#575a70'], ['7', '#747a8c'], ['3', '#868b9c'], ['4', '#b9c0cc'], ['5', '#f2f2e6'], // stone and metal
    ['a', '#3b2520'], ['b', '#6a4230'], ['c', '#96623c'], ['d', '#c4935a'], ['e', '#ecd39b'],                   // wood, earth, sand
    ['S', '#c98866'], ['s', '#f0b78c'],                                                                         // skin
    ['q', '#6b1d2e'], ['r', '#b9303a'], ['R', '#e8604c'],                                                       // reds
    ['o', '#ee8b2c'], ['y', '#f7cf45'], ['Y', '#fdf2ad'],                                                       // fire and gold
    ['g', '#1d4636'], ['G', '#34753f'], ['h', '#52964a'], ['H', '#5ea34f'], ['L', '#9fd05c'],                   // greens
    ['n', '#232a5c'], ['u', '#2c5cab'], ['U', '#4a94dd'], ['w', '#a5e0f2'],                                     // blues
    ['p', '#55348a'], ['P', '#9460cf'], ['k', '#ea6fb4'],                                                       // magic
  ];
  const RGB = {};
  PAL.forEach(([ch, hex]) => { RGB[ch] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; });

  /* ---------- bitmap helpers (all return new arrays of strings) ---------- */
  const blank = w => '.'.repeat(w);
  // Move a picture; pixels pushed off the edge are lost.
  function shift(rows, dx, dy) {
    const w = rows[0].length, h = rows.length, out = [];
    for (let y = 0; y < h; y++) {
      const src = rows[y - dy];
      if (!src) { out.push(blank(w)); continue; }
      let line = '';
      for (let x = 0; x < w; x++) line += src[x - dx] || '.';
      out.push(line);
    }
    return out;
  }
  const flip = rows => rows.map(r => r.split('').reverse().join(''));
  // Replace rows starting at row y.
  function patch(rows, y, lines) { const out = rows.slice(); lines.forEach((l, i) => { out[y + i] = l; }); return out; }
  // Set single pixels: [[x, y, colour], ...].
  function dots(rows, list) {
    const g = rows.map(r => r.split(''));
    list.forEach(([x, y, c]) => { if (g[y] && x >= 0 && x < g[y].length) g[y][x] = c; });
    return g.map(r => r.join(''));
  }
  // A character on two legs: base is rows 0-12 (head and body), stand and step are 3 rows of legs, up is 4.
  function walker(base, stand, step, up) {
    const tall = base.slice(1).concat(up);
    return {
      idle: [base.concat(stand), [blank(16)].concat(base.slice(0, 12), stand)],
      walk: [base.concat(step), tall, base.concat(flip(step)), tall],
    };
  }

  /* ---------- characters ---------- */
  const HERO = walker([
    '................',
    '.....000000.....',
    '....0bccccb0....',
    '...0bccccccb0...',
    '...0bbbccbbb0...',
    '...0bssssssb0...',
    '...0ss0ss0ss0...',
    '...0ss0ss0ss0...',
    '....0ssSSss0....',
    '....00rRRr00....',
    '...0uuUUUUuu0...',
    '...0s0dyyd0s0...',
    '....0uuuuuu0....',
  ], [
    '....0nn00nn0....',
    '....0aa00aa0....',
    '.....00..00.....',
  ], [
    '....0nn00aa0....',
    '....0aa0.00.....',
    '.....00.........',
  ], [
    '....0nn00nn0....',
    '....0nn00nn0....',
    '....0aa00aa0....',
    '.....00..00.....',
  ]);

  const VILLAGER = walker([
    '................',
    '.....000000.....',
    '....0oyyyyo0....',
    '...0oyyyyyyo0...',
    '...0ooyyyyoo0...',
    '...0osssssso0...',
    '...0os0ss0so0...',
    '...0os0ss0so0...',
    '...0o0sSSs0o0...',
    '....00555500....',
    '...0rrRRRRrr0...',
    '...0s055550s0...',
    '....0r5555r0....',
  ], [
    '...0rrrrrrrr0...',
    '....0bb00bb0....',
    '.....00..00.....',
  ], [
    '...0rrrrrrrr0...',
    '....0bb0000.....',
    '.....00.........',
  ], [
    '....0rrrrrr0....',
    '...0rrrrrrrr0...',
    '....0bb00bb0....',
    '.....00..00.....',
  ]);

  const SKELETON = walker([
    '.....000000.....',
    '....05555550....',
    '...0555555540...',
    '...0500550040...',
    '...0500550040...',
    '...0555005540...',
    '....05555540....',
    '....05454540....',
    '...0000000000...',
    '...0555555550...',
    '...0501551050...',
    '...0505555050...',
    '....00155100....',
  ], [
    '.....050050.....',
    '....05500550....',
    '.....00..00.....',
  ], [
    '.....0500550....',
    '....0550.00.....',
    '.....00.........',
  ], [
    '.....050050.....',
    '.....050050.....',
    '....05500550....',
    '.....00..00.....',
  ]);

  const SLIME_A = [
    '................',
    '................',
    '................',
    '................',
    '.....000000.....',
    '...00UwwUUU00...',
    '..0UwwUUUUUUU0..',
    '..0UwUUUUUUUU0..',
    '.0UUUUUUUUUUUU0.',
    '.0UUU0UUUU0UUU0.',
    '.0UUU0UUUU0UUU0.',
    '.0UUUUUUUUUUUU0.',
    '.0uUUUUUUUUUUu0.',
    '.0uuUUUUUUUUuu0.',
    '..0uuuuuuuuuu0..',
    '...0000000000...',
  ];
  const SLIME_B = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '....00000000....',
    '..00UwwUUUUU00..',
    '.0UwwUUUUUUUUU0.',
    '0UUwUUUUUUUUUUU0',
    '0UUU0UUUUUU0UUU0',
    '0UUU0UUUUUU0UUU0',
    '0uUUUUUUUUUUUUu0',
    '0uuUUUUUUUUUUuu0',
    '.0uuuuuuuuuuuu0.',
    '..000000000000..',
  ];
  const SLIME_C = [
    '................',
    '......0000......',
    '....00UwUU00....',
    '...0UwwUUUUU0...',
    '...0UwUUUUUU0...',
    '..0UUUUUUUUUU0..',
    '..0UU0UUUU0UU0..',
    '..0UU0UUUU0UU0..',
    '..0UUUUUUUUUU0..',
    '..0uUUUUUUUUu0..',
    '..0uuUUUUUUuu0..',
    '...0uuuuuuuu0...',
    '....00000000....',
    '................',
    '................',
    '................',
  ];

  const BAT_A = [
    '................',
    '................',
    '................',
    '................',
    '.00..........00.',
    '0PP0........0PP0',
    '0PpP0.0..0.0PpP0',
    '0PppP010010PppP0',
    '0Pppp011110pppP0',
    '.0pp01y11y10pp0.',
    '..00.011110.00..',
    '......0110......',
    '.......00.......',
    '................',
    '................',
    '................',
  ];
  const BAT_B = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '......0..0......',
    '.....010010.....',
    '.000.011110.000.',
    '0ppp01y11y10ppp0',
    '0Pppp011110pppP0',
    '0Ppp0.0110.0ppP0',
    '0Pp0...00...0pP0',
    '.00..........00.',
    '................',
    '................',
  ];

  const GHOST_A = [
    '................',
    '.....000000.....',
    '...0055555500...',
    '..055555555540..',
    '.05555555555540.',
    '.05551155115540.',
    '.05551155115540.',
    '.05555555555540.',
    '.05555511555540.',
    '.05555555555440.',
    '.05555555555440.',
    '.05555555554440.',
    '.05555555555440.',
    '.05550555505440.',
    '..000.0000.000..',
    '................',
  ];
  const GHOST_B = shift(patch(GHOST_A, 13, [
    '.05505555550440.',
    '..00.000000.00..',
  ]), 0, 1);

  const TOTEM_A = [
    '.......00.......',
    '......0k50......',
    '.....0kk5P0.....',
    '..0.0kkPPPp0.0..',
    '.040.0PPpp0.030.',
    '.0430.0pp0.0320.',
    '.04330000003320.',
    '..043333333320..',
    '..043113311320..',
    '..043kk33kk320..',
    '..043333333320..',
    '..043311113320..',
    '..043333333320..',
    '.00000000000000.',
    '.03444444443220.',
    '.00000000000000.',
  ];
  const TOTEM_B = patch(patch(TOTEM_A, 1, [
    '......0550......',
    '.....0k55k0.....',
    '..0.0kkkkPP0.0..',
    '.040.0kPPp0.030.',
  ]), 9, ['..043553355320..']);

  /* ---------- pickups and interactables ---------- */
  const COIN_A = [
    '................',
    '................',
    '................',
    '......0000......',
    '....00yYYy00....',
    '...0yYYyyyyo0...',
    '...0yYyoYyyo0...',
    '...0yYyoYyyo0...',
    '...0yyyoYyyo0...',
    '...0yyyoYyoo0...',
    '...0yyyyyyoo0...',
    '....00yooo00....',
    '......0000......',
    '................',
    '................',
    '................',
  ];
  const COIN_B = [
    '................',
    '................',
    '................',
    '......0000......',
    '.....0yYyo0.....',
    '.....0YYyo0.....',
    '.....0YoYo0.....',
    '.....0YoYo0.....',
    '.....0yoYo0.....',
    '.....0yoYo0.....',
    '.....0yyoo0.....',
    '.....0yooo0.....',
    '......0000......',
    '................',
    '................',
    '................',
  ];
  const COIN_C = [
    '................',
    '................',
    '................',
    '.......00.......',
    '......0Yo0......',
    '......0Yo0......',
    '......0Yo0......',
    '......0yo0......',
    '......0yo0......',
    '......0yo0......',
    '......0yo0......',
    '......0yo0......',
    '.......00.......',
    '................',
    '................',
    '................',
  ];

  const GEM_A = [
    '................',
    '................',
    '................',
    '.....000000.....',
    '....0w55wUU0....',
    '...0w5wwUUUu0...',
    '..0UwwUUUUUuu0..',
    '..0uUwUUUUuuu0..',
    '...0uUUUUuuu0...',
    '....0uUUUuu0....',
    '.....0uUuu0.....',
    '......0uu0......',
    '.......00.......',
    '................',
    '................',
    '................',
  ];
  const GEM_B = dots(GEM_A, [[12, 2, '5'], [12, 3, '5'], [12, 4, '5'], [11, 3, '5'], [13, 3, '5'], [5, 6, '5'], [6, 7, 'w'], [3, 10, '5']]);

  const HEART_A = [
    '................',
    '................',
    '................',
    '...000....000...',
    '..0RRR0..0RRR0..',
    '..0R5RR00RRRr0..',
    '..0R5RRRRRRRr0..',
    '..0RRRRRRRRRr0..',
    '...0RRRRRRRr0...',
    '....0RRRRRr0....',
    '.....0RRRr0.....',
    '......0rr0......',
    '.......00.......',
    '................',
    '................',
    '................',
  ];
  const HEART_B = [
    '................',
    '................',
    '................',
    '................',
    '....00....00....',
    '...0RR0..0RR0...',
    '...0R5R00RRr0...',
    '...0R5RRRRRr0...',
    '....0RRRRRr0....',
    '.....0RRRr0.....',
    '......0rr0......',
    '.......00.......',
    '................',
    '................',
    '................',
    '................',
  ];

  const KEY = [
    '................',
    '......0000......',
    '.....0yYYo0.....',
    '....0yY00yo0....',
    '....0y0..0o0....',
    '....0yy00yo0....',
    '.....0yyyo0.....',
    '......0yo0......',
    '......0yo0......',
    '......0yo0......',
    '......0yo000....',
    '......0yoyo0....',
    '......0yo00.....',
    '......0yoyo0....',
    '......000000....',
    '................',
  ];

  const POTION = [
    '................',
    '................',
    '......0000......',
    '......0cd0......',
    '.....000000.....',
    '......0w50......',
    '.....0w5ww0.....',
    '....0wRRRRw0....',
    '...0wR5RRRRr0...',
    '...0R5RRRRRr0...',
    '...0RRRRRRRr0...',
    '...0RRRRRRrr0...',
    '....0rRRRrr0....',
    '.....000000.....',
    '................',
    '................',
  ];

  const CHEST_FRONT = [
    '.0yccc0yy0cccy0.',
    '.0yccc0oo0cccy0.',
    '.0ycccc00ccccy0.',
    '.0ybbbbbbbbbby0.',
    '.0obbbbbbbbbbo0.',
    '.00000000000000.',
    '................',
  ];
  const CHEST_CLOSED = [
    '................',
    '................',
    '................',
    '................',
    '..000000000000..',
    '.0yddddddddddy0.',
    '.0yccccccccccy0.',
    '.0obbbbbbbbbbo0.',
    '.00000000000000.',
  ].concat(CHEST_FRONT);
  const CHEST_OPEN = [
    '................',
    '..000000000000..',
    '.0ybbbbbbbbbby0.',
    '.0ybaaaaaaaaby0.',
    '.0ybaaaaaaaaby0.',
    '.0ybbbbbbbbbby0.',
    '.00000000000000.',
    '.0ayYyyYyoyYya0.',
    '.00000000000000.',
  ].concat(CHEST_FRONT);

  const DOOR = [
    '..000000000000..',
    '.04444444444430.',
    '0443000000003320',
    '0430dccbdccb0320',
    '0430dccbdccb0320',
    '0430233333320320',
    '0430dccbdccb0320',
    '0430dccbdccb0320',
    '0430dccbdyYb0320',
    '0430dccbdoyb0320',
    '0430dccbdccb0320',
    '0430dccbdccb0320',
    '0430233333320320',
    '0430dccbdccb0320',
    '0430dccbdccb0320',
    '0000000000000000',
  ];

  const GATE = [
    '0000000000000000',
    '0344444444444430',
    '0122222222222210',
    '041..41..41..410',
    '041..41..41..410',
    '041..41..41..410',
    '041..41..41..410',
    '041..41..41..410',
    '041..41..41..410',
    '041..41..41..410',
    '041..41..41..410',
    '041..41..41..410',
    '041..41..41..410',
    '0344444444444430',
    '0122222222222210',
    '0000000000000000',
  ];

  const STAIRS = [
    '0000000000000000',
    '0200000000000020',
    '0200000000000020',
    '0200000000000020',
    '0211111111111120',
    '0200000000000020',
    '0222222222222220',
    '0211111111111120',
    '0200000000000020',
    '0233333333333320',
    '0222222222222220',
    '0211111111111120',
    '0244444444444420',
    '0233333333333320',
    '0233333333333320',
    '0222222222222220',
  ];

  const SIGN = [
    '................',
    '..000000000000..',
    '.0dddddddddddd0.',
    '.0dbbbdbbbbdbd0.',
    '.0dddddddddddd0.',
    '.0dbbbbdbbbddd0.',
    '.0cccccccccccc0.',
    '..000000000000..',
    '......0cb0......',
    '......0cb0......',
    '......0cb0......',
    '......0cb0......',
    '......0cb0......',
    '......0cb0......',
    '......0cb0......',
    '......0000......',
  ];

  const FLAG_A = [
    '....00..........',
    '...0yy0000000...',
    '...0430RRRRRR0..',
    '...0430RRRRRRR0.',
    '...0430RRRRRRr0.',
    '...0430rRRRRr0..',
    '...0430rrRRRr0..',
    '...04300000000..',
    '...0430.........',
    '...0430.........',
    '...0430.........',
    '...0430.........',
    '...0430.........',
    '...0430.........',
    '..0234320.......',
    '..0000000.......',
  ];
  const FLAG_B = patch(FLAG_A, 1, [
    '...0yy00000000..',
    '...0430RRRRRRR0.',
    '...0430RRRRRRr0.',
    '...0430RRRRRr0..',
    '...0430rRRRRRr0.',
    '...0430rrRRRRr0.',
    '...043000000000.',
  ]);

  /* ---------- scenery ---------- */
  const TREE = [
    '.....000000.....',
    '...00GGGGGG00...',
    '..0GGHHGGGGGG0..',
    '.0GHLLHGGGGGGG0.',
    '.0GHLGGGGHHGGg0.',
    '0GGHGGGGHLLHGGg0',
    '0GGGGGGGHLGGGgg0',
    '0GGHHGGGGGGGGgg0',
    '0GHLLHGGGGHHGgg0',
    '0GGHLGGGGHLGggg0',
    '0gGGGGGGGGGGggg0',
    '0gGGGGGGGGGgggg0',
    '.0gGGGGGGGgggg0.',
    '.0ggGGGGgggggg0.',
    '..0gggggggggg0..',
    '...00gggggg00...',
    '.....0abbc0.....',
    '.....0bbcc0.....',
    '.....0bbcc0.....',
    '.....0bbcc0.....',
    '.....0bbcc0.....',
    '....0bbbccc0....',
    '....0bbbccc0....',
    '....00000000....',
  ];

  const ROCK = [
    '................',
    '................',
    '................',
    '.....000000.....',
    '...0044444400...',
    '..044444433330..',
    '.04444333333320.',
    '.04433333333220.',
    '0443333333332220',
    '0433333323332220',
    '0433333233322220',
    '0333333333222220',
    '0333333322222210',
    '0232222222222110',
    '.02222222221110.',
    '..000000000000..',
  ];

  const BUSH = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....00000000....',
    '..00GHHGGGGG00..',
    '.0GHLHGGGHHGGG0.',
    '0GHHGGGGHLHGGGg0',
    '0GGGGRGGGHGGGGg0',
    '0GGHGGGGGGGRGgg0',
    '0GHLHGGGGGGGGgg0',
    '0gGHGGGRGGGGggg0',
    '0ggGGGGGGGGgggg0',
    '.0gggGGGgggggg0.',
    '..000000000000..',
  ];

  const CRATE = [
    '0000000000000000',
    '0cddddddddddddc0',
    '0dccccccccccccb0',
    '0dc0000000000cb0',
    '0dc0cddddddb0cb0',
    '0dc0cccccccb0cb0',
    '0dc0bbbbbbbb0cb0',
    '0dc0cddddddb0cb0',
    '0dc0cccccccb0cb0',
    '0dc0bbbbbbbb0cb0',
    '0dc0cddddddb0cb0',
    '0dc0cccccccb0cb0',
    '0dc0000000000cb0',
    '0dccccccccccccb0',
    '0cbbbbbbbbbbbbb0',
    '0000000000000000',
  ];

  const BARREL = [
    '................',
    '................',
    '....00000000....',
    '..00cccccccc00..',
    '.0ccddddddddcc0.',
    '.0bccddddddccb0.',
    '.04433333333220.',
    '.0dcbdcbccbcbb0.',
    '.0dcbdcbccbcbb0.',
    '.0dcbdcbccbcbb0.',
    '.0dcbdcbccbcbb0.',
    '.0dcbdcbccbcbb0.',
    '.04433333333220.',
    '.0dcbdcbccbcbb0.',
    '..0cbdcbccbcb0..',
    '...0000000000...',
  ];

  const TORCH_A = [
    '................',
    '.......0........',
    '......0y0.......',
    '.....0yYy0......',
    '.....0oYYo0.....',
    '....0oyYYyo0....',
    '....0oyY5yo0....',
    '....0royyor0....',
    '.....0roor0.....',
    '....00000000....',
    '....02444320....',
    '.....022220.....',
    '......0cb0......',
    '......0cb0......',
    '......0cb0......',
    '......0000......',
  ];
  const TORCH_B = patch(TORCH_A, 0, [
    '.........o......',
    '........0.......',
    '.......0y0......',
    '......0yYy0.....',
    '.....0oYYo0.....',
    '....0oyYYyo0....',
    '....0oy5Yyo0....',
  ]);

  const SPIKES = [
    '................',
    '...00......00...',
    '..0420....0420..',
    '..0420....0420..',
    '.044220..044220.',
    '.044220..044220.',
    '.000000..000000.',
    '................',
    '................',
    '...00......00...',
    '..0420....0420..',
    '..0420....0420..',
    '.044220..044220.',
    '.044220..044220.',
    '.000000..000000.',
    '................',
  ];

  /* ---------- projectiles (8x8) ---------- */
  const ORB_A = ['..0000..', '.0PkkP0.', '0Pk55kP0', '0Pk5kkP0', '0PkkkkP0', '0pPkkPp0', '.0pPPp0.', '..0000..'];
  const ORB_B = ['..0000..', '.0kkkk0.', '0kk55kk0', '0k555kk0', '0kk5kkk0', '0PkkkkP0', '.0PkkP0.', '..0000..'];
  const SPARK_A = ['...oo...', '...yy...', '..yYYy..', 'oyY55Yyo', 'oyY55Yyo', '..yYYy..', '...yy...', '...oo...'];
  const SPARK_B = ['o......o', '.y....y.', '..yYYy..', '..Y55Y..', '..Y55Y..', '..yYYy..', '.y....y.', 'o......o'];

  /* ---------- sprite list ---------- */
  const one = (rows, name) => [{ name: name || 'idle', fps: 1, loop: true, frames: [rows] }];
  const anim = (name, fps, frames, loop) => ({ name, fps, loop: loop !== false, frames });
  const person = (p, idleFps) => [anim('idle', idleFps || 3, p.idle), anim('walk', 8, p.walk)];
  // id, name, w, h, ox, oy, [hit x, y, w, h], anims
  const SPRITES = [
    ['spr_hero', 'Hero', 16, 16, 8, 15, [4, 9, 8, 7], person(HERO)],
    ['spr_villager', 'Villager', 16, 16, 8, 15, [4, 9, 8, 7], person(VILLAGER)],
    ['spr_slime', 'Slime', 16, 16, 8, 15, [2, 8, 12, 8], [anim('idle', 3, [SLIME_A, SLIME_B]), anim('walk', 6, [SLIME_B, SLIME_C])]],
    ['spr_bat', 'Bat', 16, 16, 8, 14, [3, 6, 10, 7], [anim('idle', 8, [BAT_A, BAT_B]), anim('walk', 8, [BAT_A, BAT_B])]],
    ['spr_ghost', 'Ghost', 16, 16, 8, 15, [3, 6, 10, 9], [anim('idle', 3, [GHOST_A, GHOST_B]), anim('walk', 4, [GHOST_A, GHOST_B])]],
    ['spr_skeleton', 'Skeleton', 16, 16, 8, 15, [4, 9, 8, 7], person(SKELETON)],
    ['spr_totem', 'Totem', 16, 16, 8, 15, [2, 7, 12, 9], [anim('idle', 2, [TOTEM_A, TOTEM_B])]],

    ['spr_coin', 'Coin', 16, 16, 8, 8, [4, 4, 8, 8], [anim('idle', 8, [COIN_A, COIN_B, COIN_C, flip(COIN_B)])]],
    ['spr_gem', 'Gem', 16, 16, 8, 8, [3, 4, 10, 8], [anim('idle', 3, [GEM_A, GEM_B])]],
    ['spr_heart', 'Heart', 16, 16, 8, 8, [3, 4, 10, 8], [anim('idle', 3, [HEART_A, HEART_B])]],
    ['spr_key', 'Key', 16, 16, 8, 8, [5, 2, 6, 12], one(KEY)],
    ['spr_potion', 'Potion', 16, 16, 8, 8, [4, 4, 8, 9], one(POTION)],
    ['spr_chest', 'Chest', 16, 16, 8, 15, [1, 8, 14, 7], [anim('closed', 1, [CHEST_CLOSED], false), anim('open', 1, [CHEST_OPEN], false)]],
    ['spr_door', 'Door', 16, 16, 8, 15, [0, 0, 16, 16], one(DOOR)],
    ['spr_gate', 'Gate', 16, 16, 8, 15, [0, 0, 16, 16], one(GATE)],
    ['spr_stairs', 'Stairs', 16, 16, 8, 8, [2, 2, 12, 12], one(STAIRS)],
    ['spr_sign', 'Sign', 16, 16, 8, 15, [3, 9, 10, 7], one(SIGN)],
    ['spr_flag', 'Flag', 16, 16, 8, 15, [2, 6, 11, 10], [anim('idle', 4, [FLAG_A, FLAG_B])]],

    ['spr_tree', 'Tree', 16, 24, 8, 23, [5, 17, 6, 6], one(TREE)],
    ['spr_rock', 'Rock', 16, 16, 8, 15, [1, 6, 14, 10], one(ROCK)],
    ['spr_bush', 'Bush', 16, 16, 8, 15, [1, 8, 14, 8], one(BUSH)],
    ['spr_crate', 'Crate', 16, 16, 8, 15, [0, 2, 16, 14], one(CRATE)],
    ['spr_barrel', 'Barrel', 16, 16, 8, 15, [2, 6, 12, 10], one(BARREL)],
    ['spr_torch', 'Torch', 16, 16, 8, 15, [5, 10, 6, 6], [anim('idle', 6, [TORCH_A, TORCH_B])]],
    ['spr_spikes', 'Spikes', 16, 16, 8, 8, [2, 2, 12, 12], one(SPIKES)],

    ['spr_orb', 'Orb', 8, 8, 4, 4, [2, 2, 4, 4], [anim('idle', 10, [ORB_A, ORB_B])]],
    ['spr_spark', 'Spark', 8, 8, 4, 4, [2, 2, 4, 4], [anim('idle', 10, [SPARK_A, SPARK_B])]],
  ];

  /* ---------- tiles ---------- */
  const TILE = {
    grass: 0, grassFlowers: 1, grassTuft: 2, dirt: 3, sand: 4, water: 5, waterDeep: 6, stoneFloor: 7,
    stoneFloorCracked: 8, woodFloor: 9, wallTop: 10, wallFace: 11, rockWall: 12, hedge: 13, fence: 14, void: 15,
    carpet: 16, planks: 17, lava: 18, checker: 19, darkFloor: 20, cobble: 21, snow: 22, ice: 23,
  };
  const SOLID = ['water', 'waterDeep', 'wallTop', 'wallFace', 'rockWall', 'hedge', 'fence', 'void'];
  const T = 16;

  // Small seeded random number generator, so the ground looks the same on every run.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const grid = c => Array.from({ length: T }, () => new Array(T).fill(c));
  const fromRows = rows => rows.map(r => r.split(''));
  // Draw a small picture into a tile. It wraps around the edges, which keeps tiles seamless.
  function stamp(g, x, y, rows) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] !== '.') g[(y + j + T * 4) % T][(x + i + T * 4) % T] = row[i];
    });
    return g;
  }
  // Scatter marks evenly: the tile is cut into cells and each cell may get one mark at a random spot.
  function scatter(g, seed, cells, chance, marks) {
    const rand = rng(seed), size = T / cells;
    for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
      const roll = rand(), x = Math.floor(cx * size + rand() * size), y = Math.floor(cy * size + rand() * size);
      const mark = marks[Math.floor(rand() * marks.length)];
      if (roll < chance) stamp(g, x, y, mark);
    }
    return g;
  }
  function hline(g, y, x0, x1, c) { for (let x = x0; x <= x1; x++) g[(y + T) % T][(x + T) % T] = c; }
  function vline(g, x, y0, y1, c) { for (let y = y0; y <= y1; y++) g[(y + T) % T][(x + T) % T] = c; }

  const grass = seed => scatter(grid('H'), seed, 4, 0.7, [['h'], ['hh'], ['h', 'h'], ['h.', '.h']]);
  // Two big slabs per tile, offset like bricks.
  function slabs(base, joint) {
    const g = grid(base);
    hline(g, 7, 0, 15, joint); hline(g, 15, 0, 15, joint);
    vline(g, 7, 0, 6, joint); vline(g, 15, 8, 14, joint);
    return g;
  }
  // Rows of bricks: every row is 4 pixels tall and alternate rows are offset.
  function bricks(base, top, mortar) {
    const g = grid(base);
    for (let r = 0; r < 4; r++) {
      hline(g, r * 4, 0, 15, top);
      hline(g, r * 4 + 3, 0, 15, mortar);
      const off = r % 2 ? 3 : 7;
      vline(g, off, r * 4, r * 4 + 2, mortar); vline(g, off + 8, r * 4, r * 4 + 2, mortar);
    }
    return g;
  }

  // Irregular stones: every pixel belongs to its nearest seed point, and the borders between them become gaps.
  function stones(seed, n, body, gap, light, corner) {
    const rand = rng(seed), size = T / n, pts = [];
    for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) pts.push([(cx + 0.15 + rand() * 0.7) * size, (cy + 0.15 + rand() * 0.7) * size]);
    const own = (x, y) => {
      x = (x + T) % T; y = (y + T) % T;
      let best = 0, bd = 1e9;
      pts.forEach((p, i) => {
        let dx = Math.abs(x + 0.5 - p[0]), dy = Math.abs(y + 0.5 - p[1]);
        dx = Math.min(dx, T - dx); dy = Math.min(dy, T - dy);
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };
    const isGap = (x, y) => own(x, y) !== own(x + 1, y) || own(x, y) !== own(x, y + 1);
    const g = grid(body);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (isGap(x, y)) g[y][x] = gap;
      else if (corner ? isGap(x, y - 1) && isGap(x - 1, y) : isGap(x, y - 1)) g[y][x] = light;
    }
    return g;
  }

  const TILE_MAKERS = {
    grass: () => grass(11),
    grassFlowers: () => {
      const g = grass(23);
      stamp(g, 2, 2, ['.5.', '5y5', '.5.']);
      stamp(g, 10, 6, ['.k.', 'kYk', '.k.']);
      stamp(g, 5, 11, ['.5.', '5y5', '.5.']);
      stamp(g, 13, 13, ['y']);
      return g;
    },
    grassTuft: () => {
      const g = grass(37);
      stamp(g, 2, 3, ['L.G.L', '.GLG.', '..G..']);
      stamp(g, 9, 9, ['L.G.L', '.GLG.', '..G..']);
      stamp(g, 11, 2, ['G.L', '.G.']);
      stamp(g, 3, 12, ['L.G', '.G.']);
      return g;
    },
    dirt: () => scatter(scatter(grid('c'), 41, 4, 0.45, [['b'], ['bb'], ['b.', '.b']]), 43, 3, 0.5, [['d'], ['dd']]),
    sand: () => scatter(scatter(grid('e'), 51, 4, 0.5, [['d'], ['d'], ['dd']]), 53, 2, 0.6, [['5']]),
    water: () => scatter(scatter(grid('U'), 61, 3, 0.7, [['ww'], ['www'], ['.ww', 'w..']]), 67, 3, 0.5, [['uu'], ['uuu']]),
    waterDeep: () => scatter(scatter(grid('u'), 71, 3, 0.6, [['UU'], ['UUU']]), 73, 3, 0.5, [['nn'], ['nnn']]),
    stoneFloor: () => scatter(slabs('3', '7'), 81, 3, 0.5, [['7'], ['77']]),
    stoneFloorCracked: () => {
      const g = scatter(slabs('3', '7'), 83, 3, 0.4, [['7']]);
      stamp(g, 4, 2, ['2.......', '.2......', '.2......', '..22....', '....2...', '....2...', '.....2..', '......2.', '......2.', '.......2']);
      stamp(g, 9, 4, ['..2', '.2.', '2..']); stamp(g, 12, 3, ['22']);
      return g;
    },
    woodFloor: () => {
      const g = grid('d');
      for (let r = 0; r < 4; r++) hline(g, r * 4 + 3, 0, 15, 'c');
      [5, 12, 2, 9].forEach((x, r) => vline(g, x, r * 4, r * 4 + 2, 'c'));
      stamp(g, 8, 1, ['cc']); stamp(g, 1, 5, ['ccc']); stamp(g, 6, 9, ['cc']); stamp(g, 12, 13, ['ccc']); stamp(g, 2, 13, ['c']);
      return g;
    },
    wallTop: () => {
      const g = scatter(grid('2'), 91, 3, 0.4, [['1'], ['3']]);
      hline(g, 0, 0, 15, '3'); vline(g, 0, 0, 15, '3');
      hline(g, 15, 0, 15, '1'); vline(g, 15, 0, 15, '1');
      hline(g, 1, 1, 14, '3');
      return g;
    },
    wallFace: () => {
      const g = bricks('1', '2', '0');
      for (let r = 0; r < 4; r++) for (let x = 0; x < T; x++) if (g[r * 4 + 1][x] === '1') g[r * 4 + 1][x] = '2';
      hline(g, 0, 0, 15, '1');
      return g;
    },
    rockWall: () => stones(101, 3, '1', '0', '2', false),
    hedge: () => scatter(scatter(grid('G'), 111, 4, 0.9, [['HH.', '.gg'], ['H.', 'Hg'], ['.H', 'gg']]), 113, 2, 0.7, [['L']]),
    fence: () => stamp(grass(127), 0, 0, [
      '................',
      '................',
      '..0000....0000..',
      '..0dc0....0dc0..',
      '000dc000000dc000',
      'dddddddddddddddd',
      'cccccccccccccccc',
      '000dc000000dc000',
      '..0dc0....0dc0..',
      '000dc000000dc000',
      'dddddddddddddddd',
      'cccccccccccccccc',
      '000dc000000dc000',
      '..0dc0....0dc0..',
      '..0000....0000..',
      '................',
    ]),
    void: () => scatter(grid('0'), 131, 2, 0.75, [['1']]),
    carpet: () => {
      const g = grid('r');
      stamp(g, 2, 2, ['.q.', 'qRq', '.q.']); stamp(g, 10, 10, ['.q.', 'qRq', '.q.']);
      stamp(g, 11, 3, ['q']); stamp(g, 3, 11, ['q']);
      return g;
    },
    planks: () => {
      const g = grid('c');
      [3, 7, 11, 15].forEach(x => vline(g, x, 0, 15, 'b'));
      [0, 4, 8, 12].forEach((x, i) => { vline(g, x, 0, 15, 'd'); stamp(g, x + 1, 1, ['a']); stamp(g, x + 1, 14, ['a']); stamp(g, x + 1, 4 + i * 2, ['b', 'b']); });
      hline(g, 15, 0, 15, 'b');
      return g;
    },
    lava: () => scatter(scatter(scatter(grid('R'), 141, 3, 0.9, [['ooo'], ['oooo', '.oo.'], ['oo']]), 143, 3, 0.6, [['yy'], ['y']]), 147, 3, 0.5, [['rr'], ['rrr']]),
    checker: () => {
      const g = grid('4');
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x < 8) !== (y < 8)) g[y][x] = '3';
      return g;
    },
    darkFloor: () => scatter(slabs('1', '0'), 151, 3, 0.5, [['2'], ['0']]),
    cobble: () => stones(157, 3, '3', '2', '4', true),
    snow: () => scatter(scatter(grid('5'), 161, 4, 0.4, [['4'], ['44']]), 163, 2, 0.5, [['w']]),
    ice: () => {
      const g = scatter(grid('w'), 171, 3, 0.4, [['U'], ['UU']]);
      stamp(g, 2, 2, ['..5', '.5.', '5..']); stamp(g, 5, 3, ['.5', '5.']);
      stamp(g, 10, 9, ['..5', '.5.', '5..']); stamp(g, 13, 10, ['.5', '5.']);
      stamp(g, 12, 2, ['5']); stamp(g, 4, 12, ['5']);
      return g;
    },
  };

  /* ---------- drawing (only happens when one of the functions below is called) ---------- */
  function paint(img, rows, x0, y0, w) {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < w; x++) {
      const c = RGB[rows[y][x]];
      if (!c) continue;
      const i = ((y0 + y) * img.width + x0 + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
  function toPng(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
    draw(img);
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  let spriteCache = null, tilesetCache = null;
  function buildSprites() {
    return SPRITES.map(([id, name, w, h, ox, oy, hit, anims]) => ({
      id, name, w, h, ox, oy,
      hit: { x: hit[0], y: hit[1], w: hit[2], h: hit[3] },
      anims: anims.map(a => ({
        name: a.name, fps: a.fps, loop: a.loop,
        frames: a.frames.map(rows => {
          if (rows.length !== h || rows.some(r => r.length !== w)) console.warn('OV.Assets: ' + id + ' has a frame that is not ' + w + 'x' + h);
          return toPng(w, h, img => paint(img, rows, 0, 0, w));
        }),
      })),
    }));
  }
  function buildTileset() {
    const names = Object.keys(TILE), cols = 8, rows = 3;
    const src = toPng(cols * T, rows * T, img => {
      names.forEach(n => { const i = TILE[n]; paint(img, TILE_MAKERS[n](), (i % cols) * T, Math.floor(i / cols) * T, T); });
    });
    const solid = new Array(cols * rows).fill(false);
    SOLID.forEach(n => { solid[TILE[n]] = true; });
    return { id: 'ts_basic', name: 'Basic tiles', src, tw: T, th: T, cols, rows, solid };
  }
  const copySprite = s => ({
    id: s.id, name: s.name, w: s.w, h: s.h, ox: s.ox, oy: s.oy,
    hit: { x: s.hit.x, y: s.hit.y, w: s.hit.w, h: s.hit.h },
    anims: s.anims.map(a => ({ name: a.name, fps: a.fps, loop: a.loop, frames: a.frames.slice() })),
  });
  const allSprites = () => spriteCache || (spriteCache = buildSprites());

  OV.Assets = {
    PALETTE: PAL.map(p => p[1]),
    TILE: Object.assign({}, TILE),
    sprites() { return allSprites().map(copySprite); },
    sprite(id) { const s = allSprites().find(x => x.id === id); return s ? copySprite(s) : null; },
    tileset() {
      const t = tilesetCache || (tilesetCache = buildTileset());
      return Object.assign({}, t, { solid: t.solid.slice() });
    },
  };
})();
