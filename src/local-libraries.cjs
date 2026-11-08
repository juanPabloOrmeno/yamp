const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const validTrack = row => row && /^[a-zA-Z0-9_-]{11}$/.test(row.id) && ['song', 'video'].includes(row.kind) && typeof row.title === 'string';
class LocalLibraries {
  constructor(directory) {
    this.file = path.join(directory, 'local-libraries.json'); this.items = []; this.pending = Promise.resolve();
  }
  async start() {
    try {
      const items = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!Array.isArray(items) || items.some(list => typeof list.id !== 'string' || typeof list.name !== 'string' || !Array.isArray(list.tracks) || !list.tracks.every(validTrack))) throw new Error('Formato inválido.');
      this.items = items;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('No se pudieron leer las librerías locales. Revisa local-libraries.json.');
    }
  }
  list(id, items = this.items) {
    const list = items.find(item => item.id === id);
    if (!list) throw new Error('La librería ya no existe.');
    return list;
  }
  name(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new Error('Escribe un nombre de hasta 100 caracteres.');
    return value.trim();
  }
  change(edit) {
    const task = this.pending.then(async () => {
      const items = structuredClone(this.items);
      const result = edit(items);
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      try {
        await fs.writeFile(`${this.file}.part`, JSON.stringify(items), { mode: 0o600 });
        await fs.rename(`${this.file}.part`, this.file);
      } finally { await fs.rm(`${this.file}.part`, { force: true }); }
      this.items = items; return result;
    });
    this.pending = task.catch(() => {}); return task;
  }
  create(name) {
    return this.change(items => {
      const list = { id: randomUUID(), name: this.name(name), tracks: [] };
      items.push(list); return list.id;
    });
  }
  rename(id, name) { return this.change(items => { this.list(id, items).name = this.name(name); }); }
  remove(id) { return this.change(items => { items.splice(items.indexOf(this.list(id, items)), 1); }); }
  add(id, tracks) {
    if (!Array.isArray(tracks) || !tracks.length || !tracks.every(validTrack)) throw new Error('No hay canciones válidas para añadir.');
    const copies = tracks.map(({ id, kind, title, artist, album, duration, spotifyId }) => ({ id, kind, title, artist, album, duration, spotifyId }));
    return this.change(items => {
      const list = this.list(id, items), known = new Set(list.tracks.map(row => row.id));
      let added = 0;
      for (const row of copies) if (!known.has(row.id)) { known.add(row.id); list.tracks.push(row); added++; }
      return added;
    });
  }
  removeTracks(id, ids) {
    return this.change(items => {
      const list = this.list(id, items);
      if (!Array.isArray(ids) || !ids.length || ids.some(id => !list.tracks.some(row => row.id === id))) throw new Error('Selecciona canciones de esta librería.');
      list.tracks = list.tracks.filter(row => !ids.includes(row.id));
    });
  }
  tracks(id) { return this.list(id).tracks.map(row => ({ ...row })); }
  snapshot(cache) {
    return this.items.map(list => ({ ...list, tracks: list.tracks.map(row => ({ ...row, local: cache.tracks.has(row.id) })) }));
  }
}
module.exports = LocalLibraries;
