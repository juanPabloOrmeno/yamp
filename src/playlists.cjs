const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
class Playlists {
  constructor(directory) { this.directory = path.join(directory, 'playlists'); this.items = []; }
  async start() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const file of await fs.readdir(this.directory)) {
      if (!file.endsWith('.json')) continue;
      try {
        const list = JSON.parse(await fs.readFile(path.join(this.directory, file), 'utf8'));
        if (list.id + '.json' !== file || typeof list.name !== 'string' || !Array.isArray(list.tracks) || !list.tracks.length) continue;
        if (list.tracks.some(row => !/^[a-zA-Z0-9_-]{11}$/.test(row.id) || !['song', 'video'].includes(row.kind))) continue;
        this.items.push(list);
      } catch { /* Ignore incomplete playlist files. */ }
    }
    this.items.sort((a, b) => String(a.created).localeCompare(String(b.created)));
  }
  get summaries() { return this.items.map(({ id, name, tracks }) => ({ id, name, count: tracks.length })); }
  async save(name, queue) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('Escribe un nombre de hasta 100 caracteres.');
    if (!queue.length) throw new Error('La cola está vacía.');
    const list = { id: randomUUID(), name: name.trim(), created: new Date().toISOString(), tracks: queue.map(({ id, kind, title, artist, album, duration }) => ({ id, kind, title, artist, album, duration })) };
    const file = path.join(this.directory, `${list.id}.json`);
    try {
      await fs.writeFile(`${file}.part`, JSON.stringify(list), { mode: 0o600 });
      await fs.rename(`${file}.part`, file);
    } finally { await fs.rm(`${file}.part`, { force: true }); }
    this.items.push(list);
    return list;
  }
  tracks(id) {
    const list = this.items.find(item => item.id === id);
    if (!list) throw new Error('Playlist no disponible.');
    return list.tracks.map(row => ({ ...row }));
  }
  async remove(id) {
    const list = this.items.find(item => item.id === id);
    if (!list) throw new Error('Playlist no disponible.');
    await fs.rm(path.join(this.directory, `${list.id}.json`), { force: true });
    this.items = this.items.filter(item => item.id !== id);
  }
}
module.exports = Playlists;
