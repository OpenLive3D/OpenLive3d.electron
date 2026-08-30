// interface

let electronConfig = null;

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

async function fetchElectronConfig() {
    electronConfig = await window.api.invoke('initConfig', '');
    console.log("[Interface] Fetched config:", electronConfig);
    try {
        if (electronConfig) {
            const parsed = JSON.parse(electronConfig);
            if (parsed && parsed.BG_COLOR) {
                const displayColor = convertHexToDisplayColor(parsed.BG_COLOR);
                if (window.api && typeof window.api.send === 'function') {
                    window.api.send('setBackgroundColor', displayColor);
                }
            }
            if (parsed && typeof parsed.ALWAYS_ON_TOP === 'boolean') {
                if (window.api && typeof window.api.send === 'function') {
                    window.api.send('set-always-on-top', parsed.ALWAYS_ON_TOP);
                }
            }
        }
    } catch (e) {}
}

function getSavedConfig() {
    return electronConfig;
}
function setSavedConfig(saveString) {
    window.api.send('saveConfig', saveString);
}

function setLogAPI(saveString) {
    try {
        fetch('https://2bbb76lqd1.execute-api.us-east-1.amazonaws.com/dev/openlive3d_s3_put_log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: saveString
        }).then(function(response) {
            console.log("API log sent:", response.status);
        }).catch(function(err) {
            console.log("API Call Error:", err);
        });
    } catch (err) {
        console.log("API Call Error");
    }
}

function onKeyUpHook(f) {
    document.addEventListener("keyup", f);
}

// iFacialMocap Logic
let ifacialMocapClient = null;

function toggleIFacialMocap(checked) {
    const settingsDiv = document.getElementById('ifacialmocap-settings');
    const videoSelect = document.getElementById('videoselect');

    // Update config
    setCMV('USE_IFACIALMOCAP', checked);

    if (checked) {
        settingsDiv.style.display = 'block';
        videoSelect.disabled = true;
        videoSelect.style.opacity = '0.5';

        // Stop camera to save resources/prevent conflicts
        if (typeof stopCamera === 'function') stopCamera();
        // Disable UI camera toggle
        setCMV('TOGGLE_CAMERA', false);

        // Auto-connect if IP is saved
        const savedIP = getCMV('IFACIALMOCAP_IP');
        if (savedIP && savedIP !== "192.168.1.x") {
            document.getElementById('ifacialmocap-ip').value = savedIP;
            connectIFacialMocap(); // Keep this line from original
        }
    } else {
        settingsDiv.style.display = 'none';
        videoSelect.disabled = false;
        videoSelect.style.opacity = '1.0';

        // Restart camera
        if (typeof startCamera === 'function') startCamera();
        setCMV('TOGGLE_CAMERA', true);

        if (ifacialMocapClient) {
            ifacialMocapClient.disconnect();
        }

        // Reset Button UI
        const btn = document.querySelector('#ifacialmocap-settings button[onclick="connectIFacialMocap()"]');
        if (btn) {
            btn.innerText = "Connect";
            btn.classList.remove('w3-red');
            btn.classList.add('w3-blue');
        }
        console.log("[Interface] Disconnected from iFacialMocap");
    }
}

function connectIFacialMocap() {
    const btn = document.querySelector('#ifacialmocap-settings button[onclick="connectIFacialMocap()"]');

    // Disconnect Logic
    if (ifacialMocapClient && ifacialMocapClient.listening) {
        ifacialMocapClient.disconnect();
        if (btn) {
            btn.innerText = "Connect";
            btn.classList.remove('w3-red');
            btn.classList.add('w3-blue');
        }
        console.log("[Interface] Disconnected from iFacialMocap");
        return;
    }

    // Connect Logic
    const ipInput = document.getElementById('ifacialmocap-ip');
    const ip = ipInput.value;

    if (ip) {
        setCMV('IFACIALMOCAP_IP', ip);
        localStorage.setItem('ifacialmocap_ip', ip);

        if (!ifacialMocapClient) {
            ifacialMocapClient = new IFacialMocapClient();
            // Hook into the ML manager
            ifacialMocapClient.onFaceData((data) => {
                if (typeof window.applyIFacialMocapData === 'function') {
                    window.applyIFacialMocapData(data);
                }
            });
        }
    }

    // Always re-register connect callback because it gets cleared after success
    ifacialMocapClient.onConnect((connected) => {
        if (connected && btn) {
            btn.innerText = "Disconnect";
            btn.classList.remove('w3-blue');
            btn.classList.add('w3-red');
        }
    });

    console.log(`[Interface] Connecting to iFacialMocap at ${ip}...`);
    ifacialMocapClient.connect(ip);
}

