const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const LocalLibraries = require('../src/local-libraries.cjs');

test('local libraries mix sources, deduplicate, share audio and persist independent membership', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yamp-libraries-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const libraries = new LocalLibraries(directory); await libraries.start();
  const [first, second] = await Promise.all([libraries.create('Mis favoritas'), libraries.create('Viajes')]);
  const youtube = { id: 'youtube0001', kind: 'song', title: 'YouTube' };
  const spotify = { id: 'spotify0001', kind: 'song', title: 'Spotify', spotifyId: 'original-spotify-id' };
  assert.equal(await libraries.add(first, [youtube, spotify, youtube]), 2);
  assert.equal(await libraries.add(first, [spotify]), 0);
  await libraries.add(second, [youtube]);
  const cache = { tracks: new Map([[youtube.id, youtube]]) };
  assert.deepEqual(libraries.snapshot(cache)[0].tracks.map(row => row.local), [true, false]);
  await libraries.removeTracks(first, [youtube.id]);
  assert.equal(libraries.tracks(second).length, 1);
  assert.equal(cache.tracks.size, 1);
  await libraries.rename(first, 'Favoritas mixtas');
  const restored = new LocalLibraries(directory); await restored.start();
  assert.equal(restored.list(first).name, 'Favoritas mixtas');
  assert.equal(restored.tracks(first)[0].spotifyId, spotify.spotifyId);
  await restored.remove(second);
  assert.equal(cache.tracks.size, 1);
  cache.tracks.clear();
  assert.equal(restored.snapshot(cache)[0].tracks[0].local, false);
  await assert.rejects(restored.rename(first, '  '), /nombre/);
  await assert.rejects(restored.removeTracks(first, ['missing']), /Selecciona/);
  assert.throws(() => restored.add(first, [{ id: '../invalid', kind: 'song', title: 'Invalid' }]), /válidas/);
  assert.equal(restored.tracks(first).length, 1);
  await restored.create('Después de un error');
  assert.equal(restored.items.length, 2);
});

test('invalid library storage is not silently overwritten', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yamp-libraries-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const libraries = new LocalLibraries(directory);
  await fs.writeFile(libraries.file, '{broken');
  await assert.rejects(libraries.start(), /leer las librerías/);
  assert.equal(await fs.readFile(libraries.file, 'utf8'), '{broken');
});
