import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMPAIGN_LEVELS,
  DAILY_TEMPLATES,
  dailyChallengeFor,
  mechanicLearnedFromMove,
  mechanicTutorialStep,
} from '../src/game/campaign.ts';
import {
  addStats,
  applyRewardedContinue,
  canPlace,
  createBoard,
  createEmptyBoard,
  goalProgress,
  isGameOver,
  isGoalComplete,
  lossReasonForRun,
  placeAndResolve,
  starsForLevel,
} from '../src/game/engine.ts';
import { canPlaceAllDefinitions, createPieceInstance, generateTray, hashSeed, PIECES, PIECE_BY_ID } from '../src/game/pieces.ts';
import { EMPTY_STATS, type Board, type RunState } from '../src/game/types.ts';
import { goalText } from '../src/i18n.ts';
import { adjustProgress, completeDaily, completeTutorial, createDefaultSave, doubleDailyReward, mergeSaves, normalizeSave, selectProfileSave } from '../src/save.ts';
import {
  bindAccountSelection,
  CRITICAL_ASSET_URLS,
  DAILY_LEADERBOARD_NAME,
  encodeDailyLeaderboardScore,
  initYandex,
  preloadCriticalAssets,
  queueCloudSave,
  refreshPlayer,
  showInterstitial,
  showRewarded,
  signalReady,
  submitDailyScore,
} from '../src/yandex.ts';

const piece = (shapeId: string, seed = 1) => createPieceInstance(shapeId, seed, 0);
const fill = (board: Board, coordinates: readonly [number, number][]) => {
  coordinates.forEach(([row, col]) => { board[row][col].fill = 'blue'; });
  return board;
};
const blankRun = (board: Board): RunState => ({
  mode: 'campaign', board, tray: [piece('single'), null, null], score: 0, lines: 0, combo: 0,
  maxCombo: 0, maxClear: 0, moves: 0, stats: { ...EMPTY_STATS }, seed: 1, sequence: [], continued: false,
  bonusMoves: 0,
});

test('critical startup preload waits for decode and a failed decode falls back without blocking', async () => {
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWarn = console.warn;
  const decoded: string[] = [];
  let fallbackEnabled = false;
  let releaseMenu!: () => void;
  const menuDecoded = new Promise<void>((resolve) => { releaseMenu = resolve; });
  class FakeImage {
    private source = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) { this.source = value; queueMicrotask(() => this.onload?.()); }
    get src() { return this.source; }
    decode() {
      decoded.push(this.src);
      if (this.src.endsWith('menu-puzzle-sanctuary.png')) return menuDecoded;
      if (this.src.endsWith('mechanic-tiles.png')) {
        queueMicrotask(() => this.onerror?.());
        return Promise.reject(new Error('decode failed'));
      }
      return Promise.resolve();
    }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      fonts: { ready: Promise.resolve() },
      documentElement: { classList: { toggle: (_name: string, enabled: boolean) => { fallbackEnabled = enabled; } } },
    },
  });
  console.warn = () => undefined;
  try {
    let finished = false;
    const preloading = preloadCriticalAssets().then(() => { finished = true; });
    await Promise.resolve();
    assert.equal(finished, false);
    releaseMenu();
    await preloading;
    assert.equal(finished, true);
    assert.deepEqual(decoded, [...CRITICAL_ASSET_URLS]);
    assert.equal(fallbackEnabled, true);
  } finally {
    if (previousImage) Object.defineProperty(globalThis, 'Image', previousImage);
    else Reflect.deleteProperty(globalThis, 'Image');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    console.warn = previousWarn;
  }
});

test('piece placement accepts valid cells and rejects overlap or bounds', () => {
  const board = createEmptyBoard();
  assert.equal(canPlace(board, piece('square2'), 7, 7), true);
  assert.equal(canPlace(board, piece('square2'), 8, 8), false);
  board[7][7].fill = 'gold';
  assert.equal(canPlace(board, piece('square2'), 7, 7), false);
});

