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

// --- Auto-Updater & Version Checker ---
function compareSemver(v1, v2) {
    const clean = (v) => (v || '').replace(/^[^\d]*/, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    const p1 = clean(v1);
    const p2 = clean(v2);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
        const a = p1[i] || 0;
        const b = p2[i] || 0;
        if (a > b) return 1;
        if (a < b) return -1;
    }
    return 0;
}

function scoreAsset(asset, platform = process.platform, arch = process.arch) {
    if (!asset || !asset.name) return -99999;
    const name = asset.name.toLowerCase();

    // Ignore checksums, signatures, blockmaps, metadata, and source archives
    const ignoredExts = ['.blockmap', '.sha256', '.sha512', '.md5', '.sig', '.asc', '.txt', '.json', '.yml', '.yaml'];
    if (ignoredExts.some(ext => name.endsWith(ext))) return -99999;
    if (name.includes('source code')) return -99999;

    let score = 0;

    if (platform === 'darwin') {
        const isOtherOS = /(win32|win64|windows|\.exe$|\.msi$|linux|\.appimage$|\.deb$|\.rpm$)/i.test(name);
        if (isOtherOS) return -99999; // Never download Windows/Linux binary on macOS

        const isDmgOrPkg = name.endsWith('.dmg') || name.endsWith('.pkg');
        const hasMacKeyword = /(darwin|mac|macos|osx|apple)/i.test(name);
        const isMac = hasMacKeyword || isDmgOrPkg;
        if (!isMac) return -99999;

        score += 50;

        // Installer package preference: DMG > PKG > ZIP
        if (name.endsWith('.dmg')) score += 100;
        else if (name.endsWith('.pkg')) score += 80;
        else if (name.endsWith('.zip')) score += 60;
        else return -99999;

        // Architecture scoring
        const isArmTarget = arch === 'arm64';
        const hasArmToken = /(^|[^a-z0-9])(arm64|aarch64|apple[-_]?silicon|m[1-4]|arm)([^a-z0-9]|$)/i.test(name);
        const hasIntelToken = /(^|[^a-z0-9])(x64|x86_64|x86-64|intel|amd64)([^a-z0-9]|$)/i.test(name);
        const isUniversal = /universal/i.test(name);

        if (isArmTarget) {
            if (hasArmToken) score += 100;
            else if (isUniversal) score += 80;
            else if (hasIntelToken) score -= 300; // Strong penalty against x64 if arm64/universal exists
        } else {
            // Intel target
            if (hasIntelToken) score += 100;
            else if (isUniversal) score += 80;
            else if (hasArmToken) return -99999; // Intel hardware cannot run ARM binaries
        }
    } else if (platform === 'win32') {
        if (/(darwin|mac|linux)/i.test(name)) return -99999;
        if (name.endsWith('.exe')) score += 100;
        else if (name.endsWith('.msi')) score += 90;
        else if (name.endsWith('.zip')) score += 60;
        else return -99999;
        if (arch === 'x64' && /(x64|x86_64|intel|amd64)/i.test(name)) score += 100;
    } else {
        if (/(darwin|mac|win32|win64|\.exe$)/i.test(name)) return -99999;
        if (name.endsWith('.appimage')) score += 100;
        else if (name.endsWith('.deb')) score += 80;
        else if (name.endsWith('.tar.gz') || name.endsWith('.zip')) score += 50;
    }

    return score;
}

function findBestAsset(assets, platform = process.platform, arch = process.arch) {
    if (!Array.isArray(assets) || assets.length === 0) return null;
    let best = null;
    let highestScore = 0;

    for (const asset of assets) {
        const score = scoreAsset(asset, platform, arch);
        if (score > highestScore) {
            highestScore = score;
            best = asset;
        }
    }
    return best;
}

function isAutoCheckUpdatesEnabled() {
    try {
        const cfgStr = readConfig();
        if (cfgStr) {
            const cfg = JSON.parse(cfgStr);
            if (cfg && typeof cfg.AUTO_CHECK_UPDATES === 'boolean') {
                return cfg.AUTO_CHECK_UPDATES;
            }
        }
    } catch (e) {}
    return true;
}

function setAutoCheckUpdatesEnabled(enabled) {
    try {
        const cfgStr = readConfig();
        const cfg = cfgStr ? JSON.parse(cfgStr) : {};
        cfg.AUTO_CHECK_UPDATES = Boolean(enabled);
        saveConfig(JSON.stringify(cfg));
    } catch (e) {
        console.error('[Main] Failed to update AUTO_CHECK_UPDATES config:', e);
    }
}

