import { hashSeed, nextRandom } from './pieces.ts';
import type {
  CellModifier,
  Coord,
  DailyChallenge,
  Goal,
  LevelDefinition,
  Mechanic,
  ObstacleSpec,
  RunStats,
} from './types.ts';

export const BIOMES = ['enchantedForest', 'moonRuins', 'crystalCaves', 'skyCity', 'emberCitadel'] as const;

export interface MechanicTutorialStep {
  shapeId: string;
  row: number;
  col: number;
  targets: readonly Coord[];
}

const rowTargets = (from: number, to: number): Coord[] =>
  Array.from({ length: to - from + 1 }, (_, index) => ({ row: 4, col: from + index }));

export const mechanicTutorialStep = (mechanic: Mechanic, step: number): MechanicTutorialStep => {
  if (mechanic === 'seals' && step === 1) return { shapeId: 'h5', row: 4, col: 0, targets: rowTargets(0, 4) };
  if (mechanic === 'seals' && step >= 2) return { shapeId: 'h4', row: 4, col: 5, targets: rowTargets(5, 8) };
  const targets = rowTargets(6, 8);
  return {
    shapeId: 'h3',
    row: 4,
    col: 6,
    targets: mechanic === 'stones' ? [...targets, { row: 3, col: 7 }] : targets,
  };
};

export const mechanicLearnedFromMove = (mechanic: Mechanic, stats: RunStats): boolean => {
  if (mechanic === 'stones') return stats.stonesDestroyed > 0;
  if (mechanic === 'ice') return stats.iceDestroyed > 0;
  if (mechanic === 'crystals') return stats.crystalsCollected > 0;
  return stats.sealsCompleted > 0;
};

const uniqueCoords = (seed: number, count: number, blocked: readonly Coord[] = []): Coord[] => {
  const used = new Set(blocked.map(({ row, col }) => `${row}:${col}`));
  const result: Coord[] = [];
  let cursor = seed >>> 0;
  while (result.length < count && used.size < 81) {
    const rowRoll = nextRandom(cursor);
    const colRoll = nextRandom(rowRoll.seed);
    cursor = colRoll.seed;
    const row = Math.floor(rowRoll.value * 9);
    const col = Math.floor(colRoll.value * 9);
    const key = `${row}:${col}`;
    if (used.has(key)) continue;
    used.add(key);
    result.push({ row, col });
  }
  return result;
};

const obstacles = (
  seed: number,
  type: CellModifier['type'],
  count: number,
  occupied: readonly Coord[] = [],
  strength = 1,
): ObstacleSpec[] => uniqueCoords(seed, count, occupied).map(({ row, col }, index) => {
  let modifier: CellModifier;
  if (type === 'stone') modifier = { type, hp: index % 4 === 0 ? strength : 1 };
  else if (type === 'ice') modifier = { type, hp: index % 5 === 0 ? strength : 1 };
  else if (type === 'seal') modifier = { type, progress: 0, required: strength };
  else modifier = { type };
  return { row, col, modifier };
});

const occupiedCoords = (items: readonly ObstacleSpec[]): Coord[] => items
  .filter((item) => item.modifier.type === 'stone')
  .map(({ row, col }) => ({ row, col }));

const goalFor = (id: number, primary: Goal): Goal => {
  if (id % 5 === 0) return { type: 'combo', amount: Math.min(2 + Math.floor(id / 35), 3) };
  if (id % 7 === 0) return { type: 'clearLines', amount: 4 + Math.floor(id / 12) };
  if (id % 11 === 0) return { type: 'score', amount: 700 + id * 24 };
  return primary;
};