test('row, column and simultaneous line clears resolve exactly once', () => {
  const rowBoard = fill(createEmptyBoard(), Array.from({ length: 8 }, (_, col) => [3, col] as [number, number]));
  const row = placeAndResolve(rowBoard, piece('single'), 3, 8, 0)!;
  assert.deepEqual(row.rows, [3]);
  assert.equal(row.lines, 1);
  assert.equal(row.board[3].every((cell) => !cell.fill), true);

  const columnBoard = fill(createEmptyBoard(), Array.from({ length: 8 }, (_, rowIndex) => [rowIndex, 4] as [number, number]));
  const column = placeAndResolve(columnBoard, piece('single'), 8, 4, 0)!;
  assert.deepEqual(column.columns, [4]);

  const crossBoard = fill(createEmptyBoard(), [
    ...Array.from({ length: 8 }, (_, col) => [4, col] as [number, number]),
    ...Array.from({ length: 8 }, (_, index) => [index < 4 ? index : index + 1, 8] as [number, number]),
  ]);
  const cross = placeAndResolve(crossBoard, piece('single'), 4, 8, 0)!;
  assert.equal(cross.lines, 2);
  assert.equal(cross.cleared.length, 17);
  assert.ok(cross.scoreDelta > row.scoreDelta);
});

test('score and consecutive-clear combo grow, then reset on a quiet move', () => {
  const board = fill(createEmptyBoard(), Array.from({ length: 8 }, (_, col) => [0, col] as [number, number]));
  const first = placeAndResolve(board, piece('single'), 0, 8, 0)!;
  const secondBoard = fill(first.board, Array.from({ length: 8 }, (_, col) => [1, col] as [number, number]));
  const second = placeAndResolve(secondBoard, piece('single'), 1, 8, first.combo)!;
  const quiet = placeAndResolve(second.board, piece('single'), 8, 8, second.combo)!;
  assert.equal(first.combo, 1);
  assert.equal(second.combo, 2);
  assert.ok(second.scoreDelta > first.scoreDelta);
  assert.equal(quiet.combo, 0);
});

test('stones take adjacent-line damage and are destroyed at zero hp', () => {
  const board = createBoard(
    Array.from({ length: 8 }, (_, col) => ({ row: 4, col })),
    [{ row: 3, col: 5, modifier: { type: 'stone', hp: 2 } }],
  );
  const first = placeAndResolve(board, piece('single'), 4, 8)!;
  assert.equal(first.stats.stonesDamaged, 1);
  assert.deepEqual(first.board[3][5].modifier, { type: 'stone', hp: 1 });
  fill(first.board, Array.from({ length: 8 }, (_, col) => [4, col] as [number, number]));
  const second = placeAndResolve(first.board, piece('single'), 4, 8)!;
  assert.equal(second.stats.stonesDestroyed, 1);
  assert.equal(second.board[3][5].modifier, null);
});

test('ice can accept a block and breaks when its line clears', () => {
  const board = createBoard(
    Array.from({ length: 8 }, (_, col) => ({ row: 2, col })),
    [{ row: 2, col: 8, modifier: { type: 'ice', hp: 1 } }],
  );
  assert.equal(canPlace(board, piece('single'), 2, 8), true);
  const result = placeAndResolve(board, piece('single'), 2, 8)!;
  assert.equal(result.stats.iceDamaged, 1);
  assert.equal(result.stats.iceDestroyed, 1);
  assert.equal(result.board[2][8].modifier, null);
});

test('crystals collect and seals progress across multiple clears', () => {
  const crystalBoard = createBoard(
    Array.from({ length: 8 }, (_, col) => ({ row: 5, col })),
    [{ row: 5, col: 8, modifier: { type: 'crystal' } }],
  );
  const crystal = placeAndResolve(crystalBoard, piece('single'), 5, 8)!;
  assert.equal(crystal.stats.crystalsCollected, 1);

  const sealBoard = createBoard(
    Array.from({ length: 8 }, (_, col) => ({ row: 6, col })),
    [{ row: 6, col: 8, modifier: { type: 'seal', progress: 0, required: 2 } }],
  );
  const first = placeAndResolve(sealBoard, piece('single'), 6, 8)!;
  assert.deepEqual(first.board[6][8].modifier, { type: 'seal', progress: 1, required: 2 });
  fill(first.board, Array.from({ length: 8 }, (_, col) => [6, col] as [number, number]));
  const second = placeAndResolve(first.board, piece('single'), 6, 8)!;
  assert.equal(second.stats.sealsCompleted, 1);
  assert.equal(second.board[6][8].modifier, null);
});

