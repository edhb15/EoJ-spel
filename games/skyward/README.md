# Skyward Flight Simulator

A 3D flight simulator. Fly airliners, fighter jets, private aircraft and cargo planes over Aurelia, a procedurally generated island with cities, mountains and nine airports.

**Play:** https://edhb15.github.io/EoJ-spel/games/skyward/index.html

**Endast för dator** – the game needs a keyboard (and works best with a mouse or joystick), so it is marked as computer-only on the start page.

This folder holds a **prebuilt copy**: the files are minified, so don't edit them here. The source code, tests and full documentation live in [edhb15/airplane-simulator](https://github.com/edhb15/airplane-simulator). To update this copy, run the following from the root of that repository:

```sh
npm install
npx vite build --outDir ../EoJ-spel/games/skyward --emptyOutDir
```

The build replaces everything in this folder, including this README. Save a copy of the README first and put it back afterwards.

Online multiplayer needs the separate relay server (see the airplane-simulator README); GitHub Pages only hosts the game itself, so single-player works out of the box.

## Multiplayer server (patched in this copy)

This copy always connects to the hosted server `wss://skyward-multiplayer.onrender.com/ws`. The Multiplayer screen has no "Server address" field and no "Local (browser tabs)" mode, and a `?server=` link or a server saved in the browser is ignored. This change was made directly in the built `assets/index-*.js` file, not in airplane-simulator, so **a new build from that repository will undo it**. Make the same change in the airplane-simulator source before you rebuild.
