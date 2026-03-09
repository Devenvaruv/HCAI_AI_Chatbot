const inputField = document.getElementById('user-input')
const sendBtn = document.getElementById('send-btn')
const messagesContainer = document.getElementById('messages')
const retrievalMethod = document.getElementById('retrieval-method')
const uploadBtn = document.getElementById('upload-btn')

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
                "userMessage": userMessage,
                "retrievalMethod": retrievalMethod.value
            }),
        })
        if (resp.ok) {
            let data = await resp.json();
            createChatMessage('Message received', 'system')
            console.log('Server responded: ', JSON.stringify(data));
        } else {
            console.error("Failed to fetch response from server")
        }
    } catch (err) {
        console.error("Fetch response from server: ", err)
    }
}

sendBtn.addEventListener('click', sendMessage);

inputField.addEventListener('keydown', function (event) {
    if (event.key == 'Enter') {
        sendMessage();
    }
});

retrievalMethod.addEventListener('change', function () {
    const selectedMethod = retrievalMethod.value;
    console.log("Retrieval method: " + selectedMethod);
});

uploadBtn.addEventListener('click', function () {
    const file = document.getElementById('file-input').files[0];
    console.log("Selected file: " + file.name);
});
