const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const History = require('../src/history.cjs');
test('history persists recency, avoids duplicates and rejects stale selections', async t => {
  const directory = await fs.mkdtemp('/tmp/opencode/yamp-history-');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const history = new History(directory); await history.start();
  const first = { id: 'test0000001', kind: 'song', title: 'Primera' };
  const second = { id: 'test0000002', kind: 'song', title: 'Segunda' };
  history.record(first);
  const selection = { index: 0, revision: history.revision };
  history.record(second); history.record(first);
  assert.throws(() => history.selected(selection));
  await history.pending;
  const reopened = new History(directory); await reopened.start();
  assert.deepEqual(reopened.view.items.map(row => row.id), [first.id, second.id]);
  assert.ok(reopened.view.items.every(row => row.playedAt));
});