const introLevel = (id: 6 | 16 | 31 | 51): LevelDefinition => {
  const base = {
    id,
    biome: BIOMES[Math.floor((id - 1) / 20)],
    moveLimit: id === 51 ? 22 : 16,
    starScores: [450 + id * 8, 760 + id * 12] as const,
    difficulty: id / 100,
  };
  const rowLead = Array.from({ length: 6 }, (_, col) => ({ row: 4, col }));
  if (id === 6) return {
    ...base,
    goal: { type: 'destroyStones', amount: 1 },
    startingCells: rowLead,
    obstacles: [{ row: 3, col: 7, modifier: { type: 'stone', hp: 1 } }],
    pieceSequence: ['h3', 'single', 'v2'],
    introduces: 'stones',
  };
  if (id === 16) return {
    ...base,
    goal: { type: 'breakIce', amount: 3 },
    startingCells: rowLead,
    obstacles: [6, 7, 8].map((col) => ({ row: 4, col, modifier: { type: 'ice', hp: 1 } as const })),
    pieceSequence: ['h3', 'single', 'v2'],
    introduces: 'ice',
  };
  if (id === 31) return {
    ...base,
    goal: { type: 'collectCrystals', amount: 3 },
    startingCells: rowLead,
    obstacles: [6, 7, 8].map((col) => ({ row: 4, col, modifier: { type: 'crystal' } as const })),
    pieceSequence: ['h3', 'single', 'v2'],
    introduces: 'crystals',
  };
  return {
    ...base,
    goal: { type: 'completeSeals', amount: 3 },
    startingCells: rowLead,
    obstacles: [6, 7, 8].map((col) => ({ row: 4, col, modifier: { type: 'seal', progress: 0, required: 2 } as const })),
    pieceSequence: ['h3', 'h5', 'h4'],
    introduces: 'seals',
  };
};

const makeLevel = (id: number): LevelDefinition => {
  if (id === 6 || id === 16 || id === 31 || id === 51) return introLevel(id);
  const seed = hashSeed(`rune-campaign-${id}`);
  const biome = BIOMES[Math.floor((id - 1) / 20)];
  const difficulty = id / 100;
  let levelObstacles: ObstacleSpec[] = [];
  let primary: Goal = id % 2 ? { type: 'score', amount: 300 + id * 24 } : { type: 'clearLines', amount: 2 + Math.floor(id / 12) };

  if (id >= 6 && id <= 15) {
    levelObstacles = obstacles(seed, 'stone', 2 + Math.floor((id - 6) / 3), [], id > 11 ? 2 : 1);
    primary = { type: 'destroyStones', amount: Math.min(levelObstacles.length, 2 + Math.floor((id - 6) / 4)) };
  } else if (id >= 16 && id <= 30) {
    levelObstacles = obstacles(seed, 'ice', 3 + Math.floor((id - 16) / 3), [], id > 25 ? 2 : 1);
    if (id >= 22 && id % 3 === 0) levelObstacles.push(...obstacles(seed + 31, 'stone', 2, levelObstacles));
    primary = { type: 'breakIce', amount: Math.min(id > 25 ? 5 : 6, levelObstacles.filter((item) => item.modifier.type === 'ice').length) };
  } else if (id >= 31 && id <= 50) {
    levelObstacles = obstacles(seed, 'crystal', 4 + Math.floor((id - 31) / 4));
    if (id >= 41) levelObstacles.push(...obstacles(seed + 41, id % 2 ? 'stone' : 'ice', 2, levelObstacles));
    primary = { type: 'collectCrystals', amount: levelObstacles.filter((item) => item.modifier.type === 'crystal').length };
  } else if (id >= 51 && id <= 60) {
    levelObstacles = obstacles(seed, 'seal', 2 + Math.floor((id - 51) / 3), [], id > 56 ? 2 : 1);
    primary = { type: 'completeSeals', amount: Math.min(3, levelObstacles.length) };
  } else if (id >= 61 && id <= 70) {
    levelObstacles = obstacles(seed, 'seal', 3, [], 2);
    levelObstacles.push(...obstacles(seed + 61, 'stone', 3 + id % 3, levelObstacles, id > 66 ? 2 : 1));
    primary = id % 2 ? { type: 'completeSeals', amount: 2 } : { type: 'destroyStones', amount: 3 };
  } else if (id >= 71 && id <= 80) {
    levelObstacles = obstacles(seed, 'ice', 5, [], 2);
    levelObstacles.push(...obstacles(seed + 71, 'crystal', 5, levelObstacles));
    primary = id % 2 ? { type: 'breakIce', amount: 4 } : { type: 'collectCrystals', amount: 4 };
  } else if (id >= 81 && id <= 90) {
    levelObstacles = obstacles(seed, 'crystal', 5);
    levelObstacles.push(...obstacles(seed + 81, 'seal', 3, levelObstacles, 2));
    primary = id % 2 ? { type: 'completeSeals', amount: 2 } : { type: 'collectCrystals', amount: 4 };
  } else if (id >= 91) {
    const pairs: readonly [CellModifier['type'], CellModifier['type']][] = [
      ['stone', 'crystal'], ['ice', 'seal'], ['crystal', 'seal'], ['stone', 'ice'],
    ];
    const pair = pairs[id % pairs.length];
    levelObstacles = obstacles(seed, pair[0], 5, [], 2);
    levelObstacles.push(...obstacles(seed + 91, pair[1], 5, levelObstacles, 2));
    primary = pair[1] === 'seal' ? { type: 'completeSeals', amount: 3 }
      : pair[1] === 'crystal' ? { type: 'collectCrystals', amount: 4 }
        : pair[1] === 'ice' ? { type: 'breakIce', amount: 4 }
          : { type: 'destroyStones', amount: 3 };
  }

  const startingCount = id <= 3 ? 0 : Math.min(3 + Math.floor(id / 18), 8);
  const startingCells = uniqueCoords(seed + 101, startingCount, occupiedCoords(levelObstacles));
  return {
    id,
    biome,
    goal: goalFor(id, primary),
    moveLimit: 24 + Math.floor(id / 8),
    starScores: [650 + id * 20, 1000 + id * 31],
    obstacles: levelObstacles,
    startingCells,
    difficulty,
  };
};

