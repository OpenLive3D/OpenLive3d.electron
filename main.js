const electron = require('electron');

const { readFileSync, existsSync, writeFileSync } = require('fs');
const { app } = electron;
const { BrowserWindow } = electron;
const { ipcMain } = electron;

const path = require('path');
const url = require('url');

function readConfig() {
    if(existsSync('./config.json')){
        return readFileSync('./config.json', 'utf8');
    }else{
        return null;
    }
}
function saveConfig(saveString) {
    writeFileSync('./config.json', saveString);
}

let win;
function createWindow() {
    // Create the browser window.
    win = new BrowserWindow({
        width: 1024,
        height: 640,
        icon: path.join(__dirname, 'build/icon.icns'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
        },
    });
    win.webContents.openDevTools();

    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(
            __dirname,
            'OpenLive3D.github.io/index.html'
        ),
        protocol: 'file:',
        slashes: true,
    }));

    // save and load config
    ipcMain.on('initConfig', (event, arg) => {
        event.returnValue = readConfig();
    })
    ipcMain.on('saveConfig', (event, arg) => {
        console.log("Acquire Config ", arg);
        if(arg){
            saveConfig(arg);
        }else{
            saveConfig('');
        }
    });
}
app.on('ready', () => {
    createWindow();
});
