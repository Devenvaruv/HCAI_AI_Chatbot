const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const EventLog = require('./models/EventLogs');
const Interaction = require('./models/Interactions');
const { OpenAI } = require("openai");

dotenv.config({ path: path.join(__dirname, '.env') });

mongoose.connect(process.env.MONGO_URI)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.post('/chat', async (req, res) => {

    // const participantID = req.body.participantID;
    // const userMessage = req.body.userMessage;
    // const retrievalMethod = req.body.retrievalMethod;

    // console.log('Participant ID:', participantID);
    // console.log('User Message:', userMessage);
    // console.log('Retrieval Method:', retrievalMethod);

    // res.send({ responseReceived: { userMessage }, responseToUser: "Message Received!" })

    
    
    const input = req.body.userMessage;

    console.log(input);

    if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
        error: 'OpenAI API key is missing.'
        });
    }

    if (!input || !input.trim()) {
        return res.status(400).json({
        error: 'Invalid input'
        });
    }

    try {
        const message = input.trim();

        const response = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: message }],
        max_tokens: 100
        });

        const botResponse = response.choices[0].message.content.trim();

        const interaction = new Interaction({
        participantID: req.body.participantID,  
        userInput: message,
        botResponse: botResponse
        });
        await interaction.save();

        res.json({
        botResponse: botResponse
        });
    } catch (error) {
        console.error('Error interacting with OpenAI API:', error.message);

        res.status(500).send('Server Error');
    }
    });

    app.post('/log-event', async (req, res) => {
    const { participantID, eventType, elementName, timestamp } = req.body;

    try {
        const event = new EventLog({
        participantID,
        eventType,
        elementName,
        timestamp
        });

        await event.save();
        res.status(200).send('Event logged successfully');
    } catch (error) {
        console.error('Error logging event:', error.message);
        res.status(500).send('Server Error');
    }
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});