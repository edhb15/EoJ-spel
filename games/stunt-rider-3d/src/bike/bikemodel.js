// Procedural 3D motorcycle models. Local frame: forward +Z, up +Y, left +X.
// Origin at ground level, midway between the two wheel contact patches.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { numberPlateTexture, glowTexture } from '../world/textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mats(paint) {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: paint, roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
    white: new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.4 }),
    black: new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.6, metalness: 0.2 }),
    alu: new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.32, metalness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.45, metalness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#eef0f3', roughness: 0.12, metalness: 1 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d8a93a', roughness: 0.25, metalness: 0.9 }),
    engine: new THREE.MeshStandardMaterial({ color: '#5c6168', roughness: 0.45, metalness: 0.65 }),
    seat: new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.9 }),
    tire: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.95 }),
    screen: new THREE.MeshStandardMaterial({ color: '#6f8fa6', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.5 }),
    head: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6dd', emissiveIntensity: 1.6 }),
    brake: new THREE.MeshStandardMaterial({ color: '#550000', emissive: '#ff1a10', emissiveIntensity: 0.5 }),
  };
}

function mesh(geo, mat, parent, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(a, b, r0, r1 = r0, seg = 10) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

function box(w, h, d, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

// Side profile (pairs of [z, y]) extruded symmetrically across X.
function ext(pts, width, bevel = 0.025, x = 0) {
  const shape = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const w = Math.max(0.005, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -w / 2);
  g.rotateY(-Math.PI / 2);
  g.translate(x, 0, 0);
  g.computeVertexNormals();
  return g;
}

function merge(list) {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  }));
}

function wheel(r, tw, style, m) {
  const g = new THREE.Group();
  const tireGeos = [new THREE.TorusGeometry(r - tw * 0.5, tw * 0.5, 10, 32).rotateY(Math.PI / 2)];
  if (style === 'knobby') {
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const k = new THREE.BoxGeometry(tw * 0.95, 0.035, 0.05);
      k.translate(0, r - 0.012, 0);
      k.rotateX(a);
      tireGeos.push(k);
    }
  }
  mesh(merge(tireGeos), m.tire, g);
  const rimR = r - tw - 0.005;
  const rim = [new THREE.TorusGeometry(rimR, 0.02, 6, 32).rotateY(Math.PI / 2)];
  if (style === 'knobby' || style === 'spoke') {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const side = i % 2 ? 0.03 : -0.03;
      rim.push(cyl(V(side, 0, 0), V(0, Math.cos(a) * rimR, Math.sin(a) * rimR), 0.004, 0.004, 4));
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const sp = new THREE.BoxGeometry(0.03, rimR - 0.05, 0.035);
      sp.translate(0, (rimR - 0.05) / 2 + 0.05, 0);
      sp.rotateX(a);
      rim.push(sp);
    }
  }
  rim.push(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 12).rotateZ(Math.PI / 2));
  mesh(merge(rim), style === 'knobby' || style === 'spoke' ? m.alu : m.dark, g);
  const disc = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.008, 24).rotateZ(Math.PI / 2).translate(0.07, 0, 0);
  mesh(disc, m.chrome, g);
  return g;
}

const LAYOUTS = {
  mx: { rake: 27, fork: 0.98, pivot: [0.5, -0.12], tire: 0.11, style: 'knobby', offroad: true, number: 7 },
  sm: { rake: 25, fork: 0.86, pivot: [0.47, -0.12], tire: 0.12, style: 'spoke', offroad: true, number: 22 },
  street: { rake: 25, fork: 0.74, pivot: [0.44, -0.1], tire: 0.15, style: 'cast' },
  sport: { rake: 24, fork: 0.72, pivot: [0.45, -0.1], tire: 0.16, style: 'cast' },
  race: { rake: 24, fork: 0.72, pivot: [0.46, -0.1], tire: 0.19, style: 'cast', number: 46 },
};

