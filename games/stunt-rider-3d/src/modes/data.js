// Time trial courses and challenge definitions.

const E = Math.PI / 2;
const W = -Math.PI / 2;
const S = 0;

export const COURSES = [
  {
    id: 'downtown',
    name: 'Downtown Dash',
    desc: 'Street sprint around the city blocks. Brake for the corners!',
    zone: 'Downtown',
    start: { x: -455, z: -600, yaw: W },
    cps: [
      [-680, -600, W],
      [-920, -600, W],
      [-1040, -480, S],
      [-1040, -240, S],
      [-920, -120, E],
      [-680, -120, E],
      [-540, -120, E],
      [-440, -30, S],
      [-440, 90, S],
    ],
    width: 16,
    goldSpeed: 23,
  },
  {
    id: 'highway',
    name: 'Highway Blitz',
    desc: 'Flat out down Highway 1. Watch the traffic.',
    zone: 'Highway 1',
    start: { x: -950, z: -997.5, yaw: E },
    cps: [
      [-600, -1000, E],
      [-250, -1000, E],
      [100, -1000, E],
      [450, -1000, E],
      [800, -1000, E],
      [945, -1000, E],
    ],
    width: 22,
    goldSpeed: 52,
  },
  {
    id: 'hills',
    name: 'Pine Hills Run',
    desc: 'Twisty country road through the forest down to the docks.',
    zone: 'Pine Hills',
    path: 'ne',
    spacing: 150,
    width: 14,
    goldSpeed: 28,
  },
  {
    id: 'mx',
    name: 'MX Track Lap',
    desc: 'One lap of the stunt park motocross track: whoops, tables and doubles.',
    zone: 'Stunt Park',
    path: 'mx',
    spacing: 70,
    width: 12,
    goldSpeed: 16,
  },
  {
    id: 'lakeside',
    name: 'Lakeside Cruise',
    desc: 'Long valley road past the lake, from downtown to the industrial zone.',
    zone: 'Lakeside Valley',
    path: 'sw',
    spacing: 180,
    width: 14,
    goldSpeed: 27,
  },
];

export const MEDAL_REWARD = { bronze: 2000, silver: 4000, gold: 8000 };

export const CHALLENGES = [
  { id: 'wheelie', name: 'Wheelie King', desc: 'Hold a wheelie for 6 seconds. Hold Space while riding, feather W/S to balance.', spawn: 'airfield', time: 90, reward: 3000, type: 'wheelie', target: 6 },
  { id: 'stoppie', name: 'Stoppie Pro', desc: 'Hold a stoppie for 2.5 seconds. Hold Space + S at speed.', spawn: 'mall', time: 90, reward: 3000, type: 'stoppie', target: 2.5 },
  { id: 'backflip', name: 'Flip Out', desc: 'Land a backflip. Hit a big kicker, then hold S in the air.', spawn: 'kickers', time: 90, reward: 3000, type: 'flip', dir: 1, target: 1 },
  { id: 'frontflip', name: 'Front Runner', desc: 'Land a frontflip. Release W after take-off, then press W again.', spawn: 'kickers', time: 90, reward: 4000, type: 'flip', dir: -1, target: 1 },
  { id: 'spin', name: 'Spin Cycle', desc: 'Land a 360 spin. Hold A or D in the air.', spawn: 'kickers', time: 90, reward: 3500, type: 'spin', target: 360 },
  { id: 'superman', name: 'Man of Steel', desc: 'Land a Superman. Press and hold E in the air, release before landing.', spawn: 'kickers', time: 90, reward: 3000, type: 'style', trick: 'superman' },
  { id: 'whip', name: 'Whip It', desc: 'Land a tailwhip. Press E + D in the air.', spawn: 'kickers', time: 90, reward: 4000, type: 'style', trick: 'tailwhip' },
  { id: 'nohander', name: 'Look, No Hands', desc: 'Land a No-Hander (E + A) and a No-Footer (E + S) in one run.', spawn: 'kickers', time: 120, reward: 5000, type: 'styles', tricks: ['nohander', 'nofooter'] },
  { id: 'double', name: 'Double Trouble', desc: 'Land a double backflip. Use the Mega kicker at full speed.', spawn: 'kickers', time: 120, reward: 8000, type: 'flip', dir: 1, target: 2 },
  { id: 'combo', name: 'Combo Artist', desc: 'Bank a single combo of 4 or more tricks.', spawn: 'park', time: 150, reward: 6000, type: 'comboCount', target: 4 },
  { id: 'bigair', name: 'Big Air', desc: 'Stay airborne for 3.5 seconds.', spawn: 'airfield', time: 90, reward: 4000, type: 'air', target: 3.5 },
  { id: 'loop', name: 'Loop the Loop', desc: 'Ride all the way around the loop. You need 70+ km/h.', spawn: 'loop', time: 60, reward: 3000, type: 'loop' },
  { id: 'halfpipe', name: 'Halfpipe Hero', desc: 'Land 3 vert airs in the halfpipe.', spawn: 'halfpipe', time: 90, reward: 5000, type: 'vert', target: 3 },
  { id: 'rooftop', name: 'Rooftop Leap', desc: 'Ride up the ramp and jump the street from roof to roof.', spawn: 'rooftop', time: 120, reward: 5000, type: 'gap', gap: 'Rooftop Leap' },
  { id: 'containers', name: 'Container Hop', desc: 'Jump between the container rows in the industrial yard.', spawn: 'containers', time: 120, reward: 5000, type: 'gap', gap: 'Container Hop' },
  { id: 'lake', name: 'Lake Jump', desc: 'Clear the lake jump. Bring a lot of speed!', spawn: 'lake', time: 120, reward: 6000, type: 'gap', gap: 'Lake Jump' },
  { id: 'speed', name: 'Speed Demon', desc: 'Hit 200 km/h. Road bikes recommended - or use your boost!', spawn: 'highway', time: 60, reward: 4000, type: 'speed', target: 200 },
  { id: 'score', name: 'Score Attack', desc: 'Bank 25,000 points within 2 minutes.', spawn: 'park', time: 120, reward: 8000, type: 'score', target: 25000 },
];

export const MODE_INFO = [
  { id: 'free', name: 'Free Ride', icon: '🌍', desc: 'Explore the whole map without limits. Find all 30 hidden stars and every named gap.' },
  { id: 'stunt', name: 'Stunt Mode', icon: '🔥', desc: 'Three minutes to score as many points as you can. Chain tricks into huge combos.' },
  { id: 'trial', name: 'Time Trial', icon: '⏱', desc: 'Race through checkpoints on five courses. Earn bronze, silver and gold medals.' },
  { id: 'challenge', name: 'Challenges', icon: '🎯', desc: 'Specific stunt goals against the clock. Complete them all for big rewards.' },
  { id: 'ramp', name: 'Ramp Jump', icon: '🚀', desc: 'Launch off the Mega Ramp at the airfield. Three attempts to fly as far as possible.' },
];
