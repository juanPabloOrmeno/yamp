const { EventEmitter } = require('node:events');
class LibraryDownload extends EventEmitter {
  constructor(catalogue, player) {
    super(); this.catalogue = catalogue; this.player = player;
    this.queued = new Map();
    this.state = { running: false, saved: 0, skipped: 0, failed: 0, scanned: 0, title: '', message: '' };
  }
  enqueue(rows) {
    for (const row of rows) this.queued.set(row.id, { ...row });
    if (!this.state.running) this.start(false);
  }
  start(library = true) {
    if (this.state.running) return;
    this.abort = new AbortController();
    this.state = { running: true, saved: 0, skipped: 0, failed: 0, scanned: 0, title: '', message: library ? 'Leyendo bibliotecas…' : 'Guardando canciones de la playlist…' };
    this.emit('change');
    this.task = this.run(library).finally(() => {
      this.state.running = false; this.state.title = ''; this.emit('change');
      if (this.queued.size) this.start(false);
    });
  }
  async *tracks(library, signal) {
    if (library) {
      try { yield* this.catalogue.libraryTracks(signal, () => { this.state.failed++; this.emit('change'); }); }
      catch (error) { signal.throwIfAborted(); if (!this.queued.size) throw error; this.state.failed++; }
    }
    while (this.queued.size) {
      signal.throwIfAborted();
      const [id, row] = this.queued.entries().next().value;
      this.queued.delete(id);
      yield row;
    }
  }
  async run(library) {
    const signal = this.abort.signal;
    const cache = this.player.cache;
    try {
      for await (const row of this.tracks(library, signal)) {
        signal.throwIfAborted();
        this.state.scanned++; this.state.title = row.title; this.state.message = 'Guardando canciones en segundo plano…'; this.emit('change');
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
      this.state.message = this.state.failed ? 'Algunas canciones no se guardaron. Vuelve a guardar la playlist o descargar las bibliotecas para reintentarlo.' : library ? 'Bibliotecas guardadas.' : 'Canciones de la playlist guardadas.';
    } catch (error) {
      this.state.message = signal.aborted ? 'Descarga detenida. Las canciones guardadas se conservan.' : error.message;
    }
  }
  stop() { this.queued.clear(); this.abort?.abort(); this.state.message = 'Deteniendo al terminar el guardado actual…'; this.emit('change'); }
}
module.exports = LibraryDownload;
