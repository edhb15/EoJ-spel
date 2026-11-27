# TVÄTTBERT: RED ZONE

Ett förstapersons överlevnadsspel (FPS) i ett zombiedrabbat Göteborg. Spelvärlden är genererad direkt
från den bifogade STL-modellen (`stl/gothenburg-4000x4000m.stl`, CitySlicer, 4 × 4 km).
Spelet körs i webbläsaren (Three.js / WebGL, WebAudio) utan byggsteg.

## Starta

**Spela online:** https://edhb15.github.io/EoJ-spel/games/tvattbert-red-zone/index.html

Lokalt (från den här mappen):

```bash
npm start
```

Öppna sedan http://localhost:8080 (kräver Node 18+). Alternativ: `npx serve .` eller valfri statisk webbserver.
Lägg till `?quality=low|medium|high` i adressen för att välja grafiknivå (kan även ändras i menyn).

## Kontroller

| Tangent | Funktion |
|---|---|
| W A S D | Gå |
| Shift | Springa (kostar stamina) |
| Mellanslag | Hoppa |
| C / Ctrl | Huka (tystare, svårare att upptäcka) |
| Vänster mus / höger mus | Skjut/slå · sikta (kikarsikte på jaktgeväret) |
| R | Ladda om |
| 1–5 / mushjul | Kniv · Glock 17 · Pumphagelgevär · Automatkarbin 5 · Jaktgevär .308 |
| E | Interagera: dörrar, sök i bilar/skåp (håll), prata, handla, vila, ta motgift |
| F | Ficklampa (batteri laddas ur) |
| H | Snabbanvänd: motgift om infekterad, annars bandage/förbandslåda |
| Tab / I | Inventarie (använd/släng) |
| M | Karta |
| Esc | Paus (infektionens nedräkning fortsätter i verklig tid) |

## Hur STL-filen används

`tools/build-world.mjs` (Node, inga beroenden) läser STL-filen och skriver komprimerad speldata till `data/`:

1. **Analys:** binär STL, 275 768 trianglar, 180 × 180 mm = 4000 × 4000 m → 22,22 m/mm. Kontroll mot
   Masthuggskyrkan (tornet ≈ 58 m på en höjd ≈ 59 m över älven) visar att höjdskalan är 1:1.
2. **Segmentering:** hela modellen är ett sammanhängande nät. Uppåtvända trianglar som skiljs av lodräta väggar
   grupperas i 4 695 ytor ("patches").
3. **Terräng:** de största lutande ytorna är gator/mark. En höjdmodell (DEM) rekonstrueras och fylls ut under hus.
   Parker/skog är i utskriftsmodellen upphöjda ≈ 0,9 mm (20 m) och gräsytor ≈ 0,4 mm – dessa lager sänks
   tillbaka till marknivå och blir yttyper (asfalt, gräs, skog/granithällar).
4. **Vatten:** plana ytor under DEM (Göta älv, dammar i Slottsskogen och Änggårdsbergen) – exakta former från STL.
5. **Byggnader:** 3 332 plana tak ovanför DEM. Takets trianglar och konturkanter tas direkt från STL; väggar
   extruderas ned till marken. Konturerna blir kollisionsväggar (2,5D-kollision) för spelare, zombier, kulor och sikt.
6. **Rekvisita:** bilar längs fasader, vägspärrar tvärs över gator, gatlyktor och träd placeras utifrån avståndsfält
   till husen.

Kör om med `npm run build-world` (eller `node tools/build-world.mjs <fil.stl>` för en annan ruta).

### Vilken del av Göteborg?
Rutan täcker sydvästra/centrala Göteborg: Göta älv med kajerna (hamnen) och Eriksberg på Hisingen, Masthugget,
Stigberget, Majorna, Linnéstaden, Haga, södra kanten av Vallgraven, Slottsskogen, Änggården, Sahlgrenska och
Änggårdsbergen. Platsnamnen är placerade utifrån det som syns i höjdkartan (älven, Masthuggskyrkan, Slottsskogens
dammar, Vallgraven, sjukhusområdet med gångbroar); utan tillgång till OpenStreetMap är distriktens mittpunkter
ungefärliga (±100 m).

**Avenyn, Liseberg, Brunnsparken, Nordstan och Ullevi ligger utanför den bifogade rutan** (nordost om den).
Bara en STL-fil bifogades – den andra som nämndes saknades. Vid kanten finns avspärrningsstängslet med skyltar
mot dessa platser. Med den andra STL-filen kan byggverktyget köras på den och världen utökas.

## Vad som är implementerat och testat

Automatiska tester (`npm test`) – 6 enhetstester + 40 kontroller som kör det riktiga spelet i headless Chromium:

- **Värld:** STL-baserad stad, terrängströmning i 128 m-rutor, kollision mot hus/vatten/fordon/barrikader,
  avspärrningsstängsel. ✔ testat (gå, springa, hoppa, huka, väggar stoppar)
