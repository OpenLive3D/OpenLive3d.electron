// interface

const { ipcRenderer } = require('electron');
let electronConfig = ipcRenderer.sendSync('initConfig', '');
console.log(electronConfig);

function getSavedConfig() {
    return electronConfig;
}
function setSavedConfig(saveString) {
    ipcRenderer.send('saveConfig', saveString);
}

function setLogAPI(saveString) {
    try {
        let request = new XMLHttpRequest();
        request.open('POST', 'https://2bbb76lqd1.execute-api.us-east-1.amazonaws.com/dev/openlive3d_s3_put_log', false);
        request.setRequestHeader('Content-Type', 'application/json');
        request.send(saveString);
        request.onreadystatechange = function () {
            console.log(request);
        }
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
