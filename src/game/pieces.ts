import type { Board, BlockColor, Coord, PieceDefinition, PieceInstance } from './types.ts';
import { BOARD_SIZE } from './types.ts';

const shape = (
  id: string,
  cells: readonly [number, number][],
  weight = 1,
  challenge = Math.min(1, cells.length / 8),
  unlockAt = 0,
): PieceDefinition => ({
  id,
  cells: cells.map(([row, col]) => ({ row, col })),
  size: cells.length,
  weight,
  challenge,
  unlockAt,
});

export const PIECES: readonly PieceDefinition[] = [
  shape('single', [[0, 0]], 2.2, .03),
  shape('h2', [[0, 0], [0, 1]], 1.8, .08),
  shape('v2', [[0, 0], [1, 0]], 1.8, .08),
  shape('h3', [[0, 0], [0, 1], [0, 2]], 1.55, .18),
  shape('v3', [[0, 0], [1, 0], [2, 0]], 1.55, .18),
  shape('h4', [[0, 0], [0, 1], [0, 2], [0, 3]], 1.05, .34),
  shape('v4', [[0, 0], [1, 0], [2, 0], [3, 0]], 1.05, .34),
  shape('h5', [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], .72, .55, .18),
  shape('v5', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], .72, .55, .18),
  shape('square2', [[0, 0], [0, 1], [1, 0], [1, 1]], 1.25, .3),
  shape('corner3', [[0, 0], [1, 0], [1, 1]], 1.45, .2),
  shape('corner3r', [[0, 1], [1, 0], [1, 1]], 1.45, .2),
  shape('corner3u', [[0, 0], [0, 1], [1, 0]], 1.35, .2),
  shape('corner3ur', [[0, 0], [0, 1], [1, 1]], 1.35, .2),
  shape('l4', [[0, 0], [1, 0], [2, 0], [2, 1]], .9, .42),
  shape('l4r', [[0, 1], [1, 1], [2, 0], [2, 1]], .9, .42),
  shape('t4', [[0, 0], [0, 1], [0, 2], [1, 1]], .82, .45),
  shape('t4d', [[0, 1], [1, 0], [1, 1], [1, 2]], .82, .45),
  shape('z4', [[0, 0], [0, 1], [1, 1], [1, 2]], .9, .44),
  shape('s4', [[0, 1], [0, 2], [1, 0], [1, 1]], .9, .44),
  shape('z4v', [[0, 0], [1, 0], [1, 1], [2, 1]], .82, .45),
  shape('corner5', [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], .62, .62, .25),
  shape('corner5r', [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]], .62, .62, .25),
  shape('cross5', [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], .52, .72, .32),
  shape('u5', [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], .58, .68, .3),
  shape('stair5', [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], .56, .7, .32),
  shape('h6', [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]], .58, .72, .42),
  shape('v6', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], .58, .72, .42),
  shape('rect6', [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], .52, .7, .48),
  shape('rect6v', [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]], .52, .7, .48),
  shape('bigL6', [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]], .46, .82, .57),
  shape('stair6', [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3]], .46, .86, .62),
  shape('t7', [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 2]], .4, .9, .66),
  shape('ring8', [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]], .34, .94, .72),
  shape('square3', [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], .32, 1, .76),
];

export const PIECE_BY_ID = new Map(PIECES.map((piece) => [piece.id, piece]));
export const BLOCK_COLORS: readonly BlockColor[] = ['blue', 'cyan', 'green', 'orange', 'purple', 'pink', 'gold'];

export const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const nextRandom = (seed: number): { seed: number; value: number } => {
  const next = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return { seed: next, value: next / 4294967296 };
};

export const pieceBounds = (piece: PieceDefinition) => ({
  rows: Math.max(...piece.cells.map((cell) => cell.row)) + 1,
  cols: Math.max(...piece.cells.map((cell) => cell.col)) + 1,
});

export const canDefinitionFit = (board: Board, piece: PieceDefinition): boolean => {
  const bounds = pieceBounds(piece);
  for (let row = 0; row <= BOARD_SIZE - bounds.rows; row += 1) {
    for (let col = 0; col <= BOARD_SIZE - bounds.cols; col += 1) {
      if (piece.cells.every((offset) => {
        const cell = board[row + offset.row][col + offset.col];
        return !cell.fill && cell.modifier?.type !== 'stone';
      })) return true;
    }
  }
  return false;
};

export const pieceWeightAtDifficulty = (piece: PieceDefinition, difficulty: number): number => {
  const value = Math.max(0, Math.min(1, difficulty));
  if (value < piece.unlockAt) return 0;
  return piece.weight * (.18 + (1 - value) * (1 - piece.challenge) * 1.8 + value * piece.challenge * 3.2);
};

const weightedPick = (pool: readonly PieceDefinition[], seed: number, difficulty: number) => {
  const random = nextRandom(seed);
  const total = pool.reduce((sum, item) => sum + pieceWeightAtDifficulty(item, difficulty), 0);
  let cursor = random.value * total;
  for (const item of pool) {
    cursor -= pieceWeightAtDifficulty(item, difficulty);
    if (cursor <= 0) return { piece: item, seed: random.seed };
  }
  return { piece: pool[pool.length - 1], seed: random.seed };
};

