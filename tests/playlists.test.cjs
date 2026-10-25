const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Playlists = require('../src/playlists.cjs');
test('playlists preserve queue order and duplicates across restarts', async t => {
  const directory = await fs.mkdtemp('/tmp/opencode/yamp-playlists-');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new Playlists(directory); await store.start();
  const a = { id: 'test0000001', kind: 'song', title: 'Primera' }, b = { id: 'test0000002', kind: 'song', title: 'Segunda' };
  await assert.rejects(store.save(' ', [a]));
  await assert.rejects(store.save('Vacía', []));
  const list = await store.save('Mi playlist', [b, a, b]);
  a.title = 'Cambiada';
  const reopened = new Playlists(directory); await reopened.start();
  assert.deepEqual(reopened.tracks(list.id).map(row => row.title), ['Segunda', 'Primera', 'Segunda']);
  const tracks = reopened.tracks(list.id); tracks.pop();
  assert.equal(reopened.tracks(list.id).length, 3);
  assert.throws(() => reopened.tracks('../escape'));
});
