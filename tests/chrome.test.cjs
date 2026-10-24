const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { once } = require('node:events');
const ChromeMusic = require('../src/chrome.cjs');

test('Chrome real: local control, browser identity, UTF-8, errors, restart and cleanup', { timeout: 45000 }, async () => {
  const profile = await fs.mkdtemp('/tmp/opencode/yamp-chrome-test-');
  const chrome = new ChromeMusic(profile);
  try {
    await chrome.start();
    await chrome.send('Page.navigate', { url: 'about:blank' }, chrome.sessionId);
    const response = await chrome.send('Runtime.evaluate', {
      expression: '({ text: "Música 日本語 🎧", webdriver: navigator.webdriver, agent: navigator.userAgent })', returnByValue: true
    }, chrome.sessionId);
    assert.equal(response.result.value.text, 'Música 日本語 🎧');
    assert.equal(response.result.value.webdriver, false);
    assert.match(response.result.value.agent, /Chrome\//);
    assert.doesNotMatch(response.result.value.agent, /Electron/);
    const { targetInfo } = await chrome.send('Target.getTargetInfo', { targetId: chrome.target });
    assert.equal(targetInfo.url, 'about:blank');
    await assert.rejects(chrome.send('Yamp.invalidMethod'), /wasn't found/);
    await chrome.show();
    const exited = once(chrome.process, 'exit');
    await chrome.close();
    await exited;
    assert.equal(chrome.process, null);
    assert.equal(chrome.pending.size, 0);
    await chrome.show();
    assert.ok(chrome.process);
    assert.ok(chrome.sessionId);
  } finally {
    const exited = chrome.process ? once(chrome.process, 'exit') : Promise.resolve();
    await chrome.close();
    await exited;
    await fs.rm(profile, { recursive: true, force: true });
  }
});
