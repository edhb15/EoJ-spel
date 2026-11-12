// Static map layout: zones, roads and named spawn points.
// Coordinates: x east, z south, metres. North is -z (top of the minimap).

export const WORLD_HALF = 1200;
export const PLAY_LIMIT = 1150;
export const WATER_LEVEL = -1.5;

export const SURF = {
  asphalt: 0,
  concrete: 1,
  dirt: 2,
  grass: 3,
  sand: 4,
  gravel: 5,
  wood: 6,
  metal: 7,
};

export const SURFACES = [
  { name: 'asphalt', grip: 1.0, roll: 0.012, bump: 0.0, dust: 0, offroad: false },
  { name: 'concrete', grip: 0.97, roll: 0.014, bump: 0.0, dust: 0, offroad: false },
  { name: 'dirt', grip: 0.74, roll: 0.03, bump: 0.025, dust: 1, offroad: true },
  { name: 'grass', grip: 0.64, roll: 0.05, bump: 0.035, dust: 0.35, offroad: true },
  { name: 'sand', grip: 0.55, roll: 0.13, bump: 0.02, dust: 1.2, offroad: true },
  { name: 'gravel', grip: 0.66, roll: 0.04, bump: 0.035, dust: 0.8, offroad: true },
  { name: 'wood', grip: 0.92, roll: 0.015, bump: 0.0, dust: 0, offroad: false },
  { name: 'metal', grip: 0.88, roll: 0.013, bump: 0.0, dust: 0, offroad: false },
];

// City grid
export const CITY_X = [-1040, -920, -800, -680, -560, -440];
export const CITY_Z = [-600, -480, -360, -240, -120, 0, 120, 240];
export const CITY_STREET_W = 14;

// Industrial grid
export const IND_STREETS = [
  { a: [340, 440], b: [1100, 440] },
  { a: [340, 700], b: [1100, 700] },
  { a: [340, 960], b: [1100, 960] },
  { a: [420, 440], b: [420, 960] },
  { a: [700, 440], b: [700, 1080] },
  { a: [980, 440], b: [980, 1080] },
];

// Flat zones (rects: x0, z0, x1, z1). `flatPad` is the blend distance to the hills.
export const ZONES = [
  { id: 'park', name: 'Stunt Park', rect: [-262, -262, 262, 262], surface: SURF.dirt, color: '#a07a4e', mapColor: '#7a5a39' },
  { id: 'city', name: 'Downtown', rect: [-1060, -620, -420, 260], surface: SURF.asphalt, color: '#77787a', mapColor: '#3b3d44' },
  { id: 'mall', name: 'Mall Parking', rect: [-425, -330, -275, -10], surface: SURF.asphalt, color: '#6a6b6e', mapColor: '#45474e' },
  { id: 'industrial', name: 'Industrial Zone', rect: [330, 380, 1100, 1100], surface: SURF.concrete, color: '#9b9993', mapColor: '#4d4d50' },
  { id: 'airfield', name: 'Airfield', rect: [40, -840, 900, -580], surface: SURF.grass, color: '#7ea04f', mapColor: '#4f6e34' },
  { id: 'highway', name: 'Highway 1', rect: [-1070, -1045, 1070, -955], surface: SURF.grass, color: '#7a9a4c', mapColor: '#4a6532' },
  { id: 'lake', name: 'Lakeside', rect: [-640, 600, -220, 780], surface: SURF.grass, color: '#7aa04e', mapColor: '#4a6a33', soft: true },
];

export const QUARRY = { rect: [360, 975, 690, 1105] };
export const LAKE = { cx: -430, cz: 690, rx: 175, rz: 40 };
export const PLAZA = [-262, -70, -176, 70];

export const FIELDS = [
  { rect: [-1040, 360, -880, 520], kind: 'wheat' },
  { rect: [-860, 360, -790, 470], kind: 'green' },
  { rect: [-1040, 540, -900, 700], kind: 'plowed' },
  { rect: [-1020, 820, -840, 960], kind: 'wheat' },
  { rect: [-180, 1000, -20, 1100], kind: 'green' },
  { rect: [-360, 960, -220, 1080], kind: 'plowed' },
];

