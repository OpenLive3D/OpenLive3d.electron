const electron = require('electron');

const { app } = electron;
const { BrowserWindow } = electron;
const { ipcMain } = electron;
const { powerSaveBlocker } = electron;
const {
    readFileSync,
    existsSync,
    writeFileSync,
    mkdirSync
} = require('fs');

const path = require('path');
const url = require('url');

function getAppDataPath() {
    switch (process.platform) {
        case "darwin": {
            return path.join(process.env.HOME, "Library", "Application Support", "OpenLive3D");
        }
        case "win32": {
            return path.join(process.env.APPDATA, "OpenLive3D");
        }
        case "linux": {
            return path.join(process.env.HOME, ".OpenLive3D");
        }
        default: {
            console.log("Unsupported platform!");
            process.exit(1);
        }
    }
}

const appDatatDirPath = getAppDataPath();
if (!existsSync(appDatatDirPath)) {
    mkdirSync(appDatatDirPath);
}
const appDataFilePath = path.join(appDatatDirPath, 'config.json');
function readConfig() {
    if(existsSync(appDataFilePath)){
        return readFileSync(appDataFilePath, 'utf8');
    }else{
        return null;
    }
}
function saveConfig(saveString) {
    writeFileSync(appDataFilePath, saveString);
}

let win;
function createWindow() {
    // Create the browser window.
    win = new BrowserWindow({
        title: 'OpenLive3D',
        width: 1024,
        height: 640,
        icon: path.join(__dirname, 'build/icon.icns'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js')
        },
    });
    // win.webContents.openDevTools();

    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true,
    }));

    // save and load config
    ipcMain.handle('initConfig', () => {
        return readConfig();
    });
    ipcMain.on('saveConfig', (event, arg) => {
        console.log("Acquire Config ", arg);
        if(arg){
            saveConfig(arg);
        }else{
            saveConfig('');
        }
    });
}
// GPU acceleration flags for real-time rendering performance
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.whenReady().then(() => {
    const id = powerSaveBlocker.start('prevent-app-suspension');
    console.log(`[Main] powerSaveBlocker started (prevent-app-suspension) with id: ${id}`);
    createWindow();
});
