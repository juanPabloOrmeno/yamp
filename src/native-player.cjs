const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { executable: findExecutable } = require('./platform.cjs');
const AudioEngine = require('./mpv.cjs');
const AudioCache = require('./audio-cache.cjs');
const History = require('./history.cjs');

function resolveAudio(id, directory, signal) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) throw new Error('Identificador de canción inválido.');
  const executable = findExecutable('yt-dlp');
  // Electron's own Node runtime also works as yt-dlp's JS engine; no desktop PATH dependency.
  const args = ['--no-playlist', '--skip-download', '--dump-single-json', '--no-warnings', '--socket-timeout', '20', '--js-runtimes', `node:${process.execPath}`, '-f', 'bestaudio/best'];
  const cookies = path.join(directory, 'cookies.txt');
  if (existsSync(cookies)) args.push('--cookies', cookies);
  args.push(`https://music.youtube.com/watch?v=${id}`);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'ignore'], signal, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    let output = '', finished = false;
    const timeout = setTimeout(() => { child.kill('SIGTERM'); finish(new Error('La canción tardó demasiado. Intenta otra o renueva tu sesión.')); }, 60000);
    function finish(error, result) {
      if (finished) return; finished = true; clearTimeout(timeout);
      if (error) reject(error); else resolve(result);
    }
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 16 * 1024 * 1024) { child.kill(); finish(new Error('Respuesta de audio demasiado grande.')); }
    });
    child.on('error', error => finish(error));
    child.on('close', code => {
      if (code !== 0) return finish(new Error('No se pudo abrir el audio. Renueva la sesión en CUENTA o prueba otra canción.'));
      try {
        const info = JSON.parse(output);
        if (!info.url || !info.url.startsWith('https://')) throw new Error('Audio no disponible para esta canción.');
        finish(null, { url: info.url, headers: info.http_headers || {}, duration: info.duration || 0 });
      } catch (error) { finish(error); }
    });
  });
}

