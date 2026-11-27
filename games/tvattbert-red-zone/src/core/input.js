// Keyboard + mouse input with pointer lock (falls back to click-drag look when
// pointer lock is unavailable, e.g. inside sandboxed iframes).
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.enabled = false;
    this.dragLook = false;
    this.sensitivity = 1;
    this.onUnlock = null;
    addEventListener('keydown', e => {
      if (!this.enabled && e.code !== 'Escape') return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    el.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (!this.locked && !this.dragLook) this.lock();
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.enabled) return;
      if (this.locked || (this.dragLook && (this.mouse.left || this.mouse.right || e.buttons))) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    });
    addEventListener('wheel', e => { if (this.enabled) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.el;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
    document.addEventListener('pointerlockerror', () => { this.dragLook = true; });
  }
  lock() {
    try {
      const p = this.el.requestPointerLock && this.el.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.dragLook = true; });
    } catch { this.dragLook = true; }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.leftPressed = false;
    this.mouse.wheel = 0;
  }
}
