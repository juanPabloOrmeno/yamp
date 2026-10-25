const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const { EventEmitter } = require('node:events');

const validID = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id);
class AudioCache extends EventEmitter {
  constructor(directory) {
    super(); this.directory = path.join(directory, 'audio');
    this.tracks = new Map(); this.jobs = new Map(); this.tail = Promise.resolve();
    this.abort = new AbortController(); this.revision = 0; this.error = '';
  }
  file(id, suffix = 'audio') {
    if (!validID(id)) throw new Error('Identificador de canción inválido.');
    return path.join(this.directory, `${id}.${suffix}`);
  }
  async start() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const name of await fs.readdir(this.directory)) {
      if (!/^[a-zA-Z0-9_-]{11}\.json$/.test(name)) continue;
      const id = name.slice(0, -5);
      try {
        const row = JSON.parse(await fs.readFile(this.file(id, 'json'), 'utf8'));
        const stat = await fs.stat(this.file(id));
        if (row.id === id && stat.isFile() && stat.size > 0 && stat.size === row.bytes) this.tracks.set(id, row);
      } catch { /* Incomplete entries are never offered for offline playback. */ }
    }
    this.revision++;
  }
  get view() {
    return { title: 'GUARDADAS · SIN CONEXIÓN', items: [...this.tracks.values()].map(({ bytes, ...row }) => row), revision: this.revision, filters: [], more: false };
  }
  selected(value) {
    const view = this.view;
    if (!value || value.revision !== view.revision || !Number.isInteger(value.index) || !view.items[value.index]) throw new Error('La lista cambió. Selecciona de nuevo.');
    return view.items[value.index];
  }
  async lookup(id) {
    const row = this.tracks.get(id);
    if (!row) return null;
    try {
      const stat = await fs.stat(this.file(id));
      if (stat.isFile() && stat.size === row.bytes && stat.size > 0) return { url: this.file(id), duration: row.duration, local: true };
    } catch {}
    this.tracks.delete(id); this.revision++; this.emit('change');
    return null;
  }
  selection(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !validID(id) || !this.tracks.has(id))) throw new Error('Selecciona canciones locales disponibles.');
    return [...new Set(ids)].map(id => this.tracks.get(id));
  }
  async remove(ids) {
    const rows = this.selection(ids);
    try {
      for (const row of rows) {
        await fs.rm(this.file(row.id), { force: true });
        this.tracks.delete(row.id); this.revision++;
        await fs.rm(this.file(row.id, 'json'), { force: true });
      }
    } finally { this.emit('change'); }
    return rows.length;
  }
  async backup(ids, destination) {
    const rows = this.selection(ids);
    const folder = await fs.mkdtemp(path.join(destination, 'YAMP-respaldo-'));
    try {
      for (const row of rows) {
        if (!await this.lookup(row.id)) throw new Error('Una canción ya no está disponible en el disco.');
        await fs.copyFile(this.file(row.id), path.join(folder, `${row.id}.audio`));
        await fs.writeFile(path.join(folder, `${row.id}.json`), JSON.stringify(row), { mode: 0o600 });
      }
      return { count: rows.length, folder };
    } catch (error) {
      await fs.rm(folder, { recursive: true, force: true });
      throw error;
    }
  }
  restore(folder) {
    const task = this.tail.then(async () => {
      const rows = [];
      let restored = 0, skipped = 0, invalid = 0;
      for (const name of await fs.readdir(folder)) {
        if (!/^[a-zA-Z0-9_-]{11}\.json$/.test(name)) continue;
        const id = name.slice(0, -5);
        try {
          const metadata = path.join(folder, name);
          const source = path.join(folder, `${id}.audio`);
          const info = await fs.lstat(metadata), stat = await fs.lstat(source);
          if (!info.isFile() || info.size > 1024 * 1024 || !stat.isFile()) throw new Error('Invalid files');
          const row = JSON.parse(await fs.readFile(metadata, 'utf8'));
          if (row.id !== id || !['song', 'video'].includes(row.kind) || typeof row.title !== 'string' || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || row.bytes !== stat.size) throw new Error('Invalid metadata');
          rows.push({ id, kind: row.kind, title: row.title, artist: typeof row.artist === 'string' ? row.artist : '', album: typeof row.album === 'string' ? row.album : '', duration: Number.isFinite(row.duration) && row.duration >= 0 ? row.duration : 0, bytes: row.bytes });
        } catch { invalid++; }
      }
      if (!rows.length) throw new Error('No hay canciones válidas en esta carpeta. Elige una carpeta YAMP-respaldo-*.');
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      try {
        for (const row of rows) {
          if (await this.lookup(row.id)) { skipped++; continue; }
          const partial = this.file(row.id, 'restore.part');
          const metadata = this.file(row.id, 'restore.json.part');
          try {
            await fs.copyFile(path.join(folder, `${row.id}.audio`), partial);
            if ((await fs.stat(partial)).size !== row.bytes) throw new Error('El respaldo cambió durante la restauración.');
            await fs.chmod(partial, 0o600);
            await fs.writeFile(metadata, JSON.stringify(row), { mode: 0o600 });
            await fs.rename(partial, this.file(row.id));
            await fs.rename(metadata, this.file(row.id, 'json'));
            this.tracks.set(row.id, row); this.revision++; restored++;
          } finally {
            await Promise.all([partial, metadata].map(file => fs.rm(file, { force: true }).catch(() => {})));
          }
        }
        return { restored, skipped, invalid };
      } finally { this.emit('change'); }
    });
    this.tail = task.catch(() => {});
    return task;
  }
  save(track, audio) {
    if (!validID(track.id) || !audio.url.startsWith('https://') || this.abort.signal.aborted) return Promise.resolve();
    if (this.jobs.has(track.id)) return this.jobs.get(track.id);
    const job = this.tail.then(async () => {
      if (this.abort.signal.aborted || await this.lookup(track.id)) return;
      const partial = this.file(track.id, 'part');
      const metadata = this.file(track.id, 'json.part');
      try {
        const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(10 * 60 * 1000)]);
        const headers = Object.fromEntries(Object.entries(audio.headers || {}).filter(([key]) => ['user-agent', 'referer', 'origin'].includes(key.toLowerCase())));
        const response = await fetch(audio.url, { headers, signal });
        if (!response.ok || !response.body) throw new Error('Download failed');
        await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { mode: 0o600 }), { signal });
        const { size } = await fs.stat(partial);
        const expected = response.headers.get('content-length');
        if (!size || (expected !== null && size !== Number(expected))) throw new Error('Incomplete audio');
        const row = { id: track.id, kind: track.kind, title: track.title, artist: track.artist || '', album: track.album || '', duration: audio.duration || track.duration || 0, bytes: size };
        await fs.writeFile(metadata, JSON.stringify(row), { mode: 0o600 });
        await fs.rename(partial, this.file(track.id));
        await fs.rename(metadata, this.file(track.id, 'json'));
        this.tracks.set(track.id, row); this.revision++; this.error = '';
      } catch {
        if (!this.abort.signal.aborted) this.error = 'No se pudo guardar una canción sin conexión. Se reintentará al reproducirla.';
      } finally {
        await Promise.all([partial, metadata].map(file => fs.rm(file, { force: true }).catch(() => {})));
      }
    }).catch(() => { this.error = 'No se pudo guardar el audio local.'; }).finally(() => {
      this.jobs.delete(track.id); this.emit('change');
    });
    this.jobs.set(track.id, job); this.tail = job; this.emit('change');
    return job;
  }
  async close() { this.abort.abort(); await this.tail; }
}
module.exports = AudioCache;
