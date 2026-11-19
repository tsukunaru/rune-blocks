import type { Goal, Language, Mechanic } from './game/types.ts';

export const GAME_TITLES: Record<Language, string> = { ru: 'Рунные Блоки', en: 'Rune Blocks' };
export const GAME_DESCRIPTIONS: Record<Language, string> = {
  ru: 'Рунные Блоки — уютная головоломка о линиях, блоках и парящих островах.',
  en: 'Rune Blocks is a cozy line puzzle set among blocks and floating islands.',
};

const ru: Record<string, string> = {
  menuKicker: 'Уютная головоломка с блоками',
  tagline: 'Сложи блоки. Разбуди острова.',
  continue: 'Продолжить', campaign: 'Кампания', endless: 'Бесконечная игра', daily: 'Ежедневное испытание',
  themes: 'Темы блоков', settings: 'Настройки', achievements: 'Достижения', today: 'Сегодня',
  stars: 'Звёзды', streak: 'Серия', days: 'дн.', best: 'Рекорд', shards: 'Лунные осколки',
  back: 'Назад', play: 'Играть', close: 'Закрыть', skip: 'Пропустить', next: 'Далее', menu: 'В меню', mainMenu: 'Главное меню',
  level: 'Уровень', locked: 'Закрыто', chapter: 'Глава', score: 'Счёт', lines: 'Линии', combo: 'Комбо',
  moves: 'Фигуры', goal: 'Цель', pause: 'Пауза', paused: 'Игра приостановлена', resume: 'Продолжить',
  undo: 'Отменить', undoUsed: 'Отмена уже использована', hint: 'Подсказка', howToPlay: 'Как играть',
  result: 'Результат', victory: 'Остров пробуждён!', gameOver: 'Блоки больше не складываются',
  newRecord: 'Новый рекорд!', maxCombo: 'Лучшее комбо', retry: 'Ещё раз', nextLevel: 'Следующий уровень',
  campaignMap: 'Карта кампании', continueAd: 'Бонус: продолжить за видео', continueHelp: 'Будет очищена самая заполненная линия',
  continueMoves: 'Лимит увеличится на 5 фигур', moveLimitReached: 'Закончились фигуры',
  objectiveComplete: 'Цель выполнена', objectiveFailed: 'Попробуй другую комбинацию', noMoves: 'Нет доступных ходов',
  spark: 'Искра', burst: 'Вспышка', enchantment: 'Серия', grandEnchantment: 'Сверхкомбо',
  tutorialWelcome: 'Первая фигура ждёт тебя', tutorialWelcomeBody: 'Короткое обучение займёт меньше минуты.',
  tutorialStart: 'Начать обучение', tutorialPick: 'Возьми светящуюся фигуру',
  tutorialDrag: 'Перетащи её в золотую область', tutorialLine: 'Заполни линию целиком',
  tutorialLineGone: 'Готовая линия исчезает!', tutorialBoth: 'Очищай горизонтальные и вертикальные линии',
  tutorialThree: 'Используй все три фигуры — затем появятся новые',
  tutorialCombo: 'Очищай линии подряд, чтобы увеличить комбо',
  tutorialGameOver: 'Игра закончится, если ни одну оставшуюся фигуру нельзя разместить.',
  tutorialDone: 'Готово! Теперь попробуй пройти первый уровень.', tutorialPlay: 'Играть первый уровень',
  music: 'Музыка', sounds: 'Звуки', vibration: 'Вибрация', language: 'Язык',
  replayTutorial: 'Пройти обучение снова', on: 'Вкл.', off: 'Выкл.', resetSave: 'Сбросить сохранение',
  mechanics: 'Механики', basics: 'Основы',
  helpBasics: 'Перетаскивай фигуры. Полные горизонтальные и вертикальные линии исчезают.',
  helpStones: 'Камни блокируют клетки. Очищай соседние линии, чтобы разбить их.',
  helpIce: 'Лёд принимает блок. Очисти линию через лёд, чтобы расколоть его.',
  helpCrystals: 'Очищай линии через кристаллы, чтобы собирать их.',
  helpSeals: 'Проводи линии через печать несколько раз, чтобы зарядить её.',
  mechanicStones: 'Камни', mechanicIce: 'Лёд', mechanicCrystals: 'Кристаллы', mechanicSeals: 'Печати',
  introStones: 'Камни блокируют клетки. Очищай линии рядом, чтобы разбить их.',
  introIce: 'Лёд сковывает клетки. Очисти линию через лёд.',
  introCrystals: 'Кристаллы — дополнительная цель. Собирай их очищением линий.',
  introSeals: 'Печати требуют несколько очищений. Заряжай их линиями.',
  tryStones: 'Поставь длинную фигуру в рамку: готовая линия ударит соседний камень.',
  tryIce: 'Закрой золотые клетки: линия пройдёт через лёд и расколет его.',
  tryCrystals: 'Закрой золотые клетки: кристаллы соберутся вместе с линией.',
  trySealsFirst: 'Проведи первую линию через печати — они запомнят заряд.',
  trySealsFill: 'Начни собирать эту строку длинной фигурой.',
  trySealsFinish: 'Замкни строку ещё раз, чтобы полностью зарядить печати.',
  understood: 'Понятно', newInChapter: 'Новая механика',
  dailyTitle: 'Испытание дня', newIn: 'Новое через', currentStreak: 'Текущая серия', bestStreak: 'Лучшая серия',
  dailyLeaderboard: 'Рейтинг дня', leaderboardLoading: 'Загружаем результаты…', leaderboardEmpty: 'Сегодня результатов пока нет.',
  leaderboardLocal: 'Локальная проверка: после публикации здесь появятся результаты игроков.', leaderboardUnavailable: 'Рейтинг временно недоступен.',
  player: 'Игрок', you: 'Вы', anonymousPlayer: 'Скрытый игрок', scoreSending: 'Отправляем результат…', scoreSent: 'Результат отправлен в рейтинг дня.',
  scoreSavedLocal: 'Результат сохранён локально. Отправка включится на Яндекс Играх.', scoreSendUnavailable: 'Результат сохранён, но рейтинг сейчас недоступен.',
  signInBenefit: 'Войдите с Яндекс ID, чтобы отправить результат и увидеть своё место.', signInAndSend: 'Войти и отправить',
  completed: 'Выполнено', reward: 'Награда', calendar: 'Календарь', alreadyCompleted: 'Сегодня уже выполнено',
  themeClassic: 'Звёздная лазурь', themeEmerald: 'Изумрудная роща', themeCrystal: 'Хрустальная ночь',
  themeMoon: 'Лунное серебро', themeFire: 'Жар цитадели', themeGolden: 'Золотая заря',
  select: 'Выбрать', selected: 'Выбрано', unlock: 'Открыть', notEnough: 'Не хватает осколков', cosmeticOnly: 'Только внешний вид — без бонусов к игре.',
  achievementsTitle: 'Зал славы', achievementFirst: 'Первая искра', achievementFirstBody: 'Очистить первую линию',
  achievementCombo: 'Цепочка линий', achievementComboBody: 'Достичь комбо ×4', achievementStars: 'Путник островов',
  achievementStarsBody: 'Собрать 30 звёзд', achievementDaily: 'Хранитель дней', achievementDailyBody: 'Серия 7 дней',
  achieved: 'Получено', inProgress: 'В процессе',
  goalScore: 'Набери {amount} {unit}', goalClearLines: 'Очисти {amount} {unit}', goalCombo: 'Достигни комбо ×{amount}',
  goalClearAtOnce: 'Очисти {amount} {unit} одним ходом', goalPlacePieces: 'Размести {amount} {unit}',
  goalDestroyStones: 'Разбей {amount} {unit}', goalBreakIce: 'Разбей {amount} {unit}',
  goalCollectCrystals: 'Собери {amount} {unit}', goalCompleteSeals: 'Заряди {amount} {unit}',
  biomeEnchantedForest: 'Зачарованный лес', biomeMoonRuins: 'Лунные руины', biomeCrystalCaves: 'Кристальные пещеры',
  biomeSkyCity: 'Небесный город', biomeEmberCitadel: 'Огненная цитадель',
  keyboardHelp: 'Мышь или касание: перетаскивай. Клавиатура: 1–3, стрелки, Enter.',
  devTools: 'Инструменты разработчика', devShards: 'Добавить осколки', devLevel: 'Открыть уровень', devDaily: 'Дата daily',
  forceGameOver: 'Принудительный game over', adUnavailable: 'Видео сейчас недоступно',
  adOpening: 'Открываем рекламу…', rewardedShards: 'Посмотреть видео → +15 ◈',
  rewardedShardsLeft: 'Доступно в этой сессии: {count}', rewardedSessionLimit: 'Лимит наград в этой сессии исчерпан',
  rewardedUndo: 'Ещё одна отмена за видео', rewardedUndoHelp: 'Вернуться на один ход назад',
  dailyDouble: 'Удвоить награду за видео', dailyDoubleHelp: 'Получить ещё +15 ◈', dailyDoubleDone: 'Награда уже удвоена',
  resetConfirmTitle: 'Сбросить сохранение?', resetConfirmBody: 'Прогресс на этом устройстве будет удалён. Это действие нельзя отменить.',
  resetConfirm: 'Да, сбросить', cancel: 'Отмена', profileSwitching: 'Обновляем профиль…',
};

