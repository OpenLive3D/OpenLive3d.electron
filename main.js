const electron = require('electron');

const {
    app,
    BrowserWindow,
    ipcMain,
    powerSaveBlocker,
    nativeTheme,
    Menu,
    shell,
    screen,
    dialog
} = electron;

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
    mkdirSync(appDatatDirPath, { recursive: true });
}

// Config file management
const appDataFilePath = path.join(appDatatDirPath, 'config.json');
function readConfig() {
    if (existsSync(appDataFilePath)) {
        return readFileSync(appDataFilePath, 'utf8');
    } else {
        return null;
    }
}
function saveConfig(saveString) {
    writeFileSync(appDataFilePath, saveString);
}

function convertHexToDisplayColor(hex) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex || '#00e700';
    let cleanHex = hex.slice(1);
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    if (cleanHex.length !== 6) return hex;
    const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
    const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
    const b = parseInt(cleanHex.slice(4, 6), 16) / 255;
    const toSRGB = (c) => {
        return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
    };
    const sR = Math.min(255, Math.max(0, Math.round(toSRGB(r) * 255)));
    const sG = Math.min(255, Math.max(0, Math.round(toSRGB(g) * 255)));
    const sB = Math.min(255, Math.max(0, Math.round(toSRGB(b) * 255)));
    return `#${sR.toString(16).padStart(2, '0')}${sG.toString(16).padStart(2, '0')}${sB.toString(16).padStart(2, '0')}`;
}

function getInitialBackgroundColor() {
    try {
        const configStr = readConfig();
        if (configStr) {
            const configObj = JSON.parse(configStr);
            if (configObj && configObj.BG_COLOR) {
                return convertHexToDisplayColor(configObj.BG_COLOR);
            }
        }
    } catch (e) {}
    return '#00e700';
}

// Window state management (remember position and size across launches)
const windowStateFilePath = path.join(appDatatDirPath, 'window-state.json');
function loadWindowState() {
    const defaultState = { width: 1024, height: 640, isMaximized: false };
    try {
        if (existsSync(windowStateFilePath)) {
            const data = JSON.parse(readFileSync(windowStateFilePath, 'utf8'));
            return { ...defaultState, ...data };
        }
    } catch (e) {
        console.error('[Main] Failed to load window state:', e);
    }
    return defaultState;
}

function saveWindowState(window) {
    if (!window || window.isDestroyed()) return;
    try {
        const isMaximized = window.isMaximized();
        let state = { isMaximized };
        if (!isMaximized) {
            const bounds = window.getBounds();
            state.x = bounds.x;
            state.y = bounds.y;
            state.width = bounds.width;
            state.height = bounds.height;
        } else {
            const prevState = loadWindowState();
            state.x = prevState.x;
            state.y = prevState.y;
            state.width = prevState.width || 1024;
            state.height = prevState.height || 640;
        }
        writeFileSync(windowStateFilePath, JSON.stringify(state));
    } catch (e) {
        console.error('[Main] Failed to save window state:', e);
    }
}

function validateBounds(state) {
    if (typeof state.x !== 'number' || typeof state.y !== 'number') return state;
    try {
        const displays = screen.getAllDisplays();
        const isVisibleOnAnyDisplay = displays.some(display => {
            const b = display.bounds;
            return state.x >= b.x - 50 &&
                   state.x < b.x + b.width - 50 &&
                   state.y >= b.y - 50 &&
                   state.y < b.y + b.height - 50;
        });
        if (!isVisibleOnAnyDisplay) {
            delete state.x;
            delete state.y;
        }
    } catch (e) {
        delete state.x;
        delete state.y;
    }
    return state;
}

