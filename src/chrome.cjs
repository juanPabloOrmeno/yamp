const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const net = require('node:net');

const HOME = 'https://music.youtube.com/';
const LOGIN = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F';

// CDP is bound only to loopback on a nonzero port in a dedicated Chrome profile.
// Chrome's pipe/port-zero modes mark navigator.webdriver; normal port mode does not.
// Chrome is used only to authenticate. GUARDAR SESIÓN exports the user's YAMP
// session for the native backend and closes Chrome; playback never uses this class.
class ChromeMusic {
  constructor(profile) {
    this.profile = profile;
    this.pending = new Map();
    this.sequence = 0;
    this.target = null;
    this.sessionId = null;
    this.process = null;
    this.starting = null;
    this.socket = null;
    this.closing = false;
  }
  async start() {
    if (this.starting) return this.starting;
    if (this.process) return;
    this.starting = this.launch();
    try { await this.starting; } finally { this.starting = null; }
  }
  async launch() {
    const executable = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/google-chrome'].find(existsSync);
    if (!executable) throw new Error('Instala Google Chrome para iniciar sesión en YAMP.');
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(error => error ? reject(error) : resolve(port));
      });
    });
    const child = spawn(executable, [
      `--user-data-dir=${this.profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1',
      '--no-first-run', '--no-default-browser-check', '--no-startup-window'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    this.process = child;
    const disconnected = () => {
      if (this.process !== child) return;
      this.process = null; this.target = null; this.sessionId = null;
      this.socket?.close(); this.socket = null;
      if (!this.closing && child.exitCode === null && !child.killed) child.kill('SIGTERM');
      for (const request of this.pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error('Chrome se cerró. Pulsa MUSIC para volver a abrirlo.'));
      }
      this.pending.clear();
    };
    child.on('error', disconnected);
    child.on('exit', disconnected);
    try {
      const endpoint = await new Promise((resolve, reject) => {
        let log = '';
        const timeout = setTimeout(() => finish(new Error('Chrome no inició el control local.')), 15000);
        function finish(error, url) {
          clearTimeout(timeout);
          child.stderr.off('data', onData);
          child.off('exit', onExit);
          child.off('error', onError);
          if (error) reject(error); else resolve(url);
        }
        function onError(error) { finish(error); }
        function onExit() { finish(new Error('Chrome se cerró al iniciar.')); }
        function onData(chunk) {
          log = (log + chunk.toString()).slice(-8192);
          const match = log.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/);
          if (match) finish(null, match[1]);
        }
        child.stderr.on('data', onData);
        child.once('exit', onExit);
        child.once('error', onError);
      });
      const socket = new WebSocket(endpoint);
      this.socket = socket;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { socket.close(); reject(new Error('No se pudo conectar con Chrome.')); }, 10000);
        socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
        socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Error conectando con Chrome.')); }, { once: true });
      });
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        clearTimeout(request.timeout);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      });
      socket.addEventListener('close', disconnected);
      await this.send('Browser.getVersion');
      await this.createPage();
    } catch (error) {
      child.kill('SIGTERM');
      disconnected();
      throw error;
    }
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      if (!this.process || this.socket?.readyState !== WebSocket.OPEN) return reject(new Error('Abre MUSIC para conectar con Chrome.'));
      const id = ++this.sequence;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Chrome no respondió. Vuelve a abrir MUSIC.'));
      }, 15000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async createPage() {
    const { targetId } = await this.send('Target.createTarget', { url: HOME, newWindow: true });
    this.target = targetId;
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    this.sessionId = sessionId;
  }
  async show() {
    await this.start();
    const { targetInfos } = await this.send('Target.getTargets');
    if (!targetInfos.some(target => target.targetId === this.target)) await this.createPage();
    const { windowId } = await this.send('Browser.getWindowForTarget', { targetId: this.target });
    await this.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await this.send('Page.bringToFront', {}, this.sessionId);
  }
  async navigate(url) {
    await this.show();
    await this.send('Page.navigate', { url }, this.sessionId);
  }
  async login() { await this.navigate(LOGIN); }
  async close() {
    if (!this.process) return;
    const child = this.process;
    this.closing = true;
    const exited = new Promise(resolve => {
      const timeout = setTimeout(() => child.kill('SIGTERM'), 5000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
    try { await this.send('Browser.close'); } catch { /* Chrome may close the connection before replying. */ }
    await exited;
    this.closing = false;
  }
}
module.exports = ChromeMusic;
