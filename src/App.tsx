import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setAudioPaused, setAudioPreferences, playSound, unlockAudio, vibrate } from './audio.ts';
import { GameCanvas } from './components/GameCanvas.tsx';
import {
  BIOMES,
  CAMPAIGN_LEVELS,
  dailyChallengeFor,
  mechanicLearnedFromMove,
  mechanicTutorialStep,
  millisecondsUntilNextUtcDay,
  utcDateKey,
} from './game/campaign.ts';
import {
  addStats,
  applyRewardedContinue,
  canPlace,
  createBoard,
  goalProgress,
  isGameOver,
  isGoalComplete,
  lossReasonForRun,
  placeAndResolve,
  starsForLevel,
} from './game/engine.ts';
import { createPieceInstance, findFirstPlacement, generateTray, hashSeed, PIECE_BY_ID } from './game/pieces.ts';
import {
  EMPTY_STATS,
  type Coord,
  type DailyChallenge,
  type GameMode,
  type LevelDefinition,
  type LossReason,
  type Mechanic,
  type RunState,
} from './game/types.ts';
import { biomeText, formatNumber, GAME_DESCRIPTIONS, GAME_TITLES, goalText, mechanicText, t } from './i18n.ts';
import {
  adjustProgress,
  completeDaily,
  completeTutorial,
  createDefaultSave,
  doubleDailyReward,
  readLocalSave,
  SAVE_KEY,
  selectProfileSave,
  totalCampaignStars,
  writeLocalSave,
  type SaveData,
} from './save.ts';
import { THEMES, themeById } from './themeData.ts';
import {
  authorizeForLeaderboard,
  bindAccountSelection,
  bindPlatformPause,
  currentPlayerId,
  initYandex,
  isLocalEnvironment,
  loadDailyLeaderboard,
  portalLanguage,
  preloadCriticalAssets,
  queueCloudSave,
  readCloudSave,
  refreshPlayer,
  resumeCloudSync,
  rewardedAvailable,
  setCloudSyncPaused,
  setGameplayActive,
  showInterstitial,
  showRewarded,
  signalReady,
  submitDailyScore,
  type DailyLeaderboardEntry,
  type DailyScoreSubmission,
} from './yandex.ts';

type Screen = 'menu' | 'campaign' | 'daily' | 'themes' | 'settings' | 'achievements' | 'game';
type TutorialStage = 'pick' | 'drag' | 'lineGone' | 'three' | 'done';
type DailySubmissionState = 'idle' | 'sending' | DailyScoreSubmission;

interface ResultState {
  won: boolean;
  stars: number;
  newRecord: boolean;
  reason?: LossReason;
}

interface CanvasEffectState {
  id: number;
  cleared: readonly Coord[];
  placed: readonly Coord[];
  label?: string;
}

const runDifficulty = (run: RunState): number => run.level?.difficulty ?? (run.mode === 'endless' ? Math.min(.9, run.moves / 120) : .35);

const refillRun = (run: RunState): RunState => {
  const forced = run.sequence.slice(0, 3);
  const generated = generateTray(run.board, run.seed, runDifficulty(run), forced);
  return { ...run, tray: generated.tray, seed: generated.seed, sequence: run.sequence.slice(forced.length) };
};

const createRun = (mode: Exclude<GameMode, 'tutorial'>, level?: LevelDefinition, daily?: DailyChallenge): RunState => {
  const seed = daily?.seed ?? hashSeed(level ? `level-${level.id}` : `endless-${Date.now()}`);
  const board = createBoard(level?.startingCells ?? daily?.startingCells, level?.obstacles ?? daily?.obstacles);
  return refillRun({
    mode, board, tray: [null, null, null], score: 0, lines: 0, combo: 0, maxCombo: 0, maxClear: 0,
    moves: 0, stats: { ...EMPTY_STATS }, seed, sequence: [...(level?.pieceSequence ?? [])], level, daily, continued: false,
    bonusMoves: 0,
  });
};

const tutorialRun = (): RunState => ({
  mode: 'tutorial',
  board: createBoard(Array.from({ length: 6 }, (_, col) => ({ row: 4, col }))),
  tray: [createPieceInstance('h3', 4242, 0), null, null],
  score: 0, lines: 0, combo: 0, maxCombo: 0, maxClear: 0, moves: 0,
  stats: { ...EMPTY_STATS }, seed: 4242, sequence: [], continued: false, bonusMoves: 0,
});

const tutorialComboRun = (score: number, lines: number): RunState => ({
  mode: 'tutorial',
  board: createBoard([
    ...Array.from({ length: 8 }, (_, col) => ({ row: 0, col })),
    ...Array.from({ length: 8 }, (_, col) => ({ row: 1, col })),
    ...Array.from({ length: 7 }, (_, col) => ({ row: 2, col })),
  ]),
  tray: [createPieceInstance('single', 5151, 0), createPieceInstance('single', 5252, 1), createPieceInstance('h2', 5353, 2)],
  score, lines, combo: 0, maxCombo: 1, maxClear: 1, moves: 1,
  stats: { ...EMPTY_STATS }, seed: 5454, sequence: [], continued: false, bonusMoves: 0,
});

const goalForRun = (run: RunState) => run.level?.goal ?? run.daily?.goal;
const moveLimitForRun = (run: RunState) => {
  const limit = run.level?.moveLimit ?? run.daily?.moveLimit;
  return limit === undefined ? undefined : limit + run.bonusMoves;
};

function RuneButton({ children, onClick, className = '', disabled = false, title, ariaLabel }: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  return <button
    type="button"
    className={`rune-button ${className}`}
    disabled={disabled}
    title={title}
    aria-label={ariaLabel}
    onClick={() => { unlockAudio(); playSound('button'); onClick(); }}
  >{children}</button>;
}

function FantasyBackdrop({ biome }: { biome?: string }) {
  return <div className={`fantasy-backdrop ${biome ? `location-${biome}` : ''}`} aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => <span key={index} className="mote" style={{
      left: `${8 + (index * 13) % 84}%`, animationDelay: `${index * -.85}s`,
    }} />)}
  </div>;
}

function HeroIsland() {
  return <div className="hero-island" aria-hidden="true"><span>ᚱ</span></div>;
}

function MechanicIcon({ mechanic, className = '' }: { mechanic: Mechanic; className?: string }) {
  return <span className={`mechanic-icon ${mechanic} ${className}`} aria-hidden="true" />;
}

