"""The clip list for showreel.py (see there). usage: showreel_clips.py OUTDIR [name ...]
States: work/st (the test-states zip) and work/sr, made by tools/re/... or by hand (0.28: see mk_states() below)."""
import sys, time
sys.path.insert(0, '/home/claude/shantae-dual/tests')
from showreel import *

ST = '/home/claude/work/st'
SR = '/home/claude/work/sr'
# page coordinates (640x480 viewport = 320x240 logical x2)
TAB = {'status': (106, 464), 'world': (320, 464), 'list': (534, 464)}
SUB = {'items': (124, 72), 'story': (318, 72), 'stats': (512, 72)}
SIDE = [(62, 90), (62, 160), (62, 225), (62, 285)]       # map side buttons, top to bottom
MAPC = (380, 330)
GEAR, FFB = (607, 16), (610, 466)
ITEM = lambda i: (42 + (i % 6) * 96, 110 + (i // 6) * 40)  # SHANTAE tab item boxes (640x480)
DAY = 3600 * 1000
SAMPLE_STATS = {'t': int(4.2 * 3600 * 59.7275), 'gemsIn': 3874, 'gemsOut': 3120, 'items': 41, 'hearts': 230, 'deaths': 6,
                'dances': 212, 'nights': 23, 'since': int(time.time() * 1000) - 5 * 24 * DAY}

def walk(btn, start=0, stop=10**6):
    return lambda k: btn if start <= k < stop else 'N'
def card(k): return ('js', "ShantaeMap.card('%s')" % k)
NOTE = (567, 16)                                           # the dance list button by the gear
DROW = lambda i: (300, 108 + 22 * i)                       # rows of the DANCES pop-up (0.33 auto dance)
def dance(s0, keys, warm=24, after='N', then=None):
    """Game buttons for an auto dance tapped at clip step s0, as MainActivity's input queue plays it (Select, then input k
    at frame 18 + 64k after it) in 2-frame steps: Select on the tap step, input k held for steps s0 + 10 + 32k and +1.
    after: a button held from `then` steps after the last input (to show the new form moving)."""
    k0 = warm + s0
    at = {k0: 'E'}
    for i, key in enumerate(keys): at[k0 + 10 + 32 * i] = at[k0 + 11 + 32 * i] = key
    end = k0 + 11 + 32 * (len(keys) - 1)
    return lambda k: at.get(k, after if then is not None and k >= end + then else 'N')

def mk_states():
    """The states the clips start from that aren't in the test-states zip: an area just after the room warp, and
    Risky's ship fight after the opening talk (B held through it)."""
    os.makedirs(SR, exist_ok=True)
    s = ''
    for a in ('0E', '14', '0B', '24'):
        if not os.path.exists(f'{SR}/sw0_{a}.st'): s += f'load {ST}/d4.st\nwarp {a}\nrun 500\nsave {SR}/sw0_{a}.st\n'
    if not os.path.exists(f'{SR}/boss.st'):
        s += f'load {ST}/d4.st\nwarp 03\nrun 300\n' + 'run 12 B\nrun 12\n' * 90 + f'save {SR}/boss.st\n'
    if s: subprocess.run([DRIVE, ROMF, '-'], input=s, capture_output=True, text=True)

def run(out, only):
    os.makedirs(out, exist_ok=True)
    mk_states()
    with sync_playwright() as pw:
        b = pw.chromium.launch(); ctx = b.new_context()
        base = {'sd.stats': SAMPLE_STATS, 'sd.worldView': 'map'}
        def want(n): return not only or any(o in n for o in only)
        L = lambda **kw: dict(base, **kw)
        C = []
        C.append(dict(name='01 Area transition - Mount Pointy', state=SR + '/sw0_0E.st', buttons=walk('L', 6), prewarm=True,
                      ls=L(**{'sd.tab': 'world'}), stills=[(4, 'Map - Mount Pointy'), (140, 'Map - after walking into the next area')]))
        C.append(dict(name='02 Area transition - forest', state=SR + '/sw0_14.st', buttons=walk('L', 6), prewarm=True,
                      ls=L(**{'sd.tab': 'world'}), stills=[(140, 'Map - forest')]))
        C.append(dict(name='03 Switching tabs', state=ST + '/d4.st', buttons=walk('R', 10, 140),
                      ls=L(**{'sd.tab': 'world', 'sd.progView': 'items'}),
                      actions={15: [('tap',) + TAB['status']], 45: [('tap',) + TAB['list']], 75: [('tap',) + SUB['stats']],
                               110: [('tap',) + TAB['world']]},
                      stills=[(35, 'Shantae tab'), (65, 'Progress - checklist'), (100, 'Progress - stats')]))
        drag = [('down',) + MAPC] + [('move', MAPC[0] - 12 * i, MAPC[1] - 3 * i) for i in range(1, 16)]
        C.append(dict(name='04 Map scrolling and zoom', state=SR + '/sw0_0B.st', buttons=walk('N'), ls=L(**{'sd.tab': 'world'}),
                      actions={**{10 + i: [a] for i, a in enumerate(drag)}, 26: [('up',)], 60: [('tap',) + MAPC], 90: [('tap',) + MAPC], 125: [('tap',) + MAPC]},
                      stills=[(25, 'Map - dragged'), (80, 'Map - zoom x2'), (115, 'Map - whole region')]))
        C.append(dict(name='05 Progress checklist hints', state=ST + '/d4.st', buttons=walk('N'),
                      ls=L(**{'sd.tab': 'list', 'sd.progView': 'items', 'sd.listOpen': ''}),
                      actions={10: [('tap', 300, 142)], 35: [('tap', 320, 330)], 55: [('tap', 300, 142)], 57: [('tap', 300, 168)], 78: [('tap', 320, 330)]},
                      steps=110, stills=[(30, 'Progress - heart holder hints'), (95, 'Progress - firefly hints')]))
        C.append(dict(name='06 Water Town street and doors', state=ST + '/warp_30.st', buttons=walk('R', 4), ls=L(**{'sd.tab': 'world'}),
                      actions={70: [card('doors')], 140: [card('doors')]},
                      stills=[(50, 'Map - Water Town street'), (110, 'Map - town doors card')]))
        C.append(dict(name='07 Night notes and map cards', state=ST + '/night_walk.st', buttons=walk('R', 4, 140), ls=L(**{'sd.tab': 'world'}),
                      actions={18: [('tap',) + SIDE[2]], 70: [('tap',) + MAPC], 88: [('tap',) + SIDE[0]], 135: [('tap',) + MAPC]},
                      stills=[(50, 'Map - night card'), (115, 'Map - ways out card')]))
        C.append(dict(name='08 Dance list pop-up', state=ST + '/d4.st',
                      buttons=lambda k: {20: 'E', 30: 'D', 31: 'D', 36: 'DR', 37: 'DR'}.get(k, 'N'),
                      ls=L(**{'sd.tab': 'world'}), actions={20: [('js', 'onSelect()')]}, stills=[(28, 'Dance list pop-up')]))
        C.append(dict(name='09 Boss bars - Tinker ship', state=SR + '/boss.st',
                      buttons=lambda k: ['R', 'RB', 'N', 'B', 'L', 'LB', 'A', 'N'][(k // 6) % 8], ls=L(**{'sd.tab': 'world'}),
                      stills=[(70, 'Boss bars - Risky and the Tinker ship')]))
        sig = []
        for s, pts in enumerate([[(120, 330), (150, 260), (175, 330), (200, 260), (230, 330)], [(260, 300), (300, 300)],
                                 [(330, 330), (350, 270), (380, 330), (400, 290), (430, 330)], [(460, 260), (470, 330), (520, 310)]]):
            sig += [('down',) + pts[0]] + [('move',) + p for p in pts[1:]] + [('up',)]
        C.append(dict(name='10 Ending card - signing', state=ST + '/after_end.st', buttons=walk('N'), ls=L(),
                      actions={**{20 + 3 * i: [a] for i, a in enumerate(sig)}, 125: [('tap', 590, 436)]},
                      stills=[(10, 'Ending card'), (145, 'Ending card - signed')]))
        C.append(dict(name='11 Story hint', state=ST + '/d4.st', buttons=walk('N'), ls=L(**{'sd.tab': 'list', 'sd.progView': 'story'}),
                      actions={10: [('tap', 320, 200)]}, steps=40, stills=[(5, 'Progress - story hint hidden'), (30, 'Progress - story hint')],
                      video_out=False))
        # 0.28 additions
        C.append(dict(name='12 Dusk falls', state=SR + '/sw0_0E.st', pre='poke C3E9 00\npoke C3EA 7E\n', buttons=walk('N'),
                      ls=L(**{'sd.tab': 'world'}), actions={110: [card('night')]},
                      stills=[(10, 'Map - dusk in seconds'), (90, 'Map - night falls'), (135, 'Map - night card at dusk')]))
        sdrag = [('down', 380, 360)] + [('move', 380, 360 - 14 * i) for i in range(1, 11)]
        C.append(dict(name='13 Labyrinth map cards and signposts', state=ST + '/warp_07.st', buttons=walk('N'), ls=L(**{'sd.tab': 'world'}),
                      actions={12: [card('ways')], 45: [card('items')], 78: [card('items')], 84: [('tap', 62, 192)],   # 3 side buttons here
                               **{105 + i: [a] for i, a in enumerate(sdrag)}, 116: [('up',)], 140: [('tap', 520, 408)]},   # the list's MAP button
                      stills=[(5, 'Map - Golem Mine'), (35, 'Map - ways out card'), (70, 'Map - still to collect card'),
                              (100, 'Signposts'), (130, 'Signposts - scrolled')]))
        C.append(dict(name='15 Cave - all rooms card', state=SR + '/sw0_24.st', buttons=walk('R', 6, 70), ls=L(**{'sd.tab': 'world'}),
                      actions={80: [card('rooms')], 145: [card('rooms')]}, stills=[(40, 'Map - cave'), (120, 'Map - all rooms card')]))
        C.append(dict(name='14 Equip, options and fast-forward', state=ST + '/d4.st', buttons=walk('N'),
                      ls=L(**{'sd.tab': 'status'}),
                      actions={12: [('tap',) + ITEM(2)], 38: [('tap',) + ITEM(9)], 66: [('tap',) + GEAR], 96: [('tap',) + FFB], 128: [('tap',) + FFB]},
                      stills=[(30, 'Shantae tab - item equipped'), (58, 'Shantae tab - another item'), (88, 'Options'), (115, 'Fast-forward on')]))
        # 0.33 auto dance: tap a dance in the pop-up, the app performs it (sw0_0B: no enemy reaches her mid-dance; a hit stops it)
        C.append(dict(name='16 Auto dance - Monkey', state=SR + '/sw0_0B.st', buttons=dance(22, 'DR'),
                      ls=L(**{'sd.tab': 'world'}), actions={10: [('tap',) + NOTE], 22: [('tap',) + DROW(0)]}, steps=215,
                      stills=[(16, 'Auto dance - the dance list'), (45, 'Auto dance - dancing'), (205, 'Auto dance - Monkey')]))
        C.append(dict(name='17 Auto dance - Elephant', state=SR + '/sw0_0B.st', buttons=dance(22, 'DL'),
                      ls=L(**{'sd.tab': 'world'}), actions={10: [('tap',) + NOTE], 22: [('tap',) + DROW(1)]}, steps=215,
                      stills=[(205, 'Auto dance - Elephant')]))
        C.append(dict(name='18 Auto dance - Warp 2', state=SR + '/sw0_0B.st', buttons=dance(22, 'DURLBA'),
                      ls=L(**{'sd.tab': 'world'}), actions={10: [('tap',) + NOTE], 22: [('tap',) + DROW(6)]}, steps=420,
                      stills=[(120, 'Auto dance - Warp 2 dancing'), (405, 'Auto dance - Warp 2 to Water Town')]))
        for c in C:
            if not want(c['name']): continue
            n = c.pop('name'); stl = c.pop('stills', [])
            clip(ctx, out, n, stills=stl, **c)
        b.close()

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2:])
