import type { Language } from './game/types.ts';
import type { SaveData } from './save.ts';
import { SAVE_KEY } from './save.ts';

interface AdCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown?: boolean) => void;
  onError?: (error?: unknown) => void;
  onRewarded?: () => void;
}

interface YandexPlayer {
  getUniqueID?(): string;
  isAuthorized?(): boolean;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

interface YandexLeaderboardEntry {
  extraData?: string;
  rank?: number;
  score: number;
  player?: { publicName?: string; uniqueID?: string };
}

interface YandexSdk {
  EVENTS?: {
    ACCOUNT_SELECTION_DIALOG_OPENED?: string;
    ACCOUNT_SELECTION_DIALOG_CLOSED?: string;
  };
  environment?: { i18n?: { lang?: string } };
  features?: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  adv?: {
    showRewardedVideo(options: { callbacks: AdCallbacks }): void;
    showFullscreenAdv(options: { callbacks: AdCallbacks }): void;
  };
  auth?: { openAuthDialog(): Promise<void> };
  leaderboards?: {
    setScore(name: string, score: number, extraData?: string): Promise<void>;
    getEntries(name: string, options: { includeUser?: boolean; quantityAround?: number; quantityTop?: number }): Promise<{
      entries?: YandexLeaderboardEntry[];
    }>;
  };
  getPlayer?(options?: { scopes?: boolean }): Promise<YandexPlayer>;
  isAvailableMethod?(name: string): Promise<boolean>;
  on?(event: string, callback: () => void): void | (() => void);
  off?(event: string, callback: () => void): void;
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSdk> };
  }
}

type ViteMeta = ImportMeta & { env?: { BASE_URL?: string; DEV?: boolean } };

let sdk: YandexSdk | null = null;
let player: YandexPlayer | null = null;
let playerId: string | null = null;
let readySent = false;
let gameplayActive = false;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
let cloudSyncPaused = false;
let deferredCloudSave: SaveData | null = null;
let cloudWriteQueue: Promise<boolean> = Promise.resolve(true);
let lastCloudWriteTarget: YandexPlayer | null = null;
let lastCloudWritePayload = '';
let adPending = false;
const loggedWarnings = new Set<string>();

const baseUrl = (import.meta as ViteMeta).env?.BASE_URL ?? './';
export const DAILY_LEADERBOARD_NAME = 'dailyscore';
export const CRITICAL_ASSET_URLS = [
  `${baseUrl}pixel-isles-bg.png`,
  `${baseUrl}menu-puzzle-sanctuary.png`,
  `${baseUrl}mechanic-tiles.png`,
] as const;
export const AD_WATCHDOG_MS = 20_000;
const DAILY_SCORE_FACTOR = 10_000_000;

export type DailyScoreSubmission = 'sent' | 'auth-required' | 'local' | 'unavailable';

export interface DailyLeaderboardEntry {
  rank: number;
  score: number;
  name: string;
  isCurrentPlayer: boolean;
}

const warn = (operation: string, error: unknown): void => {
  if (loggedWarnings.has(operation)) return;
  loggedWarnings.add(operation);
  console.warn(`[Yandex] ${operation}`, error);
};

const withTimeout = async <T>(task: Promise<T>, milliseconds = 8000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('Yandex SDK timeout')), milliseconds); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const loadPlayer = async (): Promise<string | null> => {
  if (!sdk?.getPlayer) {
    player = null;
    playerId = null;
    return null;
  }
  try {
    await cloudWriteQueue;
    player = await withTimeout(sdk.getPlayer({ scopes: false }), 5000);
    playerId = player.getUniqueID?.() || null;
  } catch (error) {
    warn('player initialization failed', error);
    player = null;
    playerId = null;
  }
  return playerId;
};

export const isLocalEnvironment = (): boolean => ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
const hasDevelopmentAdMock = (): boolean => Boolean((import.meta as ViteMeta).env?.DEV) && isLocalEnvironment();

