# Chicago Bois

A chaotic, slightly comedic 3D open-world crime sandbox set in a cartoon version of Chicago: a 12×12-block city with the Loop and its elevated train, the Chicago River with steel bridges, tour boats and a riverwalk, the lakefront, Navy-Pier-style Ferris wheel and a skyline of art-deco and glass towers. Rob stores, crack locks, steal cars, race the streets and tag the alleys – and fill all **five wanted stars** before the cops put you in cuffs.

**Play:** https://edhb15.github.io/EoJ-spel/games/chicago-bois/index.html

**Endast för dator** – the game needs a keyboard and mouse.

## Controls

| Key | Action |
|---|---|
| W A S D | Move / drive |
| Mouse | Look around (click the game to capture the mouse) |
| Shift | Sprint |
| Space | Jump · handbrake in a car |
| E | Interact: rob (hold), pick locks, steal / enter / exit cars, hide in dumpsters, buy food or a disguise |
| F / left click | Shove (break free from an officer) |
| M | City map |
| H / R | Horn / car radio |
| Esc | Pause menu |

## How it works

- **Wanted meter:** every crime adds heat (minor +10%, medium +25%, major +40%, very major +60%). Repeating the same small crime within a minute gives less. Crimes done while cops are chasing you give ×1.25. 100% = one star; 500% = win.
- **Police response** grows with each star: suspicious officers (1), chase on sight (2), more units (3), tasers and ramming cruisers (4), and a helicopter with a spotlight (5).
- **Escaping:** break line of sight, duck into alleys, hide in dumpsters or bushes, or buy a disguise at a thrift store. When the search timer runs out you've escaped.
- **Busted:** officers next to you fill the arrest meter (shove them or run). If it fills, or your health hits zero, it's game over.

## Activities

Corner stores, pizzerias and the pawn shop (+25%), electronics and jewelry stores (+40%), the Second City Savings bank vault (+60%), ATMs (+25%), apartment back doors (+25%), warehouses and penthouses (+40%), the armored truck (+60%), parked cars / police cruisers / carjackings, street races (+40%), stunt ramps (+25%), speed cameras, graffiti and smashing street props (+10%).

## Graphics settings

- **High** (default): 4096 px sun shadows, glowing neon/lights, bloom, MSAA and sharpening, long draw distance.
- **Medium**: 2048 px shadows and glow.
- **Low**: no shadows or glow, lower resolution, shorter draw distance.

If the frame rate stays below ~30 FPS the game steps the quality down once by itself (until you pick a quality in Settings).

## Code

Plain HTML/CSS/JavaScript with [Babylon.js](https://www.babylonjs.com/) 8.20 (`lib/babylon.js`, Apache-2.0). Everything is generated in code – no models, textures or audio files.

| File | What |
|---|---|
| `index.html`, `style.css` | Page, HUD and menus |
| `game.js` | Engine setup, day/night cycle, player, camera, driving, collisions, game flow, menus |
| `js/util.js` | Constants, seeded RNG, settings |
| `js/pools.js` | Thin-instance pools and rigs (fast rendering of people, cars and props), mesh builder |
| `js/city.js`, `js/citytex.js` | City generator (blocks, river, bridges, towers), procedural textures, collision, navigation grid, traffic lights |
| `js/characters.js` | People and pedestrian AI |
| `js/vehicles.js` | Car models, arcade physics, traffic on the street grid |
| `js/police.js` | Wanted level, police AI (officers, cruisers, chopper), arrests |
| `js/activities.js` | Robberies, break-ins, vandalism, races, ramps, hiding… |
| `js/landmarks.js` | L train, Ferris wheel, mirror sculpture, lake, river and tour boats |
| `js/hud.js`, `js/effects.js`, `js/audio.js` | HUD + minimap, particles, synthesized sound and music |

Leaderboard and share buttons come from `../../shared/eoj.js` (board `chicago-bois:score`).