// Initialize UI state on load
window.addEventListener('DOMContentLoaded', () => {
    // macOS platform detection for native styling
    if (window.api && window.api.platform === 'darwin') {
        document.documentElement.classList.add('platform-darwin');
        document.body.classList.add('platform-darwin');
    }

    // Window focus / blur state handlers (native visual polish)
    if (window.api && typeof window.api.on === 'function') {
        window.api.on('window-focus', (isFocused) => {
            if (isFocused) {
                document.body.classList.remove('window-blurred');
                document.body.classList.add('window-focused');
            } else {
                document.body.classList.add('window-blurred');
                document.body.classList.remove('window-focused');
            }
        });

        // Application menu triggers
        window.api.on('menu-toggle-sidebar', () => {
            const systembox = document.getElementById('systembox');
            if (systembox) {
                systembox.click();
            }
        });

        window.api.on('menu-toggle-sidebars', () => {
            toggleSidebars();
        });

        window.api.on('menu-toggle-all-ui', () => {
            toggleAllUI();
        });

        window.api.on('menu-reset-camera', () => {
            if (typeof resetCameraPos === 'function' && typeof getCMV === 'function') {
                const headPos = getCMV('HEAD_POSITION') || { x: 0, y: 1.4, z: 0 };
                resetCameraPos(headPos);
            }
        });

        window.api.on('menu-open-vrm', async () => {
            if (window.api && typeof window.api.invoke === 'function') {
                const filePath = await window.api.invoke('show-open-vrm-dialog');
                if (filePath && typeof loadVRM === 'function') {
                    loadVRM('file://' + filePath);
                    if (typeof setCMV === 'function') {
                        setCMV('CUSTOM_MODEL', true);
                    }
                }
            }
        });

        window.api.on('menu-tracking-mode', (mode) => {
            if (typeof setCMV === 'function') {
                setCMV('TRACKING_MODE', mode);
            }
            if (typeof setTrackingModeSelect === 'function') {
                setTrackingModeSelect(mode);
            }
        });
    }

    // Wait for config to be loaded
    setTimeout(() => {
        const enabled = getCMV('USE_IFACIALMOCAP');
        const checkbox = document.getElementById('useifacialmocap');
        if (checkbox) {
            checkbox.checked = enabled;
            toggleIFacialMocap(enabled);
        }

        const savedIP = localStorage.getItem('ifacialmocap_ip') || getCMV('IFACIALMOCAP_IP');
        const ipInput = document.getElementById('ifacialmocap-ip');
        if (ipInput && savedIP && savedIP !== "192.168.1.x") {
            ipInput.value = savedIP;
        }
    }, 1000); // Small delay to ensure config is initialized
});

// Titlebar & top edge double click to toggle maximize/zoom
document.addEventListener('dblclick', (e) => {
    if (e.clientY <= 45) {
        const target = e.target;
        if (target && (target.closest('#systembox') || target.closest('#thesidebar') || target.closest('button') || target.closest('input') || target.closest('select') || target.closest('#ifacialmocap-guide'))) {
            return;
        }
        if (window.api && typeof window.api.send === 'function') {
            window.api.send('double-click-titlebar');
        }
    }
});


// Native macOS Finder Drag & Drop (.vrm models and background images)
window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

window.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const name = file.name.toLowerCase();
        if (name.endsWith('.vrm') || name.endsWith('.vrma')) {
            const blob = new Blob([file], { type: 'application/octet-stream' });
            const blobUrl = URL.createObjectURL(blob);
            if (typeof loadVRM === 'function') {
                loadVRM(blobUrl);
                if (typeof setCMV === 'function') {
                    setCMV('CUSTOM_MODEL', true);
                }
            }
        } else if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')) {
            const blobUrl = URL.createObjectURL(file);
            if (typeof setCMV === 'function') {
                setCMV('BG_UPLOAD', 'url(' + blobUrl + ')');
            }
            if (typeof setBackGround === 'function') {
                setBackGround();
            }
        }
    }
});

// Sidebar & UI Toggle Controls
let sidebarsHidden = false;

function toggleSidebars() {
    const moodbar = document.getElementById("themoodbar");
    const posebar = document.getElementById("theposebar");
    const sidebar = document.getElementById("thesidebar");
    const systembox = document.getElementById("systembox");

    // If main settings sidebar is open, close it
    if (sidebar && sidebar.style.display !== "none" && !sidebar.classList.contains('sidebar-close')) {
        if (systembox) systembox.click();
        return;
    }

    sidebarsHidden = !sidebarsHidden;
    if (sidebarsHidden) {
        if (moodbar) moodbar.style.display = "none";
        if (posebar) posebar.style.display = "none";
    } else {
        if (moodbar) moodbar.style.display = "block";
        if (posebar) posebar.style.display = "block";
    }
}

function toggleAllUI() {
    const moodbar = document.getElementById("themoodbar");
    const posebar = document.getElementById("theposebar");
    const sidebar = document.getElementById("thesidebar");
    const systembox = document.getElementById("systembox");

    if (sidebar && sidebar.style.display !== "none" && !sidebar.classList.contains('sidebar-close')) {
        sidebar.style.display = "none";
    }

    sidebarsHidden = !sidebarsHidden;
    if (sidebarsHidden) {
        if (moodbar) moodbar.style.display = "none";
        if (posebar) posebar.style.display = "none";
        if (systembox) systembox.style.display = "none";
    } else {
        if (moodbar) moodbar.style.display = "block";
        if (posebar) posebar.style.display = "block";
        if (systembox) systembox.style.display = "block";
    }
}

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
    }

    // Escape closes settings drawer
    if (e.key === 'Escape') {
        const sidebar = document.getElementById("thesidebar");
        const systembox = document.getElementById("systembox");
        if (sidebar && sidebar.style.display !== "none" && !sidebar.classList.contains('sidebar-close')) {
            if (systembox) systembox.click();
        }
    }

    // 'h' or 'H' toggles sidebars
    if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        toggleSidebars();
    }
});
