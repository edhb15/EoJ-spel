# The Legend of Andorra

An open-world 3D fantasy adventure on the **real mountains of Andorra**. Defeat five guardian monsters, collect their magical shards, forge the Rainbow Sword and stop Zorg before his poison cloud swallows the country in 14 in-game days.

**Play:** https://edhb15.github.io/EoJ-spel/games/the-legend-of-andorra/index.html

**Endast för dator** – the game needs a keyboard and a mouse, so it is marked as computer-only on the start page.

This folder holds a **prebuilt copy**: the files are minified, so don't edit them here. The source code, tests and full documentation live in [edhb15/the-legend-of-andorra](https://github.com/edhb15/the-legend-of-andorra). To update this copy, run the following from the root of that repository:

```sh
npm install
npx vite build --outDir ../EoJ-spel/games/the-legend-of-andorra --emptyOutDir
```

The build replaces everything in this folder, including this README. Save a copy of the README first and put it back afterwards.

## MapTiler terrain

The game ships with a bundled elevation model of Andorra (`data/andorra_dem.png`), so it works out of the box. To stream MapTiler's 3D terrain instead, add your own key in the game (title screen → Settings → MapTiler 3D terrain) or in the address bar: `index.html?maptilerKey=YOUR_KEY`. Don't commit a key to this repository.

## Useful address options

- `?quality=low` – for slower computers (`medium` and `high` also exist)
- `?dayLength=8` – minutes per in-game day (default 16, so 14 days ≈ 3.7 hours)