const en: Record<string, string> = {
  menuKicker: 'Cozy Block Puzzle',
  tagline: 'Place blocks. Awaken the isles.',
  continue: 'Continue', campaign: 'Campaign', endless: 'Endless', daily: 'Daily Challenge',
  themes: 'Block Themes', settings: 'Settings', achievements: 'Achievements', today: 'Today',
  stars: 'Stars', streak: 'Streak', days: 'days', best: 'Best', shards: 'Moon Shards',
  back: 'Back', play: 'Play', close: 'Close', skip: 'Skip', next: 'Next', menu: 'Menu', mainMenu: 'Main menu',
  level: 'Level', locked: 'Locked', chapter: 'Chapter', score: 'Score', lines: 'Lines', combo: 'Combo',
  moves: 'Pieces', goal: 'Goal', pause: 'Pause', paused: 'Game paused', resume: 'Resume',
  undo: 'Undo', undoUsed: 'Undo already used', hint: 'Hint', howToPlay: 'How to play',
  result: 'Result', victory: 'Island awakened!', gameOver: 'No block can be placed',
  newRecord: 'New record!', maxCombo: 'Best combo', retry: 'Try again', nextLevel: 'Next level',
  campaignMap: 'Campaign map', continueAd: 'Bonus: continue with video', continueHelp: 'The fullest line will be cleared',
  continueMoves: 'The limit will increase by 5 pieces', moveLimitReached: 'Piece limit reached',
  objectiveComplete: 'Objective complete', objectiveFailed: 'Try another combination', noMoves: 'No available moves',
  spark: 'Spark', burst: 'Burst', enchantment: 'Enchantment', grandEnchantment: 'Grand Enchantment',
  tutorialWelcome: 'Your first piece is ready', tutorialWelcomeBody: 'A quick tutorial takes less than a minute.',
  tutorialStart: 'Start tutorial', tutorialPick: 'Pick up the glowing piece',
  tutorialDrag: 'Drag it into the golden area', tutorialLine: 'Complete a full line',
  tutorialLineGone: 'Completed lines disappear!', tutorialBoth: 'Clear horizontal and vertical lines',
  tutorialThree: 'Use all three pieces to receive a new set',
  tutorialCombo: 'Clear lines on consecutive moves to build a combo',
  tutorialGameOver: 'The run ends when none of the remaining pieces can be placed.',
  tutorialDone: "You're ready! Try the first campaign level.", tutorialPlay: 'Play level one',
  music: 'Music', sounds: 'Sounds', vibration: 'Vibration', language: 'Language',
  replayTutorial: 'Replay tutorial', on: 'On', off: 'Off', resetSave: 'Reset save',
  mechanics: 'Mechanics', basics: 'Basics',
  helpBasics: 'Drag pieces onto the board. Full horizontal and vertical lines disappear.',
  helpStones: 'Stones block cells. Clear nearby lines to break them.',
  helpIce: 'Ice accepts a block. Clear a line through it to crack it.',
  helpCrystals: 'Clear lines through crystals to collect them.',
  helpSeals: 'Clear through a seal several times to charge it.',
  mechanicStones: 'Stones', mechanicIce: 'Ice', mechanicCrystals: 'Crystals', mechanicSeals: 'Seals',
  introStones: 'Stones block cells. Clear nearby lines to break them.',
  introIce: 'Ice covers cells. Clear a line through it.',
  introCrystals: 'Crystals are bonus objectives. Collect them with line clears.',
  introSeals: 'Seals need multiple clears. Charge them with lines.',
  tryStones: 'Place the long piece in the frame: the line will strike the nearby stone.',
  tryIce: 'Cover the golden cells: the line will pass through and crack the ice.',
  tryCrystals: 'Cover the golden cells: the crystals will be collected with the line.',
  trySealsFirst: 'Clear through the seals once — they will keep that charge.',
  trySealsFill: 'Start rebuilding this row with the long piece.',
  trySealsFinish: 'Close the row again to charge the seals completely.',
  understood: 'Got it', newInChapter: 'New mechanic',
  dailyTitle: 'Daily Challenge', newIn: 'New in', currentStreak: 'Current streak', bestStreak: 'Best streak',
  dailyLeaderboard: 'Daily Ranking', leaderboardLoading: 'Loading scores…', leaderboardEmpty: 'No scores yet today.',
  leaderboardLocal: 'Local preview: player results will appear here after publishing.', leaderboardUnavailable: 'The ranking is temporarily unavailable.',
  player: 'Player', you: 'You', anonymousPlayer: 'Hidden player', scoreSending: 'Sending score…', scoreSent: 'Score submitted to today’s ranking.',
  scoreSavedLocal: 'Score saved locally. Submission activates on Yandex Games.', scoreSendUnavailable: 'Score saved, but the ranking is unavailable.',
  signInBenefit: 'Sign in with Yandex ID to submit your score and see your rank.', signInAndSend: 'Sign in and submit',
  completed: 'Completed', reward: 'Reward', calendar: 'Calendar', alreadyCompleted: 'Completed for today',
  themeClassic: 'Starlit Azure', themeEmerald: 'Emerald Grove', themeCrystal: 'Crystal Night',
  themeMoon: 'Moon Silver', themeFire: 'Citadel Ember', themeGolden: 'Golden Dawn',
  select: 'Select', selected: 'Selected', unlock: 'Unlock', notEnough: 'Not enough shards', cosmeticOnly: 'Visual only — no gameplay bonuses.',
  achievementsTitle: 'Hall of Glory', achievementFirst: 'First Spark', achievementFirstBody: 'Clear the first line',
  achievementCombo: 'Line Chain', achievementComboBody: 'Reach combo ×4', achievementStars: 'Island Wanderer',
  achievementStarsBody: 'Collect 30 stars', achievementDaily: 'Keeper of Days', achievementDailyBody: 'Reach a 7-day streak',
  achieved: 'Earned', inProgress: 'In progress',
  goalScore: 'Score {amount} points', goalClearLines: 'Clear {amount} lines', goalCombo: 'Reach combo ×{amount}',
  goalClearAtOnce: 'Clear {amount} lines in one move', goalPlacePieces: 'Place {amount} pieces',
  goalDestroyStones: 'Break {amount} stones', goalBreakIce: 'Break {amount} ice cells',
  goalCollectCrystals: 'Collect {amount} crystals', goalCompleteSeals: 'Charge {amount} seals',
  biomeEnchantedForest: 'Enchanted Forest', biomeMoonRuins: 'Moon Ruins', biomeCrystalCaves: 'Crystal Caves',
  biomeSkyCity: 'Sky City', biomeEmberCitadel: 'Ember Citadel',
  keyboardHelp: 'Mouse or touch: drag. Keyboard: 1–3, arrows, Enter.',
  devTools: 'Developer tools', devShards: 'Add shards', devLevel: 'Open level', devDaily: 'Daily date',
  forceGameOver: 'Force game over', adUnavailable: 'Video is unavailable right now',
  adOpening: 'Opening the ad…', rewardedShards: 'Watch a video → +15 ◈',
  rewardedShardsLeft: 'Available this session: {count}', rewardedSessionLimit: 'Session reward limit reached',
  rewardedUndo: 'One more undo with video', rewardedUndoHelp: 'Go back one move',
  dailyDouble: 'Double the reward with video', dailyDoubleHelp: 'Get another +15 ◈', dailyDoubleDone: 'Reward already doubled',
  resetConfirmTitle: 'Reset saved progress?', resetConfirmBody: 'Progress on this device will be deleted. This cannot be undone.',
  resetConfirm: 'Yes, reset', cancel: 'Cancel', profileSwitching: 'Refreshing profile…',
};

