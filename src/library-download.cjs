const { EventEmitter } = require('node:events');
class LibraryDownload extends EventEmitter {
  constructor(catalogue, player) {
    super(); this.catalogue = catalogue; this.player = player;
    this.state = { running: false, saved: 0, skipped: 0, failed: 0, scanned: 0, title: '', message: '' };
  }
  start() {
    if (this.state.running) return;
    this.abort = new AbortController();
    this.state = { running: true, saved: 0, skipped: 0, failed: 0, scanned: 0, title: '', message: 'Leyendo bibliotecas…' };
    this.emit('change');
    this.task = this.run().finally(() => { this.state.running = false; this.state.title = ''; this.emit('change'); });
  }
  async run() {
    const signal = this.abort.signal;
    const cache = this.player.cache;
    try {
      for await (const row of this.catalogue.libraryTracks(signal, () => { this.state.failed++; this.emit('change'); })) {
        signal.throwIfAborted();
        this.state.scanned++; this.state.title = row.title; this.state.message = 'Guardando bibliotecas…'; this.emit('change');
        try {
          if (await cache.lookup(row.id)) this.state.skipped++;
          else {
            const audio = await this.player.resolve(row.id, this.player.directory, signal);
            signal.throwIfAborted();
            await cache.save(row, audio);
            if (await cache.lookup(row.id)) this.state.saved++;
            else this.state.failed++;
          }
        } catch (error) { signal.throwIfAborted(); this.state.failed++; }
        this.emit('change');
      }
      signal.throwIfAborted();
      this.state.message = this.state.failed ? 'Proceso terminado con errores. Puedes volver a intentarlo.' : 'Bibliotecas guardadas.';
    } catch (error) {
      this.state.message = signal.aborted ? 'Descarga detenida. Las canciones guardadas se conservan.' : error.message;
    }
  }
  stop() { this.abort?.abort(); this.state.message = 'Deteniendo al terminar el guardado actual…'; this.emit('change'); }
}
module.exports = LibraryDownload;
