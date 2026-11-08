const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { Catalogue, collect } = require('./catalogue.cjs');

const REDIRECT = 'http://127.0.0.1:43821/callback';
const API = 'https://api.spotify.com/v1/';
const filters = { Canciones: 'me/tracks', Playlists: 'me/playlists', Álbumes: 'me/albums' };
function normalize(entry) {
  const row = entry?.type ? entry : entry?.item || entry?.track || entry?.album || entry;
  if (!row?.id || row.is_local || !['track', 'playlist', 'album', 'artist'].includes(row.type)) return null;
  return { id: row.id, source: 'spotify', kind: row.type === 'track' ? 'song' : row.type,
    title: row.name || '', artist: row.artists?.map(a => a.name).join(', ') || row.owner?.display_name || '',
    album: row.album?.name || '', duration: (row.duration_ms || 0) / 1000 };
}

class Spotify extends Catalogue {
  constructor(directory, youtube, request = fetch) {
    super(directory); this.youtube = youtube; this.request = request;
    this.file = path.join(directory, 'spotify-session.json'); this.session = {}; this.matches = new Map();
  }
  async start() {
    try { const session = JSON.parse(await fs.readFile(this.file, 'utf8')); if (session && typeof session === 'object') this.session = session; }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  }
  get status() { return { connected: !!this.session.refresh_token, clientId: this.session.client_id || '', connecting: !!this.cancelLogin }; }
  async persist() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(`${this.file}.part`, JSON.stringify(this.session), { mode: 0o600 });
    await fs.rename(`${this.file}.part`, this.file);
  }
  async token(params, clientId = this.session.client_id) {
    const response = await this.request('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: clientId }), signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('Spotify no pudo renovar o guardar la sesión. Vuelve a conectar tu cuenta.');
    const data = await response.json();
    if (!data.access_token) throw new Error('Sesión de Spotify inválida.');
    this.session = { client_id: clientId, access_token: data.access_token,
      refresh_token: data.refresh_token || this.session.refresh_token, expires: Date.now() + data.expires_in * 1000 };
    await this.persist();
  }
  async access() {
    if (!this.session.refresh_token) throw new Error('Selecciona CUENTA y conecta Spotify con tu Client ID.');
    if (this.session.expires > Date.now() + 60000) return;
    if (!this.refreshing) this.refreshing = this.token({ grant_type: 'refresh_token', refresh_token: this.session.refresh_token }).finally(() => { this.refreshing = null; });
    await this.refreshing;
  }
  async api(endpoint, options = {}, retry = true) {
    const url = new URL(endpoint, API);
    if (url.origin !== 'https://api.spotify.com' || !url.pathname.startsWith('/v1/')) throw new Error('Enlace de Spotify inválido.');
    await this.access();
    const response = await this.request(url.href, { ...options, headers: { Authorization: `Bearer ${this.session.access_token}` }, signal: AbortSignal.timeout(20000) });
    if (response.status === 401 && retry) { this.session.expires = 0; return this.api(endpoint, options, false); }
    if (response.status === 429) throw new Error(`Spotify limita las consultas. Reintenta en ${response.headers.get('retry-after') || 'unos'} segundos.`);
    if (response.status === 403) throw new Error('Spotify denegó el acceso. Revisa los usuarios autorizados y permisos de tu aplicación de Spotify.');
    if (!response.ok) throw new Error(`No se pudo consultar Spotify (${response.status}).`);
    return response.status === 204 ? null : response.json();
  }
  async login(clientId, openExternal) {
    if (typeof clientId !== 'string' || !/^[a-fA-F0-9]{32}$/.test(clientId)) throw new Error('Introduce el Client ID de tu aplicación de Spotify (32 caracteres).');
    if (this.cancelLogin) throw new Error('Ya hay una conexión a Spotify en curso.');
    await this.refreshing;
    const verifier = randomBytes(32).toString('base64url'), state = randomBytes(24).toString('hex');
    const url = new URL('https://accounts.spotify.com/authorize');
    url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: REDIRECT,
      code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), state,
      scope: 'user-library-read user-library-modify playlist-read-private playlist-read-collaborative user-top-read' }).toString();
    await new Promise((resolve, reject) => {
      let done = false, processing = false;
      const finish = error => {
        if (done) return; done = true; clearTimeout(timer); this.cancelLogin = null; server.close();
        if (error) reject(error); else resolve();
      };
      const server = http.createServer(async (req, res) => {
        const callback = new URL(req.url, REDIRECT);
        if (callback.pathname !== '/callback' || callback.searchParams.get('state') !== state) { res.writeHead(400); res.end('Solicitud invalida.'); return; }
        if (processing || done) { res.writeHead(409); res.end(); return; }
        processing = true;
        try {
          const code = callback.searchParams.get('code');
          if (!code || callback.searchParams.has('error')) throw new Error('Conexión a Spotify cancelada.');
          await this.token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier }, clientId);
          res.end('Spotify conectado. Puedes volver a YAMP.'); finish();
        } catch (error) { res.writeHead(400); res.end('No se pudo conectar. Vuelve a YAMP.'); finish(error); }
      });
      const timer = setTimeout(() => finish(new Error('La conexión a Spotify caducó. Intenta de nuevo.')), 180000);
      this.cancelLogin = () => finish(new Error('Conexión a Spotify cancelada.'));
      server.on('error', () => finish(new Error('No se pudo abrir el puerto local 43821 para conectar Spotify.')));
      server.listen(43821, '127.0.0.1', () => { Promise.resolve().then(() => openExternal(url.href)).catch(finish); });
    });
  }
  async disconnect() {
    if (this.cancelLogin) throw new Error('Termina primero la conexión a Spotify.');
    await this.refreshing; this.session = { client_id: this.session.client_id }; await this.persist();
    this.page = null; this.view = { title: 'SPOTIFY · CONECTA TU CUENTA', items: [], revision: this.view.revision + 1, more: false, filters: [] };
  }
  async pageAt(endpoint, key) {
    const data = await this.api(endpoint), page = key ? data[key] : data;
    return { items: (page?.items || []).map(normalize).filter(Boolean), next: page?.next || null, key };
  }
  async showPage(title, endpoint, key, append = false, library = false) {
    const page = await this.pageAt(endpoint, key); this.page = page;
    const items = append ? [...this.view.items, ...page.items] : page.items;
    this.view = { title, items: [...new Map(items.map(row => [`${row.kind}:${row.id}`, row])).values()], revision: this.view.revision + 1,
      more: !!page.next, filters: library ? Object.keys(filters) : [] };
  }
  async home() {
    if (!this.status.connected) { this.view = { title: 'SPOTIFY · CONECTA TU CUENTA', items: [], revision: this.view.revision + 1, more: false, filters: [] }; this.page = null; return; }
    await this.showPage('SPOTIFY · TUS FAVORITAS', 'me/top/tracks?limit=20');
  }
  async search(query) { await this.showPage(`SPOTIFY: ${query}`, `search?type=track&limit=10&q=${encodeURIComponent(query)}`, 'tracks'); }
  async library() { await this.filter('Canciones'); }
  async filter(name) {
    if (!Object.hasOwn(filters, name)) throw new Error('Filtro no disponible.');
    await this.showPage(`SPOTIFY · ${name.toUpperCase()}`, `${filters[name]}?limit=50`, undefined, false, true);
  }
  async more() { if (this.page?.next) await this.showPage(this.view.title, this.page.next, this.page.key, true, !!this.view.filters.length); }
  async open(row) {
    if (row.kind === 'playlist') await this.showPage(row.title, `playlists/${row.id}/items?limit=50`);
    else if (row.kind === 'album') await this.showPage(row.title, `albums/${row.id}/tracks?limit=50`);
    else if (row.kind === 'artist') await this.search(row.title);
  }
  async allSongs() {
    const rows = new Map(this.view.items.filter(r => r.kind === 'song').map(r => [r.id, r]));
    let page = this.page;
    while (page?.next) { page = await this.pageAt(page.next, page.key); for (const row of page.items) if (row.kind === 'song') rows.set(row.id, row); }
    return [...rows.values()];
  }
  async playable(row) {
    if (row.source !== 'spotify') return row;
    if (this.matches.has(row.id)) return { ...this.matches.get(row.id) };
    const yt = await this.youtube.client();
    const candidates = collect(await yt.music.search(`${row.title} ${row.artist}`, { type: 'song' }));
    const clean = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const match = candidates.find(song => song.kind === 'song' && clean(song.title) === clean(row.title)
      && row.artist.split(', ').some(artist => clean(song.artist).includes(clean(artist)))
      && (!row.duration || !song.duration || Math.abs(row.duration - song.duration) < 12));
    if (!match) throw new Error(`No se encontró una coincidencia fiable en YouTube Music para «${row.title}». Busca la canción manualmente en YouTube Music.`);
    const result = { ...match, spotifyId: row.id, source: 'youtube' }; this.matches.set(row.id, result); return { ...result };
  }
  async *libraryTracks(signal, onError = () => {}) {
    const pending = Object.values(filters).map(endpoint => `${endpoint}?limit=50`), seen = new Set();
    for (let i = 0; i < pending.length; i++) {
      let endpoint = pending[i];
      while (endpoint) {
        signal.throwIfAborted();
        let page;
        try { page = await this.pageAt(endpoint); } catch (error) { if (i === 0) throw error; onError(); break; }
        for (const row of page.items) {
          signal.throwIfAborted(); const key = `${row.kind}:${row.id}`;
          if (seen.has(key)) continue; seen.add(key);
          if (row.kind === 'playlist') pending.push(`playlists/${row.id}/items?limit=50`);
          else if (row.kind === 'album') pending.push(`albums/${row.id}/tracks?limit=50`);
          else if (row.kind === 'song') { try { yield await this.playable(row); } catch { onError(); } }
        }
        endpoint = page.next;
      }
    }
  }
  async like(id) { await this.api(`me/library?uris=${encodeURIComponent(`spotify:track:${id}`)}`, { method: 'PUT' }); }
  close() { this.cancelLogin?.(); }
}
module.exports = { Spotify, normalize, REDIRECT };