export const initYandex = async (): Promise<boolean> => {
  if (!window.YaGames?.init) return false;
  try {
    sdk = await withTimeout(window.YaGames.init());
    return true;
  } catch (error) {
    warn('SDK initialization failed', error);
    sdk = null;
    player = null;
    playerId = null;
    return false;
  }
};

export const refreshPlayer = (): Promise<string | null> => loadPlayer();
export const currentPlayerId = (): string | null => playerId;

const methodAvailable = async (name: string): Promise<boolean> => {
  if (!sdk?.isAvailableMethod) return true;
  try {
    return await withTimeout(sdk.isAvailableMethod(name), 5000);
  } catch (error) {
    warn(`method availability check failed: ${name}`, error);
    return false;
  }
};

const preloadImage = (source: string): Promise<boolean> => new Promise((resolve) => {
  const image = new Image();
  let settled = false;
  const canDecode = typeof image.decode === 'function';
  const finish = (loaded: boolean, error?: unknown) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    image.onload = null;
    image.onerror = null;
    if (error) warn(`critical asset fallback: ${source}`, error);
    resolve(loaded);
  };
  const timeout = setTimeout(() => finish(false, new Error('image preload timeout')), 8000);
  image.onload = () => {
    if (!canDecode) finish(true);
    else void image.decode().then(() => finish(true)).catch((error) => finish(false, error));
  };
  image.onerror = () => finish(false, new Error('image load failed'));
  image.src = source;
});

export const preloadCriticalAssets = async (): Promise<void> => {
  const fontsReady = typeof document !== 'undefined' && document.fonts?.ready
    ? document.fonts.ready.catch((error) => warn('font preload fallback', error))
    : Promise.resolve();
  const results = await Promise.all(CRITICAL_ASSET_URLS.map(preloadImage));
  await fontsReady;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('critical-assets-fallback', results.some((loaded) => !loaded));
  }
};

const dateBucket = (dateKey: string): number => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return -1;
  const timestamp = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 86_400_000) : -1;
};

export const encodeDailyLeaderboardScore = (dateKey: string, score: number): number => {
  const bucket = dateBucket(dateKey);
  const safeScore = Math.max(0, Math.min(DAILY_SCORE_FACTOR - 1, Math.floor(score)));
  return bucket < 0 ? safeScore : bucket * DAILY_SCORE_FACTOR + safeScore;
};

export const authorizeForLeaderboard = async (): Promise<boolean> => {
  if (player?.isAuthorized?.()) return true;
  if (!sdk?.auth?.openAuthDialog) return false;
  try {
    await withTimeout(sdk.auth.openAuthDialog(), 120_000);
    await loadPlayer();
    return Boolean(player?.isAuthorized?.());
  } catch (error) {
    warn('authorization dialog failed', error);
    return false;
  }
};

export const submitDailyScore = async (dateKey: string, score: number): Promise<DailyScoreSubmission> => {
  if (!sdk) return isLocalEnvironment() ? 'local' : 'unavailable';
  if (!sdk.leaderboards?.setScore || !await methodAvailable('leaderboards.setScore')) return 'unavailable';
  if (!player?.isAuthorized?.()) return 'auth-required';
  try {
    await withTimeout(sdk.leaderboards.setScore(
      DAILY_LEADERBOARD_NAME,
      encodeDailyLeaderboardScore(dateKey, score),
      JSON.stringify({ dateKey, score: Math.max(0, Math.floor(score)) }),
    ));
    return 'sent';
  } catch (error) {
    warn('daily score submission failed', error);
    return 'unavailable';
  }
};

