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
    id: 'hell', name: 'BRIMSTONE COVEN', fog: [50, 10, 22], fogK: 0.05, skyLo: [175, 52, 40], skyHi: [34, 6, 34],
    orb: [235, 70, 60], orbGlow: [110, 16, 30], orbA: 0.9, orbE: 0.3, orbR: 0.12,
    wall: [52, 24, 30], wallTop: [64, 24, 28], band: [240, 45, 12],
    ambient: [255, 120, 20], ambientVz: 0.5, blood: [150, 5, 5], fire: [255, 110, 10],
    sprite: 'demon', pitDeath: 'Fell into the brimstone!', enemyPitDeath: 'Enemy burned!', pitOverlay: '255,70,0',
    accent: '255,90,60', bg: '#3a0600', title: '#f42', drone: [['sawtooth', 41], ['sawtooth', 43.7], ['sawtooth', 82.1]], droneCut: 160,
    minimap: [[40, 16, 14], [110, 40, 40], [255, 210, 40]],
    mat: { roughness: 0.92, metalness: 0.02, sun: 1.05 },
  },
  robot: {
    id: 'robot', name: "ALCHEMIST'S LAB", fog: [22, 14, 30], fogK: 0.046, skyLo: [70, 44, 86], skyHi: [14, 8, 22],
    orb: [200, 255, 190], orbGlow: [40, 90, 50], orbA: -2.2, orbE: 0.35, orbR: 0.13,
    wall: [72, 48, 34], wallTop: [96, 66, 44], band: [120, 255, 140],
    ambient: [170, 255, 150], ambientVz: 0.2, blood: [140, 20, 20], fire: [170, 255, 120],
    sprite: 'robot', pitDeath: 'Dissolved in a potion vat!', enemyPitDeath: 'Enemy dissolved!', pitOverlay: '90,255,120',
    accent: '150,255,130', bg: '#160c1c', title: '#9f8', drone: [['sine', 55], ['triangle', 82.5], ['sine', 165]], droneCut: 240, droneVol: 0.5,
    minimap: [[40, 28, 22], [100, 70, 50], [120, 255, 140]],
    mat: { roughness: 0.85, metalness: 0.05, sun: 0.6 },
  },
  witch: {
    id: 'witch', name: 'WITCH SWAMP', fog: [48, 78, 42], fogK: 0.032, skyLo: [110, 150, 75], skyHi: [35, 55, 40],
    orb: [220, 255, 180], orbGlow: [60, 120, 40], orbA: 2.4, orbE: 0.38, orbR: 0.14,
    wall: [62, 78, 52], wallTop: [78, 105, 58], band: [150, 255, 110],
    ambient: [210, 255, 120], ambientVz: 0.1, blood: [60, 170, 40], fire: [150, 255, 80],
    sprite: 'witch', pitDeath: 'Melted in the bog!', enemyPitDeath: 'Enemy melted!', pitOverlay: '90,255,60',
    accent: '120,255,90', bg: '#0c2a06', title: '#7e4', drone: [['sine', 65], ['triangle', 97.5], ['sine', 131]], droneCut: 300,
    minimap: [[22, 38, 18], [80, 100, 70], [120, 255, 60]],
    mat: { roughness: 0.95, metalness: 0.0, sun: 1.35 },
  },
  haunt: {
    id: 'haunt', name: 'HEXED MANOR', fog: [12, 10, 5], fogK: 0.11, skyLo: [38, 34, 18], skyHi: [8, 7, 4],
    orb: [0, 0, 0], orbGlow: [0, 0, 0], orbA: 0.7, orbE: -1, orbR: 0, ceiling: true,
    wall: [155, 140, 75], wallTop: [58, 50, 28], band: [200, 150, 255],
    ambient: [210, 180, 255], ambientVz: 0.04, blood: [110, 8, 8], fire: [210, 170, 255],
    sprite: 'ghost', pitDeath: 'Noclipped out of reality!', enemyPitDeath: 'Enemy noclipped!', pitOverlay: '40,0,60',
    accent: '200,150,255', bg: '#1e1428', title: '#c9f', drone: [['sawtooth', 60], ['sine', 120], ['sine', 180.5]], droneCut: 420, droneVol: 0.35,
    minimap: [[70, 62, 34], [150, 136, 72], [30, 0, 40]],
    mat: { roughness: 0.9, metalness: 0.05, sun: 0.2 },
  },
  ice: {
    id: 'ice', name: 'FROST HOLLOW', fog: [42, 50, 72], fogK: 0.05, skyLo: [140, 170, 210], skyHi: [30, 20, 56],
    orb: [220, 235, 255], orbGlow: [60, 90, 130], orbA: -1.4, orbE: 0.38, orbR: 0.12,
    wall: [90, 120, 150], wallTop: [180, 205, 230], band: [160, 230, 255],
    ambient: [225, 235, 255], ambientVz: -0.12, blood: [120, 30, 60], fire: [190, 170, 255],
    sprite: 'astronaut', pitDeath: 'Fell through the ice!', enemyPitDeath: 'Enemy fell through!', pitOverlay: '80,160,220',
    accent: '170,190,255', bg: '#12122a', title: '#abf', drone: [['sine', 48], ['triangle', 96.2], ['sine', 144]], droneCut: 280, droneVol: 0.45,
    minimap: [[50, 70, 90], [160, 190, 220], [60, 140, 200]],
    mat: { roughness: 0.35, metalness: 0.15, sun: 1.1 },
  },
  castle: {
    id: 'castle', name: 'GOTHIC CASTLE', fog: [42, 44, 48], fogK: 0.036, skyLo: [92, 96, 102], skyHi: [28, 30, 34],
    orb: [230, 228, 240], orbGlow: [70, 70, 80], orbA: -0.9, orbE: 0.45, orbR: 0.15,
    wall: [90, 94, 98], wallTop: [58, 60, 64], band: [220, 140, 70],
    ambient: [255, 170, 90], ambientVz: 0.1, blood: [140, 20, 20], fire: [255, 160, 60],
    sprite: 'gothicWitch', pitDeath: 'Fell into the oubliette!', enemyPitDeath: 'Enemy fell!', pitOverlay: '40,20,50',
    accent: '190,120,255', bg: '#121418', title: '#c8ccd0', drone: [['sawtooth', 36], ['sine', 72.3], ['triangle', 108]], droneCut: 180, droneVol: 0.4,
    minimap: [[48, 50, 54], [90, 94, 98], [40, 20, 48]],
    mat: { roughness: 0.92, metalness: 0.04, sun: 0.95 },
  },
  nuke: {
    id: 'nuke', name: 'PUMPKIN HOLLOW', fog: [62, 40, 52], fogK: 0.04, skyLo: [230, 130, 60], skyHi: [48, 26, 66],
    orb: [255, 170, 70], orbGlow: [120, 50, 20], orbA: -0.8, orbE: 0.25, orbR: 0.17,
    wall: [78, 54, 36], wallTop: [96, 66, 42], band: [255, 150, 40],
    ambient: [255, 180, 70], ambientVz: 0.05, blood: [140, 15, 15], fire: [255, 150, 40],
    sprite: 'cowboy', pitDeath: "Fell into the witch's brew!", enemyPitDeath: 'Enemy brewed!', pitOverlay: '255,120,30',
    accent: '255,150,40', bg: '#241428', title: '#fa4', drone: [['triangle', 52], ['sine', 104], ['sine', 156]], droneCut: 260, droneVol: 0.35,
    minimap: [[60, 50, 40], [110, 80, 55], [255, 140, 40]],
    mat: { roughness: 0.8, metalness: 0.1, sun: 1.15 },
  },
};