class NativePlayer extends EventEmitter {
  constructor(directory, resolver = resolveAudio) {
    super(); this.directory = directory; this.resolve = resolver;
    this.cache = new AudioCache(directory); this.local = false;
    this.history = new History(directory);
    this.cache.on('change', () => this.emit('change'));
    this.engine = new AudioEngine(); this.queue = []; this.index = -1;
    this.shuffle = false; this.repeat = 'off'; this.loading = false; this.error = '';
    this.generation = 0;
    this.engine.on('failure', error => { this.error = error; this.emit('change'); });
    this.engine.on('file-loaded', () => {
      this.loading = false; this.error = '';
      if (this.historyTrack?.generation === this.generation) {
        this.history.record(this.historyTrack.track); this.historyTrack = null;
      }
      this.emit('change');
    });
    this.engine.on('end-file', event => {
      if (event.reason === 'error') { this.loading = false; this.error = 'No se pudo reproducir el audio. Prueba otra canción o renueva la sesión.'; this.emit('change'); }
      if (event.reason === 'eof') {
        if (this.repeat === 'one') this.playIndex(this.index);
        else this.next(false);
      }
    });
  }
  async start() {
    await this.history.start();
    try { await this.cache.start(); } catch { this.cache.error = 'No se puede acceder al almacenamiento local.'; }
    await this.engine.start();
  }
  snapshot() {
    const row = this.queue[this.index] || {};
    const p = this.engine.properties;
    return {
      ready: true, title: row.title || '', artist: row.artist || '', album: row.album || '', id: row.id || '',
      playing: !this.loading && !p.pause && !p['idle-active'], time: p['time-pos'] || 0,
      duration: p.duration || row.duration || 0, volume: (p.volume ?? 75) / 100,
      muted: !!p.mute, shuffle: this.shuffle, repeat: this.repeat, loading: this.loading, error: this.error,
      local: this.local, saving: this.cache.jobs.size, cacheError: this.cache.error,
      queue: this.queue.map((track, index) => ({ ...track, index, selected: index === this.index }))
    };
  }
  playRows(rows, id) {
    this.queue = rows.filter(row => ['song', 'video'].includes(row.kind));
    const index = this.queue.findIndex(row => row.id === id);
    if (index < 0) throw new Error('No hay una canción para reproducir.');
    this.playIndex(index);
  }
  playTrack(row) {
    this.queue.push({ ...row });
    this.playIndex(this.queue.length - 1);
  }
  playIndex(index) {
    if (!Number.isInteger(index) || !this.queue[index]) throw new Error('Canción fuera de la cola.');
    const generation = ++this.generation;
    this.abort?.abort(); this.abort = new AbortController();
    const signal = this.abort.signal;
    const track = this.queue[index];
    this.index = index; this.loading = true; this.local = false; this.error = ''; this.emit('change');
    // Resolve asynchronously so transport controls remain responsive during extraction.
    this.loadingTask = (async () => {
      try {
        await this.engine.command('stop');
        if (generation !== this.generation) return;
        const cached = await this.cache.lookup(track.id);
        if (generation !== this.generation) return;
        const audio = cached || await this.resolve(track.id, this.directory, signal);
        if (generation !== this.generation) return;
        this.local = !!audio.local;
        if (audio.duration) track.duration = audio.duration;
        this.historyTrack = { track, generation };
        await this.engine.load(audio.url, audio.headers);
        if (!audio.local) this.cache.save(track, audio);
      } catch (error) {
        if (generation !== this.generation) return;
        this.loading = false; this.error = error.name === 'AbortError' ? '' : error.message; this.emit('change');
      }
    })();
  }
  next(manual = true) {
    if (!this.queue.length) return;
    if (this.shuffle && this.queue.length > 1) {
      const offset = 1 + Math.floor(Math.random() * (this.queue.length - 1));
      return this.playIndex((this.index + offset) % this.queue.length);
    }
    const index = this.index + 1;
    if (index < this.queue.length) this.playIndex(index);
    else if (manual || this.repeat === 'all') this.playIndex(0);
  }
  async run(action, value) {
    const engine = this.engine;
    switch (action) {
      case 'state': return this.snapshot();
      case 'queue': this.playIndex(value); break;
      case 'clear-queue':
        await this.run('stop'); this.queue = []; this.index = -1; this.local = false; this.error = ''; break;
      case 'remove-queue': {
        if (!Number.isInteger(value) || !this.queue[value]) throw new Error('Canción fuera de la cola.');
        const current = value === this.index;
        if (current) await this.run('stop');
        this.queue.splice(value, 1);
        if (current) {
          this.index = -1; this.local = false; this.error = '';
          if (this.queue.length) this.playIndex(Math.min(value, this.queue.length - 1));
        } else if (value < this.index) this.index--;
        break;
      }
      case 'next': this.next(); break;
      case 'previous': if (this.queue.length) this.playIndex(Math.max(0, this.index - 1)); break;
      case 'shuffle': this.shuffle = !this.shuffle; break;
      case 'repeat': this.repeat = ({ off: 'all', all: 'one', one: 'off' })[this.repeat]; break;
      case 'stop': this.generation++; this.abort?.abort(); this.loading = false; await engine.command('stop'); break;
      case 'toggle':
        if (this.loading) return this.run('stop');
        if (engine.properties['idle-active'] && this.index >= 0) this.playIndex(this.index);
        else await engine.command('cycle', 'pause'); break;
      case 'play':
        if (engine.properties['idle-active'] && this.index >= 0) this.playIndex(this.index);
        else await engine.command('set_property', 'pause', false); break;
      case 'pause': if (this.loading) return this.run('stop'); await engine.command('set_property', 'pause', true); break;
      case 'volume': await engine.command('set_property', 'volume', value * 100); await engine.command('set_property', 'mute', false); break;
      case 'mute': await engine.command('cycle', 'mute'); break;
      case 'seek': await engine.command('seek', value, 'absolute+exact'); break;
      default: throw new Error('Control desconocido.');
    }
    this.emit('change');
  }
  async close() { this.generation++; this.abort?.abort(); await Promise.all([this.cache.close(), this.engine.close(), this.history.pending]); }
}
module.exports = { NativePlayer, resolveAudio };