let isCheckingForUpdates = false;
async function checkForUpdates(targetWindow, { manual = false } = {}) {
    if (isCheckingForUpdates) {
        if (manual && targetWindow && !targetWindow.isDestroyed()) {
            await dialog.showMessageBox(targetWindow, {
                type: 'info',
                title: 'Check for Updates',
                message: 'Checking for updates...',
                detail: 'An update check is already in progress. Please wait a moment.',
                buttons: ['OK']
            });
        }
        return;
    }

    isCheckingForUpdates = true;
    try {
        const response = await fetch('https://api.github.com/repos/OpenLive3D/OpenLive3d.electron/releases/latest', {
            headers: {
                'User-Agent': `OpenLive3D/${app.getVersion()} (${process.platform}; ${process.arch})`
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            throw new Error(`GitHub API returned status ${response.status}`);
        }

        const release = await response.json();
        const latestTag = release.tag_name || '';
        const currentVersion = app.getVersion();
        const autoCheckDefault = isAutoCheckUpdatesEnabled();

        if (compareSemver(currentVersion, latestTag) < 0) {
            const asset = findBestAsset(release.assets, process.platform, process.arch);
            const downloadUrl = asset ? asset.browser_download_url : (release.html_url || 'https://github.com/OpenLive3D/OpenLive3d.electron/releases/latest');
            const assetType = asset ? path.extname(asset.name).replace('.', '').toUpperCase() : 'RELEASE';
            const releaseNotes = (release.body || '').trim();
            const truncatedNotes = releaseNotes.length > 300 ? releaseNotes.substring(0, 300) + '...' : releaseNotes;

            if (targetWindow && !targetWindow.isDestroyed()) {
                const { response: buttonIndex, checkboxChecked } = await dialog.showMessageBox(targetWindow, {
                    type: 'info',
                    title: 'Update Available',
                    message: `A new version of OpenLive3D (${latestTag}) is available!`,
                    detail: `You are currently using v${currentVersion}.\n\n` +
                            (truncatedNotes ? `Release Highlights:\n${truncatedNotes}\n\n` : '') +
                            (asset ? `Package: ${asset.name} (${assetType})` : 'Package: Direct from GitHub Releases page'),
                    buttons: ['Download Update', 'Later'],
                    defaultId: 0,
                    cancelId: 1,
                    checkboxLabel: 'Automatically check for updates in future',
                    checkboxChecked: autoCheckDefault
                });

                setAutoCheckUpdatesEnabled(checkboxChecked);

                if (buttonIndex === 0) {
                    await shell.openExternal(downloadUrl);
                }
            }
        } else {
            if (manual && targetWindow && !targetWindow.isDestroyed()) {
                const { checkboxChecked } = await dialog.showMessageBox(targetWindow, {
                    type: 'info',
                    title: "You're Up to Date!",
                    message: `OpenLive3D v${currentVersion} is currently the newest version.`,
                    detail: 'No newer updates are available at this time.',
                    buttons: ['OK'],
                    checkboxLabel: 'Automatically check for updates in future',
                    checkboxChecked: autoCheckDefault
                });

                setAutoCheckUpdatesEnabled(checkboxChecked);
            }
        }
    } catch (err) {
        console.error('[Main] Update check failed:', err);
        if (manual && targetWindow && !targetWindow.isDestroyed()) {
            await dialog.showMessageBox(targetWindow, {
                type: 'warning',
                title: 'Update Check Failed',
                message: 'Unable to check for updates.',
                detail: `Please check your internet connection or try again later.\n\nError: ${err.message}`,
                buttons: ['OK']
            });
        }
    } finally {
        isCheckingForUpdates = false;
    }
}

// Native macOS / platform Application Menu
function setupApplicationMenu(window) {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac ? [{
            label: app.name || 'OpenLive3D',
            submenu: [
                { role: 'about' },
                {
                    label: 'Check for Updates...',
                    click: () => {
                        if (window && !window.isDestroyed()) {
                            checkForUpdates(window, { manual: true });
                        }
                    }
                },
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
                    label: 'Check for Updates...',
                    click: () => {
                        if (window && !window.isDestroyed()) {
                            checkForUpdates(window, { manual: true });
                        }
                    }
                },
                { type: 'separator' },
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
            pageVisibility: true,
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
        if (win && win.webContents) {
            win.webContents.setBackgroundThrottling(false);
        }
        // Delayed background update check if enabled
        if (isAutoCheckUpdatesEnabled()) {
            setTimeout(() => {
                if (win && !win.isDestroyed()) {
                    checkForUpdates(win, { manual: false });
                }
            }, 8000);
        }
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

// Prevent background & occlusion throttling on macOS (e.g. when game takes fullscreen space)
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

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
