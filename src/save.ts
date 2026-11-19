import type { Language, Mechanic, ThemeId } from './game/types.ts';

export const SAVE_KEY = 'rune-blocks-save-v1';
const DEVICE_KEY = 'rune-blocks-device-v1';
const THEMES: readonly ThemeId[] = ['classic', 'emerald', 'crystal', 'moon', 'fire', 'golden'];
const MECHANICS: readonly Mechanic[] = ['stones', 'ice', 'crystals', 'seals'];

interface ProgressCounter {
  linesAdded: number;
  linesRemoved: number;
  runsAdded: number;
  runsRemoved: number;
}

export interface SaveData {
  version: 1;
  playerId: string | null;
  updatedAt: number;
  language: Language;
  settings: { music: boolean; sounds: boolean; vibration: boolean };
  tutorialCompleted: boolean;
  seenMechanics: Record<Mechanic, boolean>;
  campaign: { unlocked: number; stars: Record<string, number>; scores: Record<string, number> };
  bestEndless: number;
  totalLines: number;
  progressByDevice: Record<string, ProgressCounter>;
  maxCombo: number;
  daily: {
    completed: string[];
    doubled: string[];
    scores: Record<string, number>;
    streak: number;
    bestStreak: number;
    lastCompleted: string | null;
  };
  moonShards: number;
  economyRevision: number;
  unlockedThemes: ThemeId[];
  selectedTheme: ThemeId;
  completedRuns: number;
  lastInterstitialAt: number;
}

const finite = (value: unknown, fallback = 0, maximum = Number.MAX_SAFE_INTEGER): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(maximum, Math.floor(numeric))) : fallback;
};

export const createDefaultSave = (language: Language = 'en'): SaveData => ({
  version: 1,
  playerId: null,
  updatedAt: Date.now(),
  language,
  settings: { music: true, sounds: true, vibration: true },
  tutorialCompleted: false,
  seenMechanics: { stones: false, ice: false, crystals: false, seals: false },
  campaign: { unlocked: 1, stars: {}, scores: {} },
  bestEndless: 0,
  totalLines: 0,
  progressByDevice: {},
  maxCombo: 0,
  daily: { completed: [], doubled: [], scores: {}, streak: 0, bestStreak: 0, lastCompleted: null },
  moonShards: 0,
  economyRevision: 0,
  unlockedThemes: ['classic'],
  selectedTheme: 'classic',
  completedRuns: 0,
  lastInterstitialAt: 0,
});

const numberRecord = (value: unknown, maximum: number, keyPattern = /^\d+$/): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => keyPattern.test(key))
    .map(([key, entry]) => [key, finite(entry, 0, maximum)]));
};

const progressCounter = (value: unknown): ProgressCounter => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    linesAdded: finite(input.linesAdded, 0, 99_999_999),
    linesRemoved: finite(input.linesRemoved, 0, 99_999_999),
    runsAdded: finite(input.runsAdded, 0, 999_999),
    runsRemoved: finite(input.runsRemoved, 0, 999_999),
  };
};

const progressRecord = (value: unknown, legacyLines: number, legacyRuns: number): Record<string, ProgressCounter> => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const entries = Object.entries(input)
    .filter(([key]) => /^[A-Za-z0-9-]{1,80}$/.test(key))
    .slice(-64)
    .map(([key, entry]) => [key, progressCounter(entry)] as const);
  if (entries.length) return Object.fromEntries(entries);
  return legacyLines || legacyRuns ? {
    legacy: { linesAdded: legacyLines, linesRemoved: 0, runsAdded: legacyRuns, runsRemoved: 0 },
  } : {};
};

const progressTotals = (progress: Record<string, ProgressCounter>): { totalLines: number; completedRuns: number } => {
  const counters = Object.values(progress);
  return {
    totalLines: Math.max(0, Math.min(99_999_999,
      counters.reduce((total, counter) => total + counter.linesAdded - counter.linesRemoved, 0))),
    completedRuns: Math.max(0, Math.min(999_999,
      counters.reduce((total, counter) => total + counter.runsAdded - counter.runsRemoved, 0))),
  };
};

