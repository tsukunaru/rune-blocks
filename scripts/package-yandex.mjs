import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync } from 'fflate';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const releaseRoot = resolve(projectRoot, 'release');
const archivePath = resolve(releaseRoot, 'rune-blocks-yandex.zip');

const walk = async (folder = distRoot) => {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};

export const validateArchive = (entries) => {
  const names = Object.keys(entries).map((name) => name.split('\\').join('/'));
  const required = [
    names.includes('index.html'),
    names.some((name) => /^assets\/.+\.js$/.test(name)),
    names.some((name) => /^assets\/.+\.css$/.test(name)),
    names.includes('audio/README.txt'),
    names.includes('audio/moonlit-isles.wav'),
    names.includes('pixel-isles-bg.png'),
    names.includes('favicon.png'),
    names.includes('menu-puzzle-sanctuary.png'),
    names.includes('mechanic-tiles.png'),
    names.includes('biome-enchanted-forest.png'),
    names.includes('biome-moon-ruins.png'),
    names.includes('biome-crystal-caves.png'),
    names.includes('biome-sky-city.png'),
    names.includes('biome-ember-citadel.png'),
  ];
  if (required.includes(false)) throw new Error('Yandex ZIP is missing a required runtime file');
  const forbidden = names.find((name) => name.startsWith('/') || name.startsWith('../') || name.startsWith('dist/')
    || /(^|\/)(node_modules|src|tests|release)(\/|$)/i.test(name) || name.toLowerCase().endsWith('.zip'));
  if (forbidden) throw new Error(`Forbidden ZIP entry: ${forbidden}`);
  const unsafeName = names.find((name) => !/^[A-Za-z0-9_./-]+$/.test(name));
  if (unsafeName) throw new Error(`ZIP entry must use an ASCII name without spaces: ${unsafeName}`);
  const unpackedBytes = Object.values(entries).reduce((total, value) => total + value.byteLength, 0);
  if (unpackedBytes >= 100 * 1024 * 1024) throw new Error('Uncompressed Yandex package is 100 MB or larger');
  const html = new TextDecoder().decode(entries['index.html']);
  if (!html.includes('src="/sdk.js"')) throw new Error('Yandex SDK loader is missing from index.html');
  if (/\b(Block Blast)\b/i.test(html)) throw new Error('Third-party product name found in metadata');
  return names;
};

const packageYandex = async () => {
  if (!releaseRoot.startsWith(projectRoot + sep)) throw new Error('Release path escaped the project');
  const files = (await walk()).sort();
  const entries = {};
  for (const path of files) entries[relative(distRoot, path).split('\\').join('/')] = new Uint8Array(await readFile(path));
  const archive = zipSync(entries, { level: 9, mtime: new Date('1980-01-01T00:00:00.000Z') });
  validateArchive(unzipSync(archive));
  await mkdir(releaseRoot, { recursive: true });
  await rm(archivePath, { force: true });
  await writeFile(archivePath, archive);
  validateArchive(unzipSync(new Uint8Array(await readFile(archivePath))));
  console.log(`Yandex package: ${archivePath}`);
  console.log(`Files: ${files.length}; size: ${(archive.byteLength / 1024 / 1024).toFixed(2)} MB`);
};

packageYandex().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
