let ws;
let lastSeenPGN = ""; 
let connectionCheckInterval;
let isObserving = false; // Global flag to check if the extension is actively observing
let flipPending = false;  // To track if a flip is pending after the orientation button is clicked

const checkWebSocketConnection = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        statusText.innerHTML = '<span style="color:red;">App connection lost!</span><br><span style="font-weight:normal;">Restart app, then refresh this page</span>';
    } else if (ws.readyState === WebSocket.OPEN && isObserving) {
        setExtensionStatus('Observing');
    }
};

const establishWebSocket = () => {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return;  // Exit if a connection is already being attempted or is active
    }
    
    ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval); 
        }
        connectionCheckInterval = setInterval(checkWebSocketConnection, 5000); 
    };

    ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
    };

    ws.onclose = (event) => {
        if (event.wasClean) {
            // Possibly add a message or action for clean disconnection
        } else {
            console.error('WebSocket connection died.');
            setTimeout(establishWebSocket, 5000); // Try to reconnect after 5 seconds
        }
    };
};

const checkUserStatus = async () => {
    chrome.storage.local.get('token', async (result) => {
        if (result.token) {
            try {
                const response = await fetch('http://localhost:3000/user-details', {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + result.token,
                        'Content-Type': 'application/json'
                    }
                });

                const data = await response.json();

                if (response.ok && data.username && data.gemCount !== undefined) {
                    updateUIWithUserDetails(data.username, data.gemCount);
                    adjustButtonVisibility(true);
                } else {
                    console.error("Error fetching user details:", data.message);
                    // Handle the case when the user is not authenticated
                    chrome.storage.local.remove('token'); // Clear the token
                    adjustButtonVisibility(false);
                }
            } catch (error) {
                console.error("Error while checking user status:", error);
                // Handle the case when there's an error (e.g., server is down)
                adjustButtonVisibility(false);
            }
        } else {
            adjustButtonVisibility(false);
        }
    });
};

const sendMoves = (moves) => {
    if (ws && ws.readyState === WebSocket.OPEN && moves !== lastSeenPGN) { 
        ws.send(JSON.stringify({ move: moves }));
        lastSeenPGN = moves; 
        setExtensionStatus('Observing'); // Set status to "Observing" after sending move

        if (flipPending) {
            ws.send('FLIP');
            flipPending = false;
        }
    }
};

const extractMoves = (mutationsList) => {
    for(let mutation of mutationsList) {
        if (mutation.type === 'childList') {
            const rawMoves = mutation.target.innerText;
            const splitMoves = rawMoves.split('\n').filter(move => move.trim() !== '');
            const formattedMoves = [];

            for (let i = 0; i < splitMoves.length; i++) {
                if (i % 3 === 0) { // This is a number
                    formattedMoves.push(splitMoves[i] + '. ' + (splitMoves[i + 1] || '') + ' ' + (splitMoves[i + 2] || ''));
                }
            }

            const finalPGN = formattedMoves.join(' ').trim();
            sendMoves(finalPGN);
        }
    }
};

const initiateTemporaryObserver = () => {
    const bodyElement = document.body;

    const tempObserver = new MutationObserver(() => {
        const movesElement = document.querySelector("#main-wrap > main > div.round__app.variant-standard > rm6");
        if (movesElement) {
            tempObserver.disconnect();  // Stop the temporary observer
            establishWebSocket();
            const mainObserver = new MutationObserver(extractMoves);
            mainObserver.observe(movesElement, { childList: true, characterData: true, subtree: true });
            setExtensionStatus('Waiting for moves...');
        }
    });

    tempObserver.observe(bodyElement, { childList: true, subtree: true });
};

function flipFunction() {
    ws.send('FLIP');
    flipPending = true;
}

function reloadFunction() {
    ws.send('RELOAD');
}

function setExtensionStatus(status) {
    const statusText = document.getElementById('extensionStatusText');
    statusText.textContent = status;

    switch (status) {
        case 'Inactive':
            statusText.className = 'status-text inactive';
            break;
        case 'Waiting for moves...':
            statusText.className = 'status-text waiting';
            break;
        case 'Observing':
            statusText.className = 'status-text observing';
            break;
        case 'Logout successful':
            statusText.className = 'status-text logout-successful'; 
            break;
        case 'Login successful!':
            statusText.className = 'status-text login-successful'; // Add a new class for this status
            break;
        case 'Login failed. Check your credentials.':
            statusText.className = 'status-text login-failed'; // Add a new class for this status
            break;
    }
}

// Immediately establish WebSocket connection on extension load.
establishWebSocket();

const initiateObserver = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        statusText.innerHTML = '<span style="font-weight:bold;">Server not found.</span><br>Restart app, then refresh this page';
        return; // Exit the function early if no active WebSocket connection
    }

    const movesElement = document.querySelector("#main-wrap > main > div.round__app.variant-standard > rm6");
    if (movesElement) {
        isObserving = true; // Set the flag to true when the observation starts
        const observer = new MutationObserver(extractMoves);
        observer.observe(movesElement, { childList: true, characterData: true, subtree: true });
        setExtensionStatus('Waiting...');
    } else {
        setExtensionStatus('Connected. Waiting for moves.');
        initiateTemporaryObserver();
    }
};