const currentDailyStreak = (completed: readonly string[]): { lastCompleted: string | null; streak: number } => {
  const dates = [...new Set(completed)].sort();
  const lastCompleted = dates[dates.length - 1] ?? null;
  if (!lastCompleted) return { lastCompleted: null, streak: 0 };
  let streak = 1;
  for (let index = dates.length - 1; index > 0; index -= 1) {
    if (dayNumber(dates[index]) - dayNumber(dates[index - 1]) !== 1) break;
    streak += 1;
  }
  return { lastCompleted, streak };
};

export const normalizeSave = (value: unknown, fallbackLanguage: Language = 'en'): SaveData => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const fallback = createDefaultSave(fallbackLanguage);
  const settings = input.settings && typeof input.settings === 'object' ? input.settings as Record<string, unknown> : {};
  const campaign = input.campaign && typeof input.campaign === 'object' ? input.campaign as Record<string, unknown> : {};
  const daily = input.daily && typeof input.daily === 'object' ? input.daily as Record<string, unknown> : {};
  const seenInput = input.seenMechanics && typeof input.seenMechanics === 'object'
    ? input.seenMechanics as Record<string, unknown> : {};
  const completed = Array.isArray(daily.completed)
    ? [...new Set(daily.completed.filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)))].slice(-400)
    : [];
  const doubled = Array.isArray(daily.doubled)
    ? [...new Set(daily.doubled.filter((date): date is string => typeof date === 'string' && completed.includes(date)))].slice(-400)
    : [];
  const unlockedInput: unknown[] = Array.isArray(input.unlockedThemes) ? input.unlockedThemes : [];
  const unlockedThemes: ThemeId[] = unlockedInput.length
    ? THEMES.filter((theme) => unlockedInput.includes(theme))
    : ['classic'];
  if (!unlockedThemes.includes('classic')) unlockedThemes.unshift('classic');
  const requestedTheme = THEMES.includes(input.selectedTheme as ThemeId) ? input.selectedTheme as ThemeId : 'classic';
  const selectedTheme = unlockedThemes.includes(requestedTheme) ? requestedTheme : 'classic';
  const progressByDevice = progressRecord(
    input.progressByDevice,
    finite(input.totalLines, 0, 99_999_999),
    finite(input.completedRuns, 0, 999_999),
  );
  const progress = progressTotals(progressByDevice);
  const dailyProgress = currentDailyStreak(completed);
  return {
    version: 1,
    playerId: typeof input.playerId === 'string' && input.playerId.length <= 256 ? input.playerId : null,
    updatedAt: finite(input.updatedAt, fallback.updatedAt),
    language: input.language === 'ru' || input.language === 'en' ? input.language : fallbackLanguage,
    settings: {
      music: typeof settings.music === 'boolean' ? settings.music : fallback.settings.music,
      sounds: typeof settings.sounds === 'boolean' ? settings.sounds : fallback.settings.sounds,
      vibration: typeof settings.vibration === 'boolean' ? settings.vibration : fallback.settings.vibration,
    },
    tutorialCompleted: Boolean(input.tutorialCompleted),
    seenMechanics: Object.fromEntries(MECHANICS.map((mechanic) => [mechanic, Boolean(seenInput[mechanic])])) as Record<Mechanic, boolean>,
    campaign: {
      unlocked: Math.max(1, Math.min(100, finite(campaign.unlocked, 1))),
      stars: numberRecord(campaign.stars, 3),
      scores: numberRecord(campaign.scores, 99_999_999),
    },
    bestEndless: finite(input.bestEndless, 0, 99_999_999),
    totalLines: progress.totalLines,
    progressByDevice,
    maxCombo: finite(input.maxCombo, 0, 9999),
    daily: {
      completed,
      doubled,
      scores: numberRecord(daily.scores, 9_999_999, /^\d{4}-\d{2}-\d{2}$/),
      streak: dailyProgress.streak,
      bestStreak: Math.max(finite(daily.bestStreak, 0, 10000), dailyProgress.streak),
      lastCompleted: dailyProgress.lastCompleted,
    },
    moonShards: finite(input.moonShards, 0, 999_999),
    economyRevision: finite(input.economyRevision, 0, Number.MAX_SAFE_INTEGER),
    unlockedThemes,
    selectedTheme,
    completedRuns: progress.completedRuns,
    lastInterstitialAt: finite(input.lastInterstitialAt),
  };
};

