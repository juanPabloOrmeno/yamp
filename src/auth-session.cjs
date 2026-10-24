const fs = require('node:fs/promises');
const path = require('node:path');

async function saveSession(directory, cookies) {
  const selected = cookies.filter(c => c.domain === 'youtube.com' || c.domain.endsWith('.youtube.com'));
  if (!selected.some(c => ['SAPISID', '__Secure-3PAPISID', '__Secure-1PAPISID'].includes(c.name))) {
    throw new Error('Termina de iniciar sesión en Chrome antes de pulsar GUARDAR SESIÓN.');
  }
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const write = async (name, text) => {
    const destination = path.join(directory, name);
    await fs.writeFile(destination + '.tmp', text, { mode: 0o600 });
    await fs.chmod(destination + '.tmp', 0o600);
    await fs.rename(destination + '.tmp', destination);
  };
  await write('native-session.json', JSON.stringify(selected));
  const lines = selected.map(c => [
    (c.httpOnly ? '#HttpOnly_' : '') + c.domain,
    c.domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path || '/', c.secure ? 'TRUE' : 'FALSE',
    c.expires > 0 ? Math.floor(c.expires) : 0, c.name, c.value
  ].join('\t'));
  await write('cookies.txt', '# Netscape HTTP Cookie File\n' + lines.join('\n') + '\n');
  return selected.length;
}

async function loadCookie(directory) {
  try {
    const cookies = JSON.parse(await fs.readFile(path.join(directory, 'native-session.json'), 'utf8'));
    return cookies.filter(c => c.expires <= 0 || c.expires * 1000 > Date.now()).map(c => `${c.name}=${c.value}`).join('; ');
  } catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}
module.exports = { saveSession, loadCookie };