const divider = document.createElement('div');
divider.className = 'divider';

const parentContainer = document.createElement('div');
parentContainer.className = 'parent-container';

const buttonContainer = document.createElement('div');
buttonContainer.className = 'button-container';

const actionButtonContainer = document.createElement('div');
actionButtonContainer.className = 'action-button-container';

const startButton = document.createElement('button');
startButton.innerText = "Start";
startButton.className = 'styled-button';
startButton.addEventListener('click', initiateObserver);

const flipButton = document.createElement('button');
flipButton.innerText = "Flip"; // default state
flipButton.className = 'flip-button';
flipButton.addEventListener('click', flipFunction);

const reloadButton = document.createElement('button');
reloadButton.innerText = "Reload";
reloadButton.className = 'reload-button';
reloadButton.addEventListener('click', reloadFunction);

actionButtonContainer.appendChild(startButton);
actionButtonContainer.appendChild(flipButton);
actionButtonContainer.appendChild(reloadButton);

buttonContainer.appendChild(actionButtonContainer);

//~~VISUAL DIVIDER~~
buttonContainer.appendChild(divider);
//~~VISUAL DIVIDER~~

const analysisBoardOptionsButton = document.createElement('button');
analysisBoardOptionsButton.className = 'analysis-board-options-button';
analysisBoardOptionsButton.innerText = "Analysis Options";

const analysisSettingsContainer = document.createElement('div');
analysisSettingsContainer.className = 'analysis-settings-container';
analysisSettingsContainer.style.display = 'none'; // Initially hide the settings

analysisBoardOptionsButton.addEventListener('click', () => {
    if (analysisSettingsContainer.style.display === 'none') {
        analysisSettingsContainer.style.display = 'block';
    } else {
        analysisSettingsContainer.style.display = 'none';
    }
});


// Multiple lines setup
const multipleLinesConfig = createConfigContainer('Multiple lines:', 'multiple-lines-dropdown', 5, (selectedValue) => {
    ws.send(`SET_MULTIPLE_LINES:${selectedValue}`);
});
analysisSettingsContainer.appendChild(multipleLinesConfig);

// CPUs setup
const cpuConfig = createConfigContainer('CPUs:', 'analyse-threads', 15, (selectedValue) => {
    ws.send(`SET_CPUS:${selectedValue}`);
});
analysisSettingsContainer.appendChild(cpuConfig);

// Memory setup
const memoryOptions = ['16MB', '32MB', '64MB', '128MB', '256MB', '512MB', '1GB'];
const memoryConfig = createConfigContainer('Memory:', 'analyse-memory', memoryOptions.length, (selectedValue, index) => {
    const actualValue = memoryOptions[index];
    ws.send(`SET_MEMORY:${actualValue}`);
}, memoryOptions);
analysisSettingsContainer.appendChild(memoryConfig);

// Helper function to create a config container
function createConfigContainer(labelText, dropdownId, optionsCount, onChangeCallback, optionValues) {
    const configContainer = document.createElement('div');
    configContainer.className = 'config-container';

    const label = document.createElement('label');
    label.innerText = labelText;
    label.htmlFor = dropdownId;
    label.className = 'multiple-lines-label';

    const dropdown = document.createElement('select');
    dropdown.id = dropdownId;
    dropdown.className = 'multiple-lines-dropdown';

    for (let i = 0; i < optionsCount; i++) {
        const option = document.createElement('option');
        option.value = i + (optionValues ? 4 : 1); // If optionValues is provided, start from 4, else start from 1
        option.innerText = optionValues ? optionValues[i] : i + 1;
        dropdown.appendChild(option);
    }

    dropdown.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        const selectedIndex = e.target.selectedIndex;
        onChangeCallback(selectedValue, selectedIndex);
    });

    configContainer.appendChild(label);
    configContainer.appendChild(dropdown);

    return configContainer;
}


buttonContainer.appendChild(analysisBoardOptionsButton);
buttonContainer.appendChild(analysisSettingsContainer);

//~~VISUAL DIVIDER~~
buttonContainer.appendChild(divider);
//~~VISUAL DIVIDER~~

const detailsSection = document.createElement('div');
detailsSection.className = 'details-section';

const checkbox = document.createElement('input');
checkbox.type = 'checkbox';

const icon = document.createElement('img');
icon.src = chrome.runtime.getURL('assets/gem.png');
icon.style.width = '22px';
icon.style.height = '22px';
icon.style.marginLeft = '5px';

const userDetails = document.createElement('span');
userDetails.innerText = 'Not logged in'; 
userDetails.className = 'user-details';

detailsSection.appendChild(checkbox);
detailsSection.appendChild(icon);
detailsSection.appendChild(userDetails);