export const loadDailyLeaderboard = async (dateKey: string): Promise<DailyLeaderboardEntry[] | null> => {
  if (!sdk?.leaderboards?.getEntries || !await methodAvailable('leaderboards.getEntries')) return null;
  try {
    const response = await withTimeout(sdk.leaderboards.getEntries(DAILY_LEADERBOARD_NAME, {
      quantityTop: 20,
      includeUser: Boolean(player?.isAuthorized?.()),
      quantityAround: 1,
    }));
    const bucket = dateBucket(dateKey);
    const entries = (response.entries ?? []).flatMap((entry) => {
      let entryDate = '';
      let rawScore = -1;
      try {
        const data = JSON.parse(entry.extraData ?? '') as Record<string, unknown>;
        entryDate = typeof data.dateKey === 'string' ? data.dateKey : '';
        rawScore = Number.isFinite(Number(data.score)) ? Math.max(0, Math.floor(Number(data.score))) : -1;
      } catch {
        // Older leaderboard entries can omit metadata; the encoded score remains usable.
      }
      if (!entryDate && Math.floor(entry.score / DAILY_SCORE_FACTOR) === bucket) {
        entryDate = dateKey;
        rawScore = Math.floor(entry.score % DAILY_SCORE_FACTOR);
      }
      if (entryDate !== dateKey || rawScore < 0) return [];
      return [{
        rank: 0,
        score: rawScore,
        name: entry.player?.publicName?.trim().slice(0, 40) ?? '',
        isCurrentPlayer: Boolean(playerId && entry.player?.uniqueID === playerId),
      }];
    });
    return entries.sort((left, right) => right.score - left.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  } catch (error) {
    warn('daily leaderboard load failed', error);
    return null;
  }
};

export const portalLanguage = (): Language => {
  const detected = sdk?.environment?.i18n?.lang?.toLowerCase() ?? navigator.language?.toLowerCase() ?? 'en';
  return detected.startsWith('ru') ? 'ru' : 'en';
};

export const signalReady = (): void => {
  if (readySent) return;
  readySent = true;
  try {
    sdk?.features?.LoadingAPI?.ready();
  } catch (error) {
    warn('LoadingAPI.ready failed', error);
  }
};

export const setGameplayActive = (active: boolean): void => {
  if (active === gameplayActive) return;
  gameplayActive = active;
  try {
    if (active) sdk?.features?.GameplayAPI?.start();
    else sdk?.features?.GameplayAPI?.stop();
  } catch (error) {
    warn(`GameplayAPI.${active ? 'start' : 'stop'} failed`, error);
  }
};

const bindSdkEvent = (event: string, callback: () => void): (() => void) => {
  try {
    const unbind = sdk?.on?.(event, callback);
    return typeof unbind === 'function' ? unbind : () => {
      try { sdk?.off?.(event, callback); } catch (error) { warn(`event unsubscribe failed: ${event}`, error); }
    };
  } catch (error) {
    warn(`event subscribe failed: ${event}`, error);
    return () => undefined;
  }
};

export const bindPlatformPause = (pause: () => void, resume: () => void): (() => void) => {
  const unbindPause = bindSdkEvent('game_api_pause', pause);
  const unbindResume = bindSdkEvent('game_api_resume', resume);
  return () => { unbindPause(); unbindResume(); };
};

export const bindAccountSelection = (opened: () => void, closed: () => void): (() => void) => {
  const openEvent = sdk?.EVENTS?.ACCOUNT_SELECTION_DIALOG_OPENED ?? 'ACCOUNT_SELECTION_DIALOG_OPENED';
  const closeEvent = sdk?.EVENTS?.ACCOUNT_SELECTION_DIALOG_CLOSED ?? 'ACCOUNT_SELECTION_DIALOG_CLOSED';
  const unbindOpen = bindSdkEvent(openEvent, opened);
  const unbindClose = bindSdkEvent(closeEvent, closed);
  return () => { unbindOpen(); unbindClose(); };
};

export const setCloudSyncPaused = (paused: boolean): void => {
  cloudSyncPaused = paused;
};

export const readCloudSave = async (): Promise<unknown | null> => {
  const target = player;
  if (!target) return null;
  try {
    const data = await withTimeout(target.getData([SAVE_KEY]), 5000);
    const value = data?.[SAVE_KEY] ?? null;
    if (value !== null) {
      lastCloudWriteTarget = target;
      lastCloudWritePayload = JSON.stringify(value);
    }
    return value;
  } catch (error) {
    warn('cloud save read failed', error);
    return null;
  }
};

const writeCloudNow = async (target: YandexPlayer, save: SaveData, flush: boolean): Promise<boolean> => {
  const payload = JSON.stringify(save);
  if (target === lastCloudWriteTarget && payload === lastCloudWritePayload) return true;
  try {
    await withTimeout(target.setData({ [SAVE_KEY]: save }, flush), 5000);
    lastCloudWriteTarget = target;
    lastCloudWritePayload = payload;
    return true;
  } catch (error) {
    warn('cloud save write failed', error);
    return false;
  }
};

const enqueueCloudWrite = (save: SaveData, flush: boolean): Promise<boolean> => {
  const target = player;
  if (!target) return Promise.resolve(false);
  cloudWriteQueue = cloudWriteQueue.then(
    () => writeCloudNow(target, save, flush),
    () => writeCloudNow(target, save, flush),
  );
  return cloudWriteQueue;
};

export const queueCloudSave = (save: SaveData, flush = false): Promise<boolean> | null => {
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = null;
  if (cloudSyncPaused) {
    deferredCloudSave = save;
    return null;
  }
  deferredCloudSave = null;
  if (flush) return enqueueCloudWrite(save, true);
  cloudTimer = setTimeout(() => {
    cloudTimer = null;
    void enqueueCloudWrite(save, false);
  }, 1800);
  return null;
};

export const resumeCloudSync = (save?: SaveData): Promise<boolean> | null => {
  cloudSyncPaused = false;
  const latest = save ?? deferredCloudSave;
  deferredCloudSave = null;
  return latest ? queueCloudSave(latest, true) : null;
};

export const rewardedAvailable = (): boolean => hasDevelopmentAdMock() || Boolean(sdk?.adv?.showRewardedVideo);

export const showRewarded = (): Promise<boolean> => {
  if (adPending) return Promise.resolve(false);
  if (hasDevelopmentAdMock() && !sdk) {
    adPending = true;
    return new Promise((resolve) => setTimeout(() => { adPending = false; resolve(true); }, 450));
  }
  const ads = sdk?.adv;
  if (!ads?.showRewardedVideo) return Promise.resolve(false);
  adPending = true;
  return new Promise((resolve) => {
    let rewarded = false;
    let opened = false;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      adPending = false;
      resolve(rewarded);
    };
    const timeout = setTimeout(() => { if (!opened) finish(); }, AD_WATCHDOG_MS);
    try {
      ads.showRewardedVideo({ callbacks: {
        onOpen: () => { opened = true; clearTimeout(timeout); },
        onRewarded: () => { if (!settled) rewarded = true; },
        onClose: finish,
        onError: (error) => { warn('rewarded ad failed', error); finish(); },
      } });
    } catch (error) {
      warn('rewarded ad invocation failed', error);
      finish();
    }
  });
};

export const showInterstitial = (): Promise<boolean> => {
  if (adPending) return Promise.resolve(false);
  const ads = sdk?.adv;
  if (!ads?.showFullscreenAdv || hasDevelopmentAdMock()) return Promise.resolve(false);
  adPending = true;
  return new Promise((resolve) => {
    let opened = false;
    let settled = false;
    const finish = (shown = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      adPending = false;
      resolve(shown);
    };
    const timeout = setTimeout(() => { if (!opened) finish(false); }, AD_WATCHDOG_MS);
    try {
      ads.showFullscreenAdv({ callbacks: {
        onOpen: () => { opened = true; clearTimeout(timeout); },
        onClose: (shown) => finish(opened || Boolean(shown)),
        onError: (error) => { warn('interstitial ad failed', error); finish(false); },
      } });
    } catch (error) {
      warn('interstitial ad invocation failed', error);
      finish(false);
    }
  });
};
