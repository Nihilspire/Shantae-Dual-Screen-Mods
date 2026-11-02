/* shantae.js - Shantae (USA) RAM layout and game facts used by the Link page (see SHANTAE-RAM.md).
 * Names are written here; graphics and the signpost text come from the player's ROM / live VRAM at runtime. */
(function (root) {
  var S = {};
  // one read per tick: save block $CA70-$CABD, flags $CB1B-$CB3B, live state
  S.SPEC = 'CA70:78,CB1B:33,C39D:1,C3E9:2,CBFD:1,CB43:4,CA00:1,C377:2';
  S.SPEC_LEN = S.SPEC.split(',').reduce(function (n, p) { return n + (+p.split(':')[1] || 1); }, 0);
  S.parse = function (hex) {
    var b = []; for (var i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16));
    var o = 0, s = b.slice(o, o + 78); o += 78; var f = b.slice(o, o + 33); o += 33;
    var r = {
      items: s.slice(0, 12), gems: s[0x0D] | s[0x0E] << 8, lives: s[0x0F], hearts: s[0x10], maxHearts: s[0x12],
      equipped: s[0x14], squids: s[0x1A], fireflies: s[0x1B], mothers: s.slice(0x30, 0x44),
      gear: [s[0x4C], s[0x4B], s[0x4A], s[0x4D]],                    // Boot, Sash, Cuff, Tiara ($CABC $CABB $CABA $CABD)
      flags: f, state: b[o], time: b[o + 1] | b[o + 2] << 8, map: b[o + 3], x: b[o + 4] | b[o + 5] << 8, y: b[o + 6] | b[o + 7] << 8,
      screen: b[o + 8], frames: b[o + 9] | b[o + 10] << 8
    };
    var stones = f[0x1D], tal = f[0x1E], d1 = f[0x1F], d2 = f[0x20];
    r.stones = [0, 1, 2, 3].map(function (i) { return !!(stones & (0x10 << i)); });
    r.talismans = [0, 1, 2, 3].map(function (i) { return !!(tal & (0x10 << i)); });
    r.dances = [d1 & 1, d1 & 2, d1 & 4, d1 & 8, d1 & 16, d1 & 32, d1 & 64, d2 & 1, d1 & 128, d2 & 2, d2 & 4].map(Boolean);
    // baby squid n (1-20) picked up: flag bit n + 10 counted from $CB1B (table 11:6F0F; SHANTAE-RAM.md)
    r.squidGot = []; for (var n = 1; n <= 20; n++) r.squidGot.push(!!(f[(n + 10) >> 3] & (1 << ((n + 10) & 7))));
    r.night = (r.time & 0x8000) !== 0;
    r.inGame = r.state === 2 || r.state === 5;
    return r;
  };
  S.ITEMS = ['SMALL VIAL', 'MEDIUM VIAL', 'LARGE VIAL', 'FLOAT MUFFIN', 'VANISH CREAM', 'EXIT CANDY', 'TWIN MINTS', 'GREEDY JAR',
             'STORM PUFF', 'FLASH BOLT', 'PIKE BALL', 'FIREBALL'];
  S.ITEMS_SHORT = ['S.VIAL', 'M.VIAL', 'L.VIAL', 'MUFFIN', 'CREAM', 'CANDY', 'MINTS', 'GREEDY', 'STORM', 'FLASH', 'PIKE', 'FIRE'];
  S.ITEM_NOTE = ['A few hearts', 'Several hearts', 'All hearts', 'Saves you from pits', 'Slip past enemies', 'Leave a labyrinth',
                 'Double attack', 'Double loot', 'Thunder cloud', 'Ranged shot', 'Orbiting mines', 'Fast fire shot'];
  // inventory screen layout: item i is the 2x2 tile block at row 5 + 2*(i/4), column 11 + 2*(i%4)
  S.STONES = ['STONE 1', 'STONE 2', 'STONE 3', 'STONE 4'];
  S.TALISMANS = ['MONKEY CLAW', 'ELEPHANT TOTE', 'SPIDER VENOM', 'HARPY TALON'];
  S.GEAR = [['BOOT', 'Double-tap Up: spin kick'], ['SASH', 'Attack in a kick: drill'], ['CUFF', 'Hold attack: elbow dash'], ['TIARA', 'Attack in a dash: twirl']];
  // dance order follows the game's Dance Menu; inputs U D L R A B
  S.DANCES = [['MONKEY', 'DR'], ['ELEPHANT', 'DL'], ['SPIDER', 'DA'], ['HARPY', 'DB'], ['HEALING', 'DUA'],
              ['WARP 1', 'DULR'], ['WARP 2', 'DURLBA'], ['WARP 3', 'DURRBA'], ['WARP 4', 'DULLBA'], ['WARP 5', 'DUBLBR'], ['TINKERBAT', 'DUU']];
  S.HINTS = {
    heart: ['Scarecrow area: a slab on two pillars (Monkey)', 'A cave behind an eyeball door (Vanish Cream)',
            'A leafy pyramid hill (Spider)', 'Mud Bog: smash a rock (Elephant), then Float Muffin or Harpy',
            'Archer forest: break the stump (Elephant), Twin Mints for the clown', 'Desert: an upside-down pyramid high in the sky',
            'Mountain summit: a notch in the icicle roof, left side'],
    firefly: ['Scarecrow area: over the two pillars', 'Near the start of the rain storm', 'Waterfall lake (Spider)',
              'On a climbable plateau in the wasteland', 'Hidden waterfall: up from the far-right branch', 'Top of the spiked shaft (Harpy)',
              'Drop from a bat platform', 'Mountain: above the save guy, west cliff', 'Mud Bog: first climbable area going west',
              'Ghost forest: inset in the first wall (Monkey)', 'Ghost forest: high in the rocks (Harpy)', 'Archer forest: over the ruins (Spider)'],
    squid: ['Dribble Fountain: 5', 'Golem Mine: 5', 'Cackle Mound: 5', 'Twinkle Palace: 5'],
    talisman: ['Hidden forest cave (Storm Puff for the antenna creature)', 'Cave between the wasteland and the lake',
               'Mud Bog: top of the second pillar', 'Scarecrow area: a floating ruin (Harpy)']
  };
  S.FONT_FRAME = { ink: '#f8e070', red: '#e0584a', fill: '#000' };
  root.Shantae = S;
})(this);