test('game over checks every remaining piece and respects obstacle rules', () => {
  const almostFull = fill(createEmptyBoard(), Array.from({ length: 81 }, (_, index) => [Math.floor(index / 9), index % 9] as [number, number]));
  almostFull[8][8].fill = null;
  almostFull[8][8].modifier = { type: 'stone', hp: 1 };
  assert.equal(isGameOver(almostFull, [piece('single'), piece('h2'), null]), true);
  almostFull[8][8].modifier = { type: 'ice', hp: 1 };
  assert.equal(isGameOver(almostFull, [piece('single'), piece('h2'), null]), false);
});

test('generator exposes 20+ shapes and avoids a dead tray while a move exists', () => {
  assert.ok(PIECES.length >= 30);
  assert.ok(PIECES.some((definition) => definition.size >= 9));
  const board = fill(createEmptyBoard(), Array.from({ length: 81 }, (_, index) => [Math.floor(index / 9), index % 9] as [number, number]));
  board[8][8].fill = null;
  const generated = generateTray(board, 99, .9);
  assert.equal(isGameOver(board, generated.tray), false);
});

test('difficulty shifts trays toward larger pieces and preserves a playable three-piece sequence', () => {
  const board = createEmptyBoard();
  let easySize = 0;
  let hardSize = 0;
  let hardLargePieces = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    for (const generated of generateTray(board, seed, 0).tray) easySize += PIECE_BY_ID.get(generated.shapeId)!.size;
    const hard = generateTray(board, seed, 1).tray;
    for (const generated of hard) {
      const size = PIECE_BY_ID.get(generated.shapeId)!.size;
      hardSize += size;
      if (size >= 6) hardLargePieces += 1;
    }
    assert.equal(canPlaceAllDefinitions(board, hard.map((generated) => PIECE_BY_ID.get(generated.shapeId)!)), true);
  }
  assert.ok(hardSize / 360 > easySize / 360 + 1);
  assert.ok(hardLargePieces > 30);
});

test('base tutorial setup performs the promised deterministic line clear', () => {
  const board = createBoard(Array.from({ length: 6 }, (_, col) => ({ row: 4, col })));
  const outcome = placeAndResolve(board, piece('h3'), 4, 6)!;
  assert.equal(outcome.lines, 1);
  assert.equal(outcome.board[4].every((cell) => !cell.fill), true);
});

test('tutorial completion and skip share a persisted completion flag', () => {
  const completed = completeTutorial(createDefaultSave('ru'));
  const skipped = completeTutorial(createDefaultSave('en'));
  assert.equal(completed.tutorialCompleted, true);
  assert.equal(skipped.tutorialCompleted, true);
  assert.equal(normalizeSave(completed).tutorialCompleted, true);
});

test('campaign is 100 data-driven levels with staged mechanics and goals', () => {
  assert.equal(CAMPAIGN_LEVELS.length, 100);
  assert.equal(CAMPAIGN_LEVELS[5].introduces, 'stones');
  assert.equal(CAMPAIGN_LEVELS[15].introduces, 'ice');
  assert.equal(CAMPAIGN_LEVELS[30].introduces, 'crystals');
  assert.equal(CAMPAIGN_LEVELS[50].introduces, 'seals');
  const run = { ...blankRun(createEmptyBoard()), score: 500, level: CAMPAIGN_LEVELS[0] };
  assert.equal(goalProgress(run, { type: 'score', amount: 500 }), 500);
  assert.equal(isGoalComplete(run, { type: 'score', amount: 500 }), true);
});

