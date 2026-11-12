// Keyboard, mouse, gamepad and touch input mapped to game actions.

const KEYMAP = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight'],
  trick: ['KeyE'],
  reset: ['KeyR'],
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  map: ['KeyM'],
  trick1: ['Digit1'],
  trick2: ['Digit2'],
  trick3: ['Digit3'],
  trick4: ['Digit4'],
  trick5: ['Digit5'],
};

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.edges = new Set();
    this.virtual = new Set(); // touch buttons
    this.virtualEdges = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, dragging: false, lastMove: -1e9 };
    this.gp = { throttle: 0, brake: 0, steer: 0, buttons: new Set(), prev: new Set(), lookX: 0, lookY: 0 };
    this.enabled = true;
    this.anyKeyListeners = [];

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.edges.add(e.code);
      this.down.add(e.code);
      for (const fn of this.anyKeyListeners) fn(e);
    });
    addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    addEventListener('blur', () => {
      this.down.clear();
      this.virtual.clear();
    });

    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') return;
        this.mouse.dragging = true;
        canvas.setPointerCapture?.(e.pointerId);
      });
      addEventListener('pointerup', () => {
        this.mouse.dragging = false;
      });
      addEventListener('pointermove', (e) => {
        if (!this.mouse.dragging || e.pointerType === 'touch') return;
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
        this.mouse.lastMove = performance.now();
      });
      canvas.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          this.mouse.wheel += Math.sign(e.deltaY);
        },
        { passive: false },
      );
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  onAnyKey(fn) {
    this.anyKeyListeners.push(fn);
  }

  isDown(action) {
    if (this.virtual.has(action)) return true;
    if (this.gp.buttons.has(action)) return true;
    const keys = KEYMAP[action];
    if (!keys) return false;
    for (const k of keys) if (this.down.has(k)) return true;
    return false;
  }

  pressed(action) {
    if (this.virtualEdges.has(action)) return true;
    if (this.gp.buttons.has(action) && !this.gp.prev.has(action)) return true;
    const keys = KEYMAP[action];
    if (!keys) return false;
    for (const k of keys) if (this.edges.has(k)) return true;
    return false;
  }

  // Analog values combining keyboard, gamepad and touch.
  get throttle() {
    return Math.max(this.isDown('throttle') ? 1 : 0, this.gp.throttle);
  }
  get brake() {
    return Math.max(this.isDown('brake') ? 1 : 0, this.gp.brake);
  }
  get steer() {
    let s = 0;
    if (this.isDown('left')) s -= 1;
    if (this.isDown('right')) s += 1;
    if (Math.abs(this.gp.steer) > Math.abs(s)) s = this.gp.steer;
    return s;
  }

  consumeMouse() {
    const m = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel, active: performance.now() - this.mouse.lastMove < 1600 || this.mouse.dragging };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    if (Math.abs(this.gp.lookX) > 0.15 || Math.abs(this.gp.lookY) > 0.15) {
      m.dx += this.gp.lookX * 9;
      m.dy += this.gp.lookY * 6;
      m.active = true;
      this.mouse.lastMove = performance.now();
    }
    return m;
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && [...pads].find((p) => p && p.connected);
    this.gp.prev = this.gp.buttons;
    this.gp.buttons = new Set();
    if (!pad) {
      this.gp.throttle = this.gp.brake = this.gp.steer = 0;
      this.gp.lookX = this.gp.lookY = 0;
      return;
    }
    const b = (i) => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
    const v = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
    const dz = (x) => (Math.abs(x) < 0.15 ? 0 : x);
    this.gp.throttle = v(7);
    this.gp.brake = v(6);
    this.gp.steer = dz(pad.axes[0] || 0);
    this.gp.lookX = dz(pad.axes[2] || 0);
    this.gp.lookY = dz(pad.axes[3] || 0);
    const ly = dz(pad.axes[1] || 0);
    if (ly < -0.5) this.gp.buttons.add('throttle');
    if (ly > 0.5) this.gp.buttons.add('brake');
    if (b(0)) this.gp.buttons.add('jump');
    if (b(1) || b(5)) this.gp.buttons.add('boost');
    if (b(2)) this.gp.buttons.add('trick');
    if (b(3)) this.gp.buttons.add('camera');
    if (b(8)) this.gp.buttons.add('reset');
    if (b(9)) this.gp.buttons.add('pause');
    if (b(12)) this.gp.buttons.add('throttle');
    if (b(13)) this.gp.buttons.add('brake');
    if (b(14)) this.gp.buttons.add('left');
    if (b(15)) this.gp.buttons.add('right');
  }

  endFrame() {
    this.edges.clear();
    this.virtualEdges.clear();
  }

  // Touch overlay: buttons with data-action attributes.
  bindTouch(root) {
    const buttons = root.querySelectorAll('[data-action]');
    for (const el of buttons) {
      const action = el.dataset.action;
      const press = (e) => {
        e.preventDefault();
        if (!this.virtual.has(action)) this.virtualEdges.add(action);
        this.virtual.add(action);
        el.classList.add('on');
      };
      const release = (e) => {
        e.preventDefault();
        this.virtual.delete(action);
        el.classList.remove('on');
      };
      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('touchend', release, { passive: false });
      el.addEventListener('touchcancel', release, { passive: false });
    }
  }
}