export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = Array.from({ length: 100 }, (_, index) => makeLevel(index + 1));

interface DailyTemplate {
  id: string;
  goal: Goal;
  moveLimit: number;
  mechanic?: Mechanic;
}

export const DAILY_TEMPLATES: readonly DailyTemplate[] = [
  { id: 'starlight-score', goal: { type: 'score', amount: 1400 }, moveLimit: 28 },
  { id: 'line-song', goal: { type: 'clearLines', amount: 9 }, moveLimit: 30 },
  { id: 'rune-chain', goal: { type: 'combo', amount: 3 }, moveLimit: 30 },
  { id: 'patient-mage', goal: { type: 'placePieces', amount: 22 }, moveLimit: 22 },
  { id: 'twin-flare', goal: { type: 'clearAtOnce', amount: 2 }, moveLimit: 28 },
  { id: 'stone-whisper', goal: { type: 'destroyStones', amount: 3 }, moveLimit: 32, mechanic: 'stones' },
  { id: 'frozen-light', goal: { type: 'breakIce', amount: 5 }, moveLimit: 32, mechanic: 'ice' },
  { id: 'crystal-hunt', goal: { type: 'collectCrystals', amount: 5 }, moveLimit: 32, mechanic: 'crystals' },
  { id: 'seal-keeper', goal: { type: 'completeSeals', amount: 2 }, moveLimit: 34, mechanic: 'seals' },
  { id: 'moon-score', goal: { type: 'score', amount: 2100 }, moveLimit: 34 },
];

export const utcDateKey = (date = new Date()): string => [
  date.getUTCFullYear(),
  String(date.getUTCMonth() + 1).padStart(2, '0'),
  String(date.getUTCDate()).padStart(2, '0'),
].join('-');

export const dailyChallengeFor = (
  dateKey: string,
  seen: Record<Mechanic, boolean>,
): DailyChallenge => {
  const seed = hashSeed(dateKey);
  const selected = DAILY_TEMPLATES[seed % DAILY_TEMPLATES.length];
  const safeTemplates = DAILY_TEMPLATES.filter((template) => !template.mechanic);
  const template = selected.mechanic && !seen[selected.mechanic]
    ? safeTemplates[hashSeed(`safe-${dateKey}`) % safeTemplates.length]
    : selected;
  let dailyObstacles: ObstacleSpec[] = [];
  if (template.mechanic === 'stones') dailyObstacles = obstacles(seed + 7, 'stone', 5);
  if (template.mechanic === 'ice') dailyObstacles = obstacles(seed + 7, 'ice', 7);
  if (template.mechanic === 'crystals') dailyObstacles = obstacles(seed + 7, 'crystal', 7);
  if (template.mechanic === 'seals') dailyObstacles = obstacles(seed + 7, 'seal', 3, [], 2);
  return {
    dateKey,
    templateId: template.id,
    seed,
    goal: template.goal,
    moveLimit: template.moveLimit,
    obstacles: dailyObstacles,
    startingCells: uniqueCoords(seed + 17, 5, occupiedCoords(dailyObstacles)),
    mechanic: template.mechanic,
  };
};

export const millisecondsUntilNextUtcDay = (now = new Date()): number =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
