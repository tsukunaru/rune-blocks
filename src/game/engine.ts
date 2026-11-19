import { PIECE_BY_ID, canDefinitionFit } from './pieces.ts';
import {
  BOARD_SIZE,
  EMPTY_STATS,
  type BlockColor,
  type Board,
  type CellModifier,
  type Coord,
  type Goal,
  type LevelDefinition,
  type LossReason,
  type MoveOutcome,
  type ObstacleSpec,
  type PieceInstance,
  type RunState,
  type RunStats,
} from './types.ts';

export const createEmptyBoard = (): Board => Array.from({ length: BOARD_SIZE }, () =>
  Array.from({ length: BOARD_SIZE }, () => ({ fill: null, modifier: null })),
);

const copyModifier = (modifier: CellModifier | null): CellModifier | null => modifier ? { ...modifier } : null;

export const cloneBoard = (board: Board): Board => board.map((row) =>
  row.map((cell) => ({ fill: cell.fill, modifier: copyModifier(cell.modifier) })),
);

export const createBoard = (
  startingCells: readonly Coord[] = [],
  obstacles: readonly ObstacleSpec[] = [],
  color: BlockColor = 'purple',
): Board => {
  const board = createEmptyBoard();
  for (const { row, col } of startingCells) {
    if (board[row]?.[col]) board[row][col].fill = color;
  }
  for (const { row, col, modifier } of obstacles) {
    if (board[row]?.[col]) board[row][col].modifier = copyModifier(modifier);
  }
  return board;
};

export const canPlace = (board: Board, piece: PieceInstance, row: number, col: number): boolean => {
  const definition = PIECE_BY_ID.get(piece.shapeId);
  if (!definition || !Number.isInteger(row) || !Number.isInteger(col)) return false;
  return definition.cells.every((offset) => {
    const target = board[row + offset.row]?.[col + offset.col];
    return Boolean(target && !target.fill && target.modifier?.type !== 'stone');
  });
};

const clearedLines = (board: Board) => {
  const rows = Array.from({ length: BOARD_SIZE }, (_, row) => row)
    .filter((row) => board[row].every((cell) => cell.fill !== null));
  const columns = Array.from({ length: BOARD_SIZE }, (_, col) => col)
    .filter((col) => board.every((row) => row[col].fill !== null));
  return { rows, columns };
};

const emptyStats = (): RunStats => ({ ...EMPTY_STATS });

export const placeAndResolve = (
  source: Board,
  piece: PieceInstance,
  row: number,
  col: number,
  previousCombo = 0,
): MoveOutcome | null => {
  if (!canPlace(source, piece, row, col)) return null;
  const definition = PIECE_BY_ID.get(piece.shapeId)!;
  const board = cloneBoard(source);
  const placed = definition.cells.map((offset) => ({ row: row + offset.row, col: col + offset.col }));
  placed.forEach((target) => { board[target.row][target.col].fill = piece.color; });

  const { rows, columns } = clearedLines(board);
  const lines = rows.length + columns.length;
  const combo = lines ? previousCombo + 1 : 0;
  const clearKeys = new Set<string>();
  rows.forEach((clearRow) => {
    for (let clearCol = 0; clearCol < BOARD_SIZE; clearCol += 1) clearKeys.add(`${clearRow}:${clearCol}`);
  });
  columns.forEach((clearCol) => {
    for (let clearRow = 0; clearRow < BOARD_SIZE; clearRow += 1) clearKeys.add(`${clearRow}:${clearCol}`);
  });
  const cleared = [...clearKeys].map((key) => {
    const [clearRow, clearCol] = key.split(':').map(Number);
    return { row: clearRow, col: clearCol };
  });
  cleared.forEach((target) => { board[target.row][target.col].fill = null; });

  const stats = emptyStats();
  for (let currentRow = 0; currentRow < BOARD_SIZE; currentRow += 1) {
    for (let currentCol = 0; currentCol < BOARD_SIZE; currentCol += 1) {
      const cell = board[currentRow][currentCol];
      const modifier = cell.modifier;
      if (!modifier) continue;
      const key = `${currentRow}:${currentCol}`;
      if (modifier.type === 'stone') {
        const damage = rows.filter((line) => Math.abs(line - currentRow) === 1).length
          + columns.filter((line) => Math.abs(line - currentCol) === 1).length;
        if (!damage) continue;
        stats.stonesDamaged += Math.min(damage, modifier.hp);
        modifier.hp -= damage;
        if (modifier.hp <= 0) {
          cell.modifier = null;
          stats.stonesDestroyed += 1;
        }
      } else if (clearKeys.has(key) && modifier.type === 'ice') {
        stats.iceDamaged += 1;
        modifier.hp -= 1;
        if (modifier.hp <= 0) {
          cell.modifier = null;
          stats.iceDestroyed += 1;
        }
      } else if (clearKeys.has(key) && modifier.type === 'crystal') {
        cell.modifier = null;
        stats.crystalsCollected += 1;
      } else if (clearKeys.has(key) && modifier.type === 'seal') {
        modifier.progress += 1;
        stats.sealsAdvanced += 1;
        if (modifier.progress >= modifier.required) {
          cell.modifier = null;
          stats.sealsCompleted += 1;
        }
      }
    }
  }

  const placementScore = definition.size * 10;
  const lineScore = lines ? lines * lines * 100 : 0;
  const comboScore = lines && combo > 1 ? (combo - 1) * lines * 75 : 0;
  const objectiveBonus = stats.crystalsCollected * 60 + stats.stonesDestroyed * 35
    + stats.iceDestroyed * 25 + stats.sealsCompleted * 80;

  return {
    board,
    placed,
    cleared,
    lines,
    rows,
    columns,
    combo,
    scoreDelta: placementScore + lineScore + comboScore + objectiveBonus,
    stats,
  };
};