test('campaign stars reward efficient clears while score remains an alternate route', () => {
  const level = { ...CAMPAIGN_LEVELS[0], moveLimit: 20, starScores: [1_000, 2_000] as const };
  assert.equal(starsForLevel(0, 20, level), 1);
  assert.equal(starsForLevel(0, 11, level), 2);
  assert.equal(starsForLevel(0, 10, level), 3);
  assert.equal(starsForLevel(1_000, 20, level), 2);
  assert.equal(starsForLevel(2_000, 20, level), 3);
});

test('mechanic tutorials require the demonstrated board action before they are learned', () => {
  assert.deepEqual(mechanicTutorialStep('stones', 0), {
    shapeId: 'h3', row: 4, col: 6,
    targets: [{ row: 4, col: 6 }, { row: 4, col: 7 }, { row: 4, col: 8 }, { row: 3, col: 7 }],
  });
  assert.equal(mechanicLearnedFromMove('stones', { ...EMPTY_STATS }), false);
  assert.equal(mechanicLearnedFromMove('stones', { ...EMPTY_STATS, stonesDestroyed: 1 }), true);
  assert.equal(mechanicLearnedFromMove('seals', { ...EMPTY_STATS, sealsAdvanced: 3 }), false);
  assert.equal(mechanicLearnedFromMove('seals', { ...EMPTY_STATS, sealsCompleted: 1 }), true);
});

test('daily seed is stable and unseen mechanics never appear', () => {
  assert.equal(DAILY_TEMPLATES.length, 10);
  const unseen = { stones: false, ice: false, crystals: false, seals: false };
  for (let day = 1; day <= 31; day += 1) {
    const key = `2026-09-${String(day).padStart(2, '0')}`;
    const first = dailyChallengeFor(key, unseen);
    const second = dailyChallengeFor(key, unseen);
    assert.deepEqual(first, second);
    assert.equal(first.mechanic, undefined);
    assert.equal(first.seed, hashSeed(key));
  }
});

test('daily completion updates history, rewards and streak once', () => {
  const save = createDefaultSave('en');
  const dayOne = completeDaily(save, '2026-09-05', 1_250);
  const dayTwo = completeDaily(dayOne, '2026-09-06');
  const duplicate = completeDaily(dayTwo, '2026-09-06');
  const improved = completeDaily(duplicate, '2026-09-06', 1_400);
  assert.equal(dayTwo.daily.streak, 2);
  assert.equal(dayTwo.moonShards, 30);
  assert.deepEqual(duplicate, dayTwo);
  assert.equal(dayOne.daily.scores['2026-09-05'], 1_250);
  assert.equal(improved.daily.scores['2026-09-06'], 1_400);
  assert.equal(improved.moonShards, 30);
});

test('daily rewarded bonus is granted once and survives normalization', () => {
  const completed = completeDaily(createDefaultSave('en'), '2026-09-07', 500);
  const doubled = doubleDailyReward(completed, '2026-09-07');
  const duplicate = doubleDailyReward(doubled, '2026-09-07');
  assert.equal(doubled.moonShards, 30);
  assert.deepEqual(doubled.daily.doubled, ['2026-09-07']);
  assert.deepEqual(duplicate, doubled);
  assert.deepEqual(normalizeSave(doubled).daily.doubled, ['2026-09-07']);
  assert.equal(doubleDailyReward(createDefaultSave('en'), '2026-09-07').moonShards, 0);
});

test('daily leaderboard encoding keeps newer dates ahead and preserves score order', () => {
  const first = encodeDailyLeaderboardScore('2026-09-05', 1_200);
  const better = encodeDailyLeaderboardScore('2026-09-05', 1_700);
  const tomorrow = encodeDailyLeaderboardScore('2026-09-06', 10);
  assert.equal(better - first, 500);
  assert.ok(tomorrow > better);
});

