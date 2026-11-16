# World Domination

A real-time grand strategy game. You lead one of 196 nations from 2027 and try to bring every country on Earth under your control, through war, alliances, espionage, influence and puppet states. The map uses real world borders, and every playthrough is different.

**Play:** https://edhb15.github.io/EoJ-spel/games/world-domination/index.html

This folder holds a **prebuilt copy**: the files are minified, so don't edit them here. The source code, tests and full documentation live in [edhb15/airplane-simulator](https://github.com/edhb15/airplane-simulator) under `world-domination/`. To update this copy, run the following from the root of that repository:

```sh
npm install
npx vite build world-domination --base ./ --outDir ../EoJ-spel/games/world-domination --emptyOutDir
```

The build replaces everything in this folder, including this README. Save a copy of the README first and put it back afterwards.
