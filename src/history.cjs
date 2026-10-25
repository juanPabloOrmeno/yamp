const fs = require('node:fs/promises');
const path = require('node:path');
class History {
  constructor(directory) { this.file = path.join(directory, 'history.json'); this.items = []; this.revision = 0; this.pending = Promise.resolve(); }
  async start() {
    try {
      const items = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (Array.isArray(items)) this.items = items.filter(row => /^[a-zA-Z0-9_-]{11}$/.test(row.id) && ['song', 'video'].includes(row.kind)).slice(0, 1000);
    } catch (error) { if (error.code !== 'ENOENT') console.error('No se pudo leer el historial.'); }
    this.revision++;
  }
  record(track) {
    const { id, kind, title, artist, album, duration } = track;
    const row = { id, kind, title, artist, album, duration, playedAt: new Date().toISOString() };
    this.items = [row, ...this.items.filter(item => item.id !== id)].slice(0, 1000);
    this.revision++;
    const data = JSON.stringify(this.items);
    this.pending = this.pending.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      await fs.writeFile(`${this.file}.part`, data, { mode: 0o600 });
      await fs.rename(`${this.file}.part`, this.file);
    }).catch(() => console.error('No se pudo guardar el historial.'));
  }
  get view() { return { title: 'HISTORIAL · RECIENTES', items: this.items, revision: this.revision, filters: [], more: false }; }
  async clear() {
    this.items = []; this.revision++;
    const task = this.pending.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      await fs.writeFile(`${this.file}.part`, '[]', { mode: 0o600 });
      await fs.rename(`${this.file}.part`, this.file);
    });
    this.pending = task.catch(() => {});
    await task;
  }
  selected(value) {
    if (!value || value.revision !== this.revision || !Number.isInteger(value.index) || !this.items[value.index]) throw new Error('El historial cambió. Selecciona de nuevo.');
    return this.items[value.index];
  }
}
module.exports = History;
