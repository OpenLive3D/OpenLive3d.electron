// interface

const { ipcRenderer } = require('electron');
let electronConfig = ipcRenderer.sendSync('initConfig', '');
console.log(electronConfig);

function getSavedConfig(){
    return electronConfig;
}
function setSavedConfig(saveString){
    ipcRenderer.send('saveConfig', saveString);
}

function setLogAPI(saveString){
    try{
        let request = new XMLHttpRequest();
        request.open('POST', 'https://2bbb76lqd1.execute-api.us-east-1.amazonaws.com/dev/openlive3d_s3_put_log', false);
        request.setRequestHeader('Content-Type', 'application/json');
        request.send(saveString);
        request.onreadystatechange=function(){
            console.log(request);
        }
    }catch(err){
        console.log("API Call Error");
    }
}

function onKeyUpHook(f){
    document.addEventListener("keyup", f);
}
