let ws;
let lastSeenPGN = ""; 
let connectionCheckInterval;
let isObserving = false; // Global flag to check if the extension is actively observing

const checkWebSocketConnection = () => {
    if (ws && ws.readyState !== WebSocket.OPEN) {
        statusText.innerHTML = '<span style="color:red;">App connection lost!</span><br><span style="font-weight:normal;">Restart app, then refresh this page</span>';
    } else if (ws && ws.readyState === WebSocket.OPEN && isObserving) {
        // Only set the status to 'Observing' if the extension is actively observing
        setExtensionStatus('Observing');
    }
};

const establishWebSocket = () => {
    ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
        console.log('WebSocket connection established.');
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval); // Clear previous interval if exists
        }
        connectionCheckInterval = setInterval(checkWebSocketConnection, 5000); // Check every 5 seconds
    };

    ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
    };

    ws.onclose = (event) => {
        if (event.wasClean) {
            console.log(`WebSocket connection closed cleanly.`);
        } else {
            console.error('WebSocket connection died.');
        }
    };
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
            console.log('A child node has been added or removed.');
            const rawMoves = mutation.target.innerText;
            const splitMoves = rawMoves.split('\n').filter(move => move.trim() !== '');
            const formattedMoves = [];

            for (let i = 0; i < splitMoves.length; i++) {
                if (i % 3 === 0) { // This is a number
                    formattedMoves.push(splitMoves[i] + '. ' + (splitMoves[i + 1] || '') + ' ' + (splitMoves[i + 2] || ''));
                }
            }

            const finalPGN = formattedMoves.join(' ').trim();
            console.log("Extracted moves:", finalPGN);
            sendMoves(finalPGN);
        }
    }
};

const initiateTemporaryObserver = () => {
    const bodyElement = document.body;

    const tempObserver = new MutationObserver(() => {
        const movesElement = document.querySelector("#main-wrap > main > div.round__app.variant-standard > rm6 > l4x");
        if (movesElement) {
            tempObserver.disconnect();  // Stop the temporary observer
            establishWebSocket();
            const mainObserver = new MutationObserver(extractMoves);
            mainObserver.observe(movesElement, { childList: true });
            setExtensionStatus('Waiting for moves...');
        }
    });

    tempObserver.observe(bodyElement, { childList: true, subtree: true });
};


// Immediately establish WebSocket connection on extension load.
establishWebSocket();

const initiateObserver = () => {
    // Check WebSocket connection status first
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        statusText.innerHTML = '<span style="font-weight:bold;">Server not found.</span><br>Restart app, then refresh this page';
        return; // Exit the function early if no active WebSocket connection
    }

    const movesElement = document.querySelector("#main-wrap > main > div.round__app.variant-standard > rm6 > l4x");
    if (movesElement) {
        isObserving = true; // Set the flag to true when the observation starts
        const observer = new MutationObserver(extractMoves);
        observer.observe(movesElement, { childList: true });
        setExtensionStatus('Waiting...');
    } else {
        setExtensionStatus('Connected. Waiting for moves.');
        initiateTemporaryObserver();
    }
};


const flipFunction = () => {
    console.log("Flip button clicked!");
    
    // Check if WebSocket connection is established and open
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Send a specific message (e.g., 'FLIP') to the server indicating the flip request
        ws.send('FLIP');
    }
};


const divider = document.createElement('div');
divider.style.height = '1px';
divider.style.backgroundColor = '#000000';  
divider.style.margin = '5px 0';  // Reduced from 10px


// Create a container for the buttons and user details
const buttonContainer = document.createElement('div');
buttonContainer.style.backgroundColor = 'white';
buttonContainer.style.borderRadius = '5px';
buttonContainer.style.padding = '5px';  // Reduced the padding
buttonContainer.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'; // Optional: Adds a subtle shadow for depth



// Common styles for the buttons
const buttonStyles = `
    margin-left: 5px;
    padding: 8px 12px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    background-color: #007BFF;
    color: white;
    font-size: 14px;
    transition: background-color 0.3s;
`;
const buttonHoverStyles = `
    background-color: rgba(0, 123, 255, 0.8);
`;

