const params = new URLSearchParams(window.location.search);
const participantID = params.get('participantID') || localStorage.getItem('participantID');
const systemID = params.get('systemID');

document.getElementById('prototype-btn').addEventListener('click', () => {
  window.location.href = `/chat.html?participantID=${participantID}&systemID=${systemID}`;
});

document.getElementById('task-btn').addEventListener('click', () => {
  window.open(`/task.html`, '_blank');
});

if (!participantID) {
    alert('Please enter your participant ID first.');
    // redirect to login
    window.location.href = '/';
}

console.log(`participantID: ${participantID}`)

const inputField = document.getElementById('user-input')
const sendBtn = document.getElementById('send-btn')
const messagesContainer = document.getElementById('messages')
const retrievalMethod = document.getElementById('retrieval-method')
const uploadBtn = document.getElementById('upload-btn')
const fileInput = document.getElementById('file-input')
const evidenceList = document.getElementById('evidence-list');
const evidenceEmpty = document.getElementById('evidence-empty');
const metricOverall = document.getElementById('metric-overall');
const metricRetrieval = document.getElementById('metric-retrieval');
const metricResponse = document.getElementById('metric-response');
const metricMethod = document.getElementById('metric-method');
const ragPanel = document.getElementById('rag-panel');
const closeRagBtn = document.getElementById('close-rag-btn');

// TODO: maybe move this to config
const MAX_INTERACTIONS = 5
const conversationHistory = [];

/**
 * Create a message bubble & append it to the Chat Container
 * @param {string} message the message
 * @param {string} role 'user' OR 'assistant'
 * @param {{ retrievedDocuments?: Array, confidenceMetrics?: Object } | null} metadata
 */
const createChatMessage = (message, role, metadata = null) => {
    const elem = document.createElement('div');
    elem.classList.add('message', role);

    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    bubble.textContent = message;

    elem.appendChild(bubble);

    const hasEvidence = role === 'assistant' && metadata
        && ((metadata.retrievedDocuments && metadata.retrievedDocuments.length > 0) || metadata.confidenceMetrics);

    if (hasEvidence) {
        const actions = document.createElement('div');
        actions.className = 'message-actions';

        const evidenceBtn = document.createElement('button');
        evidenceBtn.type = 'button';
        evidenceBtn.className = 'evidence-toggle';
        evidenceBtn.textContent = 'View evidence';
        evidenceBtn.addEventListener('click', () => {
            renderRetrievedEvidence(metadata.retrievedDocuments || []);
            renderConfidenceMetrics(metadata.confidenceMetrics || null);
            ragPanel.classList.add('is-open');
            ragPanel.setAttribute('aria-hidden', 'false');
        });

        actions.appendChild(evidenceBtn);
        elem.appendChild(actions);
    }

    messagesContainer.appendChild(elem);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function renderRetrievedEvidence(docs) {
    evidenceList.innerHTML = '';
    evidenceEmpty.style.display = docs.length > 0 ? 'none' : 'block';

    if (docs.length === 0) {
        evidenceEmpty.textContent = 'No evidence was retrieved for this response.';
        return;
    }

    docs.forEach((doc) => {
        const card = document.createElement('article');
        card.className = 'evidence-card';

        const title = document.createElement('div');
        title.className = 'evidence-title';
        title.textContent = `${doc.docName} | Chunk ${doc.chunkIndex} | Score: ${doc.relevanceScore}`;

        const text = document.createElement('p');
        text.className = 'evidence-text';
        text.textContent = doc.chunkText;

        card.appendChild(title);
        card.appendChild(text);
        evidenceList.appendChild(card);
    });
}

function redirectToSurvey() {
  fetch('/redirect-to-survey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantID })
  })
    .then(response => response.text())
    .then(url => {
      logEvent('redirect', 'Qualtrics Survey');
      //window.location.href = url;
      window.open(url, '_blank');
    })
    .catch(error => {
      console.error('Error redirecting to survey:', error);
      alert('There was an error redirecting to the survey. Please try again.');
    });
}

function redirectToPostSurvey() {
  fetch('/redirect-to-post-survey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantID })
  })
    .then(response => response.text())
    .then(url => {
      logEvent('redirect', 'Qualtrics Survey');
      //window.location.href = url;
      window.open(url, '_blank');
    })
    .catch(error => {
      console.error('Error redirecting to survey:', error);
      alert('There was an error redirecting to the survey. Please try again.');
    });
}

document.getElementById('survey-btn').addEventListener('click', redirectToSurvey);

document.getElementById('post-survey-btn').addEventListener('click', redirectToPostSurvey);

