const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    invoke: (channel, data) => {
        let validChannels = ['initConfig'];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    },
    send: (channel, data) => {
        let validChannels = ['saveConfig'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    }
});
