// Per-level look and sound. Keys match /shared/levels.js.
//   fog/sky/orb    distance fog, sky gradient, moon/planet (orbA = world angle, orbE = height, orbR = size)
//   wall/band      wall face color and its glowing stripe
//   ambient        floating particles (embers / sparks / fireflies)
//   blood/fire     hit particles and death burst
//   sprite         enemy billboard in render/sprites.js
//   drone          ambient hum oscillators [type, Hz]; droneVol scales how loud it is
//   ceiling        a ceiling over the level (no sky)
//   mat            WebGL material hints (roughness, metalness, sun intensity)

export const THEMES = {
  hell: {
    id: 'hell', name: 'HELL', fog: [55, 8, 5], fogK: 0.055, skyLo: [180, 48, 14], skyHi: [14, 1, 4],
    orb: [230, 60, 28], orbGlow: [100, 14, 4], orbA: 0.9, orbE: 0.3, orbR: 0.09,
    wall: [52, 24, 30], wallTop: [64, 24, 28], band: [240, 45, 12],
    ambient: [255, 120, 20], ambientVz: 0.5, blood: [150, 5, 5], fire: [255, 110, 10],
    sprite: 'demon', pitDeath: 'Burned alive!', enemyPitDeath: 'Enemy burned!', pitOverlay: '255,70,0',
    accent: '255,70,20', bg: '#3a0600', title: '#f42', drone: [['sawtooth', 41], ['sawtooth', 43.7], ['sawtooth', 82.1]], droneCut: 160,
    minimap: [[40, 16, 14], [110, 40, 40], [255, 210, 40]],
    mat: { roughness: 0.92, metalness: 0.02, sun: 1.05 },
  },
  robot: {
    id: 'robot', name: 'ROBOT FACTORY', fog: [12, 18, 28], fogK: 0.048, skyLo: [28, 36, 48], skyHi: [8, 10, 14],
    orb: [160, 185, 220], orbGlow: [28, 45, 80], orbA: -2.2, orbE: 0.35, orbR: 0.15,
    wall: [68, 74, 86], wallTop: [98, 104, 118], band: [40, 230, 255],
    ambient: [80, 220, 255], ambientVz: 0.15, blood: [35, 35, 40], fire: [140, 230, 255],
    sprite: 'robot', pitDeath: 'Dissolved!', enemyPitDeath: 'Enemy dissolved!', pitOverlay: '40,255,150',
    accent: '40,220,255', bg: '#06202a', title: '#3ce', drone: [['triangle', 55], ['sine', 110.4], ['sine', 165.6]], droneCut: 220, droneVol: 0.6,
    minimap: [[30, 36, 44], [110, 120, 135], [40, 255, 150]],
    mat: { roughness: 0.55, metalness: 0.55, sun: 0.55 },
  },
  witch: {
    id: 'witch', name: 'WITCH SWAMP', fog: [16, 32, 14], fogK: 0.06, skyLo: [65, 115, 42], skyHi: [3, 10, 5],
    orb: [190, 255, 155], orbGlow: [40, 95, 28], orbA: 2.4, orbE: 0.32, orbR: 0.12,
    wall: [40, 50, 36], wallTop: [48, 68, 36], band: [130, 255, 95],
    ambient: [190, 255, 90], ambientVz: 0.1, blood: [60, 170, 40], fire: [150, 255, 80],
    sprite: 'witch', pitDeath: 'Melted in the bog!', enemyPitDeath: 'Enemy melted!', pitOverlay: '90,255,60',
    accent: '120,255,90', bg: '#0c2a06', title: '#7e4', drone: [['sine', 65], ['triangle', 97.5], ['sine', 131]], droneCut: 300,
    minimap: [[22, 38, 18], [80, 100, 70], [120, 255, 60]],
    mat: { roughness: 0.95, metalness: 0.0, sun: 0.7 },
  },
  haunt: {
    id: 'haunt', name: 'HAUNTED HOUSE', fog: [12, 10, 5], fogK: 0.11, skyLo: [38, 34, 18], skyHi: [8, 7, 4],
    orb: [0, 0, 0], orbGlow: [0, 0, 0], orbA: 0.7, orbE: -1, orbR: 0, ceiling: true,
    wall: [155, 140, 75], wallTop: [58, 50, 28], band: [255, 230, 150],
    ambient: [230, 220, 160], ambientVz: 0.04, blood: [110, 8, 8], fire: [230, 230, 255],
    sprite: 'ghost', pitDeath: 'Noclipped out of reality!', enemyPitDeath: 'Enemy noclipped!', pitOverlay: '40,0,60',
    accent: '255,215,90', bg: '#2a2208', title: '#fd5', drone: [['sawtooth', 60], ['sine', 120], ['sine', 180.5]], droneCut: 420, droneVol: 0.35,
    minimap: [[70, 62, 34], [150, 136, 72], [30, 0, 40]],
    mat: { roughness: 0.9, metalness: 0.05, sun: 0.2 },
  },
  ice: {
    id: 'ice', name: 'ICE FIELDS', fog: [40, 55, 70], fogK: 0.05, skyLo: [160, 190, 210], skyHi: [18, 28, 42],
    orb: [220, 235, 255], orbGlow: [60, 90, 130], orbA: -1.4, orbE: 0.38, orbR: 0.12,
    wall: [90, 120, 150], wallTop: [180, 205, 230], band: [160, 230, 255],
    ambient: [200, 230, 255], ambientVz: -0.08, blood: [80, 100, 140], fire: [180, 220, 255],
    sprite: 'astronaut', pitDeath: 'Fell through the ice!', enemyPitDeath: 'Enemy fell through!', pitOverlay: '80,160,220',
    accent: '140,210,255', bg: '#0a1824', title: '#8cf', drone: [['sine', 48], ['triangle', 96.2], ['sine', 144]], droneCut: 280, droneVol: 0.45,
    minimap: [[50, 70, 90], [160, 190, 220], [60, 140, 200]],
    mat: { roughness: 0.35, metalness: 0.15, sun: 1.1 },
  },
  castle: {
    id: 'castle', name: 'CASTLE KEEP', fog: [20, 16, 14], fogK: 0.09, skyLo: [50, 42, 34], skyHi: [12, 10, 8],
    orb: [0, 0, 0], orbGlow: [0, 0, 0], orbA: 0.5, orbE: -1, orbR: 0, ceiling: true,
    wall: [78, 72, 64], wallTop: [52, 48, 42], band: [255, 140, 50],
    ambient: [255, 160, 60], ambientVz: 0.06, blood: [120, 10, 10], fire: [255, 150, 40],
    sprite: 'knight', pitDeath: 'Fell into the oubliette!', enemyPitDeath: 'Enemy fell!', pitOverlay: '20,10,5',
    accent: '255,150,50', bg: '#1a1410', title: '#fa5', drone: [['sawtooth', 36], ['sine', 72.3], ['triangle', 108]], droneCut: 180, droneVol: 0.4,
    minimap: [[40, 36, 30], [90, 82, 70], [30, 20, 12]],
    mat: { roughness: 0.88, metalness: 0.08, sun: 0.25 },
  },
  nuke: {
    id: 'nuke', name: 'NUKETOWN', fog: [55, 58, 48], fogK: 0.042, skyLo: [175, 185, 155], skyHi: [55, 75, 110],
    orb: [255, 230, 160], orbGlow: [80, 60, 20], orbA: -0.8, orbE: 0.42, orbR: 0.1,
    wall: [210, 175, 95], wallTop: [190, 155, 80], band: [255, 210, 70],
    ambient: [255, 220, 140], ambientVz: 0.05, blood: [140, 15, 15], fire: [255, 180, 60],
    sprite: 'cowboy', pitDeath: 'Fell in a hole!', enemyPitDeath: 'Enemy fell!', pitOverlay: '60,50,30',
    accent: '255,200,60', bg: '#2a2818', title: '#fc5', drone: [['triangle', 52], ['sine', 104], ['sine', 156]], droneCut: 260, droneVol: 0.35,
    minimap: [[70, 75, 55], [200, 170, 90], [40, 40, 35]],
    mat: { roughness: 0.8, metalness: 0.1, sun: 1.15 },
  },
};