const participantDisplay = document.getElementById('participant-display');
participantDisplay.textContent = participantID;
function renderConfidenceMetrics(metrics) {
    metricOverall.textContent = metrics?.overallConfidence ?? 'N/A';
    metricRetrieval.textContent = metrics?.retrievalConfidence ?? 'N/A';
    metricResponse.textContent = metrics?.responseConfidence ?? 'N/A';
    metricMethod.textContent = metrics?.retrievalMethod ?? 'N/A';
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

/**
 * Submits conversation history to the server.
 * Sends the most recent 'N' messages between user and assitant.
 * @returns
 */
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
        const recentHistory = conversationHistory.slice(- MAX_INTERACTIONS * 2);
        let payload = {};

        if (recentHistory.length === 0) {
            payload = {
                input: userMessage,
                retrievalMethod: retrievalMethod.value,
                participantID,
                systemID,
            };
        } else {
            payload = {
                history: recentHistory,
                input: userMessage,
                participantID,
                systemID,
                retrievalMethod: retrievalMethod.value
            };
        }

        const resp = await fetch("/chat", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (resp.ok) {
            let data = await resp.json();
            createChatMessage(data.botResponse, 'assistant', {
                retrievedDocuments: data.retrievedDocuments,
                confidenceMetrics: data.confidenceMetrics
            });
            conversationHistory.push({ role: 'user', content: userMessage });
            conversationHistory.push({ role: 'assistant', content: data.botResponse });

        } else {
            console.error("Failed to fetch response from server")
        }
    } catch (err) {
        console.error("Fetch response from server: ", err)
    }
}

/**
 * Load existing chat history for this participant.
 */
const loadChatHistory = async () => {
    try {
        // TODO: change /history route on server.js
        const resp = await fetch('/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send participantID to the server and maximum conversation exchanges
            body: JSON.stringify({ participantID, limit: MAX_INTERACTIONS })
        });
        if (!resp.ok) {
            console.error('Failed to load chat history');
            return;
        }

        const history = await resp.json();

        if (history.interactions && history.interactions.length > 0) {
            history.interactions.forEach((interaction) => {
                createChatMessage(interaction.userInput, 'user');
                createChatMessage(interaction.botResponse, 'assistant', {
                    retrievedDocuments: interaction.retrievedDocuments,
                    confidenceMetrics: interaction.confidenceMetrics
                });

                conversationHistory.push({
                    role: 'user', content: interaction.userInput
                })
                conversationHistory.push({
                    role: 'assistant', content: interaction.botResponse
                })
            });
        }
    } catch (err) {
        console.error('Error loading chat history:', err);
    }
}

// Load chat history for this participant after HTML is parsed
document.addEventListener('DOMContentLoaded', () => {
    loadChatHistory();
    loadDocuments();
});

closeRagBtn.addEventListener('click', function () {
    ragPanel.classList.remove('is-open');
    ragPanel.setAttribute('aria-hidden', 'true');
});

// Send message to OpenAI on button click
sendBtn.addEventListener('click', function () {
    logEvent('click', 'SendButton');
    sendMessage();
});

// Send message to OpenAI on Enter
inputField.addEventListener('keydown', function (event) {
    if (event.key == 'Enter') {
        logEvent('keydown', 'UserInput');
        sendMessage();
    }
});

/* Log user interactions */
sendBtn.addEventListener('mouseenter', function () {
    logEvent('hover', 'SendButton');
});

inputField.addEventListener('focus', function () {
    logEvent('focus', 'UserInput');
});

retrievalMethod.addEventListener('change', function () {
    const selectedMethod = retrievalMethod.value;
    console.log("Retrieval method: " + selectedMethod);
    logEvent('change', 'RetrievalMethodDropdown');
});

retrievalMethod.addEventListener('focus', function () {
    logEvent('focus', 'RetrievalMethodDropdown');
});

uploadBtn.addEventListener('click', async function () {
    const file = document.getElementById('file-input').files[0];
    if (file) {
        console.log("Selected file: " + file.name);
    }
    const formData = new FormData();

    formData.append('document', file);

    const response = await fetch("/upload-document", {
        method: "POST",
        body: formData
    });
    const data = await response.json();
    await loadDocuments();
    logEvent('click', 'UploadButton');
});

async function loadDocuments() {
    const response = await fetch("/documents");
    const docs = await response.json();

    const documentsList = document.getElementById("uploaded-docs");
    documentsList.innerHTML = "";

    if (docs.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.id = 'empty-msg';
        emptyMessage.textContent = 'No documents uploaded yet';
        documentsList.appendChild(emptyMessage);
        return;
    }

    docs.forEach((doc) => {
        const item = document.createElement('div');
        item.className = 'doc-item';
        item.textContent = `${doc.filename} ${doc.processingStatus}`;
        documentsList.appendChild(item);
    });
}

uploadBtn.addEventListener('mouseenter', function () {
    logEvent('hover', 'UploadButton');
});

fileInput.addEventListener('click', function () {
    const file = document.getElementById('file-input');
    console.log("Button Selected");
    logEvent('click', 'FileInput');
});