// Road definitions. type: highway | city | road | dirt | runway
// smooth: control points are smoothed with Catmull-Rom.
export const ROADS = [
  { id: 'hw', type: 'highway', pts: [[-960, -1000], [960, -1000]] },
  { id: 'hwW', type: 'highway', smooth: true, pts: [[-960, -1000], [-1010, -990], [-1040, -950], [-1050, -870], [-1044, -740], [-1040, -660], [-1040, -607]] },
  { id: 'hwE', type: 'highway', smooth: true, pts: [[960, -1000], [1010, -990], [1045, -950], [1058, -880], [1048, -800], [1015, -730]] },
  { id: 'ne', type: 'road', smooth: true, pts: [[1015, -730], [985, -650], [965, -560], [990, -440], [1040, -330], [1035, -200], [965, -90], [870, 0], [830, 110], [880, 230], [950, 320], [975, 380], [980, 433]] },
  { id: 'boulevard', type: 'road', smooth: true, pts: [[-433, -360], [-340, -400], [-200, -470], [-70, -540], [30, -610], [60, -660], [64, -700]] },
  { id: 'parkN', type: 'road', smooth: true, pts: [[0, -262], [8, -360], [30, -470], [60, -560], [64, -640], [64, -700]] },
  { id: 'parkW', type: 'city', pts: [[-433, 0], [-262, 0]] },
  { id: 'parkS', type: 'road', smooth: true, pts: [[0, 262], [20, 330], [110, 390], [240, 425], [333, 440]] },
  { id: 'sw', type: 'road', smooth: true, pts: [[-740, 247], [-742, 350], [-690, 470], [-760, 590], [-740, 740], [-640, 850], [-470, 900], [-300, 880], [-140, 930], [40, 990], [190, 975], [280, 960], [333, 960]] },
  { id: 'runway', type: 'runway', pts: [[70, -700], [890, -700]] },
  // off-road trails
  { id: 'trailHills', type: 'dirt', smooth: true, pts: [[270, -430], [370, -380], [470, -310], [560, -210], [520, -90], [600, 30], [720, 70], [845, 30]] },
  { id: 'trailRidge', type: 'dirt', smooth: true, pts: [[268, 180], [380, 130], [500, 210], [630, 170], [750, 250], [870, 235]] },
  { id: 'trailForest', type: 'dirt', smooth: true, pts: [[-120, 270], [-150, 400], [-90, 520], [-140, 640], [-40, 760], [90, 830], [200, 960]] },
  { id: 'trailLake', type: 'dirt', smooth: true, pts: [[-700, 480], [-600, 500], [-500, 530], [-440, 560], [-430, 590]] },
  { id: 'trailWest', type: 'dirt', smooth: true, pts: [[-1040, 247], [-1080, 360], [-1060, 520], [-1090, 700], [-1000, 800], [-760, 760]] },
];

export const ROAD_TYPES = {
  highway: { width: 20, surface: SURF.asphalt, lift: 0.07, flatten: true },
  city: { width: CITY_STREET_W, surface: SURF.asphalt, lift: 0.06, flatten: true },
  road: { width: 10, surface: SURF.asphalt, lift: 0.065, flatten: true },
  dirt: { width: 6, surface: SURF.dirt, lift: 0.05, flatten: true },
  runway: { width: 40, surface: SURF.concrete, lift: 0.06, flatten: true },
};

// Named locations used by modes, teleport menu and respawns.
export const SPAWNS = {
  park: { x: -232, z: 0, yaw: Math.PI / 2, name: 'Stunt Park' },
  kickers: { x: -205, z: -200, yaw: Math.PI / 2, name: 'Kicker Alley' },
  halfpipe: { x: 70, z: 30, yaw: Math.PI / 2, name: 'Halfpipe' },
  loop: { x: -175, z: 40, yaw: Math.PI / 2, name: 'Loop' },
  mxtrack: { x: -226, z: 107.8, yaw: Math.PI / 2, name: 'MX Track' },
  city: { x: -900, z: -240, yaw: Math.PI / 2, name: 'Downtown' },
  rooftop: { x: -801, z: -300, yaw: Math.PI / 2, name: 'Rooftops' },
  plaza: { x: -820, z: 0, yaw: Math.PI / 2, name: 'Skate Plaza' },
  mall: { x: -350, z: -160, yaw: 0, name: 'Mall Parking' },
  highway: { x: -860, z: -995, yaw: Math.PI / 2, name: 'Highway 1' },
  airfield: { x: 96, z: -700, yaw: Math.PI / 2, name: 'Airfield' },
  industrial: { x: 360, z: 440, yaw: Math.PI / 2, name: 'Industrial Zone' },
  containers: { x: 700, z: 560, yaw: Math.PI / 2, name: 'Container Yard' },
  quarry: { x: 520, z: 960, yaw: Math.PI, name: 'Sand Quarry' },
  hills: { x: 990, z: -440, yaw: Math.PI, name: 'Pine Hills' },
  lake: { x: -650, z: 485, yaw: Math.PI / 2, name: 'Lake Jump' },
};

export function zoneRectDist(rect, x, z) {
  const dx = Math.max(rect[0] - x, 0, x - rect[2]);
  const dz = Math.max(rect[1] - z, 0, z - rect[3]);
  return Math.hypot(dx, dz);
}

export function inRect(rect, x, z, pad = 0) {
  return x >= rect[0] - pad && x <= rect[2] + pad && z >= rect[1] - pad && z <= rect[3] + pad;
}

export function zoneAt(x, z) {
  for (const zn of ZONES) if (!zn.soft && inRect(zn.rect, x, z)) return zn;
  if (inRect(ZONES[6].rect, x, z)) return ZONES[6];
  if (x > 200 && z < 330) return COUNTRY_NE;
  return COUNTRY_SW;
}

export const COUNTRY_NE = { id: 'hills', name: 'Pine Hills', surface: SURF.grass, mapColor: '#3f5e2c' };
export const COUNTRY_SW = { id: 'valley', name: 'Lakeside Valley', surface: SURF.grass, mapColor: '#42632e' };