- **Vapen:** kniv, Glock 17 (9 mm), pumphagelgevär (12/70, laddas patron för patron), Automatkarbin 5 (5,56 mm,
  automateld), jaktgevär .308 (kikarsikte, slutstycke). Spridning, rekyl, magasin, omladdning, olika ammunition. ✔ testat
- **Zombier:** vanlig, snabb, tålig (pansar, knuffar), skrikare (larmar hela kvarteret + kallar på fler),
  spottare (frätande spott på avstånd). Syn (synfält, ljus, huka, väder, siktlinje), hörsel (skott, spring, dörrar,
  larm), förföljelse runt hus via flödesfält, sökning, vandring, attacker, bett, krossar dörrar.
  En stadsomfattande population (~1 250) vandrar även långt från spelaren. ✔ testat
- **Överlevnad:** hälsa, stamina, hunger, törst, blödning, inventarie med vikt, mat/dryck/medicin/batterier,
  sökbara bilar, polisbilar, ambulanser, militärfordon, soptunnor, skåp. ✔ testat
- **Infektion:** bett → omedelbar infektion, varning, 05:00-timer i **verklig tid** (väggklocka, fortsätter vid paus
  och även över sparning/omladdning), gradvisa skärmeffekter (färgskiftning, vågor, kromatisk aberration,
  hjärtslag, mörkläggning) och ljudeffekter (hjärtslag, tinnitus, dämpat ljud), tydlig hänvisning till Sahlgrenska.
  Inget botemedel de två första speldygnen; därefter finns Motgift ZX-7 i kylskåpet i *Laboratoriet – Virologi*
  (fast plats). Plocka upp → inventarie → använd: infektionen stoppas och nedräkningen försvinner. Vid 00:00
  förvandlas spelaren och spelet slutar. ✔ testat
- **Sjukhuset:** Sahlgrenska som utforskbar byggnad (96 × 64 m) med ~20 rum: reception, vårdsalar, akuten,
  röntgen, operationssalar, bårhus, apotek, laboratorium, korridorer med flimrande lysrör, dörrar, möbler,
  blod, zombier i patientkläder och läkarrockar. ✔ testat (gå i korridor, ta motgift)
- **Byggnader att gå in i:** 72 hus med dörrar till lägenheter, matbutiker, apotek, jaktbutiker, kontor och en
  polisstation (genererade interiörer med loot och zombier; jagande zombier följer efter in). ✔ testat
- **Levande värld:** dag/natt (justerbar dygnslängd), väder (klart, mulet, dimma, regn, storm med blixtar),
  brinnande bilar, rökpelare, utbrända och raserade hus, militärbas i Slottsskogen, forskningsanläggning på
  Medicinareberget, tre säkra zoner (Masthuggskyrkan, Stigbergskajen, koloniområdet) med vakter som skjuter
  zombier, handlare, sjuksköterska, sängar för vila/sparning. Slumpmässiga händelser: helikopterlådor, horder,
  billarm, nödrop från överlevande, avlägsen skottlossning. Radiosändningar. Fler zombier för varje ny dag,
  loot fylls delvis på. ✔ testat (natt, storm, vakter, händelser)
- **Ljud (WebAudio, helt syntetiserat):** vapen med eko mellan husen, steg som låter olika på asfalt/gräs/skog/
  kakel, 3D-placerade zombieläten (formantsyntes), skrik, vind, regn, åska, sirener, kråkor, hundar, efterklang
  som ändras inomhus/i trånga gator. (Ljudmotorn körs utan fel i testerna; själva ljudet går inte att höra i
  automatiska tester.)

## Begränsningar (ärligt)

- Grafiken är lågpolygon med procedurgenererade texturer – realistisk ljussättning, skuggor, dimma och
  efterbehandling finns, men inte AAA-detaljer eller fotogrammetri.
- Byggnaderna från STL är solida volymer; de 72 enterbara husen använder separata genererade interiörer
  (dörren "teleporterar"), medan sjukhuset är sömlöst i världen. Sjukhuset har ett spelbart plan.
- STL-modellen saknar gatunamn/vägtyp – gator och trottoarer kan inte skiljas åt (all stadsmark är asfalt).
  Gångbroar mellan sjukhusbyggnader i STL blir smala byggnader ned till marken.
- Headless-testmiljön renderar i mjukvara (~2 bilder/s), så prestanda på riktig grafikkort är inte uppmätt här;
  koden håller ~11 ms per uppdatering och ~200 ritanrop / 200 000 trianglar per bild på mellannivå.
- Sparning sker i webbläsarens localStorage.

## Struktur

```
tools/build-world.mjs   STL → speldata          src/world/   terräng, byggnader, kollision, sjukhus, interiörer, rekvisita
tools/serve.mjs         lokal webbserver         src/ai/      zombier, flödesfält, NPC:er
data/                   genererad världsdata     src/player/  spelare, vapen
stl/                    bifogad STL              src/game/    spel-loop, infektion, inventarie, loot, händelser, sparning
tests/                  enhets- och spelstester  src/render/  texturer, miljö/väder, partiklar, efterbehandling
                                                 src/audio/   ljudmotor   src/ui/  HUD, karta, inventarie, dialog
```
