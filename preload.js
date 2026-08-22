const { contextBridge, ipcRenderer } = require('electron');

const VALID_INVOKE_CHANNELS = ['initConfig', 'show-open-vrm-dialog'];
const VALID_SEND_CHANNELS = ['saveConfig', 'setBackgroundColor', 'double-click-titlebar', 'set-always-on-top'];
const VALID_LISTEN_CHANNELS = ['window-focus', 'menu-toggle-sidebar', 'menu-toggle-sidebars', 'menu-toggle-all-ui', 'menu-tracking-mode', 'menu-open-vrm', 'menu-reset-camera', 'load-vrm-file'];

contextBridge.exposeInMainWorld('api', {
    platform: process.platform,
    invoke: (channel, data) => {
        if (VALID_INVOKE_CHANNELS.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
        return Promise.reject(new Error(`Unauthorized invoke channel: ${channel}`));
    },
    send: (channel, data) => {
        if (VALID_SEND_CHANNELS.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, callback) => {
        if (VALID_LISTEN_CHANNELS.includes(channel) && typeof callback === 'function') {
            const subscription = (event, ...args) => callback(...args);
            ipcRenderer.on(channel, subscription);
            return () => ipcRenderer.removeListener(channel, subscription);
        }
    }
});
