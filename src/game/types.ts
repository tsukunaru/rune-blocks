export const BOARD_SIZE = 9;

export type Language = 'ru' | 'en';
export type GameMode = 'tutorial' | 'endless' | 'campaign' | 'daily';
export type LossReason = 'noMoves' | 'moveLimit';
export type ThemeId = 'classic' | 'emerald' | 'crystal' | 'moon' | 'fire' | 'golden';
export type Mechanic = 'stones' | 'ice' | 'crystals' | 'seals';
export type BlockColor = 'blue' | 'cyan' | 'green' | 'orange' | 'purple' | 'pink' | 'gold';

export interface Coord {
  row: number;
  col: number;
}

export type CellModifier =
  | { type: 'stone'; hp: number }
  | { type: 'ice'; hp: number }
  | { type: 'crystal' }
  | { type: 'seal'; progress: number; required: number };

export interface Cell {
  fill: BlockColor | null;
  modifier: CellModifier | null;
}

export type Board = Cell[][];

export interface PieceDefinition {
  id: string;
  cells: readonly Coord[];
  size: number;
  weight: number;
  challenge: number;
  unlockAt: number;
}

export interface PieceInstance {
  uid: string;
  shapeId: string;
  color: BlockColor;
}

export type GoalType =
  | 'score'
  | 'clearLines'
  | 'combo'
  | 'clearAtOnce'
  | 'placePieces'
  | 'destroyStones'
  | 'breakIce'
  | 'collectCrystals'
  | 'completeSeals';

export interface Goal {
  type: GoalType;
  amount: number;
}

export interface ObstacleSpec extends Coord {
  modifier: CellModifier;
}

export interface LevelDefinition {
  id: number;
  biome: string;
  goal: Goal;
  moveLimit: number;
  starScores: readonly [number, number];
  obstacles: readonly ObstacleSpec[];
  startingCells: readonly Coord[];
  pieceSequence?: readonly string[];
  introduces?: Mechanic;
  difficulty: number;
}

export interface DailyChallenge {
  dateKey: string;
  templateId: string;
  seed: number;
  goal: Goal;
  moveLimit: number;
  obstacles: readonly ObstacleSpec[];
  startingCells: readonly Coord[];
  mechanic?: Mechanic;
}

export interface RunStats {
  stonesDamaged: number;
  stonesDestroyed: number;
  iceDamaged: number;
  iceDestroyed: number;
  crystalsCollected: number;
  sealsAdvanced: number;
  sealsCompleted: number;
}

export interface MoveOutcome {
  board: Board;
  placed: readonly Coord[];
  cleared: readonly Coord[];
  lines: number;
  rows: readonly number[];
  columns: readonly number[];
  combo: number;
  scoreDelta: number;
  stats: RunStats;
}

export interface RunState {
  mode: GameMode;
  board: Board;
  tray: Array<PieceInstance | null>;
  score: number;
  lines: number;
  combo: number;
  maxCombo: number;
  maxClear: number;
  moves: number;
  stats: RunStats;
  seed: number;
  sequence: string[];
  level?: LevelDefinition;
  daily?: DailyChallenge;
  continued: boolean;
  bonusMoves: number;
}

export const EMPTY_STATS: RunStats = {
  stonesDamaged: 0,
  stonesDestroyed: 0,
  iceDamaged: 0,
  iceDestroyed: 0,
  crystalsCollected: 0,
  sealsAdvanced: 0,
  sealsCompleted: 0,
};
