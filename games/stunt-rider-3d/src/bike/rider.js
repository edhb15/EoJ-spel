// Articulated rider made of capsule segments. Joint positions come from blended
// pose targets (pelvis, chest, hands, feet) and two-bone IK for arms and legs.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _up = V(0, 1, 0);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

const UPPER_ARM = 0.3;
const FOREARM = 0.32;
const THIGH = 0.45;
const SHIN = 0.46;

export const POSE_NAMES = ['seated', 'standing', 'tuck', 'superman', 'nohander', 'nofooter', 'heartattack', 'tailwhip', 'wheelie', 'stoppie', 'crash'];

// Solve a two-bone chain from root toward target; writes the middle joint into mid.
function ik(root, target, l1, l2, pole, mid, end) {
  _a.subVectors(target, root);
  let d = _a.length();
  const maxD = (l1 + l2) * 0.999;
  if (d > maxD) {
    _a.multiplyScalar(maxD / d);
    d = maxD;
  }
  if (d < 0.05) d = 0.05;
  end.copy(root).add(_a);
  const dir = _a.clone().normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.set(0, 0, 1);
  p.normalize();
  mid.copy(root).addScaledVector(dir, l1 * cosA).addScaledVector(p, l1 * sinA);
}

function seg(geo, mat, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class Rider {
  constructor(anchors, suitColor, helmetColor) {
    this.group = new THREE.Group();
    this.anchors = anchors;
    this.suit = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.65 });
    this.pants = new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.75 });
    this.glove = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.7 });
    this.boot = new THREE.MeshStandardMaterial({ color: '#e9e9e6', roughness: 0.5 });
    this.helmetMat = new THREE.MeshPhysicalMaterial({ color: helmetColor, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.visor = new THREE.MeshStandardMaterial({ color: '#141a22', roughness: 0.05, metalness: 0.9 });
    const g = this.group;
    this.torso = seg(new THREE.CapsuleGeometry(0.16, 0.3, 4, 10).scale(1.2, 1, 0.8), this.suit, g);
    this.pelvisM = seg(new THREE.SphereGeometry(0.17, 10, 8).scale(1.1, 0.8, 0.9), this.pants, g);
    this.helmet = new THREE.Group();
    g.add(this.helmet);
    seg(new THREE.SphereGeometry(0.155, 16, 12).scale(1, 1.05, 1.12), this.helmetMat, this.helmet);
    const v = seg(new THREE.SphereGeometry(0.158, 16, 8, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.32, Math.PI * 0.26), this.visor, this.helmet);
    v.rotation.y = 0;
    seg(new THREE.BoxGeometry(0.12, 0.05, 0.14).translate(0, -0.1, 0.13), this.helmetMat, this.helmet);
    this.limbs = {};
    const mk = (name, len, r, mat) => {
      this.limbs[name] = { mesh: seg(new THREE.CapsuleGeometry(r, len - r * 2, 3, 8), mat, g), len };
    };
    for (const s of ['L', 'R']) {
      mk('upper' + s, UPPER_ARM, 0.055, this.suit);
      mk('fore' + s, FOREARM, 0.05, this.suit);
      mk('thigh' + s, THIGH, 0.075, this.pants);
      mk('shin' + s, SHIN, 0.062, this.pants);
      this.limbs['hand' + s] = { mesh: seg(new THREE.SphereGeometry(0.055, 8, 6), this.glove, g) };
      this.limbs['boot' + s] = { mesh: seg(new THREE.BoxGeometry(0.11, 0.12, 0.27).translate(0, -0.02, 0.05), this.boot, g) };
    }
    this.joints = {
      pelvis: V(0, 1, 0),
      chest: V(0, 1.5, 0),
      head: V(0, 1.75, 0),
      handL: V(),
      handR: V(),
      footL: V(),
      footR: V(),
      shoulderL: V(),
      shoulderR: V(),
      hipL: V(),
      hipR: V(),
      elbowL: V(),
      elbowR: V(),
      kneeL: V(),
      kneeR: V(),
    };
    this.weights = { seated: 1 };
    this.firstPerson = false;
    this.poses = {};
    this.buildPoses();
  }

  setColors(suit, helmet) {
    this.suit.color.set(suit);
    this.helmetMat.color.set(helmet);
  }

  setFirstPerson(on) {
    this.firstPerson = on;
    this.helmet.visible = !on;
    this.torso.visible = !on;
  }

  // Key points per pose in bike space: [pelvis, chest, handL, handR, footL, footR]
  buildPoses() {
    const A = this.anchors;
    const seat = A.seat;
    const gL = A.grips[0];
    const gR = A.grips[1];
    const pL = A.pegs[0];
    const pR = A.pegs[1];
    const P = (pelvis, chest, hL, hR, fL, fR) => ({ pelvis, chest, hL, hR, fL, fR });
    const sitP = seat.clone().add(V(0, 0.12, 0));
    const reach = gL.z - sitP.z;
    this.poses.seated = P(sitP, sitP.clone().add(V(0, 0.46, Math.min(0.3, reach * 0.45))), gL, gR, pL, pR);
    const stP = seat.clone().add(V(0, 0.36, 0.1));
    this.poses.standing = P(stP, stP.clone().add(V(0, 0.42, 0.26)), gL, gR, pL, pR);
    this.poses.tuck = P(sitP.clone().add(V(0, -0.02, -0.04)), sitP.clone().add(V(0, 0.33, Math.min(0.45, reach * 0.75))), gL, gR, pL, pR);
    const chS = V(0, gL.y + 0.2, gL.z - 0.28);
    const peS = V(0, chS.y + 0.1, chS.z - 0.52);
    this.poses.superman = P(peS, chS, gL, gR, V(0.18, peS.y + 0.18, peS.z - 0.86), V(-0.18, peS.y + 0.12, peS.z - 0.86));
    const peN = seat.clone().add(V(0, 0.18, -0.02));
    const chN = peN.clone().add(V(0, 0.5, 0.02));
    this.poses.nohander = P(peN, chN, V(0.62, chN.y + 0.42, chN.z - 0.05), V(-0.62, chN.y + 0.42, chN.z - 0.05), pL, pR);
    const peF = seat.clone().add(V(0, 0.2, 0.04));
    this.poses.nofooter = P(peF, peF.clone().add(V(0, 0.44, 0.24)), gL, gR, V(0.72, pL.y + 0.42, pL.z + 0.18), V(-0.72, pR.y + 0.42, pR.z + 0.18));
    const chH = V(0, gL.y + 0.42, gL.z - 0.08);
    const peH = V(0, chH.y + 0.42, chH.z - 0.16);
    this.poses.heartattack = P(peH, chH, gL, gR, V(0.14, peH.y + 0.82, peH.z - 0.2), V(-0.14, peH.y + 0.82, peH.z - 0.24));
    const peT = seat.clone().add(V(0, 0.45, 0.12));
    this.poses.tailwhip = P(peT, peT.clone().add(V(0, 0.4, 0.22)), gL, gR, V(0.42, peT.y - 0.62, peT.z + 0.1), V(-0.42, peT.y - 0.62, peT.z + 0.1));
    const peW = seat.clone().add(V(0, 0.1, -0.08));
    this.poses.wheelie = P(peW, peW.clone().add(V(0, 0.5, 0.06)), gL, gR, pL, pR);
    const peSt = seat.clone().add(V(0, 0.42, 0.28));
    this.poses.stoppie = P(peSt, peSt.clone().add(V(0, 0.28, 0.42)), gL, gR, pL, pR);
    const peC = seat.clone().add(V(0, 0.2, 0));
    this.poses.crash = P(peC, peC.clone().add(V(0, 0.5, 0.05)), V(0.55, peC.y + 0.55, peC.z + 0.25), V(-0.55, peC.y + 0.3, peC.z - 0.25), V(0.35, peC.y - 0.75, peC.z + 0.35), V(-0.3, peC.y - 0.7, peC.z - 0.4));
  }

  // weights: object of pose name -> weight. lean: -1..1 (body shift), legOut: -1..1 (foot dab), t: time
  update(weights, lean = 0, legOut = 0, t = 0, crashWave = 0) {
    const J = this.joints;
    let sum = 0;
    for (const k in weights) sum += weights[k];
    if (sum <= 0) {
      weights = { seated: 1 };
      sum = 1;
    }
    const acc = { pelvis: V(), chest: V(), hL: V(), hR: V(), fL: V(), fR: V() };
    for (const k in weights) {
      const w = weights[k] / sum;
      if (!w) continue;
      const p = this.poses[k];
      for (const key in acc) acc[key].addScaledVector(p[key], w);
    }
    // body shift into corners
    acc.pelvis.x += lean * 0.1;
    acc.chest.x += lean * 0.2;
    acc.chest.y -= Math.abs(lean) * 0.04;
    if (legOut) {
      const f = legOut > 0 ? acc.fL : acc.fR;
      const s = Math.sign(legOut);
      f.lerp(V(s * 0.48, 0.22, this.anchors.pegs[0].z + 0.62), Math.abs(legOut));
    }
    if (crashWave) {
      acc.hL.add(V(Math.sin(t * 11) * 0.3, Math.cos(t * 9) * 0.3, Math.sin(t * 7) * 0.2).multiplyScalar(crashWave));
      acc.hR.add(V(Math.cos(t * 10) * 0.3, Math.sin(t * 12) * 0.3, Math.cos(t * 8) * 0.2).multiplyScalar(crashWave));
      acc.fL.add(V(Math.sin(t * 8) * 0.25, Math.cos(t * 13) * 0.2, 0).multiplyScalar(crashWave));
      acc.fR.add(V(Math.cos(t * 9) * 0.25, Math.sin(t * 11) * 0.2, 0).multiplyScalar(crashWave));
    }
    J.pelvis.copy(acc.pelvis);
    J.chest.copy(acc.chest);
    const spine = _c.subVectors(J.chest, J.pelvis);
    const spineLen = spine.length() || 1;
    spine.divideScalar(spineLen);
    // head sits above the chest along the spine, tilted forward a touch
    J.head.copy(J.chest).addScaledVector(spine, 0.24).add(V(0, 0.02, 0.06));
    // shoulders & hips
    J.shoulderL.copy(J.chest).add(V(0.2, -0.06, 0));
    J.shoulderR.copy(J.chest).add(V(-0.2, -0.06, 0));
    J.hipL.copy(J.pelvis).add(V(0.11, -0.04, 0));
    J.hipR.copy(J.pelvis).add(V(-0.11, -0.04, 0));
    ik(J.shoulderL, acc.hL, UPPER_ARM, FOREARM, V(0.7, -0.4, -0.6), J.elbowL, J.handL);
    ik(J.shoulderR, acc.hR, UPPER_ARM, FOREARM, V(-0.7, -0.4, -0.6), J.elbowR, J.handR);
    ik(J.hipL, acc.fL, THIGH, SHIN, V(0.35, 0.2, 1), J.kneeL, J.footL);
    ik(J.hipR, acc.fR, THIGH, SHIN, V(-0.35, 0.2, 1), J.kneeR, J.footR);
    this.place();
  }

  place() {
    const J = this.joints;
    const L = this.limbs;
    const put = (m, a, b) => {
      _b.subVectors(b, a);
      const len = _b.length() || 1e-3;
      m.position.addVectors(a, b).multiplyScalar(0.5);
      _q.setFromUnitVectors(_up, _b.divideScalar(len));
      m.quaternion.copy(_q);
    };
    put(this.torso, J.pelvis, J.chest);
    this.torso.position.copy(J.pelvis).lerp(J.chest, 0.55);
    this.pelvisM.position.copy(J.pelvis);
    this.pelvisM.quaternion.copy(this.torso.quaternion);
    this.helmet.position.copy(J.head);
    // helmet looks forward along the bike, its up halfway between spine and bike-up
    _a.subVectors(J.chest, J.pelvis).normalize().add(_up).normalize();
    _b.set(0, 0, 1).addScaledVector(_a, -_a.z).normalize();
    _c.crossVectors(_a, _b);
    _m.makeBasis(_c, _a, _b);
    this.helmet.quaternion.setFromRotationMatrix(_m);
    for (const s of ['L', 'R']) {
      put(L['upper' + s].mesh, J['shoulder' + s], J['elbow' + s]);
      put(L['fore' + s].mesh, J['elbow' + s], J['hand' + s]);
      put(L['thigh' + s].mesh, J['hip' + s], J['knee' + s]);
      put(L['shin' + s].mesh, J['knee' + s], J['foot' + s]);
      L['hand' + s].mesh.position.copy(J['hand' + s]);
      L['boot' + s].mesh.position.copy(J['foot' + s]);
      L['boot' + s].mesh.quaternion.identity();
    }
  }

  // world-space position of the rider's eyes (for first person)
  eyeLocal(out) {
    return out.copy(this.joints.head).add(V(0, 0.03, 0.08));
  }

  dispose() {
    this.group.traverse((o) => o.isMesh && o.geometry.dispose());
  }
}