export const mergeSaves = (localValue: unknown, cloudValue: unknown, language: Language = 'en'): SaveData => {
  const local = normalizeSave(localValue, language);
  const cloud = normalizeSave(cloudValue, language);
  const recent = local.updatedAt >= cloud.updatedAt ? local : cloud;
  const completed = [...new Set([...local.daily.completed, ...cloud.daily.completed])].sort().slice(-400);
  const doubled = [...new Set([...local.daily.doubled, ...cloud.daily.doubled])]
    .filter((date) => completed.includes(date)).sort().slice(-400);
  const dailyScores = { ...local.daily.scores };
  Object.entries(cloud.daily.scores).forEach(([date, value]) => { dailyScores[date] = Math.max(dailyScores[date] ?? 0, value); });
  const unlockedThemes = THEMES.filter((theme) => local.unlockedThemes.includes(theme) || cloud.unlockedThemes.includes(theme));
  const stars = { ...local.campaign.stars };
  Object.entries(cloud.campaign.stars).forEach(([id, value]) => { stars[id] = Math.max(stars[id] ?? 0, value); });
  const scores = { ...local.campaign.scores };
  Object.entries(cloud.campaign.scores).forEach(([id, value]) => { scores[id] = Math.max(scores[id] ?? 0, value); });
  const progressByDevice: Record<string, ProgressCounter> = {};
  for (const device of new Set([...Object.keys(local.progressByDevice), ...Object.keys(cloud.progressByDevice)])) {
    const left = local.progressByDevice[device] ?? progressCounter(null);
    const right = cloud.progressByDevice[device] ?? progressCounter(null);
    progressByDevice[device] = {
      linesAdded: Math.max(left.linesAdded, right.linesAdded),
      linesRemoved: Math.max(left.linesRemoved, right.linesRemoved),
      runsAdded: Math.max(left.runsAdded, right.runsAdded),
      runsRemoved: Math.max(left.runsRemoved, right.runsRemoved),
    };
  }
  const progress = progressTotals(progressByDevice);
  const daily = currentDailyStreak(completed);
  const economy = local.economyRevision === cloud.economyRevision
    ? recent
    : local.economyRevision > cloud.economyRevision ? local : cloud;
  return normalizeSave({
    ...recent,
    updatedAt: Math.max(local.updatedAt, cloud.updatedAt),
    tutorialCompleted: local.tutorialCompleted || cloud.tutorialCompleted,
    seenMechanics: Object.fromEntries(MECHANICS.map((mechanic) => [mechanic,
      local.seenMechanics[mechanic] || cloud.seenMechanics[mechanic],
    ])),
    campaign: { unlocked: Math.max(local.campaign.unlocked, cloud.campaign.unlocked), stars, scores },
    bestEndless: Math.max(local.bestEndless, cloud.bestEndless),
    totalLines: progress.totalLines,
    progressByDevice,
    maxCombo: Math.max(local.maxCombo, cloud.maxCombo),
    daily: {
      completed,
      doubled,
      scores: dailyScores,
      streak: daily.streak,
      bestStreak: Math.max(local.daily.bestStreak, cloud.daily.bestStreak, daily.streak),
      lastCompleted: daily.lastCompleted,
    },
    // Currency is transactional: a logical revision wins before the fall-back wall clock.
    moonShards: economy.moonShards,
    economyRevision: economy.economyRevision,
    unlockedThemes,
    selectedTheme: unlockedThemes.includes(recent.selectedTheme) ? recent.selectedTheme : 'classic',
    completedRuns: progress.completedRuns,
    lastInterstitialAt: Math.max(local.lastInterstitialAt, cloud.lastInterstitialAt),
  }, language);
};

let cachedDeviceId = '';

const progressDeviceId = (): string => {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored && /^[A-Za-z0-9-]{1,80}$/.test(stored)) return cachedDeviceId = stored;
    cachedDeviceId = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_KEY, cachedDeviceId);
  } catch {
    cachedDeviceId = `session-${Math.random().toString(36).slice(2)}`;
  }
  return cachedDeviceId;
};