// Native macOS / platform Application Menu
function setupApplicationMenu(window) {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac ? [{
            label: app.name || 'OpenLive3D',
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                {
                    label: 'Settings / Sidebar',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        if (window && !window.isDestroyed()) {
                            window.webContents.send('menu-toggle-sidebar');
                        }
                    }
                },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open VRM Model...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => {
                        if (window && !window.isDestroyed()) {
                            window.webContents.send('menu-open-vrm');
                        }
                    }
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Reset Camera View',
                    accelerator: 'CmdOrCtrl+0',
                    click: () => {
                        if (window && !window.isDestroyed()) {
                            window.webContents.send('menu-reset-camera');
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Hide / Show Sidebars',
                    accelerator: 'CmdOrCtrl+B',
                    click: () => {
                        if (window && !window.isDestroyed()) {
                            window.webContents.send('menu-toggle-sidebars');
                        }
                    }
                },
                {
                    label: 'Hide / Show All UI',
                    accelerator: 'CmdOrCtrl+\\',
                    click: () => {
                        if (window && !window.isDestroyed()) {
                            window.webContents.send('menu-toggle-all-ui');
                        }
                    }
                },
                { type: 'separator' },
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Tracking',
            submenu: [
                {
                    label: 'Face-Only Mode',
                    accelerator: 'CmdOrCtrl+1',
                    click: () => {
                        if (window && !window.isDestroyed()) {
                            window.webContents.send('menu-tracking-mode', 'Face-Only');
                        }
                    }
                },
                {
                    label: 'Upper-Body Mode',
                    accelerator: 'CmdOrCtrl+2',
                    click: () => {
                        if (window && !window.isDestroyed()) {
                            window.webContents.send('menu-tracking-mode', 'Upper-Body');
                        }
                    }
                }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
                ])
            ]
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'OpenLive3D Documentation',
                    click: async () => {
                        await shell.openExternal('https://github.com/OpenLive3D/OpenLive3D.document');
                    }
                },
                {
                    label: 'GitHub Repository',
                    click: async () => {
                        await shell.openExternal('https://github.com/OpenLive3D/OpenLive3D.github.io');
                    }
                },
                {
                    label: 'Discord Community',
                    click: async () => {
                        await shell.openExternal('https://discord.gg/pGPY5Jfhvz');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

let win;
function createWindow() {
    const isMac = process.platform === 'darwin';
    let windowState = loadWindowState();
    windowState = validateBounds(windowState);

    const winOptions = {
        title: 'OpenLive3D',
        width: windowState.width || 1024,
        height: windowState.height || 640,
        minWidth: 640,
        minHeight: 480,
        show: false, // Prevent initial white/blank flash
        backgroundColor: getInitialBackgroundColor(), // Match canvas background perfectly to prevent resize flashes
        icon: path.join(__dirname, 'build/icon.icns'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js')
        }
    };

    if (typeof windowState.x === 'number' && typeof windowState.y === 'number') {
        winOptions.x = windowState.x;
        winOptions.y = windowState.y;
    }

    if (isMac) {
        winOptions.titleBarStyle = 'hidden';
        winOptions.trafficLightPosition = { x: 18, y: 18 };
    }

    try {
        const configStr = readConfig();
        if (configStr) {
            const configObj = JSON.parse(configStr);
            if (configObj && configObj.ALWAYS_ON_TOP) {
                winOptions.alwaysOnTop = true;
            }
        }
    } catch (e) {}

    // Create the browser window
    win = new BrowserWindow(winOptions);

    if (windowState.isMaximized) {
        win.maximize();
    }

    setupApplicationMenu(win);

    // Show window only when ready to render
    win.once('ready-to-show', () => {
        win.show();
    });

    // Window focus/blur state broadcasting
    win.on('focus', () => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('window-focus', true);
        }
    });
    win.on('blur', () => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('window-focus', false);
        }
    });

    // Debounced window state saving
    let saveTimeout = null;
    const queueSaveState = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveWindowState(win);
        }, 300);
    };

    win.on('resize', queueSaveState);
    win.on('move', queueSaveState);
    win.on('close', () => {
        saveWindowState(win);
    });

    // Load the index.html of the app
    win.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true,
    }));

    // Dynamic background color sync from renderer (prevents canvas resize flashing)
    ipcMain.on('setBackgroundColor', (event, color) => {
        if (win && !win.isDestroyed() && color) {
            try {
                win.setBackgroundColor(color);
            } catch (e) {}
        }
    });

    // Native-like titlebar / edge double-click maximize/unmaximize
    ipcMain.on('double-click-titlebar', () => {
        if (!win || win.isDestroyed()) return;
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    });

    // IPC handlers for config
    ipcMain.handle('initConfig', () => {
        return readConfig();
    });
    ipcMain.on('saveConfig', (event, arg) => {
        console.log("Acquire Config ", arg);
        if (arg) {
            saveConfig(arg);
            try {
                const cfg = JSON.parse(arg);
                if (cfg && cfg.BG_COLOR && win && !win.isDestroyed()) {
                    win.setBackgroundColor(convertHexToDisplayColor(cfg.BG_COLOR));
                }
            } catch (e) {}
        } else {
            saveConfig('');
        }
    });

    // Always on Top handler
    ipcMain.on('set-always-on-top', (event, flag) => {
        if (win && !win.isDestroyed()) {
            win.setAlwaysOnTop(Boolean(flag));
            console.log(`[Main] setAlwaysOnTop: ${Boolean(flag)}`);
        }
    });

    // Native macOS Open VRM Dialog
    ipcMain.handle('show-open-vrm-dialog', async () => {
        if (!win || win.isDestroyed()) return null;
        const result = await dialog.showOpenDialog(win, {
            title: 'Select VRM Avatar Model',
            filters: [
                { name: 'VRM Models', extensions: ['vrm', 'vrma'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
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

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
    }
});
