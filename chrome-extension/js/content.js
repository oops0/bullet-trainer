let ws;
let lastSeenPGN = ""; 
let connectionCheckInterval;
let isObserving = false; // Global flag to check if the extension is actively observing

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

                if (response.ok && data.username && data.coinCount !== undefined) {
                    updateUIWithUserDetails(data.username, data.coinCount);
                } else {
                    console.error("Error fetching user details:", data.message);
                }
            } catch (error) {
                console.error("Error while checking user status:", error);
            }
        }
    });
};

const updateUIWithUserDetails = (username, coinCount) => {
    userDetails.innerText = username;

    const coinCountSpan = document.createElement('span');
    coinCountSpan.innerText = ` ${coinCount} coins`;
    coinCountSpan.className = 'coin-count';

    detailsSection.insertBefore(coinCountSpan, checkbox);
    detailsSection.insertBefore(coinCountSpan, userDetails.nextSibling);
};


const sendMoves = (moves) => {
    if (ws && ws.readyState === WebSocket.OPEN && moves !== lastSeenPGN) { 
        ws.send(JSON.stringify({ move: moves }));
        lastSeenPGN = moves; 
        setExtensionStatus('Observing'); // Set status to "Observing" after sending move
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

const flipFunction = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('FLIP');
    }
};

const divider = document.createElement('div');
divider.className = 'divider';

const parentContainer = document.createElement('div');
parentContainer.className = 'parent-container';

const buttonContainer = document.createElement('div');
buttonContainer.className = 'button-container';

const startButton = document.createElement('button');
startButton.innerText = "Start";
startButton.className = 'styled-button';
startButton.addEventListener('mouseenter', () => { startButton.classList.add('button-hover'); });
startButton.addEventListener('mouseleave', () => { startButton.classList.remove('button-hover'); });
startButton.addEventListener('click', initiateObserver);
buttonContainer.appendChild(startButton);

const flipButton = document.createElement('button');
flipButton.innerText = "Flip";
flipButton.className = 'styled-button';
flipButton.addEventListener('mouseenter', () => { flipButton.classList.add('button-hover'); });
flipButton.addEventListener('mouseleave', () => { flipButton.classList.remove('button-hover'); });
flipButton.addEventListener('click', flipFunction);
buttonContainer.appendChild(flipButton);


//~~VISUAL DIVIDER~~
buttonContainer.appendChild(divider);
//~~VISUAL DIVIDER~~

const multipleLinesConfig = document.createElement('div');
multipleLinesConfig.className = 'multiple-lines-config';

const multipleLinesLabel = document.createElement('label');
multipleLinesLabel.innerText = 'Multiple lines:';
multipleLinesLabel.htmlFor = 'multiple-lines-dropdown';
multipleLinesLabel.className = 'multiple-lines-label';

const multipleLinesDropdown = document.createElement('select');
multipleLinesDropdown.id = 'multiple-lines-dropdown';
multipleLinesDropdown.className = 'multiple-lines-dropdown';

for (let i = 1; i <= 5; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.innerText = i;
    multipleLinesDropdown.appendChild(option);
}

multipleLinesDropdown.addEventListener('change', (e) => {
    const selectedValue = e.target.value;
    ws.send(`SET_MULTIPLE_LINES:${selectedValue}`);
});

multipleLinesConfig.appendChild(multipleLinesLabel);
multipleLinesConfig.appendChild(multipleLinesDropdown);
buttonContainer.appendChild(multipleLinesConfig); // Adding the "Multiple lines" config section to the button container

//~~VISUAL DIVIDER~~
buttonContainer.appendChild(divider);
//~~VISUAL DIVIDER~~

const detailsSection = document.createElement('div');
detailsSection.className = 'details-section';

const checkbox = document.createElement('input');
checkbox.type = 'checkbox';

const icon = document.createElement('img');
icon.src = chrome.runtime.getURL('assets/bullet.png');
icon.style.width = '24px';
icon.style.height = '24px';
icon.style.marginLeft = '10px';

const userDetails = document.createElement('span');
userDetails.innerText = 'User Details';  // Placeholder text
userDetails.className = 'user-details';

detailsSection.appendChild(checkbox);
detailsSection.appendChild(icon);
detailsSection.appendChild(userDetails);

buttonContainer.appendChild(detailsSection);

//~~VISUAL DIVIDER~~
buttonContainer.appendChild(divider);
//~~VISUAL DIVIDER~~

// Registration UI
const registrationSection = document.createElement('div');
registrationSection.className = 'registration-section hidden';  // Added "hidden" class

const registrationUsername = document.createElement('input');
registrationUsername.placeholder = 'Username';
registrationSection.appendChild(registrationUsername);

const registrationPassword = document.createElement('input');
registrationPassword.type = 'password';
registrationPassword.placeholder = 'Password';
registrationSection.appendChild(registrationPassword);

const registerButton = document.createElement('button');
registerButton.innerText = "Register";
registrationSection.appendChild(registerButton);

parentContainer.appendChild(registrationSection);

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

const registerButtonTrigger = document.createElement('button');
registerButtonTrigger.innerText = "Register";
registerButtonTrigger.addEventListener('click', () => showPopup(registrationSection));

buttonContainer.appendChild(loginButtonTrigger);  // Add these buttons to the buttonContainer for alignment
buttonContainer.appendChild(registerButtonTrigger);

const logoutButton = document.createElement('button');
logoutButton.innerText = "Logout";
logoutButton.addEventListener('click', () => {
    chrome.storage.local.remove('token', function() {
        alert('Logged out successfully!');
        adjustButtonVisibility(false);
    });
});

buttonContainer.appendChild(logoutButton);

const createCloseButton = (popupElement) => {
    const closeButton = document.createElement('button');
    closeButton.innerText = "Close";
    closeButton.addEventListener('click', () => hidePopup(popupElement));
    return closeButton;
};

registrationSection.appendChild(createCloseButton(registrationSection));
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

registerButton.addEventListener('click', async () => {
    const username = registrationUsername.value;
    const password = registrationPassword.value;
    
    registerButton.disabled = true;

    try {
        const response = await fetch('http://localhost:3000/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password }),
            timeout: 5000
        });

        const data = await response.json();
        if (response.ok && data.success) {
            alert('Registration successful!');
        } else {
            alert('Registration failed. Try again.');
        }
    } catch (error) {
        console.error('Error registering:', error);
    } finally {
        registerButton.disabled = false;
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
            alert('Login successful!');
            adjustButtonVisibility(true);
        } else {
            alert('Login failed. Check your credentials.');
        }
    } catch (error) {
        console.error('Error logging in:', error);
    } finally {
        loginButton.disabled = false;
    }
});


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
    }
}

document.body.appendChild(parentContainer);
// Check user's login status and update UI accordingly
checkUserStatus();