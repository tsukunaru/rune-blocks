import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';

const projectRoot = process.cwd();
const distRoot = resolve(projectRoot, 'dist');
const chromeCandidates = process.platform === 'win32'
  ? [
    `${process.env.PROGRAMFILES ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
  ]
  : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chromePath = process.env.CHROME_PATH || chromeCandidates.find((candidate) => existsSync(candidate));
if (!chromePath) throw new Error('Chrome/Chromium not found. Set CHROME_PATH to its executable.');
const profileDir = resolve(tmpdir(), 'rune-blocks-smoke-chrome');
const port = 4179;
const debugPort = 9225;
const appUrl = `http://127.0.0.1:${port}/`;

const sdkMock = `
(() => {
  const listeners = new Map();
  const state = window.__yandexSmoke = { ready: 0, starts: 0, stops: 0, sequence: [] };
  window.__emitSdk = (event) => (listeners.get(event) || new Set()).forEach((callback) => callback());
  window.YaGames = { init: async () => ({
    EVENTS: {
      ACCOUNT_SELECTION_DIALOG_OPENED: 'ACCOUNT_SELECTION_DIALOG_OPENED',
      ACCOUNT_SELECTION_DIALOG_CLOSED: 'ACCOUNT_SELECTION_DIALOG_CLOSED'
    },
    environment: { i18n: { lang: 'en' } },
    features: {
      LoadingAPI: { ready: () => { state.ready += 1; state.sequence.push('ready'); } },
      GameplayAPI: {
        start: () => { state.starts += 1; state.sequence.push('start'); },
        stop: () => { state.stops += 1; state.sequence.push('stop'); }
      }
    },
    getPlayer: async () => ({
      getUniqueID: () => 'smoke-player',
      isAuthorized: () => false,
      getData: async () => ({}),
      setData: async () => undefined
    }),
    isAvailableMethod: async () => false,
    on: (event, callback) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
      return () => listeners.get(event)?.delete(callback);
    },
    off: (event, callback) => listeners.get(event)?.delete(callback),
    adv: {
      showRewardedVideo: ({ callbacks }) => setTimeout(() => {
        callbacks.onOpen?.(); callbacks.onRewarded?.(); callbacks.onClose?.(true);
      }, 60),
      showFullscreenAdv: ({ callbacks }) => setTimeout(() => {
        callbacks.onOpen?.(); callbacks.onClose?.(false);
      }, 60)
    }
  }) };
})();`;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', appUrl).pathname;
    if (pathname === '/sdk.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(sdkMock);
      return;
    }
    const target = resolve(distRoot, pathname === '/' ? 'index.html' : `.${pathname}`);
    if (target !== distRoot && !target.startsWith(`${distRoot}${sep}`)) throw new Error('Unsafe static path');
    const data = await readFile(target);
    response.writeHead(200, { 'content-type': mimeTypes[extname(target)] ?? 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise((resolvePromise) => server.listen(port, '127.0.0.1', resolvePromise));
if (!profileDir.startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('Unsafe Chrome profile path');
await rm(profileDir, { recursive: true, force: true });

const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, appUrl,
], { windowsHide: true, stdio: 'ignore' });

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const waitForDebugger = async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith(appUrl));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* Chrome is still starting. */ }
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
};

