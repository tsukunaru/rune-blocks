# Rune Blocks — release audit

Дата финальной проверки: 2026-09-27. База требований: официальная страница Яндекс Игр, редакция от 22 сентября 2026 года.

## Исправлено

- Ambient перенесён с `HTMLAudioElement` на единый Web Audio `AudioContext` с loop buffer, gain, suspend/resume и XHR fallback для старых браузеров.
- `game_api_pause/resume`, `visibilitychange`, `blur/focus`, пользовательская пауза, выбор профиля и реклама учитываются раздельно; Gameplay API остаётся идемпотентным.
- Подписки SDK устанавливаются сразу после `YaGames.init()`, до чтения профиля и завершения boot.
- Добавлена обработка `ACCOUNT_SELECTION_DIALOG_OPENED/CLOSED` с остановкой sync, повторным `getPlayer()`, чтением/merge выбранного профиля и возвратом в меню.
- Экономический merge берёт Moon Shards из самого свежего save и больше не восстанавливает потраченную валюту из старого облака; купленные темы сохраняются.
- Критические транзакции пишутся локально сразу и запускают `setData(..., true)` без debounce; облачные записи сериализованы.
- Повторная отправка идентичного cloud save отсекается до `Player.setData()`, поэтому SDK больше не пишет `The data does not differ from the previous ones`.
- Critical preload использует относительный `BASE_URL`, ждёт decode/load/error и `document.fonts.ready`; Game Ready отправляется один раз после первого usable render.
- Глобально отключены context menu, text selection и iOS touch callout; input сохраняет стандартное выделение.
- Low-height landscape сохраняет видимые Undo/Hint/Pause и touch targets 44 px.
- `window.confirm()` заменён внутриигровым RU/EN modal с Escape/Enter.
- Начальный loader и HTML metadata нейтральны; после SDK локализуются `lang`, title, description и menu aria-label.
- Язык `ysdk.environment.i18n.lang` применяется до Game Ready и имеет приоритет над устаревшим языком из local/cloud save; ручное RU/EN переключение продолжает работать в текущей сессии.
- Canvas не перехватывает Ctrl/Alt/Meta shortcuts; drag отменяется при resize/rotation.
- Favicon уменьшен с 1254×1254 / 1.38 MB до 512×512 / около 0.50 MB.
- Техническое имя leaderboard централизовано как `dailyscore` (без пробелов, дефисов и подчёркиваний).

## Реклама

- Interstitial: только на result transition, после каждого второго завершённого run, начиная с 4-го; cooldown 120 секунд; только один запрос одновременно.
- Общий ad lock и UI overlay; повторные клики блокируются до результата.
- Watchdog fullscreen/rewarded ограничивает только ожидание `onOpen`; после открытия Promise ждёт `onClose/onError`, награда учитывается только по `onRewarded`, поздние и повторные callbacks идемпотентны.
- Rewarded Continue: максимум один раз на run, бесплатный Retry остаётся.
- Rewarded Shards: +15, максимум три успешные награды за сессию.
- Rewarded Undo: первый Undo бесплатный, затем максимум один дополнительный Undo за рекламу на run.
- Daily ×2: базовые +15 выдаются сразу, реклама даёт ещё +15 один раз; флаг хранится в совместимом save v1.

## Автоматические проверки

- `npm ci`: PASS, 173 packages, 0 vulnerabilities.
- `npm test`: PASS, 29/29.
- Browser smoke: PASS, 9 viewports; SDK language overriding a stale save, menu/start/pause, portrait/landscape, low-height controls, context menu, selection, rotation during pointer drag, SDK/visibility/blur lifecycle и history.
- Campaign validator: PASS — 100/100 уровней достижимы; 531/600 стратегий победили; 485 побед дали 2+ звезды; 207 дали 3 звезды.
- Production build: PASS — TypeScript, modern bundle и legacy bundle собраны без source maps.
- Packaging validator: PASS — 16 файлов; 20,831,446 bytes ZIP (19.87 MiB); `index.html` в корне; 0 `node_modules`, `src`, `tests`, nested ZIP, source maps и небезопасных имён; упорядоченный обход файлов делает упаковку воспроизводимой; SHA-256 `65FA46BA5D8B610F9D0826D1ABD5534561E60D1792BB348000614179AA08A923`.
- Promo: PASS по структуре — icon 512×512, cover 800×470, 4 desktop 1920×1080, 4 mobile 1080×1920; добавлены четыре локализованных MP4-реклама без crop (RU/EN × 1280×720 и 1080×1920), каждый с полным gameplay canvas и локальным CTA.

