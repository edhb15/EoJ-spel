# The Legend of Andorra

An open-world 3D fantasy adventure on the **real mountains of Andorra**. Defeat five guardian monsters, collect their magical shards, forge the Rainbow Sword and stop Zorg before his poison cloud swallows the country in 14 in-game days.

**Play:** https://edhb15.github.io/EoJ-spel/games/the-legend-of-andorra/index.html

Plays with a keyboard and mouse on a computer, or with on-screen touch controls on phones and tablets (they switch on by themselves; landscape works best).

This folder holds a **prebuilt copy**: the files are minified, so don't edit them here. The source code, tests and full documentation live in [edhb15/the-legend-of-andorra](https://github.com/edhb15/the-legend-of-andorra). To update this copy, run the following from the root of that repository:

```sh
npm install
npx vite build --outDir ../EoJ-spel/games/the-legend-of-andorra --emptyOutDir
```

The build replaces everything in this folder, including this README. Save a copy of the README first and put it back afterwards.

## MapTiler terrain

The game ships with a bundled elevation model of Andorra (`data/andorra_dem.png`), so it works out of the box. To stream MapTiler's 3D terrain instead, add your own key in the game (title screen → Settings → MapTiler 3D terrain) or in the address bar: `index.html?maptilerKey=YOUR_KEY`.

While MapTiler terrain is in use, the game shows MapTiler's logo and "© MapTiler © OpenStreetMap contributors" at the bottom of the screen, as MapTiler requires. With the bundled elevation model that credit is hidden, because no MapTiler data is shown.

To give every player MapTiler terrain, build the game with `VITE_MAPTILER_KEY` set. The key then ends up in the published files, where anyone can read it, so first restrict it to `edhb15.github.io` under *Allowed HTTP origins* in the MapTiler dashboard.

## Useful address options

- `?quality=low` – for slower computers (`medium` and `high` also exist; phones and tablets start on `low`)
- `?touch=1` / `?touch=0` – force the touch controls on or off
- `?dayLength=8` – minutes per in-game day (default 16, so 14 days ≈ 3.7 hours)
