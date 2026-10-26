const { existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function executable(name) {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'bin', name),
    path.join(os.homedir(), '.local', 'bin', name),
    ...(process.platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'].map(dir => path.join(dir, name)) : []),
    path.join('/usr/bin', name),
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, name))
  ];
  const found = candidates.find(file => file && existsSync(file));
  if (!found) throw new Error(`No se encontró ${name}. ${process.platform === 'darwin' ? 'Reinstala YAMP o ejecuta: brew install mpv yt-dlp.' : `Instala ${name} para continuar.`}`);
  return found;
}

function chromeExecutable() {
  return (process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  ] : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/google-chrome']).find(existsSync);
}

module.exports = { executable, chromeExecutable };
