const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const AudioEngine = require('../src/mpv.cjs');

function nextLevels(engine, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { engine.off('levels', listener); reject(new Error('No llegaron los niveles esperados.')); }, 4000);
    function listener(levels) {
      if (!predicate(levels)) return;
      clearTimeout(timeout); engine.off('levels', listener); resolve(levels);
    }
    engine.on('levels', listener);
  });
}

test('visualizer measures actual mpv audio and clears on pause, mute, silence and stop', { timeout: 20000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yamp-meter-'));
  const engine = new AudioEngine();
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const rate = 44100, seconds = 12;
  const data = Buffer.alloc(44 + rate * seconds * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  // Low tone, high tone, then digital silence: columns must track frequency.
  for (let i = 0; i < rate * 8; i++) {
    const frequency = i < rate * 4 ? 440 : 4000;
    data.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * frequency * i / rate)), 44 + i * 2);
  }
  const file = path.join(directory, 'tone.wav'); await fs.writeFile(file, data);
  await engine.start(); await engine.load(file);
  const sound = await nextLevels(engine, value => value.rms > 0);
  assert.ok(sound.peak >= sound.rms && sound.peak <= 1);
  const low = await nextLevels(engine, value => value.bands[9] > 0.2);
  assert.equal(low.bands.length, 24);
  assert.ok(low.bands[9] > low.bands[19] + 0.15, '440 Hz lights low-mid columns, not treble');
  await engine.command('set_property', 'pause', true);
  await nextLevels(engine, value => value.rms === 0 && value.peak === 0);
  await engine.command('set_property', 'pause', false);
  await nextLevels(engine, value => value.rms > 0);
  await engine.command('set_property', 'mute', true);
  await nextLevels(engine, value => value.rms === 0 && value.peak === 0);
  await engine.command('set_property', 'mute', false);
  await nextLevels(engine, value => value.rms > 0);
  await engine.command('seek', 5, 'absolute+exact');
  const high = await nextLevels(engine, value => value.bands[19] > 0.2);
  assert.ok(high.bands[19] > high.bands[9] + 0.15, '4000 Hz lights the fixed treble column');
  await engine.command('seek', 9, 'absolute+exact');
  await nextLevels(engine, value => value.rms === 0 && value.peak === 0);
  await engine.command('stop');
  await nextLevels(engine, value => value.rms === 0 && value.peak === 0);
});
