import { CAMPAIGN_LEVELS } from '../src/game/campaign.ts';
import { addStats, createBoard, goalProgress, isGoalComplete, placeAndResolve, starsForLevel } from '../src/game/engine.ts';
import { canPlaceAllDefinitions, definitionPlacements, generateTray, hashSeed, PIECE_BY_ID } from '../src/game/pieces.ts';
import { BOARD_SIZE, EMPTY_STATS, type Board, type Goal, type LevelDefinition, type RunState } from '../src/game/types.ts';

interface Strategy {
  objective: number;
  lines: number;
  potential: number;
  target: number;
  space: number;
  combo: number;
  jitter: number;
}

const STRATEGIES: readonly Strategy[] = [
  { objective: 18_000, lines: 900, potential: 6, target: 35, space: 3, combo: 420, jitter: 1 },
  { objective: 13_000, lines: 1_350, potential: 10, target: 20, space: 5, combo: 700, jitter: 2 },
  { objective: 22_000, lines: 650, potential: 4, target: 65, space: 2, combo: 260, jitter: 3 },
  { objective: 10_000, lines: 900, potential: 14, target: 42, space: 7, combo: 500, jitter: 4 },
  { objective: 16_000, lines: 1_100, potential: 8, target: 28, space: 1, combo: 1_050, jitter: 5 },
  { objective: 15_000, lines: 780, potential: 12, target: 52, space: 4, combo: 360, jitter: 6 },
];

const refill = (run: RunState): RunState => {
  const forced = run.sequence.slice(0, 3);
  const generated = generateTray(run.board, run.seed, run.level?.difficulty ?? 0, forced);
  return { ...run, tray: generated.tray, seed: generated.seed, sequence: run.sequence.slice(forced.length) };
};

const createRun = (level: LevelDefinition): RunState => refill({
  mode: 'campaign',
  board: createBoard(level.startingCells, level.obstacles),
  tray: [null, null, null],
  score: 0,
  lines: 0,
  combo: 0,
  maxCombo: 0,
  maxClear: 0,
  moves: 0,
  stats: { ...EMPTY_STATS },
  seed: hashSeed(`level-${level.id}`),
  sequence: [...(level.pieceSequence ?? [])],
  level,
  continued: false,
  bonusMoves: 0,
});

const linePotential = (board: Board): number => {
  let total = 0;
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const row = board[index];
    const column = board.map((line) => line[index]);
    if (row.every((cell) => cell.modifier?.type !== 'stone')) {
      const filled = row.filter((cell) => cell.fill).length;
      total += filled * filled;
    }
    if (column.every((cell) => cell.modifier?.type !== 'stone')) {
      const filled = column.filter((cell) => cell.fill).length;
      total += filled * filled;
    }
  }
  return total;
};

const targetPotential = (board: Board, goal: Goal): number => {
  const wanted = goal.type === 'destroyStones' ? 'stone'
    : goal.type === 'breakIce' ? 'ice'
      : goal.type === 'collectCrystals' ? 'crystal'
        : goal.type === 'completeSeals' ? 'seal' : null;
  if (!wanted) return 0;
  let total = 0;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col].modifier?.type !== wanted) continue;
      const rows = wanted === 'stone' ? [row - 1, row + 1] : [row];
      const columns = wanted === 'stone' ? [col - 1, col + 1] : [col];
      for (const targetRow of rows) {
        if (targetRow < 0 || targetRow >= BOARD_SIZE) continue;
        const filled = board[targetRow].filter((cell) => cell.fill).length;
        total += filled * filled;
      }
      for (const targetColumn of columns) {
        if (targetColumn < 0 || targetColumn >= BOARD_SIZE) continue;
        const filled = board.reduce((count, line) => count + Number(Boolean(line[targetColumn].fill)), 0);
        total += filled * filled;
      }
    }
  }
  return total;
};

const scriptedIntroMove = (run: RunState): { slot: number; row: number; col: number } | null => {
  const id = run.level?.id;
  if (![6, 16, 31, 51].includes(id ?? 0)) return null;
  const script = id === 51
    ? [{ shapeId: 'h3', row: 4, col: 6 }, { shapeId: 'h5', row: 4, col: 0 }, { shapeId: 'h4', row: 4, col: 5 }]
    : [{ shapeId: 'h3', row: 4, col: 6 }];
  const expected = script[run.moves];
  if (!expected) return null;
  const slot = run.tray.findIndex((piece) => piece?.shapeId === expected.shapeId);
  return slot < 0 ? null : { slot, row: expected.row, col: expected.col };
};

const applyMove = (run: RunState, slot: number, row: number, col: number): RunState | null => {
  const piece = run.tray[slot];
  if (!piece) return null;
  const outcome = placeAndResolve(run.board, piece, row, col, run.combo);
  if (!outcome) return null;
  const tray = [...run.tray];
  tray[slot] = null;
  let next: RunState = {
    ...run,
    board: outcome.board,
    tray,
    score: run.score + outcome.scoreDelta,
    lines: run.lines + outcome.lines,
    combo: outcome.combo,
    maxCombo: Math.max(run.maxCombo, outcome.combo),
    maxClear: Math.max(run.maxClear, outcome.lines),
    moves: run.moves + 1,
    stats: addStats(run.stats, outcome.stats),
  };
  if (tray.every((entry) => entry === null)) next = refill(next);
  return next;
};