test('save normalization rejects corrupt values and merge preserves best progress', () => {
  const corrupt = normalizeSave({ campaign: { unlocked: 999, stars: { 1: 99 } }, bestEndless: -4, selectedTheme: 'hacked' }, 'ru');
  assert.equal(corrupt.campaign.unlocked, 100);
  assert.equal(corrupt.campaign.stars['1'], 3);
  assert.equal(corrupt.bestEndless, 0);
  assert.equal(corrupt.selectedTheme, 'classic');
  const local = { ...createDefaultSave('ru'), bestEndless: 900, tutorialCompleted: true };
  const cloud = { ...createDefaultSave('en'), campaign: { unlocked: 12, stars: { 1: 3 }, scores: {} } };
  const merged = mergeSaves(local, cloud, 'ru');
  assert.equal(merged.bestEndless, 900);
  assert.equal(merged.campaign.unlocked, 12);
  assert.equal(merged.tutorialCompleted, true);
});

test('save merge keeps the newest currency balance while preserving purchased themes', () => {
  const local = {
    ...createDefaultSave('en'),
    updatedAt: 200,
    moonShards: 10,
    unlockedThemes: ['classic', 'fire'] as const,
    selectedTheme: 'fire' as const,
  };
  const staleCloud = { ...createDefaultSave('en'), updatedAt: 100, moonShards: 90 };
  const merged = mergeSaves(local, staleCloud, 'en');
  assert.equal(merged.moonShards, 10);
  assert.equal(merged.unlockedThemes.includes('fire'), true);
  assert.equal(merged.selectedTheme, 'fire');

  const wrongClock = mergeSaves(
    { ...local, updatedAt: 100, economyRevision: 2 },
    { ...staleCloud, updatedAt: 9_999, economyRevision: 1 },
    'en',
  );
  assert.equal(wrongClock.moonShards, 10);
});

test('save merge recomputes the current daily streak and preserves divergent counters', () => {
  const base = createDefaultSave('en');
  const local = {
    ...base,
    daily: { ...base.daily, completed: ['2026-09-01'], streak: 30, bestStreak: 30, lastCompleted: '2026-09-01' },
    progressByDevice: {
      legacy: { linesAdded: 10, linesRemoved: 0, runsAdded: 5, runsRemoved: 0 },
      deviceA: { linesAdded: 4, linesRemoved: 0, runsAdded: 1, runsRemoved: 0 },
    },
  };
  const cloud = {
    ...base,
    daily: { ...base.daily, completed: ['2026-09-20'], streak: 1, bestStreak: 1, lastCompleted: '2026-09-20' },
    progressByDevice: {
      legacy: { linesAdded: 10, linesRemoved: 0, runsAdded: 5, runsRemoved: 0 },
      deviceB: { linesAdded: 3, linesRemoved: 0, runsAdded: 1, runsRemoved: 0 },
    },
  };
  const merged = mergeSaves(local, cloud, 'en');
  assert.equal(merged.daily.streak, 1);
  assert.equal(completeDaily(merged, '2026-09-21').daily.streak, 2);
  assert.equal(merged.daily.bestStreak, 30);
  assert.equal(merged.totalLines, 17);
  assert.equal(merged.completedRuns, 7);
  const adjusted = adjustProgress(merged, 2, -1);
  assert.equal(adjusted.totalLines, 19);
  assert.equal(adjusted.completedRuns, 6);
});

test('Russian campaign goals use the correct counted noun form', () => {
  assert.equal(goalText('ru', { type: 'destroyStones', amount: 1 }), 'Разбей 1 камень');
  assert.equal(goalText('ru', { type: 'breakIce', amount: 3 }), 'Разбей 3 льдины');
  assert.equal(goalText('ru', { type: 'collectCrystals', amount: 5 }), 'Собери 5 кристаллов');
  assert.equal(goalText('ru', { type: 'completeSeals', amount: 21 }), 'Заряди 21 печать');
});

test('save selection never merges progress across Yandex player ids', () => {
  const local = { ...createDefaultSave('ru'), playerId: 'player-a', bestEndless: 9_000 };
  const cloud = { ...createDefaultSave('ru'), playerId: 'player-b', campaign: { unlocked: 17, stars: {}, scores: {} } };
  const selected = selectProfileSave(local, cloud, 'player-b', 'ru');
  assert.equal(selected.playerId, 'player-b');
  assert.equal(selected.campaign.unlocked, 17);
  assert.equal(selected.bestEndless, 0);
  const fresh = selectProfileSave(local, null, 'player-b', 'ru');
  assert.equal(fresh.playerId, 'player-b');
  assert.equal(fresh.bestEndless, 0);
});