export const definitionPlacements = (board: Board, piece: PieceDefinition): Coord[] => {
  const bounds = pieceBounds(piece);
  const placements: Coord[] = [];
  for (let row = 0; row <= BOARD_SIZE - bounds.rows; row += 1) {
    for (let col = 0; col <= BOARD_SIZE - bounds.cols; col += 1) {
      if (piece.cells.every((offset) => {
        const cell = board[row + offset.row][col + offset.col];
        return !cell.fill && cell.modifier?.type !== 'stone';
      })) placements.push({ row, col });
    }
  }
  return placements;
};

const boardAfterPlacement = (source: Board, piece: PieceDefinition, row: number, col: number): Board => {
  const board = source.map((line) => line.map((cell) => ({ ...cell })));
  piece.cells.forEach((offset) => { board[row + offset.row][col + offset.col].fill = 'blue'; });
  const rows = board.map((line, index) => line.every((cell) => cell.fill) ? index : -1).filter((index) => index >= 0);
  const columns = Array.from({ length: BOARD_SIZE }, (_, index) =>
    board.every((line) => line[index].fill) ? index : -1).filter((index) => index >= 0);
  rows.forEach((clearRow) => board[clearRow].forEach((cell) => { cell.fill = null; }));
  columns.forEach((clearColumn) => board.forEach((line) => { line[clearColumn].fill = null; }));
  return board;
};

const boardKey = (board: Board): string => board.map((row) => row.map((cell) =>
  cell.modifier?.type === 'stone' ? 's' : cell.fill ? 'x' : '.',
).join('')).join('');

export const canPlaceAllDefinitions = (board: Board, definitions: readonly PieceDefinition[]): boolean => {
  const memo = new Map<string, boolean>();
  const visit = (current: Board, remaining: readonly PieceDefinition[]): boolean => {
    if (!remaining.length) return true;
    const key = `${boardKey(current)}|${remaining.map((piece) => piece.id).sort().join(',')}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const candidates = remaining.map((piece, index) => ({ piece, index, placements: definitionPlacements(current, piece) }))
      .filter(({ placements }) => placements.length)
      .sort((left, right) => left.placements.length - right.placements.length);
    for (const candidate of candidates) {
      const nextRemaining = remaining.filter((_, index) => index !== candidate.index);
      for (const placement of candidate.placements) {
        if (visit(boardAfterPlacement(current, candidate.piece, placement.row, placement.col), nextRemaining)) {
          memo.set(key, true);
          return true;
        }
      }
    }
    memo.set(key, false);
    return false;
  };
  return visit(board, definitions);
};

export const createPieceInstance = (shapeId: string, seed: number, slot: number): PieceInstance => {
  const colorRoll = nextRandom(seed + slot * 977);
  return {
    uid: `${seed.toString(36)}-${slot}-${shapeId}`,
    shapeId,
    color: BLOCK_COLORS[Math.floor(colorRoll.value * BLOCK_COLORS.length)],
  };
};

export const generateTray = (
  board: Board,
  seed: number,
  difficulty = 0,
  forcedShapeIds: readonly string[] = [],
): { tray: PieceInstance[]; seed: number } => {
  let cursor = seed >>> 0;
  const value = Math.max(0, Math.min(1, difficulty));
  const pool = PIECES.filter((piece) => pieceWeightAtDifficulty(piece, value) > 0);
  const buildCandidate = (): PieceDefinition[] => Array.from({ length: 3 }, (_, index) => {
    const forced = forcedShapeIds[index] ? PIECE_BY_ID.get(forcedShapeIds[index]) : undefined;
    if (forced) {
      cursor = nextRandom(cursor).seed;
      return forced;
    }
    const result = weightedPick(pool, cursor, value);
    cursor = result.seed;
    return result.piece;
  });

  let definitions = buildCandidate();
  for (let attempt = 0; attempt < 23 && !canPlaceAllDefinitions(board, definitions); attempt += 1) definitions = buildCandidate();

  if (!canPlaceAllDefinitions(board, definitions) && forcedShapeIds.length === 0) {
    const safe = ['single', 'h2', 'v2'].map((id) => PIECE_BY_ID.get(id)!);
    if (canPlaceAllDefinitions(board, safe)) definitions = safe;
  }

  const fitting = pool.filter((piece) => canDefinitionFit(board, piece));
  if (fitting.length && definitions.every((piece) => !canDefinitionFit(board, piece))) definitions[0] = fitting[0];

  return {
    tray: definitions.map((piece, index) => createPieceInstance(piece.id, cursor, index)),
    seed: cursor,
  };
};

export const findFirstPlacement = (board: Board, piece: PieceDefinition): Coord | null => {
  return definitionPlacements(board, piece)[0] ?? null;
};
