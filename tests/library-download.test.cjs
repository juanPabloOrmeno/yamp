const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Catalogue } = require('../src/catalogue.cjs');
const LibraryDownload = require('../src/library-download.cjs');
const song = id => ({ id, item_type: 'song', title: id });
test('library traversal includes filters, nested albums/playlists and continuations without duplicates', async () => {
  const catalogue = new Catalogue(''); catalogue.authenticated = true;
  const root = { contents: [song('song0000001'), { id: 'VLlist', item_type: 'playlist' }], filters: ['Álbumes'], applyFilter: async () => ({ contents: [{ id: 'album', item_type: 'album' }] }), has_continuation: true, getContinuation: async () => ({ contents: [song('song0000002')] }) };
  catalogue.client = async () => ({ music: {
    getLibrary: async () => root,
    getPlaylist: async id => { assert.equal(id, 'list'); return { contents: [song('song0000001')], has_continuation: true, getContinuation: async () => ({ contents: [song('song0000003')] }) }; },
    getAlbum: async () => ({ contents: [song('song0000004')] })
  } });
  const rows = [];
  for await (const row of catalogue.libraryTracks(new AbortController().signal)) rows.push(row.id);
  assert.deepEqual(rows.sort(), [1, 2, 3, 4].map(n => `song000000${n}`));
  assert.equal(catalogue.view.revision, 0, 'background traversal does not change browsing');
});
test('bulk download skips local tracks, continues after failures and can be stopped', async () => {
  const stored = new Set(['song0000001']);
  const resolved = [];
  const catalogue = { async *libraryTracks() { for (let n = 1; n <= 4; n++) yield { id: `song000000${n}`, title: `Song ${n}` }; } };
  const player = { directory: '', cache: { lookup: async id => stored.has(id), save: async row => stored.add(row.id) }, resolve: async id => { resolved.push(id); if (id === 'song0000002') throw new Error('Unavailable'); return { url: 'audio' }; } };
  const download = new LibraryDownload(catalogue, player);
  download.start(); const task = download.task; download.start(); assert.equal(download.task, task);
  await task;
  assert.equal(download.state.saved, 2); assert.equal(download.state.skipped, 1); assert.equal(download.state.failed, 1);
  assert.ok(!resolved.includes('song0000001'));
  stored.clear();
  player.cache.save = async row => { stored.add(row.id); download.stop(); };
  download.start(); await download.task;
  assert.equal(download.state.running, false);
  assert.equal(stored.size, 1);
  assert.match(download.state.message, /detenida/);
});
