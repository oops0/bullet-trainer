const { app, BrowserWindow, ipcMain } = require('electron');
const robot = require('robotjs');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
let mainWindow;
const appExpress = express();
const PORT = 3000;

const memoryOptionsMapping = {
    '16MB': 4,
    '32MB': 5,
    '64MB': 6,
    '128MB': 7,
    '256MB': 8,
    '512MB': 9,
    '1GB': 10
};


appExpress.use(bodyParser.json());
appExpress.use(bodyParser.urlencoded({ extended: true }));
// Enable CORS for the lichess.org origin
appExpress.use(cors({
    origin: 'https://lichess.org',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

 appExpress.options('/login', cors());  // Enable preflight request for /login route


mongoose.connect('mongodb+srv://scstewart:BkcWXgc88k5vuG6I@bulletcluster0.ykfrfjm.mongodb.net/', { useNewUrlParser: true, useUnifiedTopology: true });

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    gems: Number
});

const User = mongoose.model('User', UserSchema);

appExpress.post('/register', async (req, res) => {
    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        username,
        password: hashedPassword,
        gems: 0
    });

    try {
        await newUser.save();
        res.status(200).send("User registered.");
    } catch (err) {
        console.error("Error while saving user:", err);
        res.status(500).send("Error registering user.");
    }
});


appExpress.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
        return res.status(401).send("User not found.");
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(401).send("Invalid password.");
    }

    const token = jwt.sign({ id: user._id }, 'm981cc483ujsicjc3mm202817scciz9d0ww938', { expiresIn: '1h' });
    res.status(200).send({ token });
});

appExpress.get('/user-details', async (req, res) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(401).send({ message: "No token provided." });
    }

    try {
        const decodedToken = jwt.verify(token, 'm981cc483ujsicjc3mm202817scciz9d0ww938');

        const user = await User.findById(decodedToken.id, 'username gems');

        if (!user) {
            return res.status(404).send({ message: "User not found." });
        }

        res.status(200).send({
            username: user.username,
            gemCount: user.gems
        });
    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(500).send({ message: "Error fetching user details." });
    }
});



function simulateKeyPress(key) {
    mainWindow.focus(); // Ensure the Electron window is focused.
    robot.keyTap(key); // Simulate the key press.
}

function adjustSetting(selector, value, eventType = 'input') {
    const adjustSettingsAndCloseMenuCode = `
        if (!window.menuButton) {
            window.menuButton = document.querySelector('#main-wrap > main > div.analyse__controls.analyse-controls > button');
        }
        
        function clickMenuButton() {
            window.menuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            window.menuButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        }
        
        if (window.menuButton) {
            clickMenuButton();  // Open the menu
            
            setTimeout(() => {
                // Adjust the setting value
                const settingElement = document.querySelector('${selector}');
                if (settingElement) {
                    settingElement.value = '${value}';
                    settingElement.dispatchEvent(new Event('${eventType}', { bubbles: true }));
                    settingElement.dispatchEvent(new Event('change', { bubbles: true }));
                }
                
                // Close the menu by simulating another click
                setTimeout(() => {
                    clickMenuButton();
                }, 100);  // 100ms delay for the menu to close

            }, 10);  // 10ms delay for the actual click
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

    mainWindow.webContents.executeJavaScript(inputPGNCode);
}

ipcMain.on('pgn-moves', (event, data) => {
    console.log("Received moves:", data.moves);
    updatePGN(data.moves);
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: true
        }
    });

    const wss = new WebSocket.Server({ port: 8080 });
    wss.on('connection', (ws) => {    
        ws.on('message', (message) => {
            const decodedMessage = message.toString('utf8');
        
            if (decodedMessage === 'FLIP') {
                simulateKeyPress('f');
                flipPending = true;
            } else if (decodedMessage.startsWith('SET_MULTIPLE_LINES:')) {
                const value = parseInt(decodedMessage.split(':')[1], 10);
                if (value >= 0 && value <= 5) {
                    adjustSetting('#analyse-multipv', value);
                }
            } else if (decodedMessage.startsWith('SET_CPUS:')) {
                const value = parseInt(decodedMessage.split(':')[1], 10);
                if (value >= 1 && value <= 15) {
                    adjustSetting('#analyse-threads', value); 
                }
            }
            else if (decodedMessage.startsWith('SET_MEMORY:')) {
                const memoryValue = decodedMessage.split(':')[1];
                const mappedValue = memoryOptionsMapping[memoryValue];
                if (mappedValue) {
                    adjustSetting('#analyse-memory', mappedValue);
                } else {
                    console.error('Invalid memory value received:', memoryValue);
                }
            }
            
             else {
                try {
                    const parsedMessage = JSON.parse(decodedMessage);
                    updatePGN(parsedMessage.move);
                } catch (e) {
                    console.error('Received an unknown message format:', decodedMessage);
                }
            }
        });
    });
    

    mainWindow.loadURL('https://lichess.org/analysis');

    mainWindow.webContents.on('did-finish-load', async () => {
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
            await mainWindow.webContents.executeJavaScript(checkElementExistence);
            simulateKeyPress('l');
        } catch (error) {
            console.error('Error waiting for element:', error);
        }
    });
    
    mainWindow.on('closed', function () {
        mainWindow = null;
    });

    appExpress.listen(PORT, () => {
        console.log(`Express server started on port ${PORT}`);
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