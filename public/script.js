// Check if participant ID is set, if not redirect to index.html
const participantID = localStorage.getItem('participantID')
if (!participantID) {
    alert('Please enter your participant ID first.');
    window.location.href = '/';
}

console.log(`participantID: ${participantID}`)

const inputField = document.getElementById('user-input')
const sendBtn = document.getElementById('send-btn')
const messagesContainer = document.getElementById('messages')
const retrievalMethod = document.getElementById('retrieval-method')
const uploadBtn = document.getElementById('upload-btn')
const fileInput = document.getElementById('file-input')

/**
 * Create a message bubble & append it to the Chat Container
 * @param {string} message the message
 * @param {string} role 'user' OR 'system'
 */
const createChatMessage = (message, role) => {
    const elem = document.createElement('div');
    elem.classList.add('message', role);

    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    bubble.textContent = message;

    elem.appendChild(bubble);
    messagesContainer.appendChild(elem);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function logEvent(type, element) {
    fetch('/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            participantID: participantID,
            eventType: type,
            elementName: element,
            timestamp: new Date()
        })
    });
}

const sendMessage = async () => {
    // Display message & clear input field
    let userMessage = inputField.value.trim();
    if (userMessage === "") {
        alert("You submitted an empty message");
        return
    } else {
        createChatMessage(userMessage, 'user');
    }
    inputField.value = '';

    // Send message to server
    try {
        const resp = await fetch("/chat", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "participantID": participantID,
                "userMessage": userMessage,
                "retrievalMethod": retrievalMethod.value
            }),
        })
        if (resp.ok) {
            let data = await resp.json();
            createChatMessage(data.botResponse, 'system')
        } else {
            console.error("Failed to fetch response from server")
        }
    } catch (err) {
        console.error("Fetch response from server: ", err)
    }
}

/**
 * Load chat history for this participant
 */
const loadChatHistory = async () => {
    try {
        // encodeURIComponent handles participantID that looks like part of URL e.g. 123?x=1
        const resp = await fetch(`/chat-history/${encodeURIComponent(participantID)}`);
        if (!resp.ok) {
            console.error('Failed to load chat history');
            return;
        }

        const history = await resp.json();

        history.forEach((interaction) => {
            createChatMessage(interaction.userInput, 'user');
            createChatMessage(interaction.botResponse, 'system');
        });
    } catch (err) {
        console.error('Error loading chat history:', err);
    }
}

// Load chat history for this participant after HTML is parsed
document.addEventListener('DOMContentLoaded', loadChatHistory)

sendBtn.addEventListener('click', function () {
    logEvent('click', 'SendButton');
    sendMessage();
});

inputField.addEventListener('keydown', function (event) {
    if (event.key == 'Enter') {
        logEvent('click', 'EnterButton');
        sendMessage();
    }
});

retrievalMethod.addEventListener('change', function () {
    const selectedMethod = retrievalMethod.value;
    console.log("Retrieval method: " + selectedMethod);
    logEvent('change', 'RetrievalMethodDropdown');
});

uploadBtn.addEventListener('click', function () {
    const file = document.getElementById('file-input').files[0];
    console.log("Selected file: " + file.name);
    logEvent('click', 'UploadButton');
});

fileInput.addEventListener('click', function () {
    const file = document.getElementById('file-input');
    console.log("Button Selected");
    logEvent('click', 'FileInput');
});