buttonContainer.appendChild(detailsSection);

//~~VISUAL DIVIDER~~
buttonContainer.appendChild(divider);
//~~VISUAL DIVIDER~~

// Login UI
const loginSection = document.createElement('div');
loginSection.className = 'login-section hidden';  // Added "hidden" class

const loginUsername = document.createElement('input');
loginUsername.placeholder = 'Username';
loginSection.appendChild(loginUsername);

const loginPassword = document.createElement('input');
loginPassword.type = 'password';
loginPassword.placeholder = 'Password';
loginSection.appendChild(loginPassword);

const loginButton = document.createElement('button');
loginButton.innerText = "Login";
loginSection.appendChild(loginButton);

parentContainer.appendChild(loginSection);

const showPopup = (popupElement) => {
    popupElement.classList.add('popup');
    popupElement.classList.remove('hidden');
};

const hidePopup = (popupElement) => {
    popupElement.classList.remove('popup');
    popupElement.classList.add('hidden');
};

const loginButtonTrigger = document.createElement('button');
loginButtonTrigger.innerText = "Login";
loginButtonTrigger.addEventListener('click', () => showPopup(loginSection));

buttonContainer.appendChild(loginButtonTrigger);  // Add these buttons to the buttonContainer for alignment

function clearUserDetails() {
    userDetails.innerText = 'Not logged in';
    
    const gemCountSpan = document.querySelector('.gem-count');
    if (gemCountSpan) {
        gemCountSpan.remove(); // Remove the gem count display
    }
}

const logoutButton = document.createElement('button');
logoutButton.className = "logout-button"; // Add this line
logoutButton.innerText = "Logout";
logoutButton.addEventListener('click', () => {
    chrome.storage.local.remove('token', function() {
        setExtensionStatus('Logout successful');
        userDetails.classList.add('logged-out');
        adjustButtonVisibility(false);
        clearUserDetails(); // Clear the displayed username
    });
});

buttonContainer.appendChild(logoutButton);

const createCloseButton = (popupElement) => {
    const closeButton = document.createElement('button');
    closeButton.innerText = "Close";
    closeButton.addEventListener('click', () => hidePopup(popupElement));
    return closeButton;
};
loginSection.appendChild(createCloseButton(loginSection));

const statusText = document.createElement('div');
statusText.className = 'status-text inactive'; // I added "inactive" class as a starting status
statusText.id = 'extensionStatusText';
statusText.textContent = 'Inactive';

parentContainer.appendChild(buttonContainer);
parentContainer.appendChild(statusText);

// Utility functions to control the visibility of elements
function hideElement(element) {
    element.style.display = 'none';
}

function showElement(element) {
    element.style.display = 'block';
}

// Adjust the visibility of buttons based on the login state
function adjustButtonVisibility(isLoggedIn) {
    if (isLoggedIn) {
        hideElement(loginButtonTrigger);
        showElement(logoutButton);
    } else {
        showElement(loginButtonTrigger);
        hideElement(logoutButton);
    }
}

// Check the initial state on startup
chrome.storage.local.get('token', function(data) {
    if (data.token) {
        adjustButtonVisibility(true);
    } else {
        adjustButtonVisibility(false);
    }
});

loginButton.addEventListener('click', async () => {
    const username = loginUsername.value;
    const password = loginPassword.value;

    loginButton.disabled = true;

    try {
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password }),
            timeout: 5000
        });

        const data = await response.json();
        if (response.ok && data.token) {
            chrome.storage.local.set({ token: data.token });
            // Update the status text instead of showing an alert
            setExtensionStatus('Login successful!');
            hidePopup(loginSection);  // Close the login form
            adjustButtonVisibility(true);
            checkUserStatus();  // Update user details
        } else {
            setExtensionStatus('Login failed. Check your credentials.');
        }
    } catch (error) {
        console.error('Error logging in:', error);
    } finally {
        loginButton.disabled = false;
    }
});

const updateUIWithUserDetails = (username, gemCount) => {
    userDetails.innerText = username;
    userDetails.classList.remove('logged-out'); // This line ensures the correct styling

    if (userDetails.parentNode === detailsSection) {
        detailsSection.removeChild(userDetails);
    }

    const gemCountSpan = document.createElement('span');
    gemCountSpan.innerText = ` ${gemCount} gems`;
    gemCountSpan.className = 'gem-count';

    // Append the userDetails and gemCountSpan to the detailsSection
    detailsSection.appendChild(userDetails);
    detailsSection.appendChild(gemCountSpan);

    // Create a new container for the userDetails and logoutButton
    const userLogoutContainer = document.createElement('div');
    userLogoutContainer.className = 'user-logout-container';
    userLogoutContainer.appendChild(userDetails);
    userLogoutContainer.appendChild(logoutButton);

    // Append the new container to the buttonContainer
    buttonContainer.appendChild(userLogoutContainer);
};

document.body.appendChild(parentContainer);
// Check user's login status and update UI accordingly
checkUserStatus();