export function buildBike(spec, paintColor) {
  const L = LAYOUTS[spec.id];
  const m = mats(paintColor);
  const wb = spec.wheelbase;
  const rF = spec.wheelF;
  const rR = spec.wheelR;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rake = (L.rake * Math.PI) / 180;
  const axisDown = V(0, -Math.cos(rake), Math.sin(rake)); // from head toward front axle
  const frontAxle = V(0, rF, wb / 2);
  const head = frontAxle.clone().addScaledVector(axisDown, -L.fork);
  const pivot = V(0, L.pivot[0], L.pivot[1]);
  const rearAxle = V(0, rR, -wb / 2);

  // whip group pivots at the steering head; chassis parts are offset by -head
  const whip = new THREE.Group();
  whip.position.copy(head);
  body.add(whip);
  const chassis = new THREE.Group();
  chassis.position.copy(head).multiplyScalar(-1);
  whip.add(chassis);
  const front = new THREE.Group();
  front.position.copy(head);
  body.add(front);
  const frontParts = new THREE.Group();
  frontParts.position.copy(head).multiplyScalar(-1);
  front.add(frontParts);

  // ---- rear: swingarm + wheel ----
  const swing = new THREE.Group();
  swing.position.copy(pivot);
  chassis.add(swing);
  const armVec = rearAxle.clone().sub(pivot);
  for (const sx of [-0.1, 0.1]) mesh(cyl(V(sx, 0, 0), V(sx * 0.9, armVec.y, armVec.z), 0.032, 0.026, 8), L.offroad ? m.alu : m.dark, swing);
  const wheelR = wheel(rR, L.tire * (spec.id === 'race' ? 1.1 : 1), L.style, m);
  wheelR.position.copy(armVec);
  swing.add(wheelR);
  // rear shock
  mesh(cyl(V(0, 0.25, 0.02).add(pivot), V(0, 0.82, -0.12), 0.035, 0.035, 8), m.gold, chassis);

  // ---- front: forks, wheel, bars ----
  const forkLower = new THREE.Group();
  frontParts.add(forkLower);
  const forkW = 0.11;
  const upperLen = L.fork * 0.55;
  for (const sx of [-forkW, forkW]) {
    mesh(cyl(head.clone().add(V(sx, 0.06, 0)), head.clone().add(V(sx, 0, 0)).addScaledVector(axisDown, upperLen), 0.026, 0.026, 10), L.offroad ? m.gold : m.chrome, frontParts);
    mesh(cyl(head.clone().add(V(sx, 0, 0)).addScaledVector(axisDown, upperLen - 0.06), frontAxle.clone().add(V(sx, 0.02, 0)), 0.034, 0.03, 10), L.offroad ? m.dark : m.gold, forkLower);
  }
  // triple clamps
  mesh(box(forkW * 2 + 0.1, 0.04, 0.09, head.x, head.y + 0.02, head.z), m.alu, frontParts);
  const lowClamp = head.clone().addScaledVector(axisDown, 0.16);
  mesh(box(forkW * 2 + 0.1, 0.04, 0.09, lowClamp.x, lowClamp.y, lowClamp.z), m.alu, frontParts);
  const wheelF = wheel(rF, L.tire * (L.offroad ? 0.85 : 0.75), L.style, m);
  wheelF.position.copy(frontAxle);
  forkLower.add(wheelF);
  // handlebars
  let grip;
  if (spec.id === 'sport' || spec.id === 'race') {
    grip = V(0.3, head.y - 0.02, head.z - 0.04);
    for (const s of [-1, 1]) mesh(cyl(V(s * 0.1, grip.y + 0.02, head.z), V(s * 0.31, grip.y, grip.z), 0.016, 0.016, 8), m.dark, frontParts);
  } else {
    const barY = head.y + (L.offroad ? 0.14 : 0.11);
    grip = V(L.offroad ? 0.41 : 0.37, barY + 0.02, head.z - 0.07);
    const pts = [V(-grip.x, grip.y, grip.z), V(-0.18, barY, head.z - 0.04), V(0.18, barY, head.z - 0.04), V(grip.x, grip.y, grip.z)];
    const curve = new THREE.CatmullRomCurve3(pts);
    mesh(new THREE.TubeGeometry(curve, 16, 0.014, 6), L.offroad ? m.alu : m.dark, frontParts);
    mesh(cyl(V(0, head.y + 0.03, head.z), V(0, barY, head.z - 0.03), 0.03, 0.03, 6), m.dark, frontParts);
  }
  for (const s of [-1, 1]) mesh(cyl(V(s * (grip.x - 0.1), grip.y, grip.z), V(s * (grip.x + 0.02), grip.y, grip.z), 0.022, 0.022, 8), m.black, frontParts);

  // ---- type specific bodywork ----
  let seat;
  let pegs;
  let tailPos;
  let exhaustTip;
  let headlight = null;
  const fx = head.z;
  if (L.offroad) {
    const top = head.y - 0.2;
    // frame
    const fr = [];
    for (const s of [-1, 1]) {
      fr.push(cyl(V(s * 0.05, head.y - 0.05, head.z - 0.02), V(s * 0.12, top - 0.22, -0.05), 0.022));
      fr.push(cyl(V(s * 0.12, top - 0.22, -0.05), V(s * 0.1, pivot.y + 0.02, pivot.z), 0.022));
      fr.push(cyl(V(s * 0.12, top - 0.22, -0.05), V(s * 0.08, top - 0.08, -0.62), 0.016));
      fr.push(cyl(V(s * 0.1, pivot.y + 0.05, pivot.z), V(s * 0.08, top - 0.08, -0.55), 0.014));
    }
    fr.push(cyl(V(0, head.y - 0.1, head.z), V(0, 0.32, 0.18), 0.022));
    mesh(merge(fr), m.alu, chassis);
    // engine
    mesh(merge([box(0.26, 0.3, 0.34, 0, 0.47, 0.06), cyl(V(0, 0.58, 0.12), V(0, 0.78, 0.2), 0.08, 0.07, 10), box(0.3, 0.12, 0.2, 0, 0.36, 0.0)]), m.engine, chassis);
    // tank & shrouds
    mesh(ext([[head.z - 0.08, top - 0.02], [head.z - 0.3, top + 0.06], [-0.05, top + 0.02], [-0.1, top - 0.14], [head.z - 0.05, top - 0.2]], 0.26, 0.04), m.paint, chassis);
    for (const s of [-1, 1]) mesh(ext([[head.z + 0.02, top - 0.02], [head.z - 0.25, top + 0.02], [-0.02, top - 0.24], [head.z - 0.1, top - 0.32]], 0.04, 0.01, s * 0.15), m.paint, chassis);
    // seat
    mesh(ext([[0.0, top + 0.03], [-0.64, top + 0.02], [-0.66, top - 0.05], [-0.0, top - 0.06]], 0.24, 0.035), m.seat, chassis);
    // side panels with numbers & rear fender
    const plate = new THREE.MeshStandardMaterial({ map: numberPlateTexture(L.number, '#f1f1ee'), roughness: 0.4 });
    plate.map.colorSpace = THREE.SRGBColorSpace;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), plate);
      p.position.set(s * 0.145, top - 0.15, -0.38);
      p.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      chassis.add(p);
    }
    mesh(ext([[-0.3, top - 0.04], [-1.0, top + 0.06], [-1.02, top + 0.02], [-0.62, top - 0.08], [-0.3, top - 0.1]], 0.2, 0.02), m.white, chassis);
    // exhaust on the right (-X)
    mesh(cyl(V(-0.06, 0.62, 0.24), V(-0.16, 0.6, -0.05), 0.026, 0.026, 8), m.chrome, chassis);
    mesh(cyl(V(-0.16, 0.6, -0.05), V(-0.17, top - 0.22, -0.32), 0.03, 0.03, 8), m.chrome, chassis);
    mesh(cyl(V(-0.17, top - 0.22, -0.32), V(-0.17, top - 0.12, -0.78), 0.055, 0.05, 12), m.alu, chassis);
    exhaustTip = V(-0.17, top - 0.11, -0.8);
    // front fender & number plate with LED headlight
    const fenderY = rF * 2 + (spec.id === 'mx' ? 0.12 : 0.04);
    mesh(ext([[head.z + 0.62, fenderY + 0.04], [head.z + 0.35, fenderY + 0.07], [head.z + 0.05, fenderY + 0.05], [head.z - 0.1, fenderY - 0.02], [head.z + 0.05, fenderY], [head.z + 0.35, fenderY + 0.02], [head.z + 0.6, fenderY]], 0.16, 0.01), m.white, spec.id === 'mx' ? frontParts : forkLower);
    const np = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.24), new THREE.MeshStandardMaterial({ map: numberPlateTexture(L.number, paintColor), roughness: 0.4 }));
    np.position.copy(head).add(V(0, -0.04, 0.12));
    np.rotation.x = -0.35;
    frontParts.add(np);
    headlight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.02), m.head);
    headlight.position.copy(head).add(V(0, -0.15, 0.17));
    frontParts.add(headlight);
    seat = V(0, top + 0.03, -0.22);
    pegs = [V(0.17, 0.42, -0.1), V(-0.17, 0.42, -0.1)];
    tailPos = V(0, top + 0.04, -1.01);
    const tl = mesh(box(0.08, 0.03, 0.02, tailPos.x, tailPos.y - 0.02, tailPos.z), m.brake, chassis, false);
    void tl;
  } else {
    const isSport = spec.id === 'sport' || spec.id === 'race';
    const ty = head.y; // tank top level
    // frame (twin spar)
    for (const s of [-1, 1]) mesh(merge([cyl(V(s * 0.08, head.y - 0.04, fx - 0.02), V(s * 0.15, 0.62, -0.08), 0.03, 0.04, 8), cyl(V(s * 0.15, 0.62, -0.08), V(s * 0.12, pivot.y, pivot.z), 0.04, 0.035, 8)]), isSport ? m.alu : m.dark, chassis);
    // engine
    mesh(merge([box(0.42, 0.34, 0.42, 0, 0.42, 0.1), box(0.36, 0.26, 0.24, 0, 0.66, 0.22, -0.4), cyl(V(-0.22, 0.42, 0.12), V(0.22, 0.42, 0.12), 0.11, 0.11, 14)]), m.engine, chassis);
    // tank
    mesh(ext([[fx - 0.04, ty - 0.03], [fx - 0.2, ty + 0.06], [-0.02, ty + 0.03], [-0.08, ty - 0.12], [fx - 0.06, ty - 0.2]], 0.36, 0.06), m.paint, chassis);
    // seat & tail
    const sy = ty - 0.13;
    mesh(ext([[-0.04, sy], [-0.46, sy - 0.02], [-0.5, sy - 0.08], [-0.04, sy - 0.09]], 0.3, 0.04), m.seat, chassis);
    mesh(ext([[-0.42, sy - 0.02], [-0.82, sy + 0.12], [-0.86, sy + 0.08], [-0.6, sy - 0.12], [-0.4, sy - 0.12]], 0.22, 0.04), m.paint, chassis);
    tailPos = V(0, sy + 0.08, -0.86);
    mesh(box(0.14, 0.04, 0.03, tailPos.x, tailPos.y - 0.01, tailPos.z), m.brake, chassis, false);
    // rear hugger & plate holder
    mesh(box(0.18, 0.02, 0.3, 0, rR * 2 + 0.03, -wb / 2 - 0.02), m.black, chassis);
    seat = V(0, sy, -0.22);
    pegs = [V(0.17, isSport ? 0.46 : 0.4, isSport ? -0.22 : -0.14), V(-0.17, isSport ? 0.46 : 0.4, isSport ? -0.22 : -0.14)];
    // exhaust
    if (isSport) {
      mesh(cyl(V(-0.1, 0.3, 0.2), V(-0.18, 0.34, -0.3), 0.035, 0.035, 8), m.dark, chassis);
      mesh(cyl(V(-0.18, 0.34, -0.3), V(-0.2, 0.52, -0.62), 0.06, 0.05, 12), spec.id === 'race' ? m.dark : m.chrome, chassis);
      exhaustTip = V(-0.2, 0.53, -0.66);
    } else {
      mesh(cyl(V(-0.06, 0.25, 0.22), V(-0.17, 0.3, -0.25), 0.035, 0.035, 8), m.chrome, chassis);
      mesh(cyl(V(-0.17, 0.3, -0.25), V(-0.19, 0.38, -0.55), 0.065, 0.055, 12), m.chrome, chassis);
      exhaustTip = V(-0.19, 0.38, -0.58);
    }
    if (isSport) {
      // fairings: nose cowl, side panels, belly pan, windscreen
      const nz = fx + 0.32;
      mesh(ext([[nz, ty - 0.12], [fx + 0.1, ty + 0.06], [fx - 0.08, ty + 0.06], [fx - 0.1, ty - 0.22], [fx + 0.22, ty - 0.32]], 0.42, 0.06), m.paint, chassis);
      for (const s of [-1, 1]) mesh(ext([[fx + 0.12, ty - 0.24], [fx - 0.12, ty - 0.08], [-0.15, ty - 0.2], [-0.1, 0.38], [0.15, 0.28], [fx - 0.02, 0.4]], 0.03, 0.012, s * 0.23), spec.id === 'race' ? m.white : m.paint, chassis);
      mesh(ext([[fx - 0.05, 0.32], [-0.15, 0.32], [-0.08, 0.22], [0.25, 0.2]], 0.36, 0.03), spec.id === 'race' ? m.paint : m.dark, chassis);
      const scr = new THREE.Mesh(ext([[fx + 0.06, ty + 0.05], [fx - 0.12, ty + (spec.id === 'race' ? 0.16 : 0.22)], [fx - 0.16, ty + 0.06]], 0.3, 0.01), m.screen);
      chassis.add(scr);
      // twin headlights in the nose
      const hl = new THREE.Mesh(merge([box(0.1, 0.045, 0.03, 0.08, ty - 0.13, nz - 0.03), box(0.1, 0.045, 0.03, -0.08, ty - 0.13, nz - 0.03)]), m.head);
      chassis.add(hl);
      headlight = hl;
      if (spec.id === 'race') {
        // winglets & number
        for (const s of [-1, 1]) mesh(box(0.12, 0.012, 0.16, s * 0.27, ty - 0.12, fx + 0.1), m.dark, chassis);
        const num = new THREE.MeshStandardMaterial({ map: numberPlateTexture(L.number, paintColor), roughness: 0.4 });
        for (const s of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), num);
          p.position.set(s * 0.25, ty - 0.2, fx - 0.08);
          p.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
          chassis.add(p);
        }
      }
    } else {
      // round headlight, radiator, mirrors
      headlight = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 18).rotateX(Math.PI / 2).translate(0, head.y - 0.12, fx + 0.14), m.head);
      frontParts.add(headlight);
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 18).rotateX(Math.PI / 2).translate(0, head.y - 0.12, fx + 0.07), m.dark, frontParts);
      mesh(box(0.34, 0.24, 0.04, 0, 0.68, fx - 0.08, 0.3), m.dark, chassis);
      for (const s of [-1, 1]) {
        mesh(cyl(V(s * 0.28, grip.y + 0.02, grip.z + 0.03), V(s * 0.32, grip.y + 0.22, grip.z + 0.06), 0.008, 0.008, 4), m.dark, frontParts);
        mesh(box(0.1, 0.06, 0.02, s * 0.33, grip.y + 0.24, grip.z + 0.06), m.dark, frontParts);
      }
      // front fender
      mesh(ext([[fx + 0.66, rF * 2 + 0.02], [fx + 0.45, rF * 2 + 0.06], [fx + 0.18, rF * 2 + 0.02], [fx + 0.2, rF * 2 - 0.02], [fx + 0.45, rF * 2 + 0.02]], 0.14, 0.01), m.paint, forkLower);
    }
  }

  // headlight glow sprite
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,245,220,1)'), color: '#fff3d6', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(0.7, 0.7, 0.7);
  if (headlight) {
    headlight.geometry.computeBoundingBox();
    const c = new THREE.Vector3();
    headlight.geometry.boundingBox.getCenter(c);
    glow.position.copy(c).add(headlight.position).add(V(0, 0, 0.06));
    headlight.parent.add(glow);
  }
  const tailGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,40,20,1)'), color: '#ff3020', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  tailGlow.position.copy(tailPos).add(V(0, 0, -0.05));
  tailGlow.scale.set(0.35, 0.35, 0.35);
  chassis.add(tailGlow);
  // boost flame
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.3), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.copy(exhaustTip);
  flame.visible = false;
  chassis.add(flame);
  const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.35, 8, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.17), new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.add(flameCore);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.material !== m.screen && !o.material.transparent;
    }
  });

  return {
    root,
    body,
    whip,
    front,
    forkLower,
    swing,
    wheelF,
    wheelR,
    head,
    axisDown,
    swingLen: armVec.length(),
    mats: m,
    flame,
    tailGlow,
    glow,
    anchors: { seat, grips: [V(grip.x, grip.y, grip.z), V(-grip.x, grip.y, grip.z)], pegs, head: head.clone() },
    exhaustTip,
    setPaint(color) {
      m.paint.color.set(color);
    },
    dispose() {
      root.traverse((o) => {
        if (o.isMesh || o.isSprite) {
          o.geometry?.dispose();
        }
      });
      for (const k of Object.keys(m)) m[k].dispose();
    },
  };
}
