const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

class AudioEngine extends EventEmitter {
  constructor() {
    super();
    this.pending = new Map();
    this.sequence = 0;
    this.properties = { pause: true, volume: 75, mute: false, 'time-pos': 0, duration: 0, 'idle-active': true };
  }
  async start() {
    this.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yamp-audio-'));
    const socketPath = path.join(this.directory, 'ipc.sock');
    this.process = spawn('/usr/bin/mpv', [
      '--no-config', '--idle=yes', '--no-video', '--no-terminal', '--audio-display=no',
      '--volume=75', '--ytdl=no', `--input-ipc-server=${socketPath}`
    ], { stdio: 'ignore' });
    let failure;
    this.process.on('error', error => { failure = error; this.emit('failure', 'No se pudo iniciar el motor de audio mpv.'); });
    this.process.on('exit', () => {
      for (const request of this.pending.values()) { clearTimeout(request.timeout); request.reject(new Error('El motor de audio se cerró.')); }
      this.pending.clear();
      if (!this.closing) this.emit('failure', 'El motor de audio se cerró. Reinicia YAMP.');
    });
    const deadline = Date.now() + 5000;
    while (!this.socket) {
      if (failure) throw failure;
      if (Date.now() > deadline) throw new Error('No se pudo conectar con mpv.');
      this.socket = await new Promise(resolve => {
        const candidate = net.createConnection(socketPath);
        candidate.once('connect', () => resolve(candidate));
        candidate.once('error', () => { candidate.destroy(); resolve(null); });
      });
      if (!this.socket) await new Promise(resolve => setTimeout(resolve, 25));
    }
    let buffer = '';
    this.socket.setEncoding('utf8');
    this.socket.on('error', () => { if (!this.closing) this.emit('failure', 'Se perdió la conexión de audio.'); });
    this.socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let response; try { response = JSON.parse(line); } catch { continue; }
        if (response.request_id) {
          const request = this.pending.get(response.request_id);
          if (request) {
            this.pending.delete(response.request_id); clearTimeout(request.timeout);
            if (response.error !== 'success') request.reject(new Error(`Audio: ${response.error}`));
            else request.resolve(response.data);
          }
        }
        if (response.event === 'property-change') this.properties[response.name] = response.data;
        if (response.event) this.emit(response.event, response);
      }
    });
    for (const [index, name] of Object.keys(this.properties).entries()) await this.command('observe_property', index + 1, name);
  }
  command(...command) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) return reject(new Error('El motor de audio no está conectado.'));
      const request_id = ++this.sequence;
      const timeout = setTimeout(() => { this.pending.delete(request_id); reject(new Error('El audio no respondió.')); }, 10000);
      this.pending.set(request_id, { resolve, reject, timeout });
      this.socket.write(JSON.stringify({ command, request_id }) + '\n');
    });
  }
  async load(url, headers = {}) {
    const fields = Object.entries(headers).filter(([name]) => ['user-agent', 'referer', 'origin'].includes(name.toLowerCase())).map(([name, value]) => `${name}: ${String(value).replace(/[\r\n]/g, '')}`);
    await this.command('set_property', 'http-header-fields', fields);
    await this.command('set_property', 'pause', false);
    await this.command('loadfile', url, 'replace');
  }
  async close() {
    this.closing = true;
    if (this.process && this.process.exitCode === null) {
      const exited = new Promise(resolve => {
        const timeout = setTimeout(() => this.process.kill('SIGKILL'), 3000);
        this.process.once('exit', () => { clearTimeout(timeout); resolve(); });
      });
      try { await this.command('quit'); } catch { this.process.kill('SIGTERM'); }
      await exited;
    }
    this.socket?.destroy();
    if (this.directory) await fs.rm(this.directory, { recursive: true, force: true });
  }
}
module.exports = AudioEngine;
