const { app, BrowserWindow, ipcMain } = require('electron');
const robot = require('robotjs');
const WebSocket = require('ws');
let mainWindow;
let flipPending = false;

function simulateKeyPress(key) {
    mainWindow.focus(); // Ensure the Electron window is focused.
    robot.keyTap(key); // Simulate the key press.
}

function setMultipleLinesSetting(value) {
    const adjustSettingsAndCloseMenuCode = `
        const menuButton = document.querySelector('#main-wrap > main > div.analyse__controls.analyse-controls > button');
        
        function clickMenuButton() {
            menuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            menuButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        }
        
        if (menuButton) {
            clickMenuButton();  // Open the menu
            console.log('Menu button clicked programmatically!');
            
            setTimeout(() => {
                // Adjust the slider value
                const slider = document.querySelector('#analyse-multipv');
                if (slider) {
                    slider.value = ${value};
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                    slider.dispatchEvent(new Event('change', { bubbles: true }));
                }
                
                // Close the menu by simulating another click
                setTimeout(() => {
                    clickMenuButton();
                    console.log('Menu closed programmatically!');
                }, 100);  // 100ms delay for the menu to close

            }, 10);  // 10ms delay for the actual click
        } else {
            console.log('Menu button not found!');
        }
    `;

    mainWindow.webContents.executeJavaScript(adjustSettingsAndCloseMenuCode);
}




function updatePGN(pgn) {
    const inputPGNCode = `
        (function() {
            let pgnInput = document.querySelector('#main-wrap > main > div.analyse__underboard > div > div.pgn > div > textarea');
            let importButton = document.querySelector('#main-wrap > main > div.analyse__underboard > div > div.pgn > div > button');
            if (pgnInput) {
                pgnInput.value = "${pgn}";
                pgnInput.dispatchEvent(new Event('input', { bubbles: true }));
                if (importButton) {
                    importButton.click();
                }
            }
        })();
    `;

    mainWindow.webContents.executeJavaScript(inputPGNCode).then(() => {
        if (flipPending) {
            simulateKeyPress('f');
            flipPending = false;
        }
    });
}

ipcMain.on('pgn-moves', (event, data) => {
    console.log('Received moves in Electron:', data.moves);
    updatePGN(data.moves);
});

function createWindow() {
    console.log('Creating main window...');

    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: true
        }
    });

    console.log('Starting to load Lichess...');

    // WebSocket server setup
    const wss = new WebSocket.Server({ port: 8080 });
    wss.on('connection', (ws) => {
        console.log('WebSocket client connected');
    
        ws.on('message', (message) => {
            const decodedMessage = message.toString('utf8');
        
            if (decodedMessage === 'FLIP') {
                console.log('Received flip request');
                simulateKeyPress('f');
                flipPending = true;
                console.log('Flip is pending');
            } else if (decodedMessage.startsWith('SET_MULTIPLE_LINES:')) {
                const value = parseInt(decodedMessage.split(':')[1], 10);
                if (value >= 0 && value <= 5) {
                    console.log('Setting multiple lines to', value);
                    setMultipleLinesSetting(value);
                }
            } else {
                try {
                    const parsedMessage = JSON.parse(decodedMessage);
                    console.log('Received move:', parsedMessage.move);
                    updatePGN(parsedMessage.move);
                } catch (e) {
                    console.error('Received an unknown message format:', decodedMessage);
                }
            }
        });
    
        ws.on('close', () => {
            console.log('WebSocket client disconnected');
        });
    });

    mainWindow.loadURL('https://lichess.org/analysis');

    mainWindow.webContents.on('did-finish-load', async () => {
        console.log('Lichess page finished loading.');
    
        const checkElementExistence = `
            const startTime = Date.now();
            new Promise((resolve, reject) => {
                const checkExist = setInterval(() => {
                    if (document.querySelector('#main-wrap')) {
                        clearInterval(checkExist);
                        resolve(true);
                    } else if (Date.now() - startTime > 10000) { // 10 seconds timeout
                        clearInterval(checkExist);
                        reject(new Error("Timeout waiting for #main-wrap"));
                    }
                }, 100);
            });
        `;
    
        try {
            console.log('Waiting for #main-wrap to be present...');
            await mainWindow.webContents.executeJavaScript(checkElementExistence);
            console.log('#main-wrap is present.');
            
            console.log('Sending "L" key event...');
            simulateKeyPress('l');
            console.log('"L" key event sent.');
        } catch (error) {
            console.error('Error waiting for element:', error);
        }
    });
    
    mainWindow.on('closed', function () {
        console.log('Main window closed.');
        mainWindow = null;
    });
}

app.on('ready', createWindow);
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