test('rewarded continuation clears the densest line without touching modifiers', () => {
  const board = createBoard(
    Array.from({ length: 7 }, (_, col) => ({ row: 7, col })),
    [{ row: 7, col: 8, modifier: { type: 'ice', hp: 1 } }],
  );
  const run = { ...blankRun(board), moves: 24 };
  const continuedRun = applyRewardedContinue(run, 'noMoves');
  const continued = continuedRun.board;
  assert.equal(continued[7].every((cell) => !cell.fill), true);
  assert.deepEqual(continued[7][8].modifier, { type: 'ice', hp: 1 });
  assert.equal(continuedRun.bonusMoves, 0);
  assert.equal(continuedRun.continued, true);
});

test('move-limit continuation adds five moves without changing the board', () => {
  const run = { ...blankRun(createEmptyBoard()), moves: 24 };
  const continued = applyRewardedContinue(run, 'moveLimit');
  assert.equal(continued.board, run.board);
  assert.equal(continued.bonusMoves, 5);
  assert.equal(continued.continued, true);
});

test('loss reason distinguishes a spent move limit from a blocked board', () => {
  const limitRun = { ...blankRun(createEmptyBoard()), moves: 12 };
  assert.equal(lossReasonForRun(limitRun, { type: 'score', amount: 100 }, 12), 'moveLimit');
  const blocked = fill(createEmptyBoard(), Array.from({ length: 81 }, (_, index) => [Math.floor(index / 9), index % 9] as [number, number]));
  const blockedRun = { ...blankRun(blocked), tray: [piece('single'), null, null] };
  assert.equal(lossReasonForRun(blockedRun), 'noMoves');
  assert.equal(lossReasonForRun({ ...limitRun, score: 100 }, { type: 'score', amount: 100 }, 12), undefined);
});

test('stat accumulation keeps every campaign objective counter', () => {
  const combined = addStats(
    { ...EMPTY_STATS, stonesDestroyed: 1, crystalsCollected: 2 },
    { ...EMPTY_STATS, iceDestroyed: 3, sealsCompleted: 1 },
  );
  assert.deepEqual(combined, {
    stonesDamaged: 0, stonesDestroyed: 1, iceDamaged: 0, iceDestroyed: 3,
    crystalsCollected: 2, sealsAdvanced: 0, sealsCompleted: 1,
  });
});