const hasClearingMove = (run: RunState): boolean => run.tray.some((piece) => {
  const definition = piece ? PIECE_BY_ID.get(piece.shapeId) : null;
  return Boolean(piece && definition && definitionPlacements(run.board, definition).some(({ row, col }) =>
    (placeAndResolve(run.board, piece, row, col, run.combo)?.lines ?? 0) > 0,
  ));
});

const chooseMove = (run: RunState, strategy: Strategy): RunState | null => {
  const goal = run.level!.goal;
  const before = goalProgress(run, goal);
  let best: { score: number; run: RunState } | null = null;
  run.tray.forEach((piece, slot) => {
    const definition = piece ? PIECE_BY_ID.get(piece.shapeId) : null;
    if (!definition) return;
    for (const position of definitionPlacements(run.board, definition)) {
      const next = applyMove(run, slot, position.row, position.col);
      if (!next) continue;
      const progress = goalProgress(next, goal) - before;
      const empty = next.board.reduce((count, line) => count + line.filter((cell) => !cell.fill && cell.modifier?.type !== 'stone').length, 0);
      const remaining = next.tray.flatMap((entry) => {
        const remainingDefinition = entry ? PIECE_BY_ID.get(entry.shapeId) : null;
        return remainingDefinition ? [remainingDefinition] : [];
      });
      const survivable = run.tray.filter(Boolean).length === 1
        || !remaining.length
        || canPlaceAllDefinitions(next.board, remaining);
      const gainedLines = next.lines - run.lines;
      const comboPlan = goal.type === 'combo'
        ? run.combo > 0
          ? (gainedLines ? 70_000 : -90_000)
          : gainedLines ? (hasClearingMove(next) ? 30_000 : -24_000) : 0
        : 0;
      const hash = Math.imul((position.row + 1) * 17 + (position.col + 1) * 31 + slot * 47, strategy.jitter * 2_654_435_761) >>> 0;
      const score = progress * strategy.objective
        + gainedLines * strategy.lines
        + linePotential(next.board) * strategy.potential
        + targetPotential(next.board, goal) * strategy.target
        + empty * strategy.space
        + next.combo * next.combo * strategy.combo
        + (survivable ? 20_000 : -120_000)
        + comboPlan
        + definition.size * (goal.type === 'score' ? 55 : 2)
        + hash / 0xffff_ffff;
      if (!best || score > best.score) best = { score, run: next };
    }
  });
  return best?.run ?? null;
};

const simulate = (level: LevelDefinition, strategy: Strategy): RunState | null => {
  let run = createRun(level);
  while (run.moves < level.moveLimit && !isGoalComplete(run, level.goal)) {
    const scripted = scriptedIntroMove(run);
    const next = scripted ? applyMove(run, scripted.slot, scripted.row, scripted.col) : chooseMove(run, strategy);
    if (!next) return null;
    run = next;
  }
  return isGoalComplete(run, level.goal) ? run : null;
};

const validateStructure = (level: LevelDefinition): string[] => {
  const errors: string[] = [];
  if (level.id < 1 || level.id > 100) errors.push('id outside 1..100');
  if (level.moveLimit < 1) errors.push('move limit is empty');
  if (level.starScores[0] >= level.starScores[1]) errors.push('star thresholds are not ascending');
  const coordinates = [...level.startingCells, ...level.obstacles];
  if (coordinates.some(({ row, col }) => row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE)) errors.push('coordinate outside board');
  const stones = new Set(level.obstacles.filter(({ modifier }) => modifier.type === 'stone').map(({ row, col }) => `${row}:${col}`));
  if (level.startingCells.some(({ row, col }) => stones.has(`${row}:${col}`))) errors.push('starting block overlaps stone');
  if (level.pieceSequence?.some((id) => !PIECE_BY_ID.has(id))) errors.push('unknown scripted piece');
  return errors;
};

const failures: string[] = [];
let totalWins = 0;
let twoStarWins = 0;
let threeStarWins = 0;
for (const level of CAMPAIGN_LEVELS) {
  const structural = validateStructure(level);
  if (structural.length) failures.push(`Level ${level.id}: ${structural.join(', ')}`);
  const wins = STRATEGIES.map((strategy) => simulate(level, strategy)).filter((run): run is RunState => Boolean(run));
  totalWins += wins.length;
  const ratings = wins.map((run) => starsForLevel(run.score, run.moves, level));
  twoStarWins += ratings.filter((stars) => stars >= 2).length;
  threeStarWins += ratings.filter((stars) => stars >= 3).length;
  if (process.env.RUNE_STAR_REPORT) console.log([
    level.id,
    level.goal.type,
    level.goal.amount,
    ...wins.map((run) => `${run.score}@${run.moves}`).sort((a, b) => Number(a.split('@')[0]) - Number(b.split('@')[0])),
    `stars:${level.starScores.join('/')}`,
  ].join('\t'));
  if (!wins.length) failures.push(`Level ${level.id}: no automatic strategy reached ${level.goal.type}=${level.goal.amount}`);
}

if (totalWins && (twoStarWins / totalWins < .75 || twoStarWins / totalWins > .98)) {
  failures.push(`Two-star balance outside 75–98% of successful strategy runs: ${twoStarWins}/${totalWins}`);
}
if (totalWins && (threeStarWins / totalWins < .2 || threeStarWins / totalWins > .65)) {
  failures.push(`Three-star balance outside 20–65% of successful strategy runs: ${threeStarWins}/${totalWins}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Campaign validation: 100/100 reachable; ${totalWins}/${CAMPAIGN_LEVELS.length * STRATEGIES.length} strategy runs won; ${twoStarWins} earned 2+ stars; ${threeStarWins} earned 3 stars.`);
}
