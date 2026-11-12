// Motorcycle definitions, upgrades and paint options.

export const BIKES = [
  {
    id: 'mx',
    name: 'MX 450',
    type: 'Motocross',
    price: 0,
    desc: 'Light, tough and born to fly. Long-travel suspension, knobby tyres and the best air control.',
    topSpeed: 150 / 3.6,
    accel: 9.4,
    brake: 10.5,
    turn: 1.0,
    maxLean: 0.85,
    air: 1.25,
    offroad: 1.0,
    hop: 1.2,
    grip: 1.0,
    gears: 5,
    idle: 1700,
    redline: 11500,
    sound: 'single',
    wheelbase: 1.48,
    wheelF: 0.37,
    wheelR: 0.35,
    travel: 0.3,
    comH: 0.82,
    impact: 30,
  },
  {
    id: 'sm',
    name: 'SM 500',
    type: 'Supermoto',
    price: 25000,
    desc: 'Dirt-bike chassis on road tyres. Razor-sharp turning, great for city tricks and drifts.',
    topSpeed: 172 / 3.6,
    accel: 9.8,
    brake: 11.5,
    turn: 1.18,
    maxLean: 0.95,
    air: 1.1,
    offroad: 0.78,
    hop: 1.1,
    grip: 1.05,
    gears: 6,
    idle: 1600,
    redline: 11000,
    sound: 'single',
    wheelbase: 1.45,
    wheelF: 0.31,
    wheelR: 0.31,
    travel: 0.24,
    comH: 0.78,
    impact: 27,
  },
  {
    id: 'street',
    name: 'Street 750',
    type: 'Street',
    price: 60000,
    desc: 'Naked twin with punchy torque. Upright, agile and quick on any tarmac.',
    topSpeed: 212 / 3.6,
    accel: 10.3,
    brake: 12,
    turn: 0.98,
    maxLean: 0.95,
    air: 0.92,
    offroad: 0.6,
    hop: 0.95,
    grip: 1.1,
    gears: 6,
    idle: 1300,
    redline: 10500,
    sound: 'twin',
    wheelbase: 1.42,
    wheelF: 0.31,
    wheelR: 0.31,
    travel: 0.15,
    comH: 0.72,
    impact: 24,
  },
  {
    id: 'sport',
    name: 'Sport 1000',
    type: 'Sport',
    price: 120000,
    desc: 'Full-fairing sport bike. Huge top speed and stability, a handful off-road.',
    topSpeed: 262 / 3.6,
    accel: 11.0,
    brake: 12.8,
    turn: 0.88,
    maxLean: 1.0,
    air: 0.82,
    offroad: 0.45,
    hop: 0.86,
    grip: 1.15,
    gears: 6,
    idle: 1200,
    redline: 13500,
    sound: 'four',
    wheelbase: 1.42,
    wheelF: 0.31,
    wheelR: 0.32,
    travel: 0.13,
    comH: 0.7,
    impact: 23,
  },
  {
    id: 'race',
    name: 'RR Superbike',
    type: 'Racing',
    price: 220000,
    desc: 'Race-bred superbike with slicks and winglets. The fastest thing in the world.',
    topSpeed: 305 / 3.6,
    accel: 12.0,
    brake: 13.5,
    turn: 0.84,
    maxLean: 1.05,
    air: 0.76,
    offroad: 0.35,
    hop: 0.8,
    grip: 1.2,
    gears: 6,
    idle: 1400,
    redline: 15500,
    sound: 'four',
    wheelbase: 1.43,
    wheelF: 0.31,
    wheelR: 0.33,
    travel: 0.12,
    comH: 0.7,
    impact: 22,
  },
];

export const bikeById = (id) => BIKES.find((b) => b.id === id) || BIKES[0];

export const PAINTS = ['#ff6a00', '#e8202a', '#1e6fe0', '#19b35c', '#f5c400', '#f2f2f2', '#1b1b1b', '#9b30ff'];
export const PAINT_NAMES = ['Blaze Orange', 'Race Red', 'Factory Blue', 'Venom Green', 'Hornet Yellow', 'Arctic White', 'Stealth Black', 'Ultra Violet'];
export const SUITS = ['#ff6a00', '#e8202a', '#1e6fe0', '#222222', '#f2f2f2', '#19b35c'];
export const SUIT_NAMES = ['Orange', 'Red', 'Blue', 'Black', 'White', 'Green'];

export const UPGRADES = [
  { id: 'engine', name: 'Engine', desc: '+6% acceleration, +4% top speed per level', costs: [6000, 15000, 32000] },
  { id: 'suspension', name: 'Suspension', desc: 'Higher hops, softer landings, more landing tolerance', costs: [5000, 12000, 26000] },
  { id: 'tires', name: 'Tyres', desc: '+5% grip on every surface, better off-road traction', costs: [4000, 10000, 22000] },
];

// Final handling numbers after upgrades.
export function effectiveSpec(spec, up = { engine: 0, suspension: 0, tires: 0 }) {
  const e = { ...spec };
  e.accel *= 1 + 0.06 * up.engine;
  e.topSpeed *= 1 + 0.04 * up.engine;
  e.hop *= 1 + 0.08 * up.suspension;
  e.impact += 3 * up.suspension;
  e.landTol = 1 + 0.08 * up.suspension;
  e.grip *= 1 + 0.05 * up.tires;
  e.offroad = Math.min(1.1, e.offroad + 0.05 * up.tires);
  return e;
}

// 0..10 bars for the UI
export function statBars(spec) {
  return {
    'Top speed': Math.min(10, (spec.topSpeed * 3.6) / 30.5),
    Acceleration: Math.min(10, ((spec.accel - 7) / 5.2) * 10),
    Handling: Math.min(10, spec.turn * 8.2),
    'Air control': Math.min(10, spec.air * 7.6),
    'Off-road': Math.min(10, spec.offroad * 9.5),
  };
}