export const adjustProgress = (save: SaveData, lines: number, runs: number): SaveData => {
  if (!lines && !runs) return save;
  const device = progressDeviceId();
  const counter = save.progressByDevice[device] ?? progressCounter(null);
  const nextCounter = {
    linesAdded: counter.linesAdded + Math.max(0, Math.floor(lines)),
    linesRemoved: counter.linesRemoved + Math.max(0, -Math.floor(lines)),
    runsAdded: counter.runsAdded + Math.max(0, Math.floor(runs)),
    runsRemoved: counter.runsRemoved + Math.max(0, -Math.floor(runs)),
  };
  const progressByDevice = { ...save.progressByDevice, [device]: nextCounter };
  return { ...save, ...progressTotals(progressByDevice), progressByDevice };
};

export const selectProfileSave = (
  localValue: unknown,
  cloudValue: unknown | null,
  playerId: string | null,
  language: Language,
): SaveData => {
  const local = localValue === null || localValue === undefined ? null : normalizeSave(localValue, language);
  const cloud = cloudValue ? normalizeSave(cloudValue, language) : null;
  if (!playerId) return local ?? cloud ?? createDefaultSave(language);

  const localForPlayer = local && (!local.playerId || local.playerId === playerId) ? local : null;
  const cloudForPlayer = cloud && (!cloud.playerId || cloud.playerId === playerId) ? cloud : null;
  const selected = localForPlayer && cloudForPlayer
    ? mergeSaves(localForPlayer, cloudForPlayer, language)
    : localForPlayer ?? cloudForPlayer ?? createDefaultSave(language);
  return { ...selected, playerId, updatedAt: Math.max(selected.updatedAt, Date.now()) };
};

export const readLocalSave = (language: Language): SaveData => {
  try {
    const value = localStorage.getItem(SAVE_KEY);
    return normalizeSave(value ? JSON.parse(value) : null, language);
  } catch {
    return createDefaultSave(language);
  }
};

export const writeLocalSave = (save: SaveData): void => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private storage can be unavailable */ }
};

const dayNumber = (dateKey: string): number => Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000;

export const completeDaily = (save: SaveData, dateKey: string, score = 0): SaveData => {
  const bestScore = Math.max(save.daily.scores[dateKey] ?? 0, Math.max(0, Math.floor(score)));
  if (save.daily.completed.includes(dateKey)) {
    return bestScore === (save.daily.scores[dateKey] ?? 0)
      ? save
      : { ...save, updatedAt: Date.now(), daily: { ...save.daily, scores: { ...save.daily.scores, [dateKey]: bestScore } } };
  }
  const consecutive = save.daily.lastCompleted && dayNumber(dateKey) - dayNumber(save.daily.lastCompleted) === 1;
  const streak = consecutive ? save.daily.streak + 1 : 1;
  return {
    ...save,
    updatedAt: Date.now(),
    moonShards: save.moonShards + 15,
    economyRevision: save.economyRevision + 1,
    daily: {
      ...save.daily,
      completed: [...save.daily.completed, dateKey].sort().slice(-400),
      scores: { ...save.daily.scores, [dateKey]: bestScore },
      streak,
      bestStreak: Math.max(save.daily.bestStreak, streak),
      lastCompleted: dateKey,
    },
  };
};

export const doubleDailyReward = (save: SaveData, dateKey: string): SaveData => {
  if (!save.daily.completed.includes(dateKey) || save.daily.doubled.includes(dateKey)) return save;
  return {
    ...save,
    updatedAt: Date.now(),
    moonShards: save.moonShards + 15,
    economyRevision: save.economyRevision + 1,
    daily: { ...save.daily, doubled: [...save.daily.doubled, dateKey].sort().slice(-400) },
  };
};

export const completeTutorial = (save: SaveData): SaveData => ({ ...save, tutorialCompleted: true, updatedAt: Date.now() });

export const totalCampaignStars = (save: SaveData): number => Object.values(save.campaign.stars)
  .reduce((total, stars) => total + stars, 0);
