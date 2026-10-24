const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ChromeMusic = require('./chrome.cjs');
const { saveSession } = require('./auth-session.cjs');
const { NativePlayer } = require('./native-player.cjs');
const { Catalogue } = require('./catalogue.cjs');

const test = process.env.YAMP_TEST === '1';
app.setName('YAMP');
app.setDesktopName('yamp.desktop');
app.setPath('userData', test ? process.env.YAMP_TEST_PROFILE : path.join(app.getPath('appData'), 'yamp'));
let mini, player, catalogue, chrome, mpris, timer, quitting = false;
let mode = 'catalogue', catalogueBusy = false;
let state = { ready: false, queue: [], volume: 0.75 };
const uiURL = pathToFileURL(path.join(__dirname, 'index.html')).href;

function refresh() {
  if (!player || !mini || mini.isDestroyed()) return;
  state = {
    ...player.snapshot(), pinned: mini.isAlwaysOnTop(), mode,
    catalogue: catalogue.view, catalogueBusy, authenticating: !!chrome?.process
  };
  if (mpris) {
    mpris.playbackStatus = player.engine.properties['idle-active'] ? 'Stopped' : state.playing ? 'Playing' : 'Paused';
    const metadata = {
      'mpris:trackid': mpris.objectPath(`track/${(state.id || 'current').replace(/[^a-zA-Z0-9_]/g, '_')}`),
      'mpris:length': Math.round(state.duration * 1e6),
      'xesam:title': state.title || 'YAMP', 'xesam:artist': [state.artist || 'YouTube Music'], 'xesam:album': state.album || ''
    };
    if (JSON.stringify(metadata) !== JSON.stringify(mpris.metadata)) mpris.metadata = metadata;
  }
  mini.webContents.send('yamp:state', state);
}
async function transport(action, value) {
  if (action === 'like') {
    const id = player.snapshot().id;
    if (!id) throw new Error('Selecciona una canción primero.');
    await catalogue.like(id);
  } else await player.run(action, value);
  refresh();
}
async function browse(operation) {
  if (catalogueBusy) throw new Error('Espera a que termine de cargar la lista.');
  mode = 'catalogue'; catalogueBusy = true; refresh();
  try { await operation(); } finally { catalogueBusy = false; refresh(); }
}
function setupMpris() {
  try {
    const Player = require('@jellybrick/mpris-service');
    mpris = new Player({ name: test ? 'yamp_test' : 'yamp', identity: 'YAMP', supportedUriSchemes: ['https'], supportedMimeTypes: ['audio/webm'], supportedInterfaces: ['player'] });
    mpris.on('error', error => console.error('MPRIS:', error.message));
    const perform = (action, value) => transport(action, value).catch(error => { player.error = error.message; refresh(); });
    for (const [event, action] of Object.entries({ play: 'play', pause: 'pause', playpause: 'toggle', stop: 'stop', next: 'next', previous: 'previous' })) mpris.on(event, () => perform(action));
    mpris.on('raise', () => { mini.show(); mini.focus(); });
    mpris.on('quit', () => app.quit());
    mpris.on('seek', offset => perform('seek', Math.max(0, state.time + offset / 1e6)));
    mpris.on('position', event => perform('seek', Math.max(0, event.position / 1e6)));
    mpris.on('volume', value => perform('volume', Math.max(0, Math.min(1, value))));
    mpris.getPosition = () => Math.round(state.time * 1e6);
    mpris.canPlay = mpris.canPause = mpris.canGoNext = mpris.canGoPrevious = mpris.canSeek = true;
  } catch (error) { console.error('MPRIS no disponible:', error.message); }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { mini?.show(); mini?.focus(); });
  app.whenReady().then(async () => {
    const directory = app.getPath('userData');
    chrome = new ChromeMusic(path.join(directory, 'chrome-profile'));
    catalogue = new Catalogue(directory);
    if (test) {
      const { FixtureCatalogue, resolver } = require('../tests/fixtures.cjs');
      catalogue = new FixtureCatalogue(); player = new NativePlayer(directory, resolver);
    } else player = new NativePlayer(directory);
    player.on('change', refresh);
    await player.start();
    mini = new BrowserWindow({
      title: 'YAMP', width: 420, height: 500, resizable: false, frame: false,
      backgroundColor: '#242532', show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    mini.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mini.webContents.on('will-navigate', event => event.preventDefault());
    mini.on('closed', () => app.quit());
    ipcMain.handle('yamp:command', async (event, action, value) => {
      if (event.sender !== mini.webContents || event.senderFrame !== mini.webContents.mainFrame || event.senderFrame.url !== uiURL) throw new Error('Origen inválido');
      try {
        switch (action) {
          case 'state': refresh(); return { ok: true, state };
          case 'music': case 'home': await browse(() => catalogue.home()); break;
          case 'library': await browse(() => catalogue.library()); break;
          case 'show-queue': mode = 'queue'; break;
          case 'search':
            if (typeof value !== 'string' || !value.trim() || value.length > 300) throw new Error('Escribe una búsqueda válida.');
            await browse(() => catalogue.search(value.trim())); break;
          case 'filter': if (typeof value !== 'string') throw new Error('Filtro inválido'); await browse(() => catalogue.filter(value)); break;
          case 'more': await browse(() => catalogue.more()); break;
          case 'open-item': case 'enqueue': {
            const row = catalogue.selected(value);
            if (['song', 'video'].includes(row.kind)) {
              if (action === 'enqueue') player.queue.push({ ...row });
              else player.playRows(catalogue.view.items, row.id);
            } else await browse(() => catalogue.open(row));
            break;
          }
          case 'login': await chrome.login(); break;
          case 'save-session': {
            if (!chrome.process) throw new Error('Pulsa CUENTA para iniciar sesión primero.');
            const { cookies } = await chrome.send('Storage.getCookies');
            await saveSession(directory, cookies);
            catalogue.resetAuth();
            await browse(() => catalogue.library());
            await chrome.close();
            break;
          }
          case 'pin': mini.setAlwaysOnTop(!mini.isAlwaysOnTop()); break;
          case 'minimize': mini.hide(); break;
          case 'close': app.quit(); break;
          case 'compact': mini.setSize(420, value === true ? 240 : 500); break;
          case 'volume':
            if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Volumen inválido');
            await transport(action, value); break;
          case 'seek':
            if (!Number.isFinite(value) || value < 0) throw new Error('Posición inválida');
            await transport(action, value); break;
          case 'queue':
            if (!Number.isInteger(value) || value < 0 || value >= player.queue.length) throw new Error('Canción inválida');
            await transport(action, value); break;
          default:
            if (!['play', 'pause', 'toggle', 'stop', 'previous', 'next', 'shuffle', 'repeat', 'like', 'mute'].includes(action)) throw new Error('Acción inválida');
            await transport(action);
        }
        refresh(); return { ok: true };
      } catch (error) { return { ok: false, error: error.message }; }
    });
    await mini.loadFile(path.join(__dirname, 'index.html'));
    mini.show(); setupMpris(); refresh();
    browse(() => catalogue.home()).catch(error => { player.error = error.message; refresh(); });
    if (!test && process.argv.includes('--login')) chrome.login().then(refresh).catch(error => { player.error = error.message; refresh(); });
    timer = setInterval(refresh, 500);
  }).catch(error => { console.error(error.message); app.quit(); });
}
app.on('before-quit', event => {
  if (quitting) return;
  quitting = true; clearInterval(timer);
  event.preventDefault();
  Promise.allSettled([player?.close(), chrome?.close()]).finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
