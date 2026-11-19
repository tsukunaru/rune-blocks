import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const appUrl = process.env.RUNE_BLOCKS_URL ?? 'http://127.0.0.1:5173/';
const projectRoot = process.cwd();
const promoDir = path.join(projectRoot, 'release', 'promo');
const profileDir = path.join(tmpdir(), 'rune-blocks-promo-chrome');
const debugPort = 9224;

if (!profileDir.startsWith(`${path.resolve(tmpdir())}${path.sep}`)) throw new Error('Unsafe capture profile path');
await mkdir(promoDir, { recursive: true });
await rm(profileDir, { recursive: true, force: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  appUrl,
], { windowsHide: true, stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForDebugger = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith(appUrl));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* Chrome is still starting. */ }
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
};

const socket = new WebSocket(await waitForDebugger());
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId;
  nextId += 1;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
};

const waitFor = async (expression, timeoutMs = 12_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  const state = await evaluate(`({ url: location.href, text: document.body?.innerText?.slice(0, 500), html: document.body?.innerHTML?.slice(0, 500) })`);
  throw new Error(`Timed out waiting for: ${expression}\n${JSON.stringify(state)}`);
};

const clickText = (text) => evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim().includes(${JSON.stringify(text)}));
  if (!button) return false;
  button.click();
  return true;
})()`);

const clickLevel = (language, level) => evaluate(`(() => {
  const button = document.querySelector(${JSON.stringify(`button[aria-label="${language === 'ru' ? 'Уровень' : 'Level'} ${level}"]`)});
  if (!button) return false;
  button.click();
  return true;
})()`);

const setViewport = async (kind) => {
  const portrait = kind === 'mobile';
  await cdp('Emulation.setDeviceMetricsOverride', portrait
    ? { width: 720, height: 1280, deviceScaleFactor: 1.5, mobile: true }
    : { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false });
  await sleep(350);
};

const capture = async (filename) => {
  const { data } = await cdp('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(promoDir, filename), Buffer.from(data, 'base64'));
};

const saveFor = (language) => ({
  version: 1,
  playerId: null,
  updatedAt: Date.now(),
  language,
  settings: { music: false, sounds: false, vibration: false },
  tutorialCompleted: true,
  seenMechanics: { stones: true, ice: true, crystals: true, seals: true },
  campaign: { unlocked: 100, stars: {}, scores: {} },
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

const loadLanguage = async (language) => {
  await waitFor(`location.origin === ${JSON.stringify(new URL(appUrl).origin)} && document.readyState !== 'loading'`);
  await evaluate(`localStorage.setItem('rune-blocks-save-v1', ${JSON.stringify(JSON.stringify(saveFor(language)))})`);
  try {
    await cdp('Page.reload', { ignoreCache: false });
  } catch (error) {
    if (!String(error).includes('Inspected target navigated or closed')) throw error;
  }
  await waitFor("document.querySelector('.menu-screen') && !document.querySelector('.loading-screen')", 15_000);
};

const openCampaignLevel = async (language, level) => {
  await clickText(language === 'ru' ? 'Кампания' : 'Campaign');
  await waitFor("document.querySelector('.campaign-screen')");
  if (!await clickLevel(language, level)) throw new Error(`Level ${level} button not found`);
  await waitFor("document.querySelector('.game-screen canvas.game-canvas')");
  await sleep(500);
};

const leaveLevel = async (language) => {
  await evaluate(`document.querySelector('.game-screen .icon-button')?.click()`);
  await waitFor("document.querySelector('.game-screen .modal-card')");
  await clickText(language === 'ru' ? 'В меню' : 'Menu');
  await waitFor("document.querySelector('.menu-screen')");
  await clickText(language === 'ru' ? 'Кампания' : 'Campaign');
  await waitFor("document.querySelector('.campaign-screen')");
};

const key = (value) => evaluate(`(() => {
  const canvas = document.querySelector('canvas.game-canvas');
  if (!canvas) return false;
  canvas.focus();
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(value)}, bubbles: true }));
  return true;
})()`);

const place = async (slot, row, col) => {
  await key(String(slot));
  for (let index = 0; index < row; index += 1) await key('ArrowDown');
  for (let index = 0; index < col; index += 1) await key('ArrowRight');
  await key('Enter');
  await sleep(350);
};

const captureLanguage = async (language) => {
  await loadLanguage(language);
  await setViewport('desktop');
  await openCampaignLevel(language, 21);
  await capture(`${language}-desktop-1.png`);
  await setViewport('mobile');
  await capture(`${language}-mobile-1.png`);
  await setViewport('desktop');
  await leaveLevel(language);
  await openCampaignLevel(language, 81);
  await place(1, 0, 0);
  await place(2, 0, 4);
  await capture(`${language}-desktop-2.png`);
  await setViewport('mobile');
  await place(3, 4, 2);
  await capture(`${language}-mobile-2.png`);
  await setViewport('desktop');
  await leaveLevel(language);
};

const recordGameplay = async ({ language, width, height, name }) => {
  await loadLanguage(language);
  await setViewport(height > width ? 'mobile' : 'desktop');
  await openCampaignLevel(language, 1);
  const mimeType = await evaluate(`(() => {
    const candidates = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
  })()`);
  if (!mimeType) throw new Error('No supported MediaRecorder video format');

  await evaluate(`(() => {
    const source = document.querySelector('canvas.game-canvas');
    const output = document.createElement('canvas');
    output.width = ${width};
    output.height = ${height};
    const context = output.getContext('2d');
    let active = true;
    const draw = () => {
      const gradient = context.createLinearGradient(0, 0, 0, output.height);
      gradient.addColorStop(0, '#121844');
      gradient.addColorStop(1, '#090b28');
      context.fillStyle = gradient;
      context.fillRect(0, 0, output.width, output.height);
      const portrait = output.height > output.width;
      const marginX = portrait ? 72 : 64;
      const topSpace = portrait ? 210 : 112;
      const bottomSpace = portrait ? 170 : 92;
      const scale = Math.min(
        (output.width - marginX * 2) / source.width,
        (output.height - topSpace - bottomSpace) / source.height,
      );
      const width = source.width * scale;
      const height = source.height * scale;
      const left = (output.width - width) / 2;
      const top = topSpace + (output.height - topSpace - bottomSpace - height) / 2;
      context.shadowColor = 'rgba(76, 205, 255, .45)';
      context.shadowBlur = 28;
      context.drawImage(source, left, top, width, height);
      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(116, 231, 255, .8)';
      context.lineWidth = portrait ? 5 : 4;
      context.strokeRect(left - 3, top - 3, width + 6, height + 6);

      const copy = ${JSON.stringify({
        title: language === 'ru' ? 'РУННЫЕ БЛОКИ' : 'RUNE BLOCKS',
        subtitle: language === 'ru' ? 'Собери блоки. Разбуди острова.' : 'Place blocks. Awaken the isles.',
        cta: language === 'ru' ? 'ИГРАЙ БЕСПЛАТНО' : 'PLAY FREE',
      })};
      const titleSize = portrait ? 58 : 42;
      const subtitleSize = portrait ? 30 : 24;
      const ctaSize = portrait ? 32 : 24;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.shadowColor = 'rgba(0, 0, 0, .7)';
      context.shadowBlur = 12;
      context.fillStyle = '#f9d77a';
      context.font = '700 ' + titleSize + 'px "Courier New", monospace';
      context.fillText(copy.title, output.width / 2, portrait ? 74 : 38);
      context.fillStyle = '#d7edff';
      context.font = '600 ' + subtitleSize + 'px "Courier New", monospace';
      context.fillText(copy.subtitle, output.width / 2, portrait ? 142 : 78);
      context.fillStyle = '#fff1bd';
      context.font = '700 ' + ctaSize + 'px "Courier New", monospace';
      context.fillText(copy.cta, output.width / 2, output.height - (portrait ? 92 : 48));
      context.shadowBlur = 0;
      if (active) requestAnimationFrame(draw);
    };
    draw();
    const chunks = [];
    const recorder = new MediaRecorder(output.captureStream(30), { mimeType: ${JSON.stringify(mimeType)}, videoBitsPerSecond: 4_000_000 });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      active = false;
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const reader = new FileReader();
      reader.onloadend = () => { window.__promoVideo = { mimeType: recorder.mimeType, data: reader.result.split(',')[1] }; };
      reader.readAsDataURL(blob);
    };
    window.__promoRecorder = recorder;
    window.__promoVideo = null;
    recorder.start(500);
  })()`);

  await sleep(1_000);
  await place(1, 0, 0);
  await sleep(800);
  await place(2, 0, 4);
  await sleep(800);
  await place(3, 4, 0);
  await sleep(800);
  await place(1, 5, 5);
  await sleep(800);
  await place(2, 2, 2);
  await sleep(800);
  await place(3, 6, 0);
  await sleep(1_500);
  await evaluate('window.__promoRecorder.stop()');
  await waitFor('Boolean(window.__promoVideo)', 15_000);
  const video = await evaluate('window.__promoVideo');
  const extension = video.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  await writeFile(path.join(promoDir, `gameplay-${name}.${extension}`), Buffer.from(video.data, 'base64'));
  return { mimeType: video.mimeType, extension };
};

try {
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await captureLanguage('ru');
  await captureLanguage('en');
  const videos = [];
  for (const language of ['ru', 'en']) {
    videos.push(await recordGameplay({ language, width: 1280, height: 720, name: `${language}-16x9` }));
    videos.push(await recordGameplay({ language, width: 1080, height: 1920, name: `${language}-9x16` }));
  }
  console.log(JSON.stringify({ promoDir, videos }));
} finally {
  socket.close();
  chrome.kill();
  await sleep(250);
  await rm(profileDir, { recursive: true, force: true });
}
