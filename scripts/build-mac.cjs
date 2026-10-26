const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { Resvg } = require('@resvg/resvg-js');
const { build, Platform, Arch } = require('electron-builder');
const { executable } = require('../src/platform.cjs');

const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'build', 'mac-resources');
const bin = path.join(resources, 'bin');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const copied = new Map();
let minimum = '12.0';
const newer = (a, b) => a.localeCompare(b, undefined, { numeric: true }) > 0;

async function bundle(source, name = path.basename(source)) {
  source = await fs.realpath(source);
  if (copied.has(name)) {
    if (copied.get(name) !== source) throw new Error(`Bibliotecas con nombre duplicado: ${name}`);
    return;
  }
  copied.set(name, source);
  const destination = path.join(bin, name);
  await fs.copyFile(source, destination);
  await fs.chmod(destination, 0o755);
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  if (!run('lipo', ['-archs', source]).split(/\s+/).includes(arch)) throw new Error(`Arquitectura incompatible: ${source}`);
  const commands = run('otool', ['-l', source]);
  for (const match of commands.matchAll(/(?:minos|\bversion) (\d+\.\d+(?:\.\d+)?)/g)) {
    // LC_BUILD_VERSION uses minos; legacy files use LC_VERSION_MIN_MACOSX.
    if (match[0].startsWith('minos') && newer(match[1], minimum)) minimum = match[1];
  }
  const rpaths = [...commands.matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (.+?) \(offset/g)].map(m => m[1]);
  const dependencies = run('otool', ['-L', source]).split('\n').slice(1).map(line => line.trim().split(' (')[0]);
  for (const dependency of dependencies) {
    if (dependency.startsWith('/usr/lib/') || dependency.startsWith('/System/')) continue;
    let resolved = dependency.replace('@loader_path', path.dirname(source));
    if (dependency.startsWith('@rpath/')) {
      const candidates = rpaths.map(dir => path.join(dir.replace('@loader_path', path.dirname(source)), dependency.slice(7)));
      resolved = candidates.find(file => require('node:fs').existsSync(file));
      if (!resolved) throw new Error(`No se pudo resolver ${dependency} en ${source}`);
    }
    if (!path.isAbsolute(resolved)) throw new Error(`Dependencia no soportada: ${dependency}`);
    if (await fs.realpath(resolved) === source) continue;
    await bundle(resolved);
    run('install_name_tool', ['-change', dependency, `@loader_path/${path.basename(resolved)}`, destination]);
  }
  if (name.endsWith('.dylib')) run('install_name_tool', ['-id', `@loader_path/${name}`, destination]);
  run('codesign', ['--force', '--sign', '-', destination]);
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Construye el DMG desde macOS.');
  await fs.rm(resources, { recursive: true, force: true });
  await fs.mkdir(bin, { recursive: true });
  console.log('Empaquetando mpv y sus bibliotecas…');
  await bundle(executable('mpv'), 'mpv');
  const version = '2026.10.21';
  const response = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp_macos`);
  if (!response.ok) throw new Error(`Descarga yt-dlp: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== '7a6fe71d7d680f1fb0ac18d4949873d77db2859e90017c0f44bd94b23be4ee40') throw new Error('Checksum de yt-dlp inválido.');
  await fs.writeFile(path.join(bin, 'yt-dlp'), bytes, { mode: 0o755 });
  run(path.join(bin, 'mpv'), ['--version']);
  run(path.join(bin, 'yt-dlp'), ['--version']);
  await fs.writeFile(path.join(resources, 'runtime-manifest.json'), JSON.stringify({ arch: process.arch, minimumSystemVersion: minimum, ytDlp: version, libraries: Object.fromEntries(copied) }, null, 2));
  const iconset = path.join(root, 'build', 'yamp.iconset');
  await fs.mkdir(iconset, { recursive: true });
  const svg = await fs.readFile(path.join(root, 'assets', 'yamp.svg'));
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: size * scale } }).render().asPng();
      await fs.writeFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`), png);
    }
  }
  run('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build', 'yamp.icns')]);
  console.log(`Creando DMG ${process.arch}, macOS >= ${minimum}…`);
  await build({
    targets: Platform.MAC.createTarget(['dmg'], process.arch === 'arm64' ? Arch.arm64 : Arch.x64),
    config: {
      appId: 'app.yamp.desktop', productName: 'YAMP', asar: true,
      directories: { output: 'dist', buildResources: 'build' },
      files: ['src/**/*', 'assets/**/*', 'package.json'],
      extraResources: [{ from: resources, to: '.' }],
      npmRebuild: false,
      mac: { category: 'public.app-category.music', icon: 'build/yamp.icns', minimumSystemVersion: minimum, identity: '-', hardenedRuntime: false },
      dmg: { title: 'Instalar YAMP', contents: [{ x: 140, y: 180, type: 'file' }, { x: 400, y: 180, type: 'link', path: '/Applications' }] },
      artifactName: 'YAMP-${version}-mac-${arch}.${ext}'
    }
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
