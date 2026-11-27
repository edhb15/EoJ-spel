// Named places in the STL tile. Positions were located on the heightmap rendered from the
// STL (river, Masthuggskyrkan, Slottsskogen, Vallgraven, hospital complex with skywalks...).
// Without OpenStreetMap access the district centres are approximate (±100 m).
// Coordinates: X east, Z south, metres from the tile centre.

export const HOSPITAL = {
  name: 'Sahlgrenska Universitetssjukhuset', x: 1395, z: 330, w: 96, d: 64,
};

export const SPAWN = { x: 96, z: -1236, yaw: Math.PI }; // churchyard at Masthuggskyrkan

export const ZONES = [
  { id: 'masthugg', name: 'Masthuggskyrkan', sub: 'Säker zon – överlevare', type: 'safe', x: 100, z: -1272, r: 45 },
  { id: 'hamn', name: 'Hamnlägret, Stigbergskajen', sub: 'Säker zon – överlevare', type: 'safe', x: -370, z: -1605, r: 32 },
  { id: 'kolonin', name: 'Koloniområdet', sub: 'Säker zon – överlevare', type: 'safe', x: -1070, z: 560, r: 38 },
  { id: 'sahlgrenska', name: HOSPITAL.name, sub: 'Farligt område – motgiftet finns här', type: 'danger', x: HOSPITAL.x, z: HOSPITAL.z, r: 120 },
  { id: 'militar', name: 'Militärbasen i Slottsskogen', sub: 'Farligt område – övergiven bas', type: 'danger', x: 230, z: -130, r: 70 },
  { id: 'forskning', name: 'Forskningsanläggningen Medicinareberget', sub: 'Farligt område – smittade forskare', type: 'danger', x: 1380, z: -230, r: 95 },
  { id: 'hamn_container', name: 'Göteborgs hamn – kajerna', sub: 'Hamnen', type: 'landmark', x: -900, z: -1500, r: 120 },
];

export const DISTRICTS = [
  { name: 'Masthugget', x: 20, z: -1380 },
  { name: 'Stigberget', x: -420, z: -1330 },
  { name: 'Majorna', x: -1050, z: -1050 },
  { name: 'Kungsladugård', x: -900, z: -250 },
  { name: 'Sandarna', x: -1650, z: -700 },
  { name: 'Linnéstaden', x: 680, z: -1250 },
  { name: 'Haga', x: 1150, z: -1650 },
  { name: 'Vasastan', x: 1750, z: -1500 },
  { name: 'Inom Vallgraven', x: 1750, z: -1950 },
  { name: 'Johanneberg', x: 1800, z: -700 },
  { name: 'Slottsskogen', x: 300, z: -150 },
  { name: 'Änggården', x: 1000, z: 650 },
  { name: 'Änggårdsbergen', x: 1350, z: 1400 },
  { name: 'Guldheden', x: 1750, z: 100 },
  { name: 'Högsbo', x: -500, z: 1300 },
  { name: 'Flatås', x: -1500, z: 1300 },
  { name: 'Eriksberg (Hisingen)', x: -1500, z: -1850 },
  { name: 'Göta älv', x: -800, z: -1750, water: true },
];

export function districtAt(x, z) {
  let best = null, bd = Infinity;
  for (const d of DISTRICTS) { const dd = (d.x - x) ** 2 + (d.z - z) ** 2; if (dd < bd) { bd = dd; best = d; } }
  return best;
}
export function zoneAt(x, z) {
  for (const zn of ZONES) if ((zn.x - x) ** 2 + (zn.z - z) ** 2 < zn.r * zn.r) return zn;
  return null;
}
