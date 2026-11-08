const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { Resvg } = require('@resvg/resvg-js');
const { build, Platform, Arch } = require('electron-builder');
const { path7za } = require('7zip-bin');

const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'build', 'win-resources');
const downloads = path.join(root, 'build', 'win-downloads');
const bin = path.join(resources, 'bin');
const runtimes = [
  { name: 'mpv.7z', url: 'https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20261108/mpv-x86_64-20261108-git-55d3feb45c.7z', sha256: '465faafbf90527421ccc304870f02e59f3f47d3361a6f526ef95f40f8f2c2459' },
  { name: 'yt-dlp.exe', url: 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe', sha256: 'f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d' }
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function download(runtime) {
  const file = path.join(downloads, runtime.name);
  try { if (hash(await fs.readFile(file)) === runtime.sha256) return file; } catch {}
  console.log(`Descargando ${runtime.name}…`);
  const response = await fetch(runtime.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Descarga ${runtime.name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== runtime.sha256) throw new Error(`Checksum inválido: ${runtime.name}`);
  await fs.writeFile(file, bytes); return file;
}
async function main() {
  await fs.mkdir(downloads, { recursive: true });
  const [mpv, ytdlp] = await Promise.all(runtimes.map(download));
  await fs.rm(resources, { recursive: true, force: true });
  await fs.mkdir(bin, { recursive: true });
  if (process.platform !== 'win32') await fs.chmod(path7za, 0o755);
  execFileSync(path7za, ['x', mpv, `-o${bin}`, '-y'], { stdio: 'inherit', windowsHide: true });
  await fs.access(path.join(bin, 'mpv.exe'));
  await fs.copyFile(ytdlp, path.join(bin, 'yt-dlp.exe'));
  await fs.writeFile(path.join(resources, 'runtime-manifest.json'), JSON.stringify({ platform: 'win32', arch: 'x64', runtimes }, null, 2));
  const svg = await fs.readFile(path.join(root, 'assets', 'yamp.svg'));
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  await fs.writeFile(path.join(root, 'build', 'yamp.ico'), Buffer.concat([header, png]));
  console.log('Creando instalador de Windows x64…');
  const artifacts = await build({
    targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
    config: {
      appId: 'app.yamp.desktop', productName: 'YAMP', asar: true,
      directories: { output: 'dist', buildResources: 'build' },
      files: ['src/**/*', 'assets/**/*', 'package.json'],
      extraResources: [{ from: resources, to: '.' }], npmRebuild: false,
      win: { icon: 'build/yamp.ico', artifactName: 'YAMP-${version}-windows-${arch}-setup.${ext}' },
      nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: 'YAMP',
        installerLanguages: ['es_ES', 'en_US'], displayLanguageSelector: true, deleteAppDataOnUninstall: false }
    }
  });
  const checksums = [];
  for (const file of artifacts.filter(file => file.endsWith('.exe'))) {
    checksums.push(`${hash(await fs.readFile(file))}  ${path.basename(file)}`);
  }
  await fs.writeFile(path.join(root, 'dist', 'windows-SHA256SUMS.txt'), checksums.join('\n') + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