// Creating the "Start" button
const startButton = document.createElement('button');
startButton.innerText = "Start";
startButton.style.cssText = buttonStyles;
startButton.addEventListener('mouseenter', () => {startButton.style.backgroundColor = "rgba(0, 123, 255, 0.8)";});
startButton.addEventListener('mouseleave', () => {startButton.style.backgroundColor = "#007BFF";});
startButton.addEventListener('click', initiateObserver);
buttonContainer.appendChild(startButton);

// Creating the "Flip" button
const flipButton = document.createElement('button');
flipButton.innerText = "Flip";
flipButton.style.cssText = buttonStyles;
flipButton.addEventListener('mouseenter', () => {
    flipButton.style.backgroundColor = "rgba(0, 123, 255, 0.8)";
});
flipButton.addEventListener('mouseleave', () => {
    flipButton.style.backgroundColor = "#007BFF";
});
flipButton.addEventListener('click', flipFunction);
buttonContainer.appendChild(flipButton);

//~~VISUAL DIVIDER~~
buttonContainer.appendChild(divider);
//~~VISUAL DIVIDER~~

// "Multiple lines" Configuration Section
const multipleLinesConfig = document.createElement('div');
multipleLinesConfig.style.display = 'flex';
multipleLinesConfig.style.justifyContent = 'center'; // Keeps elements centered horizontally
multipleLinesConfig.style.alignItems = 'center';
multipleLinesConfig.style.margin = '5px 0';

const multipleLinesLabel = document.createElement('label');
multipleLinesLabel.innerText = 'Multiple lines:';
multipleLinesLabel.htmlFor = 'multiple-lines-dropdown';
multipleLinesLabel.style.marginRight = '5px'; // Adds a little spacing between the label and the dropdown

const multipleLinesDropdown = document.createElement('select');
multipleLinesDropdown.id = 'multiple-lines-dropdown';
multipleLinesDropdown.style.padding = '0px';
multipleLinesDropdown.style.margin = '0px';
multipleLinesDropdown.style.lineHeight = '1'; // Adjust as needed
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

// Section for checkbox, icon, and user details
const detailsSection = document.createElement('div');
detailsSection.style.display = 'flex';
detailsSection.style.alignItems = 'center';
detailsSection.style.marginTop = '5px';

const checkbox = document.createElement('input');
checkbox.type = 'checkbox';

const icon = document.createElement('img');
icon.src = chrome.runtime.getURL('assets/bullet.png');
icon.style.width = '24px';
icon.style.height = '24px';
icon.style.marginLeft = '10px';

const userDetails = document.createElement('span');
userDetails.innerText = 'User Details';  // Placeholder text
userDetails.style.marginLeft = '10px';

detailsSection.appendChild(checkbox);
detailsSection.appendChild(icon);
detailsSection.appendChild(userDetails);

buttonContainer.appendChild(detailsSection);

// Parent container to wrap both the button container and status text
const parentContainer = document.createElement('div');
parentContainer.style.position = 'fixed';
parentContainer.style.top = '60px';
parentContainer.style.right = '100px';
parentContainer.style.zIndex = '9999';
parentContainer.style.textAlign = 'center'; // To center-align contents

// Create the status text element
const statusText = document.createElement('div');
statusText.className = 'statusText';
statusText.id = 'extensionStatusText';
statusText.textContent = 'Inactive';
statusText.style.marginTop = '5px';  // Add spacing above the status text
statusText.style.padding = '5px 10px'; // Padding around the text for a better look
statusText.style.borderRadius = '5px'; // To match the style of buttonContainer
statusText.style.backgroundColor = '#f5f5f5'; // A slightly darker off-white tone


// Then add the buttonContainer and statusText to the parent container
parentContainer.appendChild(buttonContainer);
parentContainer.appendChild(statusText);


// Update the status text function
function setExtensionStatus(status) {
    const statusText = document.getElementById('extensionStatusText');
    statusText.textContent = status;

    switch (status) {
        case 'Inactive':
            statusText.style.fontStyle = 'normal';
            statusText.style.fontWeight = 'normal';
            break;
        case 'Waiting for moves...':
            statusText.style.fontStyle = 'italic';
            statusText.style.fontWeight = 'normal';
            break;
        case 'Observing':
            statusText.style.fontStyle = 'normal';
            statusText.style.fontWeight = 'bold';
            break;
    }
}

document.body.appendChild(parentContainer);
