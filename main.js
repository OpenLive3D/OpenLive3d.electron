const electron = require('electron');

const { app } = electron;
const { BrowserWindow } = electron;

const path = require('path');
const url = require('url');

let win;

function createWindow() {
    // Create the browser window.
    win = new BrowserWindow({
        width: 1024,
        height: 640,
        icon: path.join(__dirname, 'build/icon.icns'),
        webPreferences: {
            backgroundThrottling: false,
        },
    });

    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(__dirname, 'OpenLive3D.github.io/index.html'),
        protocol: 'file:',
        slashes: true,
    }));
}
app.on('ready', createWindow);
