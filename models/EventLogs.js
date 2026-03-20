const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const EventLogSchema = new Schema({
    participantID: String, // Unique identifier for the user
    eventType: String, // Type of event (click, hover, focus)
    elementName: String, // Name of the element (e.g., SendButton)
    timestamp: { type: Date, default: Date.now }
});
module.exports = mongoose.model('EventLog', EventLogSchema);