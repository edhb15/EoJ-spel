# Stunt Rider 3D 🏍️

**An open-world motorcycle stunt game in the browser.** Ride five different bikes around a 2.4 × 2.4 km world. Hit kickers, a halfpipe, a loop and rooftop gaps, and chain flips, spins and style tricks into big combos. Everything is built with three.js and plain ES modules. There is no build step, and every model, texture, sound and music track is generated in code.

## Running it

Serve the folder with any static web server:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

Opening `index.html` straight from the file system won't work, because browsers block ES modules over `file://`. You need a WebGL 2 browser, which means any recent Chrome, Edge, Firefox or Safari. Phones and tablets get on-screen touch controls, and gamepads work too.

## Controls

| Key | On the ground | In the air |
|---|---|---|
| W / ↑ | Accelerate | Lean forward → frontflip (release and press again after take-off) |
| S / ↓ | Brake / reverse | Lean back → backflip |
| A D / ← → | Steer | Spin (360, 720 …) |
| Space | Tap: bunny hop. Hold: wheelie. Hold + S: stoppie | – |
| Shift | Boost (refills when you bank tricks) | Boost |
| E (+ direction) | – | Style trick: E = Superman, E+A = No-Hander, E+S = No-Footer, E+D = Tailwhip, E+W = Heart Attack (or keys 1–5) |
| R | Reset the bike | |
| C | Change camera: chase, first person, cinematic, side | |
| Mouse | Drag to look around, wheel to zoom | |
| Esc / P, M | Pause, map & teleport | |

## What's in it

### The world
- **Downtown**: a grid of streets and blocks, a 190 m tower, a skate plaza, a park, parking lots and a ramp that leads up to the **Rooftop Leap** gap.
- **Stunt Park**: Kicker Alley with S/M/L/Mega jumps, a **Bus Jump**, a vert **halfpipe**, a big quarter pipe, a **loop-the-loop**, a funbox, a spine, a motocross track with whoops and doubles, a trials section, and grandstands full of spectators.
- **Industrial Zone**: warehouses, silos, a container yard with the **Container Hop**, an open yard with ramps and quarter pipes, and a sand quarry with dunes.
- **Airfield**: a long runway with the **Mega Ramp** and distance boards, plus hangars, a control tower and a parked plane.
- **Countryside**: Pine Hills and Lakeside Valley have winding roads, dirt trails, forests, farms, wind turbines, and a **Lake Jump** over the water.
- **Highway 1**: 2 km of straight four-lane road with traffic.
- AI traffic runs in the city and on the highway. Birds, flags and turbines move, and 30 hidden stars are waiting to be found.
- Each surface has its own grip and rolling resistance: asphalt, concrete, dirt, grass, sand, gravel, wood and metal.

### Bikes
| Bike | Type | Character |
|---|---|---|
| MX 450 | Motocross | Best air control and off-road grip (free) |
| SM 500 | Supermoto | Sharpest handling |
| Street 750 | Naked street bike | Punchy and agile |
| Sport 1000 | Sport bike | Fast and stable |
| RR Superbike | Racing | Fastest bike in the game |

Each bike has its own 3D model, top speed, acceleration, handling, suspension travel, gearbox and engine sound. The models include animated wheels, suspension, steering, brake lights and headlights. In the **Garage** you can unlock bikes and paint them, change the rider's suit, and buy engine, suspension and tyre upgrades.

### Stunts and scoring
- Backflips, frontflips (double, triple …), 360/540/720 spins, Superman, No-Hander, No-Footer, Heart Attack and Tailwhips. A style trick done during a flip gives a combined trick, like a *Superman Backflip*.
- Wheelies and stoppies come with a balance meter. Holding one keeps the combo alive between jumps.
- Points depend on trick difficulty, how long a trick is held, air time and height, and how many rotations you do. Combo multipliers, the landing quality (Perfect ×1.5, Good ×1.15, Sketchy ×0.7), a streak bonus for clean landings in a row and named gaps all add to the score. Repeating a trick in one combo is worth less.
- Crashing loses the combo. The rider then tumbles away from the bike in a simple ragdoll.

### Game modes
- **Free Ride**: explore everything, collect stars and teleport from the map.
- **Stunt Mode**: score as much as you can in three minutes.
- **Time Trial**: five checkpoint courses with gold, silver and bronze medals.
- **Challenges**: 18 stunt goals against the clock.
- **Ramp Jump**: three attempts to fly as far as possible off the Mega Ramp.

## Code layout

```
src/
  main.js            boot + loading screen
  game.js            main loop, state machine, event wiring, settings
  core/              math & noise, input (keyboard, mouse, gamepad, touch), save data
  world/             terrain, roads, collision solids, city, stunt park, industrial,
                     airfield, nature, sky, traffic, collectibles, procedural textures
  bike/              specs, 3D bike models, IK-posed rider, arcade physics
  stunts/tricks.js   trick detection, combos and scoring
  modes/             game modes, courses and challenges
  camera/camera.js   chase, first person, cinematic and side cameras
  audio/             synthesized engine, effects and music (Web Audio)
  fx/particles.js    dust, smoke, sparks and skid marks
  ui/                HUD, menus, garage showroom
tools/               headless test harness, screenshot and clip recording scripts
```

Physics runs at a fixed 120 Hz. Collision geometry is a heightfield terrain plus "solids": oriented footprints with a height profile. Buildings, kickers, landing mounds, quarter pipes and the halfpipe are all built from these.

## Testing

`tools/` contains Playwright scripts that run the game in headless Chromium:

```sh
node tools/shot.mjs "tools/dev.html" shot.png      # physics harness, EVAL='…' runs JS (bots, jumps, courses)
node tools/play.mjs out basic                       # clicks through menus and plays (also: flows, cams, crash, mobile, menus)
node tools/record.mjs frames                        # renders a gameplay clip frame by frame
```