## Яндекс черновик

- PASS — приложение 597702, версия 1.0.0.0; desktop, Android и iOS; ориентация «Любая»; RU/EN; рейтинг 0+; категории «Головоломки» и «Казуальные».
- PASS — облачные сохранения включены; RU/EN название, SEO, «Об игре», короткое описание, «Как играть», ключевые слова и комментарий разработчика сохранены.
- PASS — иконка, обложка, два desktop и два mobile gameplay-скриншота, horizontal и vertical gameplay-видео загружены для обеих локализаций.
- PASS — leaderboard `dailyscore`: основной, numeric, descending, 0 decimals; форма Консоли содержит RU «Ежедневное испытание» и EN «Daily Challenge».
- PASS — рекламные позиции настроены; код поддерживает fullscreen и rewarded; стартовая реклама появилась в draft player.
- PASS — финальный archive file-id `13518975` загружен; все три стадии обработки имеют класс `g-stepper__item_view_success`: `Обработка`, `Проверка`, `Готово`.
- PASS — в RU и EN вкладках черновика сохранены по два рекламных видео: горизонтальное и вертикальное; RU-ролики содержат русский title/subtitle/CTA, EN-ролики — английский.

## Debug Panel

- PASS — SDK инициализирован, Game Ready отправляется один раз после загрузки критических ресурсов.
- PASS — свежие запуски file-id `13518975` в Debug Console: RU Game Ready `260/293 ms`, EN Game Ready `222 ms`; каждая загрузка дала ровно один индикатор ready после исчезновения loader.
- PASS — Gameplay API: зелёный во время уровня, красный в pause и menu, после Resume снова зелёный.
- PASS — реальный rewarded-вызов в draft: UI сразу заблокирован и показал «Открываем рекламу…», Debug Panel переключился на pause, после закрытия награда изменила баланс `0 → 15`, лимит `3 → 2`, overlay исчез, консоль осталась чистой.
- PASS — реальный ход с клавиатуры изменил score 0 → 40 и pieces 24 → 23; Undo вернул 0/24.
- PASS — RU/EN меню, subtitle, metadata и accessibility labels переключаются; Daily Ranking открывается в обоих языках.
- PASS — ПКМ на интерфейсе не открыл системное контекстное меню.
- PASS — свежие RU и EN debug-сеансы после загрузки file-id `13518975` не показали ни одной записи уровня `warn/error`; страница Черновика также без ошибок консоли.

## Изменённые файлы

- `src/App.tsx`, `src/audio.ts`, `src/save.ts`, `src/yandex.ts`, `src/i18n.ts`, `src/styles.css`, `src/components/GameCanvas.tsx`
- `index.html`, `package.json`, `README.md`
- `tests/game.test.ts`, `scripts/package-yandex.mjs`, `scripts/capture-promos.mjs`, `scripts/smoke-browser.mjs`
- `public/favicon.png`
- `YANDEX_MODERATION_CHECKLIST.md`, `RELEASE_AUDIT.md`, `ASSET_PROVENANCE.md`

## Перед отправкой

- Серверная обработка финального archive file-id `13518975` проверена: все стадии показывают success, включая «Готово».
- Кнопка «Отправить на модерацию» намеренно не нажата: это отдельное финальное внешнее действие.
- Происхождение ассетов и подтверждение владельца по пункту 3.5 зафиксированы в `ASSET_PROVENANCE.md`. Пункт 3.4.2 в редакции от 22.09.2026 запрещает чёрную магию и инап-покупки в играх с гаданиями; таких материалов и покупок в игре нет.

## Ограничения физической проверки

- Реальные Android/iOS устройства, системные media controls, физический fullscreen и фактический показ rewarded/interstitial требуют отдельного прогона в аккаунте/на устройствах; кодовые watchdog, блокировки и draft-настройки проверены.
- Отправка на модерацию не выполнялась по отдельному правилу безопасности: черновик полностью подготовлен и оставлен на финальное действие владельца.
