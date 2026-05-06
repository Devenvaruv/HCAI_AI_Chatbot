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
const multer = require('multer');
const Document = require('./models/Document');

const documentProcessor = require('./services/documentProcessor');
const retrievalService = require('./services/retrievalService');
const confidenceCalculator = require('./services/confidenceCalculator');
const embeddingService = require('./services/embeddingService');

const upload = multer({ dest: path.join(__dirname, 'uploads') });

dotenv.config({ path: path.join(__dirname, '.env') });

mongoose.connect(process.env.MONGO_URI)

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/chat', async (req, res) => {

    const {
        history = [],
        input: userInput,
        participantID,
        retrievalMethod = 'semantic'
    } = req.body;

    if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
            error: 'OpenAI API key is missing.'
        });
    }

    if (!participantID || !participantID.trim()) {
        return res.status(400).json({ error: 'participantID is required' });
    }

    if (!userInput || !userInput.trim()) {
        return res.status(400).json({
            error: 'Invalid input'
        });
    }

    const safeHistory = Array.isArray(history)
        ? history
            .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            .map(m => ({
                role: m.role,
                content: String(m.content ?? '')
            }))
        : [];

    const retrieved = await retrievalService.retrieve(userInput, {
        method: retrievalMethod,
        topK: 3
    });

    const retrievedDocuments = retrieved.map((chunk) => ({
        docName: chunk.documentName,
        chunkIndex: chunk.chunkIndex,
        chunkText: chunk.chunkText,
        relevanceScore: chunk.relevanceScore
    }));

    const evidenceText = retrievedDocuments.length > 0
        ? retrievedDocuments
            .map((doc) => `${doc.docName} chunk ${doc.chunkIndex}: ${doc.chunkText}`)
            .join('\n\n')
        : 'No supporting documents retrieved.';

    try {
        const messages = [
            {
                role: 'system',
                content: `You are a helpful assistant. Answer only using the retrieved evidence.`
            },
            ...safeHistory,
            {
                role: 'system',
                content: `Retrieved evidence:\n${evidenceText}`
            },
            {
                role: 'user',
                content: userInput
            }
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages,
            max_tokens: 100
        });

        const botResponse = response.choices[0].message.content.trim();
        const confidenceMetrics = confidenceCalculator.calculate({ retrievedDocs: retrieved, retrievalMethod: retrievalMethod });

        const interaction = new Interaction({
            participantID: participantID,
            userInput: userInput,
            botResponse: botResponse,
            retrievalMethod: retrievalMethod,
            retrievedDocuments: retrievedDocuments,
            confidenceMetrics: confidenceMetrics
        });
        await interaction.save();

        res.json({
            botResponse, retrievedDocuments, confidenceMetrics
        });
    } catch (error) {
        console.error('Error interacting with OpenAI API:', error.message);
        res.status(500).send('Server Error');
    }
});

app.post('/log-event', async (req, res) => {
    const { participantID, eventType, elementName, timestamp } = req.body;

    if (!participantID || !participantID.trim()) {
        return res.status(400).json({ error: 'participantID is required' });
    }

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

/**
 * Route to fetch participant's chat history
 */
app.post('/history', async (req, res) => {
    const { participantID, limit = 5 } = req.body;

    if (!participantID || !participantID.trim()) {
        return res.status(400).json({ error: 'participantID is required' });
    }

    try {
        const interactions = await Interaction
            .find({ "participantID": participantID, })
            .sort({ timestamp: -1 })
            .limit(limit);

        interactions.reverse();
        res.json({ interactions });
    } catch (error) {
        console.error('Error fetching chat history:', error.message);
        res.status(500).send('Server Error');
    }
})

app.post('/redirect-to-survey', (req, res) => {
  const { participantID } = req.body;

  const qualtricsBaseUrl = 'https://usfca.qualtrics.com/jfe/form/SV_9YmD3CQUgKK1pJQ';

  const surveyUrl = `${qualtricsBaseUrl}?participantID=${encodeURIComponent(participantID)}`;

  res.send(surveyUrl);
});

app.post('/redirect-to-post-survey', (req, res) => {
  const { participantID } = req.body;

  const qualtricsBaseUrl = 'https://usfca.qualtrics.com/jfe/form/SV_9YmD3CQUgKK1pJ';

  const surveyUrl = `${qualtricsBaseUrl}?participantID=${encodeURIComponent(participantID)}`;

  res.send(surveyUrl);
});

app.post("/upload-document", upload.single("document"), async (req, res) => {

    if (!req.file) {
        return res.status(400).json({ error: 'File not found' });
    }

    try {

        const processed = await documentProcessor.processDocument(req.file);

        const document = new Document({
            filename: req.file.originalname,
            text: processed.fullText,
            chunks: await embeddingService.generateEmbeddings(processed.chunks),
            processingStatus: 'completed'
        })

        await document.save();

        await retrievalService.rebuildIndex()

        res.json({
            status: 'success',
            filename: document.filename,
            chunkCount: document.chunks.length
        });
    } catch (error) {
        console.error("Error uploading document:", error.message);
        res.status(500).json({
            error: "Failed to process document",
            details: error.message
        });
    }
});

app.get("/documents", async (req, res) => {


    const documents = await Document.find(
        {},
        '_id filename processingStatus processedAt'
    ).sort({ processedAt: -1 });

    res.json(documents);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});