const $ = id => document.getElementById(id);
let state = {}, listKey = '', filterKey = '', compact = false, messageUntil = 0;
let localKey = '', managing = false;
const selectedLocal = new Set();
const visualizer = $('visualizer');
const meter = visualizer.getContext('2d');
const levels = Array.from({ length: 24 }, () => ({ rms: 0, peak: 0 }));
let targets = Array(24).fill(0), previousFrame = 0;
let lastLevels = 0;
function drawLevels() {
  meter.clearRect(0, 0, 144, 30);
  levels.forEach(({ rms, peak }, index) => {
    const height = Math.round(rms * 10);
    for (let step = 0; step < 10; step++) {
      meter.fillStyle = step < height ? (step > 7 ? '#d4ef83' : step > 4 ? '#a4da61' : '#609f42') : '#172b18';
      meter.fillRect(index * 6, 28 - step * 3, 4, 2);
    }
    if (peak > 0) {
      meter.fillStyle = '#d7ffa4';
      meter.fillRect(index * 6, Math.max(0, 28 - Math.round(peak * 9) * 3), 4, 1);
    }
  });
}
window.yamp.onLevels(({ bands }) => {
  lastLevels = performance.now();
  targets = Array.from({ length: 24 }, (_, i) => Math.max(0, Math.min(1, Number(bands?.[i]) || 0)));
});
function animateLevels(now) {
  const elapsed = Math.min(0.1, (now - previousFrame) / 1000 || 0);
  previousFrame = now;
  levels.forEach((bar, index) => {
    const target = now - lastLevels > 250 ? 0 : targets[index];
    // Each frequency stays in its column: fast attack, smooth vertical decay.
    bar.rms = target > bar.rms ? target : Math.max(target, bar.rms - elapsed * 1.8);
    bar.peak = Math.max(bar.rms, bar.peak - elapsed * 0.7);
  });
  drawLevels();
  requestAnimationFrame(animateLevels);
}
requestAnimationFrame(animateLevels);
let playlistsKey = '', savingPlaylist = false;
function renderPlaylists() {
  $('confirm-playlist').disabled = savingPlaylist || !state.queue?.length;
  const download = state.libraryDownload;
  $('playlist-download-progress').textContent = download?.message ? `${download.message} ${download.title || ''} · ${download.saved} guardadas · ${download.skipped} existentes · ${download.failed} errores` : '';
  const key = JSON.stringify(state.playlists || []);
  if (key === playlistsKey) return;
  playlistsKey = key;
  $('saved-playlists').replaceChildren(...(state.playlists || []).map(list => {
    const row = document.createElement('div'); row.className = 'saved-playlist';
    const name = document.createElement('span'); name.textContent = `${list.name} · ${list.count} canciones`;
    const load = document.createElement('button'); load.textContent = 'CARGAR';
    load.addEventListener('click', async () => {
      const result = await command('load-playlist', list.id);
      if (result.ok) $('playlists-dialog').close(); else $('playlists-message').textContent = result.error;
    });
    const remove = document.createElement('button'); remove.textContent = 'ELIMINAR';
    remove.setAttribute('aria-label', `Eliminar playlist ${list.name}`);
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      const result = await command('delete-playlist', list.id);
      $('playlists-message').textContent = result.ok ? 'Playlist eliminada.' : result.error;
      if (result.ok) { const updated = await command('state'); if (updated.state) render(updated.state); }
      else remove.disabled = false;
    });
    const actions = document.createElement('div'); actions.className = 'playlist-buttons'; actions.append(load, remove);
    row.append(name, actions); return row;
  }));
}
for (const id of ['save-playlist', 'show-playlists']) $(id).addEventListener('click', () => {
  renderPlaylists(); $('playlists-message').textContent = ''; $('playlists-dialog').showModal();
  if (id === 'save-playlist') $('playlist-name').focus();
});
$('close-playlists').addEventListener('click', () => $('playlists-dialog').close());
$('playlist-form').addEventListener('submit', async event => {
  event.preventDefault(); if (savingPlaylist) return;
  savingPlaylist = true; renderPlaylists();
  try {
    const result = await command('save-playlist', $('playlist-name').value);
    $('playlists-message').textContent = result.ok ? 'Playlist guardada en YAMP.' : result.error;
    if (result.ok) { $('playlist-name').value = ''; const updated = await command('state'); if (updated.state) render(updated.state); }
  } finally { savingPlaylist = false; renderPlaylists(); }
});
function renderLocal() {
  const rows = state.localLibrary?.items || [];
  const available = new Set(rows.map(row => row.id));
  for (const id of selectedLocal) if (!available.has(id)) selectedLocal.delete(id);
  const download = state.libraryDownload || {};
  const busy = managing || state.localBusy || download.running;
  $('download-library').disabled = busy;
  $('stop-library-download').hidden = !download.running;
  $('library-progress').textContent = download.message ? `${download.message} ${download.title || ''} · ${download.saved} guardadas · ${download.skipped} existentes · ${download.failed} errores · ${download.scanned} encontradas` : 'Guarda todas las canciones de tu biblioteca, playlists y álbumes.';
  const key = JSON.stringify([rows, [...selectedLocal], busy]);
  if (key !== localKey) {
    localKey = key;
    $('local-tracks').replaceChildren(...rows.map(row => {
      const label = document.createElement('label'); label.className = 'local-track';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selectedLocal.has(row.id); checkbox.disabled = busy;
      checkbox.addEventListener('change', () => { if (checkbox.checked) selectedLocal.add(row.id); else selectedLocal.delete(row.id); renderLocal(); });
      const name = document.createElement('span'); name.textContent = row.title;
      const artist = document.createElement('small'); artist.textContent = row.artist; name.append(artist);
      label.append(checkbox, name); return label;
    }));
  }
  $('local-summary').textContent = rows.length ? `${selectedLocal.size} de ${rows.length} canciones seleccionadas` : 'Todavía no hay canciones guardadas.';
  $('local-select-all').checked = rows.length > 0 && selectedLocal.size === rows.length;
  $('local-select-all').indeterminate = selectedLocal.size > 0 && selectedLocal.size < rows.length;
  $('local-select-all').disabled = busy || !rows.length;
  $('backup-local').disabled = $('delete-local').disabled = busy || !selectedLocal.size;
  $('restore-local').disabled = busy;
}
$('manage-local').addEventListener('click', () => { renderLocal(); $('local-message').textContent = ''; $('local-manager').showModal(); });
$('close-manager').addEventListener('click', () => $('local-manager').close());
for (const action of ['download-library', 'stop-library-download']) $(action).addEventListener('click', async () => {
  const result = await command(action);
  if (!result.ok) $('local-message').textContent = result.error;
});
$('local-select-all').addEventListener('change', event => {
  selectedLocal.clear();
  if (event.target.checked) for (const row of state.localLibrary?.items || []) selectedLocal.add(row.id);
  renderLocal();
});
for (const action of ['backup-local', 'delete-local', 'restore-local']) $(action).addEventListener('click', async () => {
  managing = true; renderLocal(); $('local-message').textContent = action === 'restore-local' ? 'Elige el respaldo que quieres restaurar…' : action === 'backup-local' ? 'Elige una carpeta para el respaldo…' : 'Eliminando…';
  try {
    const result = await command(action, [...selectedLocal]);
    $('local-message').textContent = result.ok ? result.message || (action === 'restore-local' ? 'Restauración cancelada.' : 'Respaldo cancelado.') : result.error || 'No se pudo completar la operación.';
    const updated = await command('state'); if (updated.state) render(updated.state);
  } finally { managing = false; renderLocal(); }
});
function clock(seconds) {
  const n = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
}
function message(text, error = false) {
  $('message').textContent = text; $('message').title = text;
  $('message').classList.toggle('error', error);
}
async function command(action, value) {
  try {
    const result = await window.yamp.command(action, value);
    if (!result.ok) { message(result.error, true); messageUntil = Date.now() + 9000; }
    else if (action === 'save-session') { message('Sesión guardada. Chrome cerrado. YAMP es independiente.'); messageUntil = Date.now() + 7000; }
    return result;
  } catch (error) { message(error.message, true); messageUntil = Date.now() + 7000; return { ok: false }; }
}
function render(next) {
  state = next;
  if ($('playlists-dialog').open) renderPlaylists();
  if ($('local-manager').open) renderLocal();
  $('title').textContent = state.title || 'YAMP · TU MÚSICA, A TU MANERA';
  $('title').title = state.title || '';
  $('artist').textContent = state.artist || 'Busca una canción o abre tu biblioteca';
  $('time').textContent = clock(state.time);
  $('duration').textContent = state.duration ? clock(state.duration) : '--:--';
  $('local-audio').hidden = !state.local;
  $('status').textContent = state.loading ? 'CARGANDO AUDIO' : state.playing ? 'PLAYING' : state.title ? 'PAUSED' : 'READY';
  $('indicator').textContent = state.playing ? '▶' : '■';
  $('play').textContent = state.playing ? 'Ⅱ' : '▶';
  $('pin').classList.toggle('active', !!state.pinned);
  $('shuffle').classList.toggle('active', !!state.shuffle);
  $('repeat').classList.toggle('active', state.repeat !== 'off');
  $('repeat').textContent = state.repeat === 'one' ? 'REP 1' : 'REP';
  $('mute').classList.toggle('active', !!state.muted);
  $('save-session').hidden = !state.authenticating;
  if (document.activeElement !== $('seek')) { $('seek').max = state.duration || 100; $('seek').value = state.time || 0; }
  $('seek').disabled = !state.duration || state.loading;
  if (document.activeElement !== $('volume')) $('volume').value = Math.round((state.volume ?? 0.75) * 100);
  $('volume-value').textContent = state.muted ? 'MUTE' : `${Math.round((state.volume ?? 0.75) * 100)}%`;
   if (Date.now() > messageUntil) message(state.error || state.cacheError || '', !!(state.error || state.cacheError));
  const view = state.catalogue || { items: [], title: 'CATÁLOGO', filters: [] };
  const isQueue = state.mode === 'queue';
  $('queue-actions').hidden = !isQueue;
  $('list-actions').hidden = isQueue;
  $('clear-history').hidden = state.mode !== 'history';
  $('enqueue-all').disabled = !!state.enqueueBusy || (state.mode === 'catalogue' && state.catalogueBusy) || !view.items.some(row => ['song', 'video'].includes(row.kind));
  $('enqueue-all').textContent = state.enqueueBusy ? 'AGREGANDO…' : 'AGREGAR TODO A LA COLA';
  $('clear-history').disabled = state.mode !== 'history' || !view.items.length;
  $('clear-queue').disabled = !state.queue?.length;
  $('save-playlist').disabled = !state.queue?.length;
  const rows = isQueue ? state.queue || [] : view.items;
  $('list-title').textContent = isQueue ? 'PLAYLIST EDITOR' : view.title;
  $('list-title').title = $('list-title').textContent;
  $('more').hidden = isQueue || !view.more;
  $('more').disabled = !!state.catalogueBusy;
  const filters = isQueue ? [] : view.filters;
  $('filter').hidden = !filters.length;
  const nextFilterKey = JSON.stringify(filters);
  if (nextFilterKey !== filterKey) {
    filterKey = nextFilterKey;
    $('filter').replaceChildren(new Option('Filtrar…', ''), ...filters.map(name => new Option(name, name)));
  }
  const key = JSON.stringify([state.mode, rows, view.revision, state.id]);
  if (key !== listKey) {
    listKey = key;
    $('queue').replaceChildren(...rows.map((track, index) => {
      const li = document.createElement('li');
      li.classList.toggle('selected', isQueue ? track.selected : !!state.id && track.id === state.id);
      const button = document.createElement('button'); button.className = 'item-main';
      const number = document.createElement('span'); number.className = 'number';
      number.textContent = ['playlist', 'album', 'artist'].includes(track.kind) ? '▸' : String(index + 1).padStart(2, '0');
      const content = document.createElement('span'); content.className = 'queue-text';
      const title = document.createElement('span'); title.className = 'queue-title'; title.textContent = track.title;
      const detail = document.createElement('span'); detail.className = 'queue-detail';
      detail.textContent = track.artist || ({ playlist: 'Playlist', album: 'Álbum', artist: 'Artista' })[track.kind] || '';
      content.append(title, detail); button.append(number, content);
      button.title = [track.title, track.artist].filter(Boolean).join(' — ');
      const selection = { index, revision: view.revision };
      const local = state.mode === 'local';
      const history = state.mode === 'history';
      button.addEventListener('click', () => isQueue ? command('queue', index) : command(history ? 'open-history' : local ? 'open-local' : 'open-item', selection));
      li.append(button);
      if (isQueue) {
        const remove = document.createElement('button'); remove.className = 'add-item'; remove.textContent = '×'; remove.title = 'Quitar de la cola'; remove.setAttribute('aria-label', `Quitar ${track.title} de la cola`);
        remove.addEventListener('click', () => command('remove-queue', index)); li.append(remove);
      }
      if (!isQueue && ['song', 'video'].includes(track.kind)) {
        const add = document.createElement('button'); add.className = 'add-item'; add.textContent = '+'; add.title = 'Añadir a la cola';
        add.addEventListener('click', () => command(history ? 'enqueue-history' : local ? 'enqueue-local' : 'enqueue', selection)); li.append(add);
      }
      return li;
    }));
    $('count').textContent = String(rows.length).padStart(2, '0');
    $('empty').hidden = rows.length > 0;
  }
}
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
  if (compact && ['music', 'home', 'library', 'local', 'history'].includes(button.dataset.action)) await expand();
  command(button.dataset.action);
}));
async function expand() {
  const result = await command('compact', false);
  if (result.ok) { compact = false; document.body.classList.remove('compact'); $('toggle-queue').setAttribute('aria-expanded', 'true'); }
}
$('seek').addEventListener('change', event => { command('seek', Number(event.target.value)); event.target.blur(); });
$('volume').addEventListener('input', event => { $('volume-value').textContent = `${event.target.value}%`; });
$('volume').addEventListener('change', event => { command('volume', Number(event.target.value) / 100); event.target.blur(); });
$('search-form').addEventListener('submit', event => { event.preventDefault(); command('search', $('search').value); });
$('enqueue-all').addEventListener('click', () => command('enqueue-all', { mode: state.mode, revision: state.catalogue.revision }));
$('filter').addEventListener('change', event => { if (event.target.value) command('filter', event.target.value); });
$('toggle-queue').addEventListener('click', async () => {
  const result = await command('compact', !compact);
  if (result.ok) { compact = !compact; document.body.classList.toggle('compact', compact); $('toggle-queue').setAttribute('aria-expanded', String(!compact)); }
});
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && !['INPUT', 'BUTTON', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); command('toggle'); }
});
window.yamp.onState(render);
command('state').then(result => { if (result.state) render(result.state); });
