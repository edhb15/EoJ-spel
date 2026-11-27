# EoJ-spel – Edwards och Johns spel

Gratis webbspel gjorda av Edward och John. Spela direkt i webbläsaren, ingen nedladdning:

**▶ https://edhb15.github.io/edwards-spel/** – startsidan är nu en hel värld ([edwards-spel](https://github.com/edhb15/edwards-spel)). `https://edhb15.github.io/EoJ-spel/` skickar dit automatiskt. Spelen ligger kvar här i `games/`, och den gamla listan finns på `klassisk.html`.

**Bossen i världen:** `shared/eoj.js` skickar speltid (`u:time:<spel>` var 2:a minut) och resultat (`u:res:<topplista>`) till samma `scores`-tabell som topplistorna. Världen räknar om det till skada på bossen. Spel som inte hade `eoj.js` (Andorra, Skyward, World Domination, Open World Sweden) laddar den nu också.

| Spel | Typ |
|---|---|
| [The Legend of Andorra](https://edhb15.github.io/EoJ-spel/games/the-legend-of-andorra/index.html) | 3D • Äventyr |
| [Skyward](https://edhb15.github.io/EoJ-spel/games/skyward/index.html) | 3D • Flygsimulator • **Endast för dator** |
| [Ski to Death 3D](https://edhb15.github.io/EoJ-spel/games/Ski-to-death-3d/index.html) | 3D • Action |
| [Impossible Rooms 3D](https://edhb15.github.io/EoJ-spel/games/impossible-rooms-3d/index.html) | 3D • Pussel |
| [Smita från ledet](https://edhb15.github.io/EoJ-spel/games/smita-fran-ledet/index.html) | 3D • Action |
| [Open World Sweden](https://edhb15.github.io/EoJ-spel/games/open-world-sweden/index.html) | 3D • Bilspel |
| [Matchdag](https://edhb15.github.io/EoJ-spel/games/matchdag/docs/index.html) | 2D • Fotboll |
| [Teacher Meltdown](https://edhb15.github.io/EoJ-spel/games/teacher-meltdown/index.html) | 2D • Kaos |
| [World Domination](https://edhb15.github.io/EoJ-spel/games/world-domination/index.html) | 2D • Strategi |
| [Stunt Rider 3D](https://edhb15.github.io/EoJ-spel/games/stunt-rider-3d/index.html) | 3D • Motorcykel |
| [TVÄTTBERT: RED ZONE](https://edhb15.github.io/EoJ-spel/games/tvattbert-red-zone/index.html) | 3D • FPS • Överlevnad • **Endast för dator** |

**Kommer snart:** [Chicago Bois](https://edhb15.github.io/chicago-bois/) släpps måndag 23 november. Startsidan visar en popup med trailern, bilder och nedräkning (filer i `dependencies/release/chicago-bois/`). Efter släppet byter rutan till "OUT NOW" i två veckor.

## Förhandsvisningar

Startsidan använder korta, komprimerade klipp i `dependencies/previews/` (MP4 + JPG-bild).
De långa originalinspelningarna ligger kvar i `dependencies/`.

Nytt klipp från en inspelning (12 sekunder med start vid sekund 4):

```sh
ffmpeg -ss 4 -t 12 -i dependencies/SPEL.mov -an -vf "scale=640:-2,fps=30" \
  -c:v libx264 -crf 28 -pix_fmt yuv420p -movflags +faststart dependencies/previews/SPEL.mp4
ffmpeg -ss 5 -i dependencies/SPEL.mov -frames:v 1 -vf "scale=640:-2" -q:v 4 dependencies/previews/SPEL.jpg
```