function Modal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className="modal-scrim" role="presentation"><section className={`stone-panel modal-card ${className}`} role="dialog" aria-modal="true">{children}</section></div>;
}

function BlockedDiagram() {
  return <div className="blocked-diagram" aria-hidden="true">{Array.from({ length: 25 }, (_, index) =>
    <i key={index} className={index === 7 || index === 18 ? 'gap' : ''} />,
  )}</div>;
}

export function App() {
  const initialLanguage = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const [save, setSave] = useState<SaveData>(() => readLocalSave(initialLanguage));
  const [booted, setBooted] = useState(false);
  const [screen, setScreen] = useState<Screen>('menu');
  const [run, setRun] = useState<RunState | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [paused, setPaused] = useState(false);
  const [sdkPaused, setSdkPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(() => document.hidden);
  const [windowBlurred, setWindowBlurred] = useState(false);
  const [accountSelecting, setAccountSelecting] = useState(false);
  const [adPlaying, setAdPlaying] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [mechanicHelp, setMechanicHelp] = useState<Mechanic | null>(null);
  const [activeMechanicTutorial, setActiveMechanicTutorial] = useState<Mechanic | null>(null);
  const [mechanicTutorialStage, setMechanicTutorialStage] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tutorialStage, setTutorialStage] = useState<TutorialStage>('pick');
  const [tutorialComboSeen, setTutorialComboSeen] = useState(false);
  const [effect, setEffect] = useState<CanvasEffectState | null>(null);
  const [hint, setHint] = useState<{ slot: number; row: number; col: number } | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<RunState | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(true);
  const [rewardedUndoUsed, setRewardedUndoUsed] = useState(false);
  const [rewardedShardClaims, setRewardedShardClaims] = useState(0);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [devDate, setDevDate] = useState(utcDateKey());
  const [dailyLeaders, setDailyLeaders] = useState<DailyLeaderboardEntry[]>([]);
  const [dailyLeaderboardState, setDailyLeaderboardState] = useState<'loading' | 'ready' | 'local' | 'unavailable'>('loading');
  const [dailySubmission, setDailySubmission] = useState<DailySubmissionState>('idle');
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);
  const effectId = useRef(0);
  const tutorialTimer = useRef(0);
  const moveTimer = useRef(0);
  const saveRef = useRef(save);
  const flushSaveRef = useRef(false);
  const adUiLockRef = useRef(false);

  const language = save.language;
  const tr = (key: string, values?: Record<string, string | number>) => t(language, key, values);
  const liveDailyDateKey = utcDateKey(new Date(clock));

  const refreshActiveProfile = async (returnToMenu: boolean): Promise<SaveData | null> => {
    setAccountSelecting(true);
    setCloudSyncPaused(true);
    try {
      await refreshPlayer();
      const detected = portalLanguage();
      const hasLocal = localStorage.getItem(SAVE_KEY) !== null;
      const local = hasLocal ? readLocalSave(detected) : null;
      const cloud = await readCloudSave();
      const selected = { ...selectProfileSave(local, cloud, currentPlayerId(), detected), language: detected };
      if (returnToMenu) {
        window.clearTimeout(tutorialTimer.current);
        window.clearTimeout(moveTimer.current);
        setRun(null);
        setResult(null);
        setPaused(false);
        setHelpOpen(false);
        setMechanicHelp(null);
        setActiveMechanicTutorial(null);
        setScreen('menu');
      }
      saveRef.current = selected;
      setSave(selected);
      resumeCloudSync(selected);
      return selected;
    } finally {
      setCloudSyncPaused(false);
      setAccountSelecting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let unbindPause: () => void = () => undefined;
    let unbindAccount: () => void = () => undefined;
    void (async () => {
      const assetsReady = preloadCriticalAssets();
      const hadLocal = localStorage.getItem(SAVE_KEY) !== null;
      const connected = await initYandex();
      if (connected) {
        unbindPause = bindPlatformPause(() => setSdkPaused(true), () => setSdkPaused(false));
        unbindAccount = bindAccountSelection(
          () => {
            void queueCloudSave(saveRef.current, true);
            setCloudSyncPaused(true);
            setAccountSelecting(true);
          },
          () => { void refreshActiveProfile(true); },
        );
        await refreshPlayer();
      }
      const detected = connected ? portalLanguage() : initialLanguage;
      const local = readLocalSave(detected);
      const cloud = connected ? await readCloudSave() : null;
      const stored = selectProfileSave(hadLocal ? local : null, cloud, currentPlayerId(), detected);
      const merged = connected ? { ...stored, language: detected } : stored;
      await assetsReady;
      if (cancelled) return;
      saveRef.current = merged;
      setSave(merged);
      setBooted(true);
    })();
    return () => {
      cancelled = true;
      unbindPause();
      unbindAccount();
    };
  }, []);

  useEffect(() => {
    if (!booted) return;
    const frame = window.requestAnimationFrame(signalReady);
    return () => window.cancelAnimationFrame(frame);
  }, [booted]);

  useEffect(() => {
    if (!booted) return;
    saveRef.current = save;
    writeLocalSave(save);
    const flush = flushSaveRef.current;
    flushSaveRef.current = false;
    void queueCloudSave(save, flush);
    document.documentElement.lang = save.language;
    document.title = GAME_TITLES[save.language];
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = GAME_DESCRIPTIONS[save.language];
    setAudioPreferences(save.settings.music, save.settings.sounds);
  }, [booted, save]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!booted || screen !== 'daily') return;
    let cancelled = false;
    const localScore = save.daily.scores[liveDailyDateKey] ?? 0;
    setDailyLeaderboardState('loading');
    void loadDailyLeaderboard(liveDailyDateKey).then((entries) => {
      if (cancelled) return;
      if (entries) {
        setDailyLeaders(entries);
        setDailyLeaderboardState('ready');
      } else {
        setDailyLeaders(localScore ? [{ rank: 1, score: localScore, name: '', isCurrentPlayer: true }] : []);
        setDailyLeaderboardState(isLocalEnvironment() ? 'local' : 'unavailable');
      }
    });
    return () => { cancelled = true; };
  }, [booted, leaderboardRefresh, liveDailyDateKey, save.daily.scores, screen]);

  const activityBlocked = sdkPaused || documentHidden || windowBlurred || adPlaying || accountSelecting;
  const gameplayActive = screen === 'game' && Boolean(run) && !paused && !activityBlocked
    && !result && !mechanicHelp && !helpOpen && !resolving;
  useEffect(() => { setGameplayActive(gameplayActive); }, [gameplayActive]);
  useEffect(() => { setAudioPaused(activityBlocked || paused); }, [activityBlocked, paused]);

  useEffect(() => {
    const onHidden = () => setDocumentHidden(document.hidden);
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  useEffect(() => {
    const onBlur = () => setWindowBlurred(true);
    const onFocus = () => setWindowBlurred(false);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    const flush = () => queueCloudSave(save, true);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [save]);

  useEffect(() => () => {
    window.clearTimeout(tutorialTimer.current);
    window.clearTimeout(moveTimer.current);
  }, []);

  const mutateSave = (change: (current: SaveData) => SaveData, flush = false) => {
    if (flush) flushSaveRef.current = true;
    setSave((current) => {
      const next = { ...change(current), updatedAt: Date.now() };
      saveRef.current = next;
      return next;
    });
  };

  const resetProgress = () => {
    localStorage.removeItem(SAVE_KEY);
    mutateSave(() => ({ ...createDefaultSave(language), playerId: currentPlayerId() }), true);
    setResetConfirmOpen(false);
  };

  useEffect(() => {
    if (!resetConfirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResetConfirmOpen(false);
      if (event.key === 'Enter') resetProgress();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resetConfirmOpen, language]);

  const resetTransient = () => {
    window.clearTimeout(tutorialTimer.current);
    window.clearTimeout(moveTimer.current);
    setResult(null);
    setPaused(false);
    setHelpOpen(false);
    setMechanicHelp(null);
    setActiveMechanicTutorial(null);
    setMechanicTutorialStage(0);
    setResolving(false);
    setEffect(null);
    setHint(null);
    setUndoSnapshot(null);
    setUndoAvailable(true);
    setRewardedUndoUsed(false);
    setDailySubmission('idle');
    setResetConfirmOpen(false);
  };

  const openMenu = () => {
    resetTransient();
    setRun(null);
    setScreen('menu');
  };

  const startTutorial = () => {
    resetTransient();
    setTutorialStage('pick');
    setTutorialComboSeen(false);
    setRun(tutorialRun());
    setScreen('game');
  };

  const skipTutorial = () => {
    mutateSave(completeTutorial);
    openMenu();
  };

  const startEndless = () => {
    resetTransient();
    setRun(createRun('endless'));
    setScreen('game');
  };

  const startCampaign = (id: number) => {
    const level = CAMPAIGN_LEVELS[Math.max(1, Math.min(100, id)) - 1];
    resetTransient();
    setRun(createRun('campaign', level));
    if (level.introduces && !save.seenMechanics[level.introduces]) setMechanicHelp(level.introduces);
    setScreen('game');
  };

  const startDaily = (dateKey = utcDateKey()) => {
    resetTransient();
    const daily = dailyChallengeFor(dateKey, save.seenMechanics);
    setRun(createRun('daily', undefined, daily));
    setScreen('game');
  };

  const showMoveEffect = (outcome: NonNullable<ReturnType<typeof placeAndResolve>>) => {
    const lineNames = ['spark', 'spark', 'burst', 'enchantment', 'grandEnchantment'];
    const lineLabel = outcome.lines ? tr(lineNames[Math.min(outcome.lines, 4)]) : undefined;
    const label = outcome.combo > 1 ? `${lineLabel ?? tr('combo')} · ${tr('combo')} ×${outcome.combo}` : lineLabel;
    setEffect({ id: ++effectId.current, cleared: outcome.cleared, placed: outcome.placed, label });
    playSound(outcome.lines ? (outcome.combo > 1 ? 'combo' : 'clear') : 'place');
    if (outcome.stats.stonesDamaged || outcome.stats.iceDamaged) playSound('crack');
    vibrate(outcome.lines ? (outcome.combo > 1 ? [30, 25, 45] : 35) : 12, save.settings.vibration);
  };

  const sendDailyResult = async (dateKey: string, score: number, requestAuthorization = false) => {
    setDailySubmission('sending');
    if (requestAuthorization) {
      if (!await authorizeForLeaderboard()) {
        setDailySubmission('auth-required');
        return;
      }
      await refreshActiveProfile(false);
    }
    const status = await submitDailyScore(dateKey, score);
    setDailySubmission(status);
    if (status === 'sent') setLeaderboardRefresh((value) => value + 1);
  };

  const finishRun = (finished: RunState, won: boolean, reason?: LossReason) => {
    const stars = won && finished.level ? starsForLevel(finished.score, finished.moves, finished.level) : 0;
    const newRecord = finished.mode === 'endless' && finished.score > save.bestEndless;
    setResult({ won, stars, newRecord, reason });
    setResolving(false);
    playSound(won ? 'win' : 'lose');
    mutateSave((current) => {
      let next: SaveData = adjustProgress({
        ...current,
        bestEndless: finished.mode === 'endless' ? Math.max(current.bestEndless, finished.score) : current.bestEndless,
        maxCombo: Math.max(current.maxCombo, finished.maxCombo),
      }, finished.lines, 1);
      if (won && finished.level) {
        const id = String(finished.level.id);
        next = {
          ...next,
          campaign: {
            unlocked: Math.max(current.campaign.unlocked, Math.min(100, finished.level.id + 1)),
            stars: { ...current.campaign.stars, [id]: Math.max(current.campaign.stars[id] ?? 0, stars) },
            scores: { ...current.campaign.scores, [id]: Math.max(current.campaign.scores[id] ?? 0, finished.score) },
          },
        };
      }
      if (won && finished.daily) next = completeDaily(next, finished.daily.dateKey, finished.score);
      return next;
    }, true);
    if (won && finished.daily) void sendDailyResult(finished.daily.dateKey, finished.score);
  };

  const evaluateMove = (next: RunState, animate: boolean) => {
    const goal = goalForRun(next);
    const won = Boolean(goal && isGoalComplete(next, goal));
    const limit = moveLimitForRun(next);
    const reason = lossReasonForRun(next, goal, limit);
    const lost = Boolean(reason);
    const delay = animate ? 360 : 0;
    setResolving(Boolean(delay) || won || lost);
    window.clearTimeout(moveTimer.current);
    moveTimer.current = window.setTimeout(() => {
      if (won || lost) finishRun(next, won, reason);
      else setResolving(false);
    }, delay);
  };

  const tutorialDropAllowed = (slot: number, row: number, col: number): boolean => {
    if (!run) return false;
    if (run.mode === 'tutorial') {
      if (tutorialStage === 'pick' || tutorialStage === 'drag') return slot === 0 && row === 4 && col === 6;
      if (tutorialStage !== 'three') return false;
      const piece = run.tray[slot];
      if (piece?.shapeId === 'h2') return row === 2 && col === 7;
      return piece?.shapeId === 'single' && col === 8 && (row === 0 || row === 1) && !run.board[row][col].fill;
    }
    if (activeMechanicTutorial) {
      const guide = mechanicTutorialStep(activeMechanicTutorial, mechanicTutorialStage);
      return run.tray[slot]?.shapeId === guide.shapeId && row === guide.row && col === guide.col;
    }
    return true;
  };

  const placePiece = (slot: number, row: number, col: number) => {
    if (!run || resolving || result || paused || activityBlocked || mechanicHelp || helpOpen) return;
    const piece = run.tray[slot];
    if (!piece || !tutorialDropAllowed(slot, row, col)) return;
    const outcome = placeAndResolve(run.board, piece, row, col, run.combo);
    if (!outcome) return;
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
    showMoveEffect(outcome);

    if (run.mode === 'tutorial') {
      if (tutorialStage === 'pick' || tutorialStage === 'drag') {
        setRun(next);
        setTutorialStage('lineGone');
        setResolving(true);
        tutorialTimer.current = window.setTimeout(() => {
          setRun(tutorialComboRun(next.score, next.lines));
          setTutorialStage('three');
          setResolving(false);
        }, 1250);
        return;
      }
      if (outcome.combo >= 2) setTutorialComboSeen(true);
      if (tray.every((entry) => entry === null)) {
        next = refillRun(next);
        setTutorialStage('done');
        mutateSave(completeTutorial);
      }
      setRun(next);
      return;
    }

    if (activeMechanicTutorial) {
      if (mechanicLearnedFromMove(activeMechanicTutorial, outcome.stats)) {
        const learned = activeMechanicTutorial;
        setActiveMechanicTutorial(null);
        mutateSave((current) => ({
          ...current,
          seenMechanics: { ...current.seenMechanics, [learned]: true },
        }));
      } else if (activeMechanicTutorial === 'seals') {
        setMechanicTutorialStage((stage) => Math.min(2, stage + 1));
      }
    }

    setUndoSnapshot(run);
    if (tray.every((entry) => entry === null)) next = refillRun(next);
    setRun(next);
    setHint(null);
    evaluateMove(next, outcome.lines > 0);
  };

  const requestHint = () => {
    if (!run) return;
    for (let slot = 0; slot < run.tray.length; slot += 1) {
      const piece = run.tray[slot];
      const definition = piece ? PIECE_BY_ID.get(piece.shapeId) : null;
      const position = definition ? findFirstPlacement(run.board, definition) : null;
      if (position) {
        setHint({ slot, ...position });
        window.setTimeout(() => setHint(null), 1800);
        return;
      }
    }
  };

  const undo = () => {
    if (!undoAvailable || !undoSnapshot) return;
    setRun(undoSnapshot);
    setUndoSnapshot(null);
    setUndoAvailable(false);
    setHint(null);
  };

  const runAdRequest = async (request: () => Promise<boolean>): Promise<boolean> => {
    if (adUiLockRef.current) return false;
    adUiLockRef.current = true;
    setGameplayActive(false);
    setAdPlaying(true);
    try {
      return await request();
    } finally {
      adUiLockRef.current = false;
      setAdPlaying(false);
    }
  };

  const requestUndo = async () => {
    if (undoAvailable) {
      undo();
      return;
    }
    const snapshot = undoSnapshot;
    if (!snapshot || rewardedUndoUsed || !rewardedAvailable()) return;
    if (!await runAdRequest(showRewarded)) return;
    setRun(snapshot);
    setUndoSnapshot(null);
    setRewardedUndoUsed(true);
    setHint(null);
    playSound('reward');
  };

  const continueWithReward = async () => {
    if (!run || !result?.reason || run.continued || !rewardedAvailable()) return;
    const rewarded = await runAdRequest(showRewarded);
    if (!rewarded) return;
    mutateSave((current) => adjustProgress(current, -run.lines, -1), true);
    let next = applyRewardedContinue(run, result.reason);
    if (result.reason === 'noMoves' && isGameOver(next.board, next.tray)) {
      next = refillRun({ ...next, tray: [null, null, null] });
    }
    setRun(next);
    setResult(null);
    setPaused(false);
    playSound('reward');
  };

  const claimRewardedShards = async () => {
    if (rewardedShardClaims >= 3 || !rewardedAvailable()) return;
    if (!await runAdRequest(showRewarded)) return;
    setRewardedShardClaims((count) => Math.min(3, count + 1));
    mutateSave((current) => ({
      ...current,
      moonShards: current.moonShards + 15,
      economyRevision: current.economyRevision + 1,
    }), true);
    playSound('reward');
  };

  const claimDailyDouble = async (dateKey: string) => {
    if (saveRef.current.daily.doubled.includes(dateKey) || !rewardedAvailable()) return;
    if (!await runAdRequest(showRewarded)) return;
    mutateSave((current) => doubleDailyReward(current, dateKey), true);
    playSound('reward');
  };

  const maybeInterstitial = async () => {
    const current = saveRef.current;
    const due = current.completedRuns >= 4 && current.completedRuns % 2 === 0
      && Date.now() - current.lastInterstitialAt >= 120_000;
    if (!due) return;
    const shown = await runAdRequest(showInterstitial);
    if (shown) mutateSave((current) => ({ ...current, lastInterstitialAt: Date.now() }));
  };

  const leaveResult = async (target: 'menu' | 'campaign' | 'next' | 'retry') => {
    if (adUiLockRef.current) return;
    await maybeInterstitial();
    if (!run) return;
    if (target === 'retry') {
      if (run.mode === 'endless') startEndless();
      else if (run.mode === 'campaign' && run.level) startCampaign(run.level.id);
      else if (run.mode === 'daily' && run.daily) startDaily(run.daily.dateKey);
      return;
    }
    if (target === 'next' && run.level) { startCampaign(Math.min(100, run.level.id + 1)); return; }
    resetTransient();
    setRun(null);
    setScreen(target === 'campaign' ? 'campaign' : 'menu');
  };

  const canvasTargets = useMemo<Coord[]>(() => {
    if (!run) return [];
    if (run.mode === 'tutorial') {
      if (tutorialStage === 'pick' || tutorialStage === 'drag') return [6, 7, 8].map((col) => ({ row: 4, col }));
      if (tutorialStage === 'three') return [{ row: 0, col: 8 }, { row: 1, col: 8 }, { row: 2, col: 7 }, { row: 2, col: 8 }]
        .filter(({ row, col }) => !run.board[row][col].fill);
      return [];
    }
    return activeMechanicTutorial ? [...mechanicTutorialStep(activeMechanicTutorial, mechanicTutorialStage).targets] : [];
  }, [activeMechanicTutorial, mechanicTutorialStage, run, tutorialStage]);

  const dailyNow = new Date(clock);
  const countdown = (() => {
    const seconds = Math.max(0, Math.floor(millisecondsUntilNextUtcDay(dailyNow) / 1000));
    return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((part) => String(part).padStart(2, '0')).join(':');
  })();

  if (!booted) return <main className="app loading-screen" aria-busy="true" onContextMenu={(event) => event.preventDefault()}><FantasyBackdrop /><div className="loading-rune" /></main>;

  const renderMenu = () => <section className="screen menu-screen">
    <header className="title-lockup"><span className="eyebrow">{tr('menuKicker')}</span><h1>{GAME_TITLES[language]}</h1><p>{tr('tagline')}</p></header>
    <HeroIsland />
    <div className="menu-stats stone-panel">
      <span>★ <b>{totalCampaignStars(save)}</b><small>{tr('stars')}</small></span>
      <span>♨ <b>{save.daily.streak}</b><small>{tr('streak')}</small></span>
      <span>♛ <b>{formatNumber(language, save.bestEndless)}</b><small>{tr('best')}</small></span>
    </div>
    <nav className="main-actions" aria-label={tr('mainMenu')}>
      <RuneButton className="primary wide" onClick={() => startCampaign(save.campaign.unlocked)}><span>◆</span>{tr('continue')}<small>{tr('level')} {save.campaign.unlocked}</small></RuneButton>
      <div className="menu-grid">
        <RuneButton onClick={() => setScreen('campaign')}><span>♜</span>{tr('campaign')}</RuneButton>
        <RuneButton onClick={startEndless}><span>∞</span>{tr('endless')}</RuneButton>
      </div>
      <RuneButton className="daily-button wide" onClick={() => setScreen('daily')}><span>☾</span><b>{tr('daily')}</b><small>{tr('newIn')} {countdown}</small></RuneButton>
      <div className="small-actions">
        <RuneButton onClick={() => setScreen('themes')}>❖ {tr('themes')}</RuneButton>
        <RuneButton onClick={() => setScreen('achievements')}>♛ {tr('achievements')}</RuneButton>
        <RuneButton onClick={() => setScreen('settings')}>⚙ {tr('settings')}</RuneButton>
      </div>
    </nav>
  </section>;

  const renderCampaign = () => <section className="screen page-screen campaign-screen">
    <header className="page-header"><RuneButton className="icon-button" onClick={() => setScreen('menu')}>‹</RuneButton><div><span>{tr('campaign')}</span><h2>{totalCampaignStars(save)} / 300 ★</h2></div></header>
    <div className="campaign-scroll">
      {BIOMES.map((biome, biomeIndex) => <section key={biome} className={`chapter-card biome-${biome}`}>
        <header><small>{tr('chapter')} {biomeIndex + 1}</small><h3>{biomeText(language, biome)}</h3></header>
        <div className="level-path">
          {CAMPAIGN_LEVELS.slice(biomeIndex * 20, biomeIndex * 20 + 20).map((level) => {
            const unlocked = level.id <= save.campaign.unlocked;
            const stars = save.campaign.stars[String(level.id)] ?? 0;
            return <button
              type="button"
              key={level.id}
              className={`level-island ${unlocked ? 'unlocked' : 'locked'} ${level.id === save.campaign.unlocked ? 'current' : ''}`}
              disabled={!unlocked}
              onClick={() => { unlockAudio(); playSound('button'); startCampaign(level.id); }}
              aria-label={`${tr('level')} ${level.id}`}
            ><b>{unlocked ? level.id : '◆'}</b><span>{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</span></button>;
          })}
        </div>
      </section>)}
    </div>
  </section>;

  const renderDaily = () => {
    const dateKey = liveDailyDateKey;
    const challenge = dailyChallengeFor(dateKey, save.seenMechanics);
    const year = dailyNow.getUTCFullYear();
    const month = dailyNow.getUTCMonth();
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const monthLabel = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dailyNow);
    return <section className="screen page-screen daily-screen">
      <header className="page-header"><RuneButton className="icon-button" onClick={() => setScreen('menu')}>‹</RuneButton><div><span>{tr('daily')}</span><h2>{tr('dailyTitle')}</h2></div></header>
      <div className="daily-layout">
        <article className="stone-panel daily-ritual">
          <div className="daily-moon">☾</div><span className="eyebrow">{dateKey}</span><h3>{goalText(language, challenge.goal)}</h3>
          <p>{tr('newIn')} <b>{countdown}</b></p>
          <div className="reward-chip">+15 ◈ {tr('shards')}</div>
          <RuneButton className="primary wide" onClick={() => startDaily(dateKey)}>{save.daily.completed.includes(dateKey) ? tr('alreadyCompleted') : tr('play')}</RuneButton>
        </article>
        <article className="stone-panel calendar-card"><h3>{tr('calendar')} · {monthLabel}</h3>
          <div className="calendar-grid">
            {Array.from({ length: firstDay }, (_, index) => <i key={`empty-${index}`} />)}
            {Array.from({ length: days }, (_, index) => {
              const day = index + 1;
              const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              return <span key={key} className={`${save.daily.completed.includes(key) ? 'complete' : ''} ${key === dateKey ? 'today' : ''}`}>{day}{save.daily.completed.includes(key) && <b>★</b>}</span>;
            })}
          </div>
        </article>
        <article className="stone-panel leaderboard-card">
          <header><h3>{tr('dailyLeaderboard')}</h3><small>{dateKey}</small></header>
          {dailyLeaderboardState === 'loading' && <p className="leaderboard-note">{tr('leaderboardLoading')}</p>}
          {dailyLeaderboardState !== 'loading' && dailyLeaders.length > 0 && <table>
            <thead><tr><th>#</th><th>{tr('player')}</th><th>{tr('score')}</th></tr></thead>
            <tbody>{dailyLeaders.slice(0, 10).map((entry) => <tr key={`${entry.rank}-${entry.name}-${entry.score}`} className={entry.isCurrentPlayer ? 'current-player' : ''}>
              <td>{entry.rank}</td><td>{entry.name || tr(entry.isCurrentPlayer ? 'you' : 'anonymousPlayer')}</td><td>{formatNumber(language, entry.score)}</td>
            </tr>)}</tbody>
          </table>}
          {dailyLeaderboardState !== 'loading' && dailyLeaders.length === 0 && <p className="leaderboard-note">{tr('leaderboardEmpty')}</p>}
          {dailyLeaderboardState === 'local' && <p className="leaderboard-hint">{tr('leaderboardLocal')}</p>}
          {dailyLeaderboardState === 'unavailable' && <p className="leaderboard-hint">{tr('leaderboardUnavailable')}</p>}
        </article>
        <div className="streak-cards"><span><small>{tr('currentStreak')}</small><b>♨ {save.daily.streak}</b></span><span><small>{tr('bestStreak')}</small><b>♨ {save.daily.bestStreak}</b></span></div>
      </div>
    </section>;
  };

  const renderThemes = () => <section className="screen page-screen">
    <header className="page-header"><RuneButton className="icon-button" onClick={() => setScreen('menu')}>‹</RuneButton><div><span>{tr('themes')}</span><h2>◈ {save.moonShards} {tr('shards')}</h2></div></header>
    <p className="page-note">{tr('cosmeticOnly')}</p>
    {rewardedAvailable() && <article className="stone-panel reward-ad-card">
      <RuneButton className="rewarded wide" disabled={adPlaying || rewardedShardClaims >= 3} onClick={() => { void claimRewardedShards(); }}>
        ▶ {rewardedShardClaims >= 3 ? tr('rewardedSessionLimit') : tr('rewardedShards')}
      </RuneButton>
      {rewardedShardClaims < 3 && <p>{tr('rewardedShardsLeft', { count: 3 - rewardedShardClaims })}</p>}
    </article>}
    <div className="theme-grid">{THEMES.map((theme) => {
      const unlocked = save.unlockedThemes.includes(theme.id);
      const selected = save.selectedTheme === theme.id;
      return <article key={theme.id} className={`stone-panel theme-card ${selected ? 'active' : ''}`} style={{ '--theme-accent': theme.accent, '--theme-board': theme.board } as React.CSSProperties}>
        <div className="theme-preview">{Object.values(theme.blocks).slice(0, 6).map((color, index) => <i key={index} style={{ background: color }} />)}</div>
        <h3>{tr(theme.nameKey)}</h3>
        <RuneButton className={selected ? 'selected' : ''} disabled={selected || adPlaying || (!unlocked && save.moonShards < theme.cost)} onClick={() => mutateSave((current) => {
          if (current.unlockedThemes.includes(theme.id)) return { ...current, selectedTheme: theme.id };
          if (current.moonShards < theme.cost) return current;
          return {
            ...current,
            moonShards: current.moonShards - theme.cost,
            economyRevision: current.economyRevision + 1,
            unlockedThemes: [...current.unlockedThemes, theme.id],
            selectedTheme: theme.id,
          };
        }, !unlocked)}>{selected ? tr('selected') : unlocked ? tr('select') : `${tr('unlock')} · ${theme.cost} ◈`}</RuneButton>
      </article>;
    })}</div>
  </section>;

  const renderAchievements = () => {
    const stars = totalCampaignStars(save);
    const items = [
      ['achievementFirst', 'achievementFirstBody', save.totalLines >= 1, `${Math.min(save.totalLines, 1)}/1`],
      ['achievementCombo', 'achievementComboBody', save.maxCombo >= 4, `${Math.min(save.maxCombo, 4)}/4`],
      ['achievementStars', 'achievementStarsBody', stars >= 30, `${Math.min(stars, 30)}/30`],
      ['achievementDaily', 'achievementDailyBody', save.daily.bestStreak >= 7, `${Math.min(save.daily.bestStreak, 7)}/7`],
    ] as const;
    return <section className="screen page-screen"><header className="page-header"><RuneButton className="icon-button" onClick={() => setScreen('menu')}>‹</RuneButton><div><span>{tr('achievements')}</span><h2>{tr('achievementsTitle')}</h2></div></header>
      <div className="achievement-list">{items.map(([title, body, achieved, progress], index) => <article key={title} className={`stone-panel achievement ${achieved ? 'achieved' : ''}`}>
        <span className="achievement-icon">{['✦', '⛓', '♜', '☀'][index]}</span><div><h3>{tr(title)}</h3><p>{tr(body)}</p></div><b>{achieved ? '★' : progress}</b>
      </article>)}</div>
    </section>;
  };

  const renderSettings = () => <section className="screen page-screen"><header className="page-header"><RuneButton className="icon-button" onClick={() => setScreen('menu')}>‹</RuneButton><div><span>{tr('settings')}</span><h2>⚙</h2></div></header>
    <div className="settings-list stone-panel">
      {(['music', 'sounds', 'vibration'] as const).map((setting) => <button type="button" key={setting} onClick={() => mutateSave((current) => ({ ...current, settings: { ...current.settings, [setting]: !current.settings[setting] } }))}><span>{tr(setting)}</span><b className={save.settings[setting] ? 'toggle on' : 'toggle'}>{save.settings[setting] ? tr('on') : tr('off')}</b></button>)}
      <button type="button" onClick={() => mutateSave((current) => ({ ...current, language: current.language === 'ru' ? 'en' : 'ru' }))}><span>{tr('language')}</span><b>RU / EN</b></button>
      <button type="button" onClick={startTutorial}><span>{tr('replayTutorial')}</span><b>›</b></button>
    </div>
    <div className="help-summary stone-panel"><h3>{tr('howToPlay')}</h3><p>{tr('helpBasics')}</p><p className="muted">{tr('keyboardHelp')}</p></div>
    {import.meta.env.DEV && <details className="stone-panel dev-tools"><summary>{tr('devTools')}</summary>
      <RuneButton onClick={() => mutateSave((current) => ({
        ...current,
        moonShards: current.moonShards + 999,
        economyRevision: current.economyRevision + 1,
        unlockedThemes: THEMES.map((theme) => theme.id),
      }))}>{tr('devShards')}</RuneButton>
      <label>{tr('devLevel')}<input type="number" min="1" max="100" defaultValue={save.campaign.unlocked} onChange={(event) => mutateSave((current) => ({ ...current, campaign: { ...current.campaign, unlocked: Math.max(1, Math.min(100, Number(event.target.value))) } }))} /></label>
      <label>{tr('devDaily')}<input type="date" value={devDate} onChange={(event) => setDevDate(event.target.value)} /></label>
      <RuneButton onClick={() => startDaily(devDate)}>{tr('daily')}</RuneButton>
      <RuneButton className="danger" onClick={() => setResetConfirmOpen(true)}>{tr('resetSave')}</RuneButton>
    </details>}
    {resetConfirmOpen && <Modal><h2>{tr('resetConfirmTitle')}</h2><p>{tr('resetConfirmBody')}</p>
      <RuneButton className="danger wide" onClick={resetProgress}>{tr('resetConfirm')}</RuneButton>
      <RuneButton className="ghost wide" onClick={() => setResetConfirmOpen(false)}>{tr('cancel')}</RuneButton>
    </Modal>}
  </section>;

  const renderGame = () => {
    if (!run) return null;
    const goal = goalForRun(run);
    const limit = moveLimitForRun(run);
    const progress = goal ? goalProgress(run, goal) : 0;
    const gameTitle = run.mode === 'endless' ? tr('endless') : run.mode === 'daily' ? tr('daily')
      : run.mode === 'campaign' ? `${tr('level')} ${run.level?.id}` : tr('tutorialStart');
    const prompt = tutorialStage === 'pick' ? tr('tutorialPick') : tutorialStage === 'drag' ? tr('tutorialDrag')
      : tutorialStage === 'lineGone' ? `${tr('tutorialLineGone')} ${tr('tutorialBoth')}`
        : tutorialComboSeen ? tr('tutorialCombo') : tr('tutorialThree');
    const mechanicPrompt = activeMechanicTutorial === 'seals'
      ? tr(mechanicTutorialStage === 0 ? 'trySealsFirst' : mechanicTutorialStage === 1 ? 'trySealsFill' : 'trySealsFinish')
      : activeMechanicTutorial ? tr(`try${activeMechanicTutorial[0].toUpperCase()}${activeMechanicTutorial.slice(1)}`) : '';
    return <section className={`screen game-screen theme-${save.selectedTheme} ${(run.mode === 'tutorial' || activeMechanicTutorial) ? 'has-tutorial' : ''}`}>
      <header className="game-header">
        <RuneButton className="icon-button" onClick={() => run.mode === 'tutorial' ? skipTutorial() : setPaused(true)}>☰</RuneButton>
        <div className="mode-title"><small>{gameTitle}</small>{goal && <b>{goalText(language, goal)}</b>}</div>
        <RuneButton className="icon-button" onClick={() => setPaused(true)}>Ⅱ</RuneButton>
      </header>
      <div className="hud-strip stone-panel">
        <span><small>{tr('score')}</small><b>{formatNumber(language, run.score)}</b></span>
        {run.mode === 'endless' && <span><small>{tr('best')}</small><b>{formatNumber(language, Math.max(save.bestEndless, run.score))}</b></span>}
        {goal && <span className="goal-progress"><small>{tr('goal')}</small><b>{Math.min(progress, goal.amount)} / {goal.amount}</b></span>}
        <span><small>{tr('combo')}</small><b>×{run.combo}</b></span>
        <span><small>{tr('lines')}</small><b>{run.lines}</b></span>
        {limit && <span><small>{tr('moves')}</small><b>{Math.max(0, limit - run.moves)}</b></span>}
      </div>
      {run.mode === 'tutorial' && tutorialStage !== 'done' && <div className="tutorial-bubble"><i />{prompt}<RuneButton className="tutorial-skip" onClick={skipTutorial}>{tr('skip')}</RuneButton></div>}
      {activeMechanicTutorial && <div className="tutorial-bubble mechanic-guide"><i />{mechanicPrompt}</div>}
      <GameCanvas
        board={run.board}
        tray={run.tray}
        theme={save.selectedTheme}
        disabled={resolving || Boolean(result) || paused || activityBlocked || Boolean(mechanicHelp) || helpOpen || tutorialStage === 'lineGone' || tutorialStage === 'done'}
        effect={effect}
        hint={hint}
        targets={canvasTargets}
        ariaLabel={`${gameTitle}. ${tr('keyboardHelp')}`}
        canDrop={tutorialDropAllowed}
        onDragStart={() => { unlockAudio(); playSound('pickup'); if (run.mode === 'tutorial' && tutorialStage === 'pick') setTutorialStage('drag'); }}
        onPlace={placePiece}
        onInvalid={() => vibrate(18, save.settings.vibration)}
      />
      {run.mode !== 'tutorial' && <div className="game-controls">
        <RuneButton
          onClick={() => { void requestUndo(); }}
          ariaLabel={undoAvailable ? tr('undo') : tr('rewardedUndo')}
          title={undoAvailable ? tr('undo') : tr('rewardedUndoHelp')}
          disabled={!undoSnapshot || adPlaying || Boolean(activeMechanicTutorial)
            || (!undoAvailable && (rewardedUndoUsed || !rewardedAvailable()))}
        >{undoAvailable ? '↶' : '▶'} <span>{undoAvailable ? tr('undo') : tr('rewardedUndo')}</span></RuneButton>
        <RuneButton onClick={requestHint} disabled={adPlaying || Boolean(activeMechanicTutorial)}>✦ <span>{tr('hint')}</span></RuneButton>
        <RuneButton onClick={() => setPaused(true)} disabled={adPlaying}>Ⅱ <span>{tr('pause')}</span></RuneButton>
      </div>}
      {mechanicHelp && <Modal className="mechanic-modal"><MechanicIcon mechanic={mechanicHelp} className="mechanic-emblem" /><small>{tr('newInChapter')}</small><h2>{tr(`mechanic${mechanicHelp[0].toUpperCase()}${mechanicHelp.slice(1)}`)}</h2><p>{mechanicText(language, mechanicHelp)}</p><RuneButton className="primary wide" onClick={() => { setActiveMechanicTutorial(mechanicHelp); setMechanicTutorialStage(0); setMechanicHelp(null); }}>{tr('understood')}</RuneButton></Modal>}
      {paused && !helpOpen && <Modal><h2>{tr('paused')}</h2><RuneButton className="primary wide" onClick={() => setPaused(false)}>{tr('resume')}</RuneButton><RuneButton className="wide" onClick={() => setHelpOpen(true)}>{tr('howToPlay')}</RuneButton>{import.meta.env.DEV && <RuneButton className="danger wide" onClick={() => finishRun(run, false, 'noMoves')}>{tr('forceGameOver')}</RuneButton>}<RuneButton className="ghost wide" onClick={openMenu}>{tr('menu')}</RuneButton></Modal>}
      {helpOpen && <Modal className="help-modal"><h2>{tr('mechanics')}</h2><div className="mechanic-help-list">
        {([['basics', 'helpBasics', null], ['mechanicStones', 'helpStones', 'stones'], ['mechanicIce', 'helpIce', 'ice'], ['mechanicCrystals', 'helpCrystals', 'crystals'], ['mechanicSeals', 'helpSeals', 'seals']] as const).map(([title, body, mechanic]) => <article key={title}>{mechanic ? <MechanicIcon mechanic={mechanic} className="help-mechanic-icon" /> : <b>✦</b>}<div><h3>{tr(title)}</h3><p>{tr(body)}</p></div></article>)}
      </div><RuneButton className="primary wide" onClick={() => setHelpOpen(false)}>{tr('back')}</RuneButton></Modal>}
      {run.mode === 'tutorial' && tutorialStage === 'done' && <Modal className="tutorial-done"><BlockedDiagram /><h2>{tr('tutorialDone')}</h2><p>{tr('tutorialGameOver')}</p><RuneButton className="primary wide" onClick={() => startCampaign(1)}>{tr('tutorialPlay')}</RuneButton><RuneButton className="ghost" onClick={openMenu}>{tr('menu')}</RuneButton></Modal>}
      {result && <Modal className={`result-modal ${result.won ? 'won' : ''}`}>
        <span className="result-emblem">{result.won ? '✦' : '☾'}</span><small>{result.won ? tr('objectiveComplete') : tr('result')}</small><h2>{result.won ? tr('victory') : tr(result.reason === 'moveLimit' ? 'moveLimitReached' : 'gameOver')}</h2>
        {result.newRecord && <div className="new-record">{tr('newRecord')}</div>}
        {result.stars > 0 && <div className="result-stars">{'★'.repeat(result.stars)}{'☆'.repeat(3 - result.stars)}</div>}
        <div className="result-stats"><span><small>{tr('score')}</small><b>{formatNumber(language, run.score)}</b></span><span><small>{tr('best')}</small><b>{formatNumber(language, run.mode === 'endless' ? Math.max(save.bestEndless, run.score) : run.level ? save.campaign.scores[String(run.level.id)] ?? run.score : run.score)}</b></span><span><small>{tr('lines')}</small><b>{run.lines}</b></span><span><small>{tr('maxCombo')}</small><b>×{run.maxCombo}</b></span></div>
        {result.won && run.daily && <div className="daily-submission">
          {!save.daily.doubled.includes(run.daily.dateKey) && rewardedAvailable() && <RuneButton
            className="rewarded wide"
            disabled={adPlaying}
            onClick={() => { void claimDailyDouble(run.daily!.dateKey); }}
          >▶ {tr('dailyDouble')}<small>{tr('dailyDoubleHelp')}</small></RuneButton>}
          {save.daily.doubled.includes(run.daily.dateKey) && <p className="success">✓ {tr('dailyDoubleDone')}</p>}
          {dailySubmission === 'sending' && <p>{tr('scoreSending')}</p>}
          {dailySubmission === 'sent' && <p className="success">✓ {tr('scoreSent')}</p>}
          {dailySubmission === 'local' && <p>{tr('scoreSavedLocal')}</p>}
          {dailySubmission === 'unavailable' && <p>{tr('scoreSendUnavailable')}</p>}
          {dailySubmission === 'auth-required' && <><p>{tr('signInBenefit')}</p><RuneButton className="wide" disabled={accountSelecting || adPlaying} onClick={() => { void sendDailyResult(run.daily!.dateKey, run.score, true); }}>{tr('signInAndSend')}</RuneButton></>}
        </div>}
        {!result.won && !run.continued && rewardedAvailable() && <RuneButton className="rewarded wide" disabled={adPlaying} onClick={() => { void continueWithReward(); }}>▶ {tr('continueAd')}<small>{tr(result.reason === 'moveLimit' ? 'continueMoves' : 'continueHelp')}</small></RuneButton>}
        <div className="result-actions">
          {result.won && run.level && run.level.id < 100 && <RuneButton className="primary" disabled={adPlaying} onClick={() => { void leaveResult('next'); }}>{tr('nextLevel')}</RuneButton>}
          <RuneButton disabled={adPlaying} onClick={() => { void leaveResult('retry'); }}>{tr('retry')}</RuneButton>
          {run.mode === 'campaign' && <RuneButton disabled={adPlaying} onClick={() => { void leaveResult('campaign'); }}>{tr('campaignMap')}</RuneButton>}
          <RuneButton className="ghost" disabled={adPlaying} onClick={() => { void leaveResult('menu'); }}>{tr('menu')}</RuneButton>
        </div>
      </Modal>}
    </section>;
  };

  const activeBiome = screen === 'game' && run?.mode === 'campaign' ? run.level?.biome : undefined;
  return <main
    className="app"
    style={{ '--active-accent': themeById(save.selectedTheme).accent } as React.CSSProperties}
    onContextMenu={(event) => event.preventDefault()}
    onDragStart={(event) => event.preventDefault()}
  >
    <FantasyBackdrop biome={activeBiome} />
    {screen === 'menu' && renderMenu()}
    {screen === 'menu' && !save.tutorialCompleted && <Modal className="welcome-card">
      <span className="modal-rune">ᚱ</span><h2>{tr('tutorialWelcome')}</h2><p>{tr('tutorialWelcomeBody')}</p>
      <RuneButton className="primary wide" onClick={startTutorial}>{tr('tutorialStart')}</RuneButton>
      <RuneButton className="ghost" onClick={skipTutorial}>{tr('skip')}</RuneButton>
    </Modal>}
    {screen === 'campaign' && renderCampaign()}
    {screen === 'daily' && renderDaily()}
    {screen === 'themes' && renderThemes()}
    {screen === 'achievements' && renderAchievements()}
    {screen === 'settings' && renderSettings()}
    {screen === 'game' && renderGame()}
    {adPlaying && <div className="modal-scrim ad-overlay" role="presentation"><section className="stone-panel modal-card" role="dialog" aria-modal="true" aria-live="polite">
      <div className="ad-spinner" aria-hidden="true" /><p>{tr('adOpening')}</p>
    </section></div>}
    {accountSelecting && !adPlaying && <div className="modal-scrim ad-overlay" role="presentation"><section className="stone-panel modal-card" role="dialog" aria-modal="true" aria-live="polite">
      <div className="ad-spinner" aria-hidden="true" /><p>{tr('profileSwitching')}</p>
    </section></div>}
  </main>;
}
