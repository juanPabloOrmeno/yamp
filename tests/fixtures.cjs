const path = require('node:path');
const { Catalogue } = require('../src/catalogue.cjs');
const rows = [
  { id: 'test0000001', kind: 'song', title: 'Primera canción', artist: 'Artista de prueba' },
  { id: 'test0000002', kind: 'song', title: 'Segunda canción', artist: 'Otro artista' }
];
class FixtureCatalogue extends Catalogue {
  constructor() { super(''); }
  async home() { this.view = { title: 'INICIO', items: rows.map(x => ({ ...x })), revision: this.view.revision + 1, filters: [], more: false }; }
  async library() { await this.home(); this.view.title = 'MI BIBLIOTECA'; }
  async search(query) { await this.home(); this.view.title = query; }
  async like() {}
}
function resolver() { return Promise.resolve({ url: path.resolve(__dirname, '../test-results/silence.wav'), duration: 20 }); }
module.exports = { FixtureCatalogue, resolver };
