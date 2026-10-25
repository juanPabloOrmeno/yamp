const { loadCookie } = require('./auth-session.cjs');

const text = value => value == null ? '' : String(value);
function item(row) {
  const kind = row.item_type || (row.video_id ? 'song' : '');
  const id = row.id || row.video_id || row.endpoint?.payload?.browseId;
  if (!id || !['song', 'video', 'playlist', 'album', 'artist'].includes(kind)) return null;
  return {
    id, kind, title: text(row.title || row.name),
    artist: row.artists?.map(artist => artist.name).join(', ') || row.author?.name || text(row.subtitle),
    album: row.album?.name || '', duration: row.duration?.seconds || 0
  };
}
function collect(page) {
  const rows = [];
  function visit(node) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const normalized = item(node);
    if (normalized) { rows.push(normalized); return; }
    for (const key of ['contents', 'items', 'sections']) if (node[key]) visit(node[key]);
  }
  visit(page);
  const unique = new Map();
  for (const row of rows) unique.set(`${row.kind}:${row.id}`, row);
  return [...unique.values()];
}

class Catalogue {
  constructor(directory) {
    this.directory = directory;
    this.view = { title: 'CATÁLOGO', items: [], revision: 0, more: false, filters: [] };
    this.ticket = 0;
  }
  async client() {
    if (!this.clientPromise) this.clientPromise = (async () => {
      const { Innertube, Log } = await import('youtubei.js');
      Log.setLevel(Log.Level.ERROR);
      const cookie = await loadCookie(this.directory);
      this.authenticated = !!cookie;
      return Innertube.create({ retrieve_player: false, lang: 'es', location: 'CL', cookie: cookie || undefined });
    })().catch(error => { this.clientPromise = null; throw error; });
    return this.clientPromise;
  }
  resetAuth() { this.clientPromise = null; }
  async show(title, fetchPage, append = false) {
    const ticket = ++this.ticket;
    const page = await fetchPage();
    if (ticket !== this.ticket) return;
    this.page = page;
    const rows = collect(page);
    this.view = {
      title, items: append ? [...this.view.items, ...rows] : rows,
      revision: this.view.revision + 1, more: !!page.has_continuation,
      filters: page.filters || []
    };
  }
  async home() { const yt = await this.client(); await this.show('INICIO', () => yt.music.getHomeFeed()); }
  async search(query) { const yt = await this.client(); await this.show(`BUSCAR: ${query}`, () => yt.music.search(query, { type: 'song' })); }
  async library() {
    const yt = await this.client();
    if (!this.authenticated) throw new Error('Pulsa CUENTA, inicia sesión y después GUARDAR SESIÓN.');
    await this.show('MI BIBLIOTECA', () => yt.music.getLibrary());
  }
  async *libraryTracks(signal, onError = () => {}) {
    const yt = await this.client();
    if (!this.authenticated) throw new Error('Pulsa CUENTA, inicia sesión y después GUARDAR SESIÓN.');
    signal.throwIfAborted();
    const root = await yt.music.getLibrary();
    const pending = [() => Promise.resolve(root)];
    for (const filter of root.filters || []) pending.push(() => root.applyFilter(filter));
    const songs = new Set(), containers = new Set();
    for (let index = 0; index < pending.length; index++) {
      signal.throwIfAborted();
      try {
        let page = await pending[index]();
        while (page) {
          signal.throwIfAborted();
          for (const row of collect(page)) {
            if (['song', 'video'].includes(row.kind)) {
              if (!songs.has(row.id)) { songs.add(row.id); yield row; }
            } else if (['playlist', 'album'].includes(row.kind)) {
              const id = row.kind === 'playlist' ? row.id.replace(/^VL/, '') : row.id;
              const key = `${row.kind}:${id}`;
              if (!containers.has(key)) {
                containers.add(key);
                pending.push(() => row.kind === 'playlist' ? yt.music.getPlaylist(id) : yt.music.getAlbum(id));
              }
            }
          }
          signal.throwIfAborted();
          page = page.has_continuation ? await page.getContinuation() : null;
        }
      } catch (error) {
        signal.throwIfAborted();
        onError();
      }
    }
  }
  async filter(name) {
    if (!this.view.filters.includes(name) || typeof this.page?.applyFilter !== 'function') throw new Error('Filtro no disponible.');
    await this.show(name.toUpperCase(), () => this.page.applyFilter(name));
  }
  async more() {
    if (!this.page?.has_continuation || typeof this.page.getContinuation !== 'function') return;
    await this.show(this.view.title, () => this.page.getContinuation(), true);
  }
  selected(value) {
    if (!value || value.revision !== this.view.revision || !Number.isInteger(value.index) || !this.view.items[value.index]) throw new Error('La lista cambió. Selecciona de nuevo.');
    return this.view.items[value.index];
  }
  async open(row) {
    const yt = await this.client();
    if (row.kind === 'playlist') await this.show(row.title, () => yt.music.getPlaylist(row.id.replace(/^VL/, '')));
    else if (row.kind === 'album') await this.show(row.title, () => yt.music.getAlbum(row.id));
    else if (row.kind === 'artist') await this.search(row.title);
  }
  async like(id) {
    const yt = await this.client();
    if (!this.authenticated) throw new Error('Inicia sesión para guardar favoritos.');
    await yt.interact.like(id);
  }
}
module.exports = { Catalogue, collect };
