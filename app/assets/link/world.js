/* world.js - names and links of Shantae's rooms (see SHANTAE-RAM.md, "Areas and links").
 *
 * Rooms are keyed by what the game keeps in RAM: region table bank:high byte ($C9FA:$C9F9) and the room's top-left
 * corner ($C9E9, $C9EC). Names: the game's own signposts where it shows them (Scarecrow Field, Spiderwood Forest),
 * otherwise the names players use (Shantae Wiki). Links were found by playing every exit in the emulator (edges) and
 * by decoding the cave warp tables (caves: door n, side s in both the cave and the outside entrance).
 * Only facts about the game: no text or art from it. */
(function (root) {
  'use strict';
  var W = {};
  // key: 'BANK:HI|x|y'
  var R = {
    '72:4B|256|1024': ['SCUTTLE TOWN', 'field'],          // the opening stage (Risky's attack), docks and all
    '51:4F|0|0': ["SHANTAE'S LIGHTHOUSE", 'field'],      // where a new game starts (map $00); 0.23
    '51:4F|32|1198': ["RISKY'S SHIP", 'field'],          // the Tinker ship fight (map $03)
    '58:40|32|0': ['SCARECROW FIELD', 'field'],
    '58:40|0|1152': ['GECKO MATCH', 'game'],
    '59:73|552|8': ['SCUTTLE TOWN GATES', 'gate'],
    '59:73|32|8': ['DRIBBLE FOUNTAIN ENTRANCE', 'gate'],
    '59:73|1072|8': ['WATER TOWN GATES', 'gate'],
    '59:73|1576|8': ['OASIS TOWN GATES', 'gate'],
    '59:73|2096|8': ['ZOMBIE CARAVAN GATES', 'gate'],
    '59:73|2608|8': ['BANDIT TOWN GATES', 'gate'],
    '66:40|32|512': ['SPIDERWOOD FOREST', 'field'],
    '66:40|1280|2304': ['GOBLIN FOREST', 'field'],
    '66:40|256|2560': ['FOREST SIDE AREA', 'field'],
    '66:40|1280|2816': ['GHOST FOREST', 'field'],
    '66:40|1280|5120': ['ARCHER FOREST', 'field'],
    '85:67|256|768': ['WATERFALL LAKE', 'field'],
    '85:67|256|1752': ['HIDDEN WATERFALL', 'field'],
    '85:67|256|256': ['ZOMBIE SWAMP', 'field'],
    '9F:40|258|136': ['RAIN STORM RIVER', 'field'],
    'B1:4E|256|1280': ['SNAIL WASTELAND', 'field'],
    'B1:4E|2304|2304': ['EAGLE WASTELAND', 'field'],
    'B1:4E|256|256': ['NAGA WASTELAND', 'field'],
    'A3:63|1024|256': ['MOUNT POINTY', 'field'],
    '8C:5A|512|144': ['MUD BOG', 'field'],
    'AB:74|256|1280': ['LADIES DESERT', 'field'],
    'AB:74|256|256': ['MENS DESERT', 'field'],
  };
  // Labyrinths: each is one region; inside it the camera limits are the whole region (8192 square), plus a few small
  // rooms (the entrance room in Dribble Fountain, the rooms where Risky takes the stone). Any room of the region is the
  // labyrinth. exit = where you arrive from the overworld; walking left from there leads back out (played in the
  // emulator). Region D4:4D00 is Risky's island hideout (the end of the game), not Dribble Fountain (0.5 had it wrong).
  var LABS = {
    0x4A: { name: 'DRIBBLE FOUNTAIN', exit: [556, 1130], to: 'DRIBBLE FOUNTAIN ENTRANCE', n: 1 },
    0xBE: { name: 'GOLEM MINE', exit: [4377, 368], to: 'MENS DESERT', n: 2 },
    0x8F: { name: 'CACKLE MOUND', exit: [2624, 4976], to: 'ZOMBIE SWAMP', n: 3 },
    0xCA: { name: 'TWINKLE PALACE', exit: [3848, 1056], to: 'MOUNT POINTY', n: 4 },
    0xD4: { name: "RISKY'S HIDEOUT", exit: null, to: null, n: 0 }
  };
  W.LABS = LABS;
  // Regions whose rooms are unrelated story scenes, not parts of one place (0.23): region 51:4F holds the lighthouse
  // start (camera 0,0 3072x472 inside a 3072x1008 header), Risky's ship fight and the credits. The map shows only the
  // room she's in: no bigger host room, no overview, no drawing of the other rooms with this room's tiles.
  var ALONE = { '51:4F': true };
  W.alone = function (tb, th) { return !!ALONE[hx(tb) + ':' + hx(th)]; };
  // the caves (region B8:4600): room number -> top-left corner
  var CAVE_AT = { 1: [256, 256], 2: [768, 256], 3: [1536, 256], 4: [2560, 256], 5: [3072, 256], 6: [3840, 256], 7: [4608, 256],
                  8: [5376, 256], 9: [256, 768], 11: [768, 768], 12: [1536, 768] };
  Object.keys(CAVE_AT).forEach(function (n) { R['B8:46|' + CAVE_AT[n][0] + '|' + CAVE_AT[n][1]] = ['CAVE ' + n, 'cave', +n]; });
  // walking off the left / right edge (played in the emulator)
  var EDGE = {
    'SCUTTLE TOWN GATES': ['NAGA WASTELAND', 'SCARECROW FIELD'],
    'SCARECROW FIELD': ['SCUTTLE TOWN GATES', 'SPIDERWOOD FOREST'],
    'SPIDERWOOD FOREST': ['SCARECROW FIELD', 'DRIBBLE FOUNTAIN ENTRANCE'],
    'DRIBBLE FOUNTAIN ENTRANCE': ['SPIDERWOOD FOREST', 'WATERFALL LAKE'],
    'WATERFALL LAKE': ['DRIBBLE FOUNTAIN ENTRANCE', 'WATER TOWN GATES'],
    'WATER TOWN GATES': ['WATERFALL LAKE', 'RAIN STORM RIVER'],
    'RAIN STORM RIVER': ['WATER TOWN GATES', 'SNAIL WASTELAND'],
    'SNAIL WASTELAND': ['RAIN STORM RIVER', 'ZOMBIE SWAMP'],
    'ZOMBIE SWAMP': ['SNAIL WASTELAND', 'GHOST FOREST'],
    'GHOST FOREST': ['ZOMBIE SWAMP', 'ARCHER FOREST'],
    'ZOMBIE CARAVAN GATES': ['GHOST FOREST', 'ARCHER FOREST'],
    'ARCHER FOREST': ['GHOST FOREST', 'MOUNT POINTY'],
    'MOUNT POINTY': ['ARCHER FOREST', 'EAGLE WASTELAND'],
    'EAGLE WASTELAND': ['MOUNT POINTY', 'MUD BOG'],
    'BANDIT TOWN GATES': [null, 'EAGLE WASTELAND'],
    'MUD BOG': ['EAGLE WASTELAND', 'OASIS TOWN GATES'],
    'OASIS TOWN GATES': ['MUD BOG', 'LADIES DESERT'],
    'LADIES DESERT': ['OASIS TOWN GATES', null],
    'MENS DESERT': [null, 'NAGA WASTELAND'],
    'NAGA WASTELAND': ['MENS DESERT', 'SCUTTLE TOWN GATES']
  };
  // cave n: where its two ends (sides 1 and 2) come out (decoded from the warp tables)
  var CAVES = {
    1: ['NAGA WASTELAND', null], 2: ['LADIES DESERT', 'NAGA WASTELAND'], 3: ['MUD BOG', null],
    4: ['SPIDERWOOD FOREST', 'GOBLIN FOREST'], 5: ['GOBLIN FOREST', 'WATERFALL LAKE'], 6: [null, 'FOREST SIDE AREA'],
    7: ['WATERFALL LAKE', 'HIDDEN WATERFALL'], 8: ['SNAIL WASTELAND', 'GHOST FOREST'], 9: ['ARCHER FOREST', null],
    11: ['HIDDEN WATERFALL', 'SNAIL WASTELAND'], 12: ['FOREST SIDE AREA', 'GOBLIN FOREST']
  };
  var DOORS = {                                 // doors from the overworld into towns and labyrinths
    'SCUTTLE TOWN GATES': 'SCUTTLE TOWN', 'WATER TOWN GATES': 'WATER TOWN', 'OASIS TOWN GATES': 'OASIS TOWN',
    'BANDIT TOWN GATES': 'BANDIT TOWN', 'ZOMBIE CARAVAN GATES': 'ZOMBIE CARAVAN', 'DRIBBLE FOUNTAIN ENTRANCE': 'DRIBBLE FOUNTAIN',
    'ZOMBIE SWAMP': 'CACKLE MOUND', 'MOUNT POINTY': 'TWINKLE PALACE', 'MENS DESERT': 'GOLEM MINE'   // labyrinths: SHANTAE-RAM.md
  };

  // Towns (SHANTAE-RAM.md, "Towns"): the street is one room of region 9B:6700 (640 px, wraps), walked in game state 5.
  // Its doors are placed objects of type 157 (param 0 = door number); door n's name is entry n-1 of the town's label table
  // (3-byte far pointers to strings), read from the ROM at run time. Each door leads to a building room (corner below,
  // found by pressing Up at every door in the emulator) or, for the gates, back to the overworld.
  var TOWNS = [
    { name: 'SCUTTLE TOWN', map: 0x04, y: 0, labels: [0x29, 0x732E], gate: 6, ir: '9B:67',
      doors: { 1: [1304, 624], 2: [2624, 336], 3: [672, 360], 4: [1800, 360], 5: [248, 360], 7: [1248, 360] } },
    { name: 'WATER TOWN', map: 0x30, y: 768, labels: [0x29, 0x765D], gate: 4, ir: 'BB:62',
      doors: { 1: [2864, 872], 2: [672, 872], 3: [1800, 872], 5: [1264, 872], 6: [2336, 880], 7: [248, 872] } },
    { name: 'OASIS TOWN', map: 0x34, y: 1120, labels: [0x29, 0x76CE], gate: 4, ir: 'BB:62',
      doors: { 1: [2816, 1400], 2: [672, 1384], 3: [1800, 1384], 5: [1264, 1384], 6: [248, 1384], 7: [2336, 1384] } },
    { name: 'ZOMBIE CARAVAN', map: 0x31, y: 1376, labels: [0x2A, 0x56FC], gate: 4, ir: 'BB:62',
      doors: { 1: [1800, 1896], 2: [672, 1896], 3: [2336, 1896], 5: [1264, 1896], 6: [248, 1896] } },
    { name: 'BANDIT TOWN', map: 0x35, y: 1632, labels: [0x2A, 0x5ECB], gate: 4, ir: 'BB:62',
      doors: { 1: [1264, 2408], 2: [248, 2408], 3: [672, 2408], 5: [2336, 2408], 6: [2848, 2416], 7: [1800, 2408] } }
  ];
  TOWNS.forEach(function (t, k) {
    t.id = k;
    R['9B:67|0|' + t.y] = [t.name, 'town', 0, k];
    Object.keys(t.doors).forEach(function (n) { var d = t.doors[n]; R[t.ir + '|' + d[0] + '|' + d[1]] = [t.name, 'building', 0, k, +n]; });
  });
  W.TOWNS = TOWNS;
  W.STREET_W = 640;

  function hx(n) { return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }
  /** The room the game is in ($C9FA bank, $C9F9 table high byte, room corner) -> {name, kind, cave, town, door} or null. */
  W.room = function (tb, th, x, y) {
    var r = R[hx(tb) + ':' + hx(th) + '|' + x + '|' + y];
    if (r && (r[1] === 'town' || r[1] === 'building')) return { name: r[0], kind: r[1], cave: 0, town: TOWNS[r[3]], door: r[4] || 0 };
    var L = LABS[tb];
    if (!r && L) return { name: L.name, kind: 'labyrinth', cave: 0, lab: L };
    return r ? { name: r[0], kind: r[1], cave: r[2] || 0 } : null;
  };
  /** Lines describing where this room leads. */
  W.links = function (room) {
    var out = [];
    if (!room) return out;
    if (room.kind === 'town') return [['GATES', room.town.name + ' GATES']];
    if (room.kind === 'building') return [['DOOR', room.town.name]];
    if (room.kind === 'labyrinth') return room.lab && room.lab.to ? [['EXIT', room.lab.to]] : [];
    if (room.kind === 'cave') {
      var c = CAVES[room.cave] || [];
      if (c[0]) out.push(['1', c[0]]);
      if (c[1]) out.push(['2', c[1]]);
      return out;
    }
    var e = EDGE[room.name];
    if (e && e[0]) out.push(['<', e[0]]);
    if (e && e[1]) out.push(['>', e[1]]);
    if (room.name === 'EAGLE WASTELAND') out.push(['SIDE', 'BANDIT TOWN GATES']);
    if (room.name === 'GHOST FOREST') out.push(['NIGHT', 'ZOMBIE CARAVAN GATES']);
    if (DOORS[room.name]) out.push(['DOOR', DOORS[room.name]]);
    Object.keys(CAVES).forEach(function (n) {
      var c = CAVES[n], i = c.indexOf(room.name);
      if (i >= 0) { var other = c[1 - i]; out.push(['CAVE ' + n, other || 'DEAD END']); }
    });
    return out;
  };
  root.ShantaeWorld = W;
})(this);
