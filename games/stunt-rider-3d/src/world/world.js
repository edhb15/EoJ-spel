// World: builds everything and answers ground / collision queries for the bike.
import * as THREE from 'three';
import { Rng, smoothstep, fbm, clamp } from '../core/math.js';
import { Terrain } from './terrain.js';
import { Solids, solidGeometry } from './solids.js';
import { buildRoadPaths, RoadNet, buildRoadMeshes } from './roads.js';
import { Batcher, std } from './geom.js';
import * as T from './textures.js';
import * as P from './props.js';
import { buildCity } from './city.js';
import { buildStuntPark } from './stuntpark.js';
import { buildIndustrial } from './industrial.js';
import { buildAirfield } from './airfield.js';
import { buildNature } from './nature.js';
import { Sky } from './sky.js';
import { Traffic, CAR_COLORS } from './traffic.js';
import { SURF, LAKE, QUARRY, FIELDS, PLAZA, WATER_LEVEL, WORLD_HALF, PLAY_LIMIT, zoneAt, inRect, SPAWNS, ROAD_TYPES } from './layout.js';

export const STEP_UP = 0.55;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class World {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.solids = new Solids();
    this.animated = [];
    this.stars = [];
    this.gapZones = [];
    this.loops = [];
    this.landmarks = [];
    this.minimapShapes = [];
    this.spawns = SPAWNS;
    this._loc = { lx: 0, lz: 0 };
    this._smp = { h: 0, slope: 0 };
    this._dir = { x: 0, z: 0 };
    this._n = { x: 0, y: 1, z: 0 };
  }

  materials() {
    const vc = std({ vertexColors: true, roughness: 0.85 });
    const m = {
      vc,
      wood: std({ map: T.woodTexture(), roughness: 0.82 }),
      woodSide: std({ color: '#6b4a2b', roughness: 0.9 }),
      dirt: std({ map: T.dirtTexture(), roughness: 1 }),
      sandTop: std({ color: '#e0c98f', map: T.terrainDetail(), roughness: 1 }),
      concrete: std({ map: T.concreteTexture(0), roughness: 0.9 }),
      concreteDark: std({ map: T.concreteTexture(1), roughness: 0.9 }),
      sidewalk: std({ map: T.sidewalkTexture(), roughness: 0.92 }),
      parking: std({ map: T.parkingTexture(), roughness: 0.9 }),
      grassTop: std({ color: '#6a9a3e', map: T.terrainDetail(), roughness: 1 }),
      roof: std({ map: T.roofTexture(), roughness: 0.95 }),
      roofMetal: std({ color: '#8d9399', roughness: 0.55, metalness: 0.5 }),
      roofDark: std({ color: '#3b3b3e', roughness: 0.8 }),
      metal: std({ map: T.metalRampTexture(), roughness: 0.45, metalness: 0.65 }),
      steel: std({ color: '#9aa1a8', roughness: 0.35, metalness: 0.75 }),
      steelDark: std({ color: '#3d4247', roughness: 0.5, metalness: 0.6 }),
      paintOrange: std({ color: '#ff6a00', roughness: 0.45 }),
      paintRed: std({ color: '#d42a1e', roughness: 0.5 }),
      paintWhite: std({ color: '#efefea', roughness: 0.6 }),
      paintYellow: std({ color: '#f2c12e', roughness: 0.5 }),
      barnRed: std({ color: '#9c2f22', roughness: 0.85 }),
      brick: std({ color: '#8b4a36', roughness: 0.9 }),
      glass: std({ color: '#9ec9e8', roughness: 0.1, metalness: 0.8 }),
      door: std({ color: '#3b4148', roughness: 0.6, metalness: 0.4 }),
      checker: std({ map: T.checkerTexture(), roughness: 0.8 }),
      waterProp: std({ color: '#4d9cc4', roughness: 0.05, metalness: 0.3 }),
      track: std({ map: T.roadTexture('dirt'), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      loopTrack: std({ map: T.metalRampTexture(), roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }),
    };
    m.facade0 = std({ map: T.facadeTexture(0), roughness: 0.25, metalness: 0.55 });
    for (let i = 1; i < T.FACADE_COUNT; i++) m['facade' + i] = std({ map: T.facadeTexture(i), roughness: 0.75, metalness: 0.05 });
    return m;
  }

  async build(progress = () => {}) {
    const rng = new Rng(2026);
    const renderer = this.renderer;
    T.setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    progress(0.05, 'Shaping terrain');
    await nextFrame();
    this.paths = buildRoadPaths();
    this.terrain = new Terrain();
    this.terrain.generate(this.paths.filter((p) => ROAD_TYPES[p.type].flatten));
    this.roads = new RoadNet(this.paths);
    progress(0.2, 'Painting landscape');
    await nextFrame();
    this.terrain.buildMeshes(this.root, (x, z, h, ny, col) => this.terrainColor(x, z, h, ny, col));
    buildRoadMeshes(this.root, this.paths, (x, z) => this.terrain.height(x, z));
    progress(0.35, 'Building sky');
    await nextFrame();
    this.sky = new Sky(this.scene, renderer);
    this.mats = this.materials();
    const ctx = this.makeContext(rng);
    progress(0.42, 'Building downtown');
    await nextFrame();
    buildCity(ctx);
    progress(0.52, 'Building stunt park');
    await nextFrame();
    buildStuntPark(ctx);
    buildAirfield(ctx);
    progress(0.6, 'Building industrial zone');
    await nextFrame();
    buildIndustrial(ctx);
    progress(0.68, 'Growing forests');
    await nextFrame();
    buildNature(ctx);
    this.addExtraStars();
    progress(0.82, 'Merging geometry');
    await nextFrame();
    for (const key of this.batch.groups.keys()) {
      if (this.mats[key]) continue;
      if (key.startsWith('corr_')) this.mats[key] = std({ map: T.corrugatedTexture(key.slice(5)), roughness: 0.6, metalness: 0.35 });
      else throw new Error('Unknown material ' + key);
    }
    const batched = this.batch.build(this.root, this.mats, { chunk: 400 });
    this.cullables = [];
    for (const m of batched) if (m.geometry.boundingSphere.radius < 600) this.cullables.push({ obj: m, c: m.geometry.boundingSphere.center, r: m.geometry.boundingSphere.radius });
    for (const pool of Object.values(this.pools)) {
      for (const m of pool.build(this.root)) if (m.boundingSphere) this.cullables.push({ obj: m, c: m.boundingSphere.center, r: m.boundingSphere.radius });
    }
    this.traffic = new Traffic(this.root, this.mats.vc);
    this.mxTrack = ctx.mxTrack;
    progress(0.9, 'Drawing maps');
    await nextFrame();
    this.buildMinimap();
    progress(1, 'Ready');
  }

  // stars scattered around the countryside for exploring
  addExtraStars() {
    const t = this.terrain;
    const at = (x, z, up = 1.4) => this.stars.push({ x, y: t.height(x, z) + up, z });
    at(-1000, -1000);
    at(1000, -1000);
    for (const l of this.landmarks) if (!l.label) at(l.x + 9, l.z + 9, 1.4); // wind turbines on the hilltops
    for (const id of ['trailHills', 'trailRidge', 'trailForest', 'trailWest']) {
      const p = this.paths.find((q) => q.id === id).points;
      const m = p[Math.floor(p.length * 0.55)];
      at(m[0], m[1]);
    }
    at(-350, -175, 1.6);
    this.stars.push({ x: LAKE.cx + 110, y: WATER_LEVEL + 2.3, z: LAKE.cz + 44 });
    at(660, 830, 7);
    while (this.stars.length > 30) this.stars.pop();
  }

  makeContext(rng) {
    this.batch = new Batcher();
    const vc = this.mats.vc;
    const pools = {
      pine: new P.InstancePool(P.pineGeo(), vc, { chunk: 400 }),
      oak: new P.InstancePool(P.oakGeo(), vc, { chunk: 400 }),
      birch: new P.InstancePool(P.birchGeo(), vc, { chunk: 400 }),
      rock: new P.InstancePool(P.rockGeo(), vc, { chunk: 400 }),
      bush: new P.InstancePool(P.bushGeo(), vc, { chunk: 400, castShadow: false }),
      lamp: new P.InstancePool(P.lampGeo(), vc, { chunk: 300 }),
      tlight: new P.InstancePool(P.trafficLightGeo(), vc, { chunk: 300 }),
      tlens: new P.InstancePool(P.lensGeo(), new THREE.MeshStandardMaterial({ color: '#ffb000', emissive: '#ffa000', emissiveIntensity: 2 }), { chunk: 300, castShadow: false }),
      tire: new P.InstancePool(P.tireGeo(), vc, { chunk: 300 }),
      hay: new P.InstancePool(P.hayGeo(), vc, { chunk: 300 }),
      barrier: new P.InstancePool(P.barrierGeo(), vc, { chunk: 300 }),
      personBody: new P.InstancePool(P.personBodyGeo(), vc, { chunk: 300, castShadow: false }),
      personRest: new P.InstancePool(P.personRestGeo(), vc, { chunk: 300, castShadow: false }),
      container: new P.InstancePool(P.containerGeo(), P.containerMaterial(), { chunk: 300 }),
      carBody: new P.InstancePool(P.carBodyGeo(), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.45 }), { chunk: 300 }),
      carDetail: new P.InstancePool(P.carDetailGeo(), vc, { chunk: 300 }),
      busBody: new P.InstancePool(P.busBodyGeo(), vc, { chunk: 300 }),
      busDetail: new P.InstancePool(P.busDetailGeo(), vc, { chunk: 300 }),
      truckBody: new P.InstancePool(P.truckBodyGeo(), vc, { chunk: 300 }),
      truckDetail: new P.InstancePool(P.truckDetailGeo(), vc, { chunk: 300 }),
      tower: new P.InstancePool(P.lightTowerGeo(), vc, { chunk: 0 }),
      post: new P.InstancePool(new THREE.BoxGeometry(0.12, 1.2, 0.12).translate(0, 0.6, 0), this.mats.woodSide, { chunk: 400, castShadow: false }),
    };
    this.pools = pools;
    this.lensMat = pools.tlens.material;
    const world = this;
    const solids = this.solids;
    const terrain = this.terrain;
    const people = [];
    this.people = people;
    const ctx = {
      scene: this.root,
      terrain,
      roads: this.roads,
      solids,
      batch: this.batch,
      mats: this.mats,
      rng,
      stars: this.stars,
      gapZones: this.gapZones,
      loops: this.loops,
      landmarks: this.landmarks,
      minimap: this.minimapShapes,
      animated: this.animated,
      addSolid(o, meshOpts = {}) {
        if (o.y0 === undefined) o.y0 = terrain.height(o.cx, o.cz);
        const s = solids.add(o);
        if (meshOpts.mesh !== false) {
          const g = solidGeometry(s, { uvScale: meshOpts.uv || 4 });
          world.batch.add(meshOpts.top || 'concrete', g.top);
          if (g.sides) world.batch.add(meshOpts.side || meshOpts.top || 'concrete', g.sides);
          if (s.kind !== 'slab' && s.kind !== 'prop' && s.hx > 1.5) {
            const c = s.kind === 'halfpipe' || s.kind === 'quarter' ? '#e0e3e8' : s.kind === 'landing' || s.kind === 'mx' ? '#b98a55' : '#ff8a2a';
            world.minimapShapes.push({ obb: [s.cx, s.cz, s.hx, s.hz, s.yaw], color: c });
          }
        }
        return s;
      },
      addTree(x, z, kind, scale = 1, y, collide = true) {
        if (y === undefined) y = terrain.height(x, z);
        const tint = new THREE.Color().setHSL(0.25 + rng.float(-0.04, 0.04), 0.5, 0.5 + rng.float(-0.08, 0.08));
        pools[kind].add(x, y - 0.1, z, rng.float(0, 6.28), scale, scale * rng.float(0.9, 1.15), scale, '#' + tint.getHexString());
        if (collide) solids.add({ cx: x, cz: z, hx: 0.35 * scale, hz: 0.35 * scale, h: 6 * scale, y0: y - 0.5, surface: SURF.dirt, kind: 'tree' });
      },
      addRock(x, z, s) {
        const y = terrain.height(x, z);
        pools.rock.add(x, y - 0.15 * s, z, rng.float(0, 6), s, s, s);
        if (s > 1.1) solids.add({ cx: x, cz: z, hx: s * 0.7, hz: s * 0.7, h: s * 0.5, y0: y - 0.2, surface: SURF.gravel, kind: 'rock' });
      },
      addBush(x, z, s) {
        pools.bush.add(x, terrain.height(x, z), z, rng.float(0, 6), s, s, s);
      },
      addPost(x, z) {
        pools.post.add(x, terrain.height(x, z), z);
      },
      addLamp(x, z, yaw) {
        pools.lamp.add(x, 0.18, z, yaw);
        solids.add({ cx: x, cz: z, hx: 0.2, hz: 0.2, h: 8, y0: 0.18, surface: SURF.metal, kind: 'pole', crashSoft: true });
      },
      addTrafficLight(x, z, yaw) {
        pools.tlight.add(x, 0.18, z, yaw);
        pools.tlens.add(x, 0.18, z, yaw);
        solids.add({ cx: x, cz: z, hx: 0.2, hz: 0.2, h: 5, y0: 0.18, surface: SURF.metal, kind: 'pole', crashSoft: true });
      },
      addTire(x, z) {
        pools.tire.add(x, terrain.height(x, z), z, 0);
      },
      addHay(x, z, yaw, y) {
        pools.hay.add(x, y ?? terrain.height(x, z), z, yaw);
        solids.add({ cx: x, cz: z, yaw, hx: 0.65, hz: 0.75, h: 1.5, y0: y ?? terrain.height(x, z), surface: SURF.grass, kind: 'prop', crashSoft: true });
      },
      addBarrier(x, z, yaw) {
        pools.barrier.add(x, terrain.height(x, z), z, yaw);
        solids.add({ cx: x, cz: z, yaw, hx: 2.8, hz: 0.3, h: 0.8, y0: terrain.height(x, z), surface: SURF.concrete, kind: 'prop' });
      },
      addPerson(x, y, z, yaw) {
        const shirt = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#2ecc71', '#ff6a00', '#9b59b6', '#1abc9c'][rng.int(0, 7)];
        const s = rng.float(0.92, 1.08);
        pools.personBody.add(x, y, z, yaw, s, s, s, shirt);
        pools.personRest.add(x, y, z, yaw, s, s, s);
        people.push({ x, y, z, yaw, s, phase: rng.float(0, 6.28) });
      },
      addContainer(x, y, z, yaw, color) {
        pools.container.add(x, y, z, yaw, 1, 1, 1, color);
      },
      addParkedCar(x, z, yaw, colorIdx, y = 0) {
        pools.carBody.add(x, y, z, yaw, 1, 1, 1, CAR_COLORS[colorIdx % CAR_COLORS.length]);
        pools.carDetail.add(x, y, z, yaw);
        solids.add({ cx: x, cz: z, yaw, hx: 0.95, hz: 2.2, h: 1.5, y0: y, surface: SURF.metal, kind: 'vehicle' });
      },
      addBus(x, z, yaw) {
        const y = terrain.height(x, z);
        pools.busBody.add(x, y, z, yaw, 1, 1, 1, '#f2b81e');
        pools.busDetail.add(x, y, z, yaw);
        solids.add({ cx: x, cz: z, yaw, hx: 1.28, hz: 6, h: 3.2, y0: y, surface: SURF.metal, kind: 'vehicle' });
      },
      addTruck(x, z, yaw, colorIdx) {
        const y = terrain.height(x, z);
        pools.truckBody.add(x, y, z, yaw, 1, 1, 1, ['#d9d9d4', '#2f5f8a', '#a83a2c', '#e0a526', '#3d6b45', '#555'][colorIdx % 6]);
        pools.truckDetail.add(x, y, z, yaw);
        solids.add({ cx: x, cz: z, yaw, hx: 1.25, hz: 5, h: 3.9, y0: y, surface: SURF.metal, kind: 'vehicle' });
      },
      addLightTower(x, z) {
        pools.tower.add(x, terrain.height(x, z), z, Math.atan2(-x, -z));
        solids.add({ cx: x, cz: z, hx: 1.6, hz: 1.6, h: 22, y0: terrain.height(x, z), surface: SURF.metal, kind: 'pole' });
      },
      addMarker(x, z, n, yaw) {
        const y = terrain.height(x, z);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshStandardMaterial({ map: T.markerTexture(n), roughness: 0.7, side: THREE.DoubleSide }));
        board.position.set(x, y + 2.6, z);
        board.rotation.y = yaw;
        world.root.add(board);
        const pole = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6);
        pole.translate(x, y + 0.8, z);
        world.batch.add('steel', pole);
      },
      addBanner(x, y, z, yaw, w, h, text, bg, fg, sub = '', doubleSided = false, posts = false) {
        const mat = new THREE.MeshStandardMaterial({ map: T.bannerTexture(text, bg, fg, sub), roughness: 0.7, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        const gy = terrain.height(x, z);
        mesh.position.set(x, gy + y, z);
        mesh.rotation.y = yaw;
        mesh.castShadow = true;
        world.root.add(mesh);
        if (!doubleSided) {
          const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), world.mats.steelDark);
          back.position.copy(mesh.position);
          back.rotation.y = yaw + Math.PI;
          world.root.add(back);
        }
        if (posts) {
          const fx = Math.cos(yaw);
          const fz = -Math.sin(yaw);
          for (const s of [-1, 1]) {
            const px = x + fx * s * (w / 2 - 0.3);
            const pz = z + fz * s * (w / 2 - 0.3);
            const ph = y - h / 2 + 0.1;
            const pole = new THREE.CylinderGeometry(0.12, 0.14, ph, 6);
            pole.translate(px, gy + ph / 2, pz);
            world.batch.add('steelDark', pole);
            solids.add({ cx: px, cz: pz, hx: 0.2, hz: 0.2, h: ph, y0: gy, surface: SURF.metal, kind: 'pole', crashSoft: true });
          }
        }
        return mesh;
      },
      addArch(x, z, yaw, width, text) {
        const fx = Math.cos(yaw);
        const fz = -Math.sin(yaw);
        const gy = terrain.height(x, z);
        for (const s of [-1, 1]) {
          const px = x + fx * s * (width / 2 + 0.8);
          const pz = z + fz * s * (width / 2 + 0.8);
          const g = new THREE.BoxGeometry(1.4, 9, 1.4);
          g.translate(px, gy + 4.5, pz);
          world.batch.add('paintOrange', g);
          solids.add({ cx: px, cz: pz, hx: 0.7, hz: 0.7, h: 9, y0: gy, surface: SURF.metal, kind: 'pole' });
        }
        const m = ctx.addBanner(x, 8.2, z, yaw + Math.PI / 2, width + 3, 2.6, text, '#111', '#ff6a00', '', true, false);
        void m;
      },
      addFlag(x, y, z, color) {
        const gy = terrain.height(x, z);
        const pole = new THREE.CylinderGeometry(0.05, 0.05, 4, 6);
        pole.translate(x, gy + y + 2, z);
        world.batch.add('steel', pole);
        const geo = new THREE.PlaneGeometry(1.6, 1, 8, 1);
        geo.translate(0.8, 0, 0);
        const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
        flag.position.set(x, gy + y + 3.5, z);
        world.root.add(flag);
        const base = geo.attributes.position.array.slice();
        const ph = rng.float(0, 6);
        world.animated.push({
          update(dt, t) {
            const p = geo.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const bx = base[i * 3];
              p.setZ(i, Math.sin(t * 6 + bx * 2.5 + ph) * 0.18 * bx);
            }
            p.needsUpdate = true;
          },
        });
      },
      addTurbine(x, y, z) {
        const tower = new THREE.CylinderGeometry(1.1, 2, 52, 12);
        tower.translate(x, y + 26, z);
        world.batch.add('paintWhite', tower);
        solids.add({ cx: x, cz: z, hx: 1.8, hz: 1.8, h: 52, y0: y - 1, surface: SURF.metal, kind: 'pole' });
        const hub = new THREE.Group();
        hub.position.set(x, y + 52, z);
        hub.rotation.y = rng.float(0, 6);
        const nacelle = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 6), world.mats.paintWhite);
        nacelle.castShadow = true;
        hub.add(nacelle);
        const rotor = new THREE.Group();
        rotor.position.z = 3.2;
        for (let k = 0; k < 3; k++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 24, 0.25).translate(0, 12, 0), world.mats.paintWhite);
          blade.rotation.z = (k * Math.PI * 2) / 3;
          blade.castShadow = true;
          rotor.add(blade);
        }
        hub.add(rotor);
        world.root.add(hub);
        const sp = rng.float(0.6, 1.0);
        world.animated.push({ update: (dt) => (rotor.rotation.z += dt * sp) });
        world.landmarks.push({ x, z, label: '' });
      },
      addBeacon(x, y, z) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2020' }));
        m.position.set(x, y, z);
        world.root.add(m);
        const ph = rng.float(0, 2);
        world.animated.push({ update: (dt, t) => (m.visible = (t + ph) % 2 < 0.25) });
      },
      addSmokeStack(x, y, z) {
        world.smokeStacks = world.smokeStacks || [];
        world.smokeStacks.push({ x, y, z });
      },
    };
    return ctx;
  }

  terrainColor(x, z, h, ny, col) {
    const zone = zoneAt(x, z);
    const n = fbm(x * 0.02, z * 0.02, 2);
    const n2 = fbm(x * 0.0035 + 40, z * 0.0035, 2);
    const road = this.roads.roadAt(x, z, 3);
    if (zone.id === 'park') {
      col.set(inRect(PLAZA, x, z) ? '#a9a59b' : '#a57c4f');
      col.offsetHSL(0, 0, n * 0.05 + fbm(x * 0.012 + 7, z * 0.012, 2) * 0.07);
    } else if (zone.id === 'city' || zone.id === 'mall') {
      col.set('#5e5f62');
    } else if (zone.id === 'industrial') {
      if (inRect(QUARRY.rect, x, z, 4)) col.set('#d9c08a').offsetHSL(0, 0, n * 0.06);
      else col.set('#8f8c85').offsetHSL(0, 0, n * 0.04);
    } else if (zone.id === 'airfield') {
      col.set(Math.floor(x / 20) % 2 ? '#7da64a' : '#749c44');
    } else {
      // countryside grass with dry patches
      col.set('#5f8f3a').lerp(new THREE.Color('#9a9a52'), smoothstep(0.1, 0.5, n2) * 0.6);
      col.offsetHSL(0, 0, n * 0.06);
      for (const f of FIELDS) {
        if (inRect(f.rect, x, z, 2)) {
          col.set(f.kind === 'wheat' ? '#d1b25a' : f.kind === 'green' ? '#78a447' : '#7a5a3a');
          break;
        }
      }
    }
    // lake shore and bed
    const lx = (x - LAKE.cx) / LAKE.rx;
    const lz = (z - LAKE.cz) / LAKE.rz;
    const e = Math.sqrt(lx * lx + lz * lz);
    if (e < 1.25) col.lerp(new THREE.Color(h < WATER_LEVEL ? '#5c6345' : '#cdbb88'), clamp((1.25 - e) * 5, 0, 1));
    // steep slopes become rock, high mountains get snow
    if (ny < 0.82) col.lerp(new THREE.Color('#7e776b'), smoothstep(0.82, 0.62, ny));
    if (h > 150) col.lerp(new THREE.Color('#eef2f5'), smoothstep(150, 200, h) * smoothstep(0.55, 0.8, ny));
    if (road) {
      col.set(road.surface === SURF.dirt ? '#7d6244' : road.type === 'runway' ? '#6a6b69' : '#4b4c4f');
    }
    return col;
  }

  // ---------- queries ----------

  surfaceAt(x, z) {
    const r = this.roads.roadAt(x, z);
    if (r) return r.surface;
    const zone = zoneAt(x, z);
    if (zone.id === 'park') return inRect(PLAZA, x, z) ? SURF.concrete : SURF.dirt;
    if (zone.id === 'industrial' && inRect(QUARRY.rect, x, z)) return SURF.sand;
    for (const f of FIELDS) if (inRect(f.rect, x, z)) return SURF.dirt;
    const lx = (x - LAKE.cx) / LAKE.rx;
    const lz = (z - LAKE.cz) / LAKE.rz;
    if (lx * lx + lz * lz < 1.4) return SURF.sand;
    if (this.terrainSlopeY(x, z) < 0.8) return SURF.gravel;
    return zone.surface;
  }

  terrainSlopeY(x, z) {
    return this.terrain.normal(x, z, this._n).y;
  }

  // Ground under (x,z) for something whose feet are at yRef.
  // out: { h, nx, ny, nz, surface, solid }
  groundAt(x, z, yRef, out) {
    const t = this.terrain;
    let h = t.height(x, z);
    const road = this.roads.roadAt(x, z);
    if (road) h += road.lift;
    const tn = t.normal(x, z, this._n);
    out.nx = tn.x;
    out.ny = tn.y;
    out.nz = tn.z;
    out.h = h;
    out.solid = null;
    out.slope = 0;
    const lim = yRef + STEP_UP;
    const list = this.solids.at(x, z);
    const loc = this._loc;
    const smp = this._smp;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      s.local(x, z, loc);
      if (!s.contains(loc.lx, loc.lz)) continue;
      s.sample(loc.lz, smp);
      const top = s.y0 + smp.h;
      if (top <= lim && top > h) {
        h = top;
        out.h = top;
        out.solid = s;
        out.slope = smp.slope;
      }
    }
    if (out.solid) {
      const s = out.solid;
      // local normal (0, 1, -slope) rotated by yaw
      const sl = out.slope;
      const inv = 1 / Math.sqrt(1 + sl * sl);
      s.toWorldDir(0, -sl * inv, this._dir);
      out.nx = this._dir.x;
      out.ny = inv;
      out.nz = this._dir.z;
      out.surface = s.surface;
    } else {
      out.surface = this.surfaceAt(x, z);
    }
    return out;
  }

  // Highest surface (ignoring step limits): used for spawning and cameras.
  topAt(x, z) {
    let h = this.terrain.height(x, z);
    for (const s of this.solids.at(x, z)) {
      s.local(x, z, this._loc);
      if (!s.contains(this._loc.lx, this._loc.lz)) continue;
      s.sample(this._loc.lz, this._smp);
      h = Math.max(h, s.y0 + this._smp.h);
    }
    return h;
  }

  // A solid blocking a body with feet at yFeet and the given height, at (x,z).
  // Returns {solid, nx, nz, depth} with the outward push normal.
  wallAt(x, z, yFeet, height, pad = 0, out = {}, ignore = null) {
    const list = this.solids.at(x, z);
    const loc = this._loc;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s === ignore) continue;
      s.local(x, z, loc);
      if (!s.contains(loc.lx, loc.lz, pad)) continue;
      if (s.y0 >= yFeet + height) continue;
      s.sample(loc.lz, this._smp);
      const top = s.y0 + this._smp.h;
      if (top <= yFeet + STEP_UP) continue;
      // nearest face
      const dx = s.hx + pad - Math.abs(loc.lx);
      const dz = s.hz + pad - Math.abs(loc.lz);
      let lnx = 0;
      let lnz = 0;
      if (dx < dz) lnx = Math.sign(loc.lx) || 1;
      else lnz = Math.sign(loc.lz) || 1;
      s.toWorldDir(lnx, lnz, this._dir);
      out.solid = s;
      out.nx = this._dir.x;
      out.nz = this._dir.z;
      out.depth = Math.min(dx, dz);
      out.top = top;
      return out;
    }
    return null;
  }

  inWater(x, z, y) {
    const lx = (x - LAKE.cx) / LAKE.rx;
    const lz = (z - LAKE.cz) / LAKE.rz;
    return lx * lx + lz * lz < 1.05 && y < WATER_LEVEL - 0.5;
  }

  zoneAt(x, z) {
    return zoneAt(x, z);
  }

  clampToWorld(p) {
    const L = PLAY_LIMIT;
    let hit = false;
    if (p.x > L) (p.x = L), (hit = true);
    if (p.x < -L) (p.x = -L), (hit = true);
    if (p.z > L) (p.z = L), (hit = true);
    if (p.z < -L) (p.z = -L), (hit = true);
    return hit;
  }

  // hide whole chunks beyond the draw distance (fog hides the cut)
  cull(camPos, dist) {
    for (const c of this.cullables) {
      const dx = c.c.x - camPos.x;
      const dz = c.c.z - camPos.z;
      c.obj.visible = Math.sqrt(dx * dx + dz * dz) - c.r < dist;
    }
  }

  update(dt, t, focus) {
    for (const a of this.animated) a.update(dt, t);
    // blinking amber traffic lights
    this.lensMat.emissiveIntensity = Math.sin(t * 4) > 0 ? 2.2 : 0.15;
    if (this.traffic) this.traffic.update(dt, focus);
  }

  setQuality(q) {
    const dens = q === 'low' ? 0.45 : q === 'medium' ? 0.8 : 1;
    for (const k of ['pine', 'oak', 'birch', 'bush', 'rock']) this.pools[k].setDensity(dens);
  }

  // ---------- minimap ----------

  buildMinimap() {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    const scale = S / (WORLD_HALF * 2);
    const X = (x) => (x + WORLD_HALF) * scale;
    // base colours from zones
    const img = g.createImageData(256, 256);
    const col = new THREE.Color();
    for (let j = 0; j < 256; j++) {
      for (let i = 0; i < 256; i++) {
        const x = -WORLD_HALF + (i + 0.5) * ((WORLD_HALF * 2) / 256);
        const z = -WORLD_HALF + (j + 0.5) * ((WORLD_HALF * 2) / 256);
        const zone = zoneAt(x, z);
        const h = this.terrain.height(x, z);
        col.set(zone.mapColor || '#42632e');
        if (zone.id === 'hills' || zone.id === 'valley' || zone.id === 'lake') {
          const shade = clamp(h / 160, -0.2, 0.6);
          col.offsetHSL(0, 0, shade * 0.18);
          const fr = FIELDS.find((f) => inRect(f.rect, x, z));
          if (fr) col.set(fr.kind === 'wheat' ? '#9b8a45' : fr.kind === 'green' ? '#5e7d38' : '#5e4a33');
        }
        if (Math.max(Math.abs(x), Math.abs(z)) > PLAY_LIMIT) col.set('#2a3530');
        if (inRect(QUARRY.rect, x, z)) col.set('#a38f63');
        const lx = (x - LAKE.cx) / LAKE.rx;
        const lz = (z - LAKE.cz) / LAKE.rz;
        if (lx * lx + lz * lz < 0.85) col.set('#2c6d8c');
        const k = (j * 256 + i) * 4;
        img.data[k] = col.r * 255;
        img.data[k + 1] = col.g * 255;
        img.data[k + 2] = col.b * 255;
        img.data[k + 3] = 255;
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = 256;
    tmp.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(tmp, 0, 0, S, S);
    // roads
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const p of this.paths) {
      g.strokeStyle = p.type === 'dirt' ? '#a8865a' : p.type === 'highway' ? '#e8e2d0' : p.type === 'runway' ? '#9a9c9e' : '#c9c9c6';
      g.lineWidth = Math.max(1.5, p.width * scale);
      g.beginPath();
      p.points.forEach((q, i) => (i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))));
      g.stroke();
    }
    if (this.mxTrack) {
      g.strokeStyle = '#c99a62';
      g.lineWidth = 10 * scale;
      g.beginPath();
      this.mxTrack.forEach((q, i) => (i ? g.lineTo(X(q[0]), X(q[1])) : g.moveTo(X(q[0]), X(q[1]))));
      g.closePath();
      g.stroke();
    }
    for (const sh of this.minimapShapes) {
      g.fillStyle = sh.color;
      if (sh.rect) g.fillRect(X(sh.rect[0]), X(sh.rect[1]), (sh.rect[2] - sh.rect[0]) * scale, (sh.rect[3] - sh.rect[1]) * scale);
      else if (sh.circle) {
        g.beginPath();
        g.arc(X(sh.circle[0]), X(sh.circle[1]), sh.circle[2] * scale, 0, Math.PI * 2);
        g.fill();
      } else if (sh.obb) {
        const [cx, cz, hx, hz, yaw] = sh.obb;
        g.save();
        g.translate(X(cx), X(cz));
        g.rotate(-yaw);
        g.fillRect(-hx * scale, -hz * scale, hx * 2 * scale, hz * 2 * scale);
        g.restore();
      }
    }
    // loop
    for (const l of this.loops) {
      g.fillStyle = '#ff6a00';
      g.beginPath();
      g.arc(X(l.x), X(l.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    this.minimapCanvas = c;
    this.minimapScale = scale;
  }
}

export { WORLD_HALF, PLAY_LIMIT, WATER_LEVEL, SPAWNS };