export const addStats = (left: RunStats, right: RunStats): RunStats => ({
  stonesDamaged: left.stonesDamaged + right.stonesDamaged,
  stonesDestroyed: left.stonesDestroyed + right.stonesDestroyed,
  iceDamaged: left.iceDamaged + right.iceDamaged,
  iceDestroyed: left.iceDestroyed + right.iceDestroyed,
  crystalsCollected: left.crystalsCollected + right.crystalsCollected,
  sealsAdvanced: left.sealsAdvanced + right.sealsAdvanced,
  sealsCompleted: left.sealsCompleted + right.sealsCompleted,
});

export const isGameOver = (board: Board, pieces: readonly (PieceInstance | null)[]): boolean => {
  const available = pieces.filter((piece): piece is PieceInstance => piece !== null);
  return available.length > 0 && available.every((piece) => {
    const definition = PIECE_BY_ID.get(piece.shapeId);
    return !definition || !canDefinitionFit(board, definition);
  });
};

export const goalProgress = (run: RunState, goal: Goal): number => {
  switch (goal.type) {
    case 'score': return run.score;
    case 'clearLines': return run.lines;
    case 'combo': return run.maxCombo;
    case 'clearAtOnce': return run.maxClear;
    case 'placePieces': return run.moves;
    case 'destroyStones': return run.stats.stonesDestroyed;
    case 'breakIce': return run.stats.iceDestroyed;
    case 'collectCrystals': return run.stats.crystalsCollected;
    case 'completeSeals': return run.stats.sealsCompleted;
  }
};

export const isGoalComplete = (run: RunState, goal: Goal): boolean => goalProgress(run, goal) >= goal.amount;

export const lossReasonForRun = (run: RunState, goal?: Goal, moveLimit?: number): LossReason | undefined => {
  if (goal && isGoalComplete(run, goal)) return undefined;
  if (moveLimit !== undefined && run.moves >= moveLimit) return 'moveLimit';
  return isGameOver(run.board, run.tray) ? 'noMoves' : undefined;
};

export const starsForScore = (score: number, thresholds: readonly [number, number]): number =>
  score >= thresholds[1] ? 3 : score >= thresholds[0] ? 2 : 1;

export const starsForLevel = (score: number, moves: number, level: LevelDefinition): number => {
  const efficiency = 1 - moves / level.moveLimit;
  const efficiencyStars = efficiency >= .5 ? 3 : efficiency >= .42 ? 2 : 1;
  return Math.max(starsForScore(score, level.starScores), efficiencyStars);
};

export const clearDensestLine = (source: Board): Board => {
  const board = cloneBoard(source);
  const rowCounts = board.map((row) => row.filter((cell) => cell.fill).length);
  const columnCounts = Array.from({ length: BOARD_SIZE }, (_, col) =>
    board.reduce((sum, row) => sum + Number(Boolean(row[col].fill)), 0),
  );
  const bestRow = rowCounts.indexOf(Math.max(...rowCounts));
  const bestColumn = columnCounts.indexOf(Math.max(...columnCounts));
  if (rowCounts[bestRow] >= columnCounts[bestColumn]) board[bestRow].forEach((cell) => { cell.fill = null; });
  else board.forEach((row) => { row[bestColumn].fill = null; });
  return board;
};

export const applyRewardedContinue = (run: RunState, reason: LossReason): RunState => ({
  ...run,
  board: reason === 'noMoves' ? clearDensestLine(run.board) : run.board,
  bonusMoves: run.bonusMoves + (reason === 'moveLimit' ? 5 : 0),
  continued: true,
  combo: 0,
});

export const countModifiers = (board: Board, type: CellModifier['type']): number => board.reduce(
  (total, row) => total + row.filter((cell) => cell.modifier?.type === type).length,
  0,
);
