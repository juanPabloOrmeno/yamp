const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Spotify, normalize, REDIRECT } = require('../src/spotify.cjs');
const track = { type: 'track', id: 'spotify1', name: 'Una canción', artists: [{ name: 'Artista' }], duration_ms: 180000, album: { type: 'album', id: 'album1', name: 'Disco' } };
async function setup(t, request, youtube = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yamp-spotify-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const spotify = new Spotify(directory, youtube, request);
  spotify.session = { client_id: 'a'.repeat(32), refresh_token: 'refresh', access_token: 'access', expires: Date.now() + 3600000 };
  t.after(() => spotify.close()); return spotify;
}
const json = value => new Response(JSON.stringify(value), { status: 200 });

test('Spotify normalizes tracks, album wrappers and new/legacy playlist items', () => {
  for (const row of [track, { track }, { item: track }]) assert.equal(normalize(row).kind, 'song');
  assert.equal(normalize(track).album, 'Disco');
  assert.equal(normalize({ album: track.album }).kind, 'album');
  assert.equal(normalize({ item: null }), null);
  assert.equal(normalize({ ...track, is_local: true }), null);
  assert.equal(normalize({ ...track, type: 'episode' }), null);
});

test('Spotify search and library follow pagination without leaking tokens to view', async t => {
  const calls = [];
  const spotify = await setup(t, async (url, options) => {
    calls.push(url); assert.equal(options.headers.Authorization, 'Bearer access');
    if (url.includes('offset=10')) return json({ tracks: { items: [track, { ...track, id: 'spotify2' }], next: null } });
    if (url.includes('/search')) return json({ tracks: { items: [track], next: 'https://api.spotify.com/v1/search?offset=10' } });
    if (url.includes('/me/playlists')) return json({ items: [{ type: 'playlist', id: 'list1', name: 'Lista' }] });
    return json({ items: [{ item: track }, { item: null }] });
  });
  await spotify.search('una canción');
  assert.equal(spotify.view.more, true);
  assert.equal((await spotify.allSongs()).length, 2);
  assert.equal(spotify.view.items.length, 1);
  await spotify.more(); assert.equal(spotify.view.items.length, 2);
  await spotify.filter('Playlists'); await spotify.open(spotify.view.items[0]);
  assert.equal(spotify.view.items[0].kind, 'song');
  assert.ok(calls.some(url => url.includes('/playlists/list1/items')));
  assert.ok(!JSON.stringify(spotify.view).includes('access_token'));
  await assert.rejects(spotify.api('https://example.org/v1/tracks'), /inválido/);
});

test('Spotify refreshes once for concurrent requests and persists rotated credentials privately', async t => {
  let refreshes = 0;
  const spotify = await setup(t, async url => {
    if (url.includes('/api/token')) { refreshes++; return json({ access_token: 'new', refresh_token: 'rotated', expires_in: 3600 }); }
    return json({ items: [] });
  });
  spotify.session.expires = 0;
  await Promise.all([spotify.api('me/tracks'), spotify.api('me/albums')]);
  assert.equal(refreshes, 1);
  assert.equal(JSON.parse(await fs.readFile(spotify.file)).refresh_token, 'rotated');
  assert.equal((await fs.stat(spotify.file)).mode & 0o777, 0o600);
  await spotify.disconnect();
  await assert.rejects(spotify.api('me/tracks'), /CUENTA/);
  assert.ok(!JSON.parse(await fs.readFile(spotify.file)).refresh_token);
});

test('Spotify rejects unreliable matches and resolves without changing the YouTube view', async t => {
  let searches = 0;
  const youtube = { view: { title: 'Original' }, client: async () => ({ music: { search: async () => {
    searches++; return { items: [
      { item_type: 'song', id: 'wrong000001', title: 'Una canción', artists: [{ name: 'Otro' }], duration: { seconds: 180 } },
      { item_type: 'song', id: 'match000001', title: 'Una canción', artists: [{ name: 'Artista' }], duration: { seconds: 181 } }
    ] };
  } } }) };
  const spotify = await setup(t, fetch, youtube);
  const result = await spotify.playable(normalize(track));
  assert.equal(result.id, 'match000001'); assert.equal(result.spotifyId, track.id);
  await spotify.playable(normalize(track)); assert.equal(searches, 1);
  await assert.rejects(spotify.playable({ ...normalize(track), id: 'other', title: 'Otra canción' }), /coincidencia fiable/);
  assert.equal(youtube.view.title, 'Original');
});

test('Spotify OAuth validates state, exchanges PKCE code and can restart from saved session', async t => {
  let challenge;
  const spotify = await setup(t, async (_url, options) => {
    assert.equal(options.body.get('redirect_uri'), REDIRECT);
    assert.equal(createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'), challenge);
    return json({ access_token: 'token', refresh_token: 'refresh', expires_in: 3600 });
  });
  await spotify.login('a'.repeat(32), async authURL => {
    const auth = new URL(authURL); challenge = auth.searchParams.get('code_challenge');
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
    const bad = await fetch(`${REDIRECT}?state=wrong&code=abc`); assert.equal(bad.status, 400);
    const good = await fetch(`${REDIRECT}?state=${auth.searchParams.get('state')}&code=abc`); assert.equal(good.status, 200);
  });
  assert.equal(spotify.status.connecting, false);
  const restored = new Spotify(spotify.directory, {}); await restored.start();
  assert.equal(restored.status.connected, true);
});

test('Spotify reports rate limits and permission failures', async t => {
  const spotify = await setup(t, async () => new Response('', { status: 429, headers: { 'retry-after': '30' } }));
  await assert.rejects(spotify.search('test'), /30 segundos/);
  spotify.request = async () => new Response('', { status: 403 });
  await assert.rejects(spotify.library(), /usuarios autorizados/);
});

test('Spotify library traversal includes containers, deduplicates and honors cancellation', async t => {
  const spotify = await setup(t, async url => {
    if (url.includes('/me/playlists')) return json({ items: [{ type: 'playlist', id: 'list1', name: 'Lista' }] });
    if (url.includes('/me/albums')) return json({ items: [{ album: track.album }] });
    if (url.includes('/playlists/')) return json({ items: [{ item: track }, { item: { ...track, id: 'second' } }] });
    if (url.includes('/albums/')) return json({ items: [track] });
    return json({ items: [{ track }] });
  });
  spotify.playable = async row => ({ ...row, id: row.id === 'second' ? 'match000002' : 'match000001' });
  const abort = new AbortController(), rows = [];
  for await (const row of spotify.libraryTracks(abort.signal)) rows.push(row.id);
  assert.deepEqual(rows, ['match000001', 'match000002']);
  abort.abort();
  await assert.rejects(async () => { for await (const row of spotify.libraryTracks(abort.signal)) assert.fail(row.id); }, { name: 'AbortError' });
});
