// Per-level look and sound. Keys match /shared/levels.js.
//   fog/sky/orb    distance fog, sky gradient, moon/planet (orbA = world angle, orbE = height, orbR = size)
//   wall/band      wall face color and its glowing stripe
//   ambient        floating particles (embers / sparks / fireflies)
//   blood/fire     hit particles and death burst
//   sprite         enemy billboard in render/sprites.js
//   drone          ambient hum oscillators [type, Hz]; droneVol scales how loud it is
//   ceiling        a ceiling over the level (no sky); see drawTerrain

export const THEMES = {
  hell: {
    id: 'hell', name: 'HELL', fog: [60, 10, 6], fogK: 0.06, skyLo: [170, 42, 12], skyHi: [18, 2, 6],
    orb: [215, 55, 25], orbGlow: [90, 12, 4], orbA: 0.9, orbE: 0.3, orbR: 0.08,
    wall: [48, 22, 28], wallTop: [60, 22, 26], band: [230, 40, 10],
    ambient: [255, 120, 20], ambientVz: 0.5, blood: [150, 5, 5], fire: [255, 110, 10],
    sprite: 'demon', pitDeath: 'Burned alive!', enemyPitDeath: 'Enemy burned!', pitOverlay: '255,70,0',
    accent: '255,70,20', bg: '#3a0600', title: '#f42', drone: [['sawtooth', 41], ['sawtooth', 43.7], ['sawtooth', 82.1]], droneCut: 160,
    minimap: [[40, 16, 14], [110, 40, 40], [255, 110, 20]],
  },
  robot: {
    id: 'robot', name: 'ROBOT FACTORY', fog: [14, 20, 30], fogK: 0.05, skyLo: [30, 38, 50], skyHi: [10, 12, 16], // dim ceiling over the server room
    orb: [150, 170, 200], orbGlow: [25, 40, 70], orbA: -2.2, orbE: 0.35, orbR: 0.14,
    wall: [70, 76, 88], wallTop: [95, 100, 112], band: [40, 220, 255],
    ambient: [80, 220, 255], ambientVz: 0.15, blood: [35, 35, 40], fire: [140, 230, 255],
    sprite: 'robot', pitDeath: 'Dissolved!', enemyPitDeath: 'Enemy dissolved!', pitOverlay: '40,255,150',
    accent: '40,220,255', bg: '#06202a', title: '#3ce', drone: [['triangle', 55], ['sine', 110.4], ['sine', 165.6]], droneCut: 220, droneVol: 0.6,
    minimap: [[30, 36, 44], [110, 120, 135], [40, 255, 150]],
  },
  witch: {
    id: 'witch', name: 'WITCH SWAMP', fog: [18, 34, 16], fogK: 0.065, skyLo: [70, 120, 45], skyHi: [4, 12, 6],
    orb: [200, 255, 160], orbGlow: [45, 100, 30], orbA: 2.4, orbE: 0.32, orbR: 0.11,
    wall: [42, 52, 38], wallTop: [50, 70, 38], band: [120, 255, 90],
    ambient: [190, 255, 90], ambientVz: 0.1, blood: [60, 170, 40], fire: [150, 255, 80],
    sprite: 'witch', pitDeath: 'Melted in the bog!', enemyPitDeath: 'Enemy melted!', pitOverlay: '90,255,60',
    accent: '120,255,90', bg: '#0c2a06', title: '#7e4', drone: [['sine', 65], ['triangle', 97.5], ['sine', 131]], droneCut: 300,
    minimap: [[22, 38, 18], [80, 100, 70], [120, 255, 60]],
  },
  haunt: {
    id: 'haunt', name: 'HAUNTED HOUSE', fog: [14, 12, 6], fogK: 0.12, skyLo: [40, 36, 20], skyHi: [10, 9, 5],
    orb: [0, 0, 0], orbGlow: [0, 0, 0], orbA: 0.7, orbE: -1, orbR: 0, ceiling: true,
    wall: [150, 136, 72], wallTop: [60, 52, 30], band: [255, 230, 150],
    ambient: [230, 220, 160], ambientVz: 0.04, blood: [110, 8, 8], fire: [230, 230, 255],
    sprite: 'ghost', pitDeath: 'Noclipped out of reality!', enemyPitDeath: 'Enemy noclipped!', pitOverlay: '40,0,60',
    accent: '255,215,90', bg: '#2a2208', title: '#fd5', drone: [['sawtooth', 60], ['sine', 120], ['sine', 180.5]], droneCut: 420, droneVol: 0.35,
    minimap: [[70, 62, 34], [150, 136, 72], [30, 0, 40]],
  },
};
