// Floating star collectibles and time-trial checkpoint gates.
import * as THREE from 'three';
import { glowTexture, checkerTexture } from './textures.js';

function starShape(r1, r2, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) s.lineTo(x, y);
    else s.moveTo(x, y);
  }
  s.closePath();
  return s;
}

export class Stars {
  constructor(scene, list) {
    this.list = list;
    this.count = list.length;
    const geo = new THREE.ExtrudeGeometry(starShape(1, 0.45), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
    geo.center();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffcc33', emissive: '#ff9900', emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 });
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture('rgba(255,210,80,1)'), color: '#ffd060', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = list.map((p, i) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, p.y, p.z);
      m.castShadow = true;
      const g = new THREE.Sprite(glowMat);
      g.scale.set(4.5, 4.5, 4.5);
      m.add(g);
      this.group.add(m);
      return { mesh: m, id: i, p, taken: false };
    });
  }
  setCollected(ids) {
    const set = new Set(ids);
    for (const it of this.items) {
      it.taken = set.has(it.id);
      it.mesh.visible = !it.taken && this.group.visible;
    }
  }
  setVisible(v) {
    this.group.visible = v;
  }
  // returns ids collected this frame
  update(dt, t, pos) {
    const got = [];
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.rotation.y = t * 2 + it.id;
      it.mesh.position.y = it.p.y + Math.sin(t * 2 + it.id) * 0.25;
      if (pos && this.group.visible) {
        const dx = pos.x - it.p.x;
        const dy = pos.y - it.p.y;
        const dz = pos.z - it.p.z;
        if (dx * dx + dy * dy + dz * dz < 3.2 * 3.2) {
          it.taken = true;
          it.mesh.visible = false;
          got.push(it.id);
        }
      }
    }
    return got;
  }
}

export class Gates {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.gates = [];
    this.matNext = new THREE.MeshStandardMaterial({ color: '#ff6a00', emissive: '#ff5000', emissiveIntensity: 0.8, roughness: 0.4 });
    this.matLater = new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.5 });
    this.matFinish = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.6 });
    this.curtain = new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.arrow = this.makeArrow();
    scene.add(this.arrow);
    this.arrow.visible = false;
  }
  makeArrow() {
    const s = new THREE.Shape();
    s.moveTo(0, 1.2);
    s.lineTo(0.8, 0);
    s.lineTo(0.3, 0);
    s.lineTo(0.3, -1);
    s.lineTo(-0.3, -1);
    s.lineTo(-0.3, 0);
    s.lineTo(-0.8, 0);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ff6a00', transparent: true, opacity: 0.85, depthTest: false }));
    m.renderOrder = 10;
    const grp = new THREE.Group();
    grp.add(m);
    return grp;
  }
  clear() {
    for (const g of this.gates) this.group.remove(g.obj);
    this.gates = [];
    this.arrow.visible = false;
  }
  setCourse(cps) {
    this.clear();
    cps.forEach((c, i) => {
      const obj = new THREE.Group();
      const y = this.world.topAt(c.x, c.z);
      obj.position.set(c.x, y, c.z);
      obj.rotation.y = c.yaw;
      const w = c.w;
      const finish = i === cps.length - 1;
      const pillars = [];
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6, 0.7), this.matLater);
        p.position.set((s * w) / 2, 3, 0);
        p.castShadow = true;
        obj.add(p);
        pillars.push(p);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 1.1, 0.5), finish ? this.matFinish : this.matLater);
      bar.position.y = 6.2;
      obj.add(bar);
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(w, 5.6), this.curtain);
      cur.position.y = 2.8;
      obj.add(cur);
      this.group.add(obj);
      this.gates.push({ obj, pillars, bar, cur, finish, c });
    });
  }
  setActive(i) {
    this.active = i;
    this.gates.forEach((g, k) => {
      g.obj.visible = k >= i && k <= i + 2;
      const next = k === i;
      for (const p of g.pillars) p.material = next ? this.matNext : this.matLater;
      if (!g.finish) g.bar.material = next ? this.matNext : this.matLater;
      g.cur.visible = next;
    });
  }
  // floating arrow above the bike pointing at the next gate
  update(t, bikePos, camera) {
    const g = this.gates[this.active];
    if (!g || !bikePos) {
      this.arrow.visible = false;
      return;
    }
    this.arrow.visible = true;
    this.arrow.position.set(bikePos.x, bikePos.y + 2.6, bikePos.z);
    const yaw = Math.atan2(g.c.x - bikePos.x, g.c.z - bikePos.z);
    this.arrow.rotation.set(0, yaw + Math.PI, 0);
    this.arrow.scale.setScalar(0.7 + Math.sin(t * 5) * 0.05);
    void camera;
  }
}
