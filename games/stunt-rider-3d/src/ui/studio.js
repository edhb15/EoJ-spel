// Showroom scene for bike selection and the garage: turntable, spotlights, the bike and rider.
import * as THREE from 'three';
import { buildBike } from '../bike/bikemodel.js';
import { Rider } from '../bike/rider.js';

export class Studio {
  constructor(envMap) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0c10');
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.6;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.camera.position.set(4.9, 1.85, 5.1);
    this.camera.lookAt(0, 0.72, 0);
    // floor with radial fade
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grd.addColorStop(0, '#3a3d44');
    grd.addColorStop(0.55, '#1a1c21');
    grd.addColorStop(1, '#0b0c10');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const floorTex = new THREE.CanvasTexture(c);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.2 }));
    floor.receiveShadow = true;
    this.scene.add(floor);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.95, 0.08, 64), new THREE.MeshStandardMaterial({ color: '#202329', roughness: 0.4, metalness: 0.5 }));
    table.position.y = 0.04;
    table.receiveShadow = true;
    this.scene.add(table);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.92, 0.025, 8, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff6a00' }));
    ring.position.y = 0.08;
    this.scene.add(ring);
    this.turn = new THREE.Group();
    this.turn.position.y = 0.08;
    this.scene.add(this.turn);
    // lights
    this.scene.add(new THREE.HemisphereLight('#c8d4ff', '#202020', 0.5));
    const key = new THREE.SpotLight('#ffffff', 60, 30, 0.5, 0.6, 1.2);
    key.position.set(4, 7, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.SpotLight('#ff6a00', 45, 30, 0.6, 0.7, 1.2);
    rim.position.set(-5, 3.5, -4);
    this.scene.add(rim);
    const rim2 = new THREE.SpotLight('#ff2a2a', 25, 30, 0.6, 0.7, 1.2);
    rim2.position.set(5, 2.5, -5);
    this.scene.add(rim2);
    this.angle = 0.6;
    this.drag = false;
    this.key = '';
    this.offsetX = 0;
  }

  show(spec, paint, suit, locked) {
    const k = spec.id + paint + suit + locked;
    if (k === this.key) return;
    if (this.bike && this.bike.spec.id === spec.id && this.locked === locked) {
      this.bike.model.setPaint(paint);
      this.bike.rider.setColors(suit, paint);
      this.key = k;
      return;
    }
    this.key = k;
    this.locked = locked;
    if (this.bike) {
      this.turn.remove(this.bike.model.root);
      this.bike.model.dispose();
      this.bike.rider.dispose();
    }
    const model = buildBike(spec, paint);
    const rider = new Rider(model.anchors, suit, paint);
    rider.update({ seated: 1 }, 0, 0, 0, 0);
    model.body.add(rider.group);
    // lean on the side stand
    model.root.rotation.z = -0.04;
    model.root.position.y = 0.0;
    model.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    if (locked) {
      model.root.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.color && o.material.color.multiplyScalar(0.12);
          if (o.material.emissive) o.material.emissiveIntensity = 0;
        }
      });
    }
    model.glow.visible = !locked;
    model.tailGlow.visible = !locked;
    this.turn.add(model.root);
    this.bike = { spec, model, rider };
  }

  setViewport(w, h, offsetX = 0) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // shift the subject sideways so the UI panel does not cover it
    this.camera.setViewOffset(w, h, -offsetX * w, 0, w, h);
  }

  update(dt, dragDx = 0) {
    if (dragDx) this.angle += dragDx * 0.01;
    else this.angle += dt * 0.35;
    this.turn.rotation.y = this.angle;
    if (this.bike) {
      this.bike.model.wheelF.rotation.x = 0;
      this.bike.model.wheelR.rotation.x = 0;
    }
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}
