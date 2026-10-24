const $ = id => document.getElementById(id);
let state = {}, listKey = '', filterKey = '', compact = false, messageUntil = 0;
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
  $('title').textContent = state.title || 'YAMP · TU MÚSICA, A TU MANERA';
  $('title').title = state.title || '';
  $('artist').textContent = state.artist || 'Busca una canción o abre tu biblioteca';
  $('time').textContent = clock(state.time);
  $('duration').textContent = state.duration ? clock(state.duration) : '--:--';
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
  if (Date.now() > messageUntil) message(state.error || (state.authenticating ? 'Inicia sesión en Chrome y pulsa GUARDAR SESIÓN.' : state.loading ? 'Resolviendo audio… puedes detenerlo o elegir otra canción.' : state.catalogueBusy ? 'Cargando catálogo…' : 'AUDIO NATIVO · SIN NAVEGADOR · ESPACIO: PLAY/PAUSA'), !!state.error);
  const view = state.catalogue || { items: [], title: 'CATÁLOGO', filters: [] };
  const isQueue = state.mode === 'queue';
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
      button.addEventListener('click', () => isQueue ? command('queue', index) : command('open-item', selection));
      li.append(button);
      if (!isQueue && ['song', 'video'].includes(track.kind)) {
        const add = document.createElement('button'); add.className = 'add-item'; add.textContent = '+'; add.title = 'Añadir a la cola';
        add.addEventListener('click', () => command('enqueue', selection)); li.append(add);
      }
      return li;
    }));
    $('count').textContent = String(rows.length).padStart(2, '0');
    $('empty').hidden = rows.length > 0;
  }
}
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
  if (compact && ['music', 'home', 'library'].includes(button.dataset.action)) await expand();
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
