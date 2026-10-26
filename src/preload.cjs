const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('yamp', {
  command: (action, value) => ipcRenderer.invoke('yamp:command', action, value),
  onLevels: callback => {
    const listener = (_event, levels) => callback(levels);
    ipcRenderer.on('yamp:levels', listener);
    return () => ipcRenderer.removeListener('yamp:levels', listener);
  },
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('yamp:state', listener);
    return () => ipcRenderer.removeListener('yamp:state', listener);
  }
});