test('Yandex integration is idempotent for ready, ads, account events and critical cloud writes', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const listeners = new Map<string, () => void>();
  const cloudWrites: Array<{ flush?: boolean; data: Record<string, unknown> }> = [];
  const leaderboardWrites: Array<{ name: string; score: number; extraData?: string }> = [];
  let readyCalls = 0;
  let rewardedCallbacks: Record<string, (...args: unknown[]) => void> = {};
  let fullscreenCallbacks: Record<string, (...args: unknown[]) => void> = {};
  const sdk = {
    EVENTS: {
      ACCOUNT_SELECTION_DIALOG_OPENED: 'ACCOUNT_OPEN',
      ACCOUNT_SELECTION_DIALOG_CLOSED: 'ACCOUNT_CLOSE',
    },
    features: { LoadingAPI: { ready: () => { readyCalls += 1; } } },
    getPlayer: async () => ({
      getUniqueID: () => 'test-player',
      isAuthorized: () => true,
      getData: async () => ({}),
      setData: async (data: Record<string, unknown>, flush?: boolean) => { cloudWrites.push({ data, flush }); },
    }),
    on: (event: string, callback: () => void) => {
      listeners.set(event, callback);
      return () => listeners.delete(event);
    },
    adv: {
      showRewardedVideo: ({ callbacks }: { callbacks: Record<string, (...args: unknown[]) => void> }) => { rewardedCallbacks = callbacks; },
      showFullscreenAdv: ({ callbacks }: { callbacks: Record<string, (...args: unknown[]) => void> }) => { fullscreenCallbacks = callbacks; },
    },
    leaderboards: {
      setScore: async (name: string, score: number, extraData?: string) => { leaderboardWrites.push({ name, score, extraData }); },
    },
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { YaGames: { init: async () => sdk } } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'games.example' } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en' } });
  try {
    assert.equal(await initYandex(), true);
    await refreshPlayer();
    assert.equal(await submitDailyScore('2026-09-20', 1234), 'sent');
    assert.deepEqual(leaderboardWrites.at(-1), {
      name: DAILY_LEADERBOARD_NAME,
      score: encodeDailyLeaderboardScore('2026-09-20', 1234),
      extraData: JSON.stringify({ dateKey: '2026-09-20', score: 1234 }),
    });
    signalReady();
    signalReady();
    assert.equal(readyCalls, 1);

    let opened = 0;
    let closed = 0;
    const unbind = bindAccountSelection(() => { opened += 1; }, () => { closed += 1; });
    listeners.get('ACCOUNT_OPEN')?.();
    listeners.get('ACCOUNT_CLOSE')?.();
    assert.deepEqual([opened, closed], [1, 1]);
    unbind();
    assert.equal(listeners.has('ACCOUNT_OPEN'), false);

    const rewarded = showRewarded();
    assert.equal(await showRewarded(), false);
    rewardedCallbacks.onRewarded?.();
    rewardedCallbacks.onRewarded?.();
    rewardedCallbacks.onClose?.();
    rewardedCallbacks.onClose?.();
    assert.equal(await rewarded, true);
    const skipped = showRewarded();
    rewardedCallbacks.onClose?.();
    assert.equal(await skipped, false);

    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    let watchdog: (() => void) | undefined;
    let timerCleared = false;
    Object.defineProperty(globalThis, 'setTimeout', {
      configurable: true,
      value: (callback: () => void) => { watchdog = callback; return 77; },
    });
    Object.defineProperty(globalThis, 'clearTimeout', {
      configurable: true,
      value: (timer: number) => { if (timer === 77) timerCleared = true; },
    });
    try {
      const longRewarded = showRewarded();
      let rewardedResolved = false;
      void longRewarded.then(() => { rewardedResolved = true; });
      rewardedCallbacks.onOpen?.();
      assert.equal(timerCleared, true);
      watchdog?.();
      await Promise.resolve();
      assert.equal(rewardedResolved, false);
      rewardedCallbacks.onRewarded?.();
      rewardedCallbacks.onRewarded?.();
      rewardedCallbacks.onClose?.();
      rewardedCallbacks.onClose?.();
      assert.equal(await longRewarded, true);

      timerCleared = false;
      const noReward = showRewarded();
      rewardedCallbacks.onOpen?.();
      watchdog?.();
      await Promise.resolve();
      rewardedCallbacks.onClose?.();
      assert.equal(await noReward, false);

      timerCleared = false;
      const interstitial = showInterstitial();
      let interstitialResolved = false;
      void interstitial.then(() => { interstitialResolved = true; });
      fullscreenCallbacks.onOpen?.();
      watchdog?.();
      await Promise.resolve();
      assert.equal(interstitialResolved, false);
      fullscreenCallbacks.onClose?.(false);
      assert.equal(await interstitial, true);
    } finally {
      Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: previousSetTimeout });
      Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: previousClearTimeout });
    }

    Object.defineProperty(globalThis, 'setTimeout', {
      configurable: true,
      value: (callback: () => void) => { queueMicrotask(callback); return 1; },
    });
    try {
      assert.equal(await showRewarded(), false);
      assert.equal(await showInterstitial(), false);
      assert.ok(fullscreenCallbacks);
    } finally {
      Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: previousSetTimeout });
    }

    const criticalSave = createDefaultSave('en');
    const critical = queueCloudSave(criticalSave, true);
    assert.ok(critical);
    assert.equal(await critical, true);
    assert.equal(cloudWrites.at(-1)?.flush, true);
    const writeCount = cloudWrites.length;
    assert.equal(await queueCloudSave(criticalSave, true), true);
    assert.equal(cloudWrites.length, writeCount);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
    else Reflect.deleteProperty(globalThis, 'location');
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