let socket;
const runtimeErrors = [];
try {
  socket = new WebSocket(await waitForDebugger());
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      runtimeErrors.push(message.params.args.map((entry) => entry.value ?? entry.description ?? '').join(' '));
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  const cdp = (method, params = {}) => new Promise((resolvePromise, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve: resolvePromise, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };

  const waitFor = async (expression, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(75);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };

  const setViewport = async (width, height, mobile = width < 900) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(150);
  };

  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('rune-blocks-save-v1', JSON.stringify({ language: 'ru', updatedAt: 1 }));
    window.__seededRussianSave = true;
  ` });
  await cdp('Page.reload', { ignoreCache: true });
  await waitFor("window.__seededRussianSave && document.querySelector('.menu-screen') && !document.querySelector('.loading-screen')");
  await sleep(100);
  assert(await evaluate('window.__yandexSmoke.ready') === 1, 'LoadingAPI.ready must be called exactly once');
  assert(await evaluate("document.documentElement.lang === 'en' && document.querySelector('.title-lockup')?.textContent.includes('Cozy Block Puzzle')"),
    'SDK language must override a stale saved language before Game Ready');

  const menuContext = await evaluate(`(() => {
    const target = document.querySelector('.title-lockup');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return { prevented: event.defaultPrevented, selection: getComputedStyle(target).userSelect,
      width: document.documentElement.scrollWidth, viewport: innerWidth };
  })()`);
  assert(menuContext.prevented, 'Context menu was not prevented on menu text');
  assert(menuContext.selection === 'none', 'Game text remains selectable');
  assert(menuContext.width <= menuContext.viewport + 2, 'Menu creates horizontal browser scroll');

  await evaluate(`(() => {
    const skip = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Skip'));
    skip?.click();
  })()`);
  for (const language of ['ru', 'en']) {
    await evaluate("document.querySelector('.small-actions button:last-child').click()");
    await waitFor("document.querySelector('.settings-list')");
    await evaluate("[...document.querySelectorAll('.settings-list button')].find(button => button.textContent.includes('RU / EN')).click()");
    await waitFor(`document.documentElement.lang === '${language}'`);
    await evaluate("document.querySelector('.page-header button').click()");
    await waitFor("document.querySelector('.main-actions .primary')");
    for (const [width, height] of [[1120, 680], [1280, 720], [1920, 1080]]) {
      await setViewport(width, height);
      const layout = await evaluate(`(() => {
        const menu = document.querySelector('.menu-screen');
        const play = menu.querySelector('.main-actions .primary');
        const clipped = [...menu.querySelectorAll('button')].filter((button) => {
          const box = button.getBoundingClientRect();
          return box.top < 0 || box.left < 0 || box.right > innerWidth || box.bottom > innerHeight;
        }).map((button) => button.textContent.trim());
        return { scale: play.getBoundingClientRect().height / play.offsetHeight, scrollX: menu.scrollWidth - menu.clientWidth,
          scrollY: menu.scrollHeight - menu.clientHeight, clipped };
      })()`);
      assert(Math.abs(layout.scale - 1.5) < .02 && layout.scrollX <= 1 && layout.scrollY <= 1 && layout.clipped.length === 0,
        `150% menu does not fit in ${language} at ${width}x${height}: ${JSON.stringify(layout)}`);
    }
  }
  await evaluate("document.querySelector('.main-actions .primary').click()");
  await waitFor("document.querySelector('.game-screen canvas.game-canvas')");
  assert(await evaluate('window.__yandexSmoke.starts') >= 1, 'GameplayAPI.start was not called on level start');

  const viewports = [[320, 568], [360, 640], [390, 844], [568, 320], [667, 375], [740, 360], [844, 390], [1024, 600], [1280, 720]];
  for (const [width, height] of viewports) {
    await setViewport(width, height);
    const layout = await evaluate(`(() => {
      const canvas = document.querySelector('.game-canvas').getBoundingClientRect();
      const controls = document.querySelector('.game-controls').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.game-controls button')].map((button) => button.getBoundingClientRect().height);
      return { canvas: { top: canvas.top, bottom: canvas.bottom, width: canvas.width, height: canvas.height },
        controls: { top: controls.top, bottom: controls.bottom, display: getComputedStyle(document.querySelector('.game-controls')).display },
        buttons, scrollWidth: document.documentElement.scrollWidth, innerWidth, innerHeight };
    })()`);
    assert(layout.canvas.width > 0 && layout.canvas.height > 0, `Canvas disappeared at ${width}x${height}`);
    assert(layout.controls.display !== 'none', `Game controls disappeared at ${width}x${height}`);
    assert(layout.buttons.every((buttonHeight) => buttonHeight >= 43.5), `Touch target is below 44px at ${width}x${height}`);
    assert(layout.controls.bottom <= layout.innerHeight + 2, `Controls are clipped at ${width}x${height}`);
    assert(layout.scrollWidth <= layout.innerWidth + 2, `Horizontal scroll at ${width}x${height}`);
  }

  const canvasContext = await evaluate(`(() => {
    const target = document.querySelector('.game-canvas');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  assert(canvasContext, 'Context menu was not prevented on canvas');

  await setViewport(390, 844, true);
  const pointer = await evaluate(`(() => {
    const rect = document.querySelector('.game-canvas').getBoundingClientRect();
    return { x: rect.left + rect.width / 6, y: rect.bottom - 30 };
  })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pointer.x, y: pointer.y, button: 'left', clickCount: 1 });
  await setViewport(844, 390, true);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pointer.x, y: pointer.y, button: 'left', clickCount: 1 });

  await evaluate("document.querySelectorAll('.game-controls button')[2].click()");
  await waitFor("document.querySelector('.modal-card')?.textContent.includes('Game paused')");
  const stoppedAtPause = await evaluate('window.__yandexSmoke.stops');
  assert(stoppedAtPause >= 1, 'GameplayAPI.stop was not called on pause');
  await evaluate(`[...document.querySelectorAll('.modal-card button')].find((button) => button.textContent.includes('Resume'))?.click()`);
  await waitFor("!document.querySelector('.modal-card')");

  const lifecycleBefore = await evaluate('({ ...window.__yandexSmoke })');
  await evaluate("window.__emitSdk('game_api_pause')");
  await sleep(25);
  await evaluate("window.__emitSdk('game_api_resume')");
  await sleep(25);
  await evaluate("window.dispatchEvent(new Event('blur'))");
  await sleep(25);
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await sleep(25);
  const visibilitySupported = await evaluate(`(() => {
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
      return true;
    } catch { return false; }
  })()`);
  await sleep(25);
  const lifecycleAfter = await evaluate('({ ...window.__yandexSmoke })');
  assert(lifecycleAfter.stops > lifecycleBefore.stops, 'Lifecycle events did not stop gameplay');
  assert(lifecycleAfter.starts > lifecycleBefore.starts, 'Lifecycle resume did not restart eligible gameplay');
  assert(visibilitySupported, 'Could not exercise visibilitychange in browser smoke');

  const historyLength = await evaluate('history.length');
  await evaluate("document.querySelector('.game-header .icon-button').click()");
  await waitFor("document.querySelector('.modal-card')");
  await evaluate(`[...document.querySelectorAll('.modal-card button')].find((button) => button.textContent.trim() === 'Menu')?.click()`);
  await waitFor("document.querySelector('.menu-screen')");
  assert(await evaluate('history.length') === historyLength, 'Internal navigation polluted browser history');

  assert(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join(' | ')}`);
  console.log(`Browser smoke: PASS (RU/EN menu zoom, ${viewports.length} gameplay viewports, context menu, lifecycle, rotation, history)`);
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  await sleep(200);
  await rm(profileDir, { recursive: true, force: true });
}
