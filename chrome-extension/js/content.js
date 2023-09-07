console.log("Content script loaded");

let ws;
let lastSeenPGN = ""; // New variable to store the last seen PGN

const establishWebSocket = () => {
    ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => {
        console.log('WebSocket connection established.');
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
    if (ws && ws.readyState === WebSocket.OPEN && moves !== lastSeenPGN) { // Check if the PGN is different from the last seen one
        ws.send(JSON.stringify({ move: moves }));
        lastSeenPGN = moves; // Update the last seen PGN
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

const movesElement = document.querySelector("#main-wrap > main > div.round__app.variant-standard > rm6 > l4x");
if (movesElement) {
    establishWebSocket();
    const observer = new MutationObserver(extractMoves);
    observer.observe(movesElement, { childList: true });
}
