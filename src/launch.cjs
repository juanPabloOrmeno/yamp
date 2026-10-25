const { spawn } = require('node:child_process');
const path = require('node:path');

const args = process.argv.slice(2);
// Select the backend before Electron initializes its native window system.
if (process.platform === 'linux' && process.env.HYPRLAND_INSTANCE_SIGNATURE && process.env.DISPLAY && !args.some(arg => /^--ozone-platform(?:=|$)/.test(arg))) {
  args.unshift('--ozone-platform=x11');
  // Hyprland already scales XWayland surfaces on HiDPI monitors.
  if (!args.some(arg => /^--force-device-scale-factor(?:=|$)/.test(arg))) args.unshift('--force-device-scale-factor=1');
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.resolve(__dirname, '..'), ...args], { env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
