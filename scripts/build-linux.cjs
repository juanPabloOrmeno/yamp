const fs = require('node:fs/promises');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const { build, Platform, Arch } = require('electron-builder');

async function main() {
  const root = path.resolve(__dirname, '..');
  await fs.mkdir(path.join(root, 'build'), { recursive: true });
  const svg = await fs.readFile(path.join(root, 'assets', 'yamp.svg'));
  await fs.writeFile(path.join(root, 'build', 'yamp.png'), new Resvg(svg, {
    fitTo: { mode: 'width', value: 512 }
  }).render().asPng());
  await build({
    targets: Platform.LINUX.createTarget(['AppImage', 'deb', 'rpm'], Arch.x64),
    config: {
      appId: 'app.yamp.desktop', productName: 'YAMP', asar: true,
      directories: { output: 'dist', buildResources: 'build' },
      files: ['src/**/*', 'assets/**/*', 'package.json'],
      npmRebuild: false,
      linux: {
        icon: 'build/yamp.png', category: 'AudioVideo',
        maintainer: 'juanPabloOrmeno <juanPabloOrmeno@users.noreply.github.com>',
        executableName: 'yamp',
        artifactName: 'YAMP-${version}-linux-${arch}.${ext}'
      },
      deb: { depends: ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0', 'mpv', 'yt-dlp'] },
      rpm: { depends: ['gtk3', 'nss', 'libXScrnSaver', 'libXtst', 'xdg-utils', 'at-spi2-core', 'libuuid', 'libsecret', 'mpv', 'yt-dlp'] }
    }
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
