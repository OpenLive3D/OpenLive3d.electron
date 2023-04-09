const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
 
const path = require('path');
const url = require('url');
 
let win;
 
function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'build/icon.icns')
  });
 
  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'OpenLive3D.github.io/index.html'),
    protocol: 'file:',
    slashes: true
  }));
}
app.on('ready', createWindow);