const dictionaries = { ru, en };

export const t = (language: Language, key: string, values: Record<string, string | number> = {}): string => {
  const template = dictionaries[language][key] ?? en[key] ?? key;
  return Object.entries(values).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), template);
};

const russianCountForm = (amount: number, forms: readonly [string, string, string]): string => {
  const lastTwo = Math.abs(amount) % 100;
  const last = lastTwo % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
};

const russianGoalUnits: Partial<Record<Goal['type'], readonly [string, string, string]>> = {
  score: ['очко', 'очка', 'очков'],
  clearLines: ['линию', 'линии', 'линий'],
  clearAtOnce: ['линию', 'линии', 'линий'],
  placePieces: ['фигуру', 'фигуры', 'фигур'],
  destroyStones: ['камень', 'камня', 'камней'],
  breakIce: ['льдину', 'льдины', 'льдин'],
  collectCrystals: ['кристалл', 'кристалла', 'кристаллов'],
  completeSeals: ['печать', 'печати', 'печатей'],
};

export const goalText = (language: Language, goal: Goal): string => {
  const keys: Record<Goal['type'], string> = {
    score: 'goalScore', clearLines: 'goalClearLines', combo: 'goalCombo', clearAtOnce: 'goalClearAtOnce',
    placePieces: 'goalPlacePieces', destroyStones: 'goalDestroyStones', breakIce: 'goalBreakIce',
    collectCrystals: 'goalCollectCrystals', completeSeals: 'goalCompleteSeals',
  };
  const forms = russianGoalUnits[goal.type];
  return t(language, keys[goal.type], {
    amount: goal.amount,
    unit: language === 'ru' && forms ? russianCountForm(goal.amount, forms) : '',
  });
};

export const mechanicText = (language: Language, mechanic: Mechanic): string => t(language, `intro${mechanic[0].toUpperCase()}${mechanic.slice(1)}`);

export const biomeText = (language: Language, biome: string): string => t(language, `biome${biome[0].toUpperCase()}${biome.slice(1)}`);

export const formatNumber = (language: Language, value: number): string => new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US').format(value);
