const params = new URLSearchParams(window.location.search);
const participantID = params.get('participantID') || localStorage.getItem('participantID');
const systemID = params.get('systemID');

const prototypeBtn = document.getElementById('prototype-btn');
if (prototypeBtn) {
  prototypeBtn.addEventListener('click', () => {
    window.location.href = `/chat.html?participantID=${participantID}&systemID=${systemID}`;
  });
}

const taskBtn = document.getElementById('task-btn');
if (taskBtn) {
  taskBtn.addEventListener('click', () => {
    alert('Add your task instructions here or link this button to a task page.');
  });
}

if (!participantID) {
  alert('Please enter your participant ID first.');
  window.location.href = '/';
}

console.log(`participantID: ${participantID}`);

const inputField        = document.getElementById('user-input');
const sendBtn           = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');
const retrievalMethod   = document.getElementById('retrieval-method');
const uploadBtn         = document.getElementById('upload-btn');
const fileInput         = document.getElementById('file-input');
const evidenceList      = document.getElementById('evidence-list');
const evidenceEmpty     = document.getElementById('evidence-empty');
const metricOverall     = document.getElementById('metric-overall');
const metricRetrieval   = document.getElementById('metric-retrieval');
const metricResponse    = document.getElementById('metric-response');
const metricMethod      = document.getElementById('metric-method');
const ragPanel          = document.getElementById('rag-panel');
const closeRagBtn       = document.getElementById('close-rag-btn');

const MAX_INTERACTIONS = 5;
const conversationHistory = [];

/* ── Concept Map ─────────────────────────────────── */
const conceptMap = {
  nodes: [],
  connections: [],
  activeTool: null,
  linkSource: null,
  nodeIdCounter: 0,
  area: null,
  svg: null,
  nodesContainer: null,
  hint: null,

  init() {
    this.area           = document.getElementById('concept-map-area');
    this.svg            = document.getElementById('concept-map-svg');
    this.nodesContainer = document.getElementById('concept-map-nodes');
    this.hint           = document.getElementById('canvas-hint');
    if (!this.area) return;

    const toolMap = {
      'tool-add-node': 'node',
      'tool-add-link': 'link',
      'tool-note':     'note',
      'tool-delete':   'delete',
    };
    Object.entries(toolMap).forEach(([id, tool]) => {
      document.getElementById(id)?.addEventListener('click', () => this.setTool(tool));
    });

    document.getElementById('tool-arrange')?.addEventListener('click', () => this.autoArrange());

    this.area.addEventListener('click', (e) => {
      if (e.target !== this.area && e.target !== this.svg &&
          e.target !== this.nodesContainer && e.target !== this.hint) return;
      if (this.activeTool === 'node' || this.activeTool === 'note') {
        const rect = this.area.getBoundingClientRect();
        this.addNode(e.clientX - rect.left, e.clientY - rect.top, this.activeTool, null);
      }
    });
  },

  setTool(tool) {
    this.activeTool = tool;
    this.linkSource = null;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('tool-active'));
    const idMap = { node: 'tool-add-node', link: 'tool-add-link', note: 'tool-note', delete: 'tool-delete' };
    if (idMap[tool]) document.getElementById(idMap[tool])?.classList.add('tool-active');
    this.area.style.cursor = (tool === 'delete' || tool === 'link') ? 'crosshair' : 'default';
  },

  addNode(x, y, type = 'node', label = null) {
    if (!label) {
      label = prompt('Node name:', type === 'note' ? 'Note' : 'Concept');
      if (!label) return null;
    }
    const id   = 'node-' + (++this.nodeIdCounter);
    const node = { id, label, x, y, type };
    this.nodes.push(node);
    this.renderNode(node);
    if (this.hint) this.hint.style.display = 'none';
    return node;
  },

  renderNode(node) {
    const el = document.createElement('div');
    el.className = 'concept-node' + (node.type === 'note' ? ' note-node' : '');
    if (this.nodes.indexOf(node) === 0) el.classList.add('node-primary');
    el.id = node.id;
    el.textContent = node.label;
    el.style.left = (node.x - 60) + 'px';
    el.style.top  = (node.y - 22) + 'px';

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.activeTool === 'delete') {
        this.deleteNode(node.id);
      } else if (this.activeTool === 'link') {
        if (!this.linkSource) {
          this.linkSource = node.id;
          el.classList.add('node-linking');
        } else if (this.linkSource !== node.id) {
          this.addConnection(this.linkSource, node.id);
          document.getElementById(this.linkSource)?.classList.remove('node-linking');
          this.linkSource = null;
        }
      } else {
        document.querySelectorAll('.concept-node').forEach(n => n.classList.remove('node-selected'));
        el.classList.add('node-selected');
      }
    });

    let dragging = false, startX, startY, startNX, startNY;
    el.addEventListener('mousedown', (e) => {
      if (this.activeTool === 'delete' || this.activeTool === 'link') return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startNX = node.x;   startNY = node.y;
      el.style.zIndex = 10;
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      node.x = startNX + (e.clientX - startX);
      node.y = startNY + (e.clientY - startY);
      el.style.left = (node.x - 60) + 'px';
      el.style.top  = (node.y - 22) + 'px';
      this.updateConnections();
    });
    document.addEventListener('mouseup', () => {
      if (dragging) { dragging = false; el.style.zIndex = ''; }
    });

    this.nodesContainer.appendChild(el);
  },

  deleteNode(id) {
    this.nodes = this.nodes.filter(n => n.id !== id);
    this.connections = this.connections.filter(c => c.from !== id && c.to !== id);
    document.getElementById(id)?.remove();
    this.updateConnections();
    if (this.nodes.length === 0 && this.hint) this.hint.style.display = '';
  },

  addConnection(fromId, toId) {
    const key = fromId + '-' + toId;
    if (this.connections.find(c => c.key === key)) return;
    this.connections.push({ key, from: fromId, to: toId });
    this.updateConnections();
  },

  updateConnections() {
    this.svg.innerHTML = '';
    this.connections.forEach(conn => {
      const from = this.nodes.find(n => n.id === conn.from);
      const to   = this.nodes.find(n => n.id === conn.to);
      if (!from || !to) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x);   line.setAttribute('y2', to.y);
      line.setAttribute('stroke', '#b0b8cc');
      line.setAttribute('stroke-width', '1.5');
      this.svg.appendChild(line);
    });
  },

  autoArrange() {
    if (this.nodes.length === 0) return;
    const rect = this.area.getBoundingClientRect();
    const w = rect.width || 600, h = rect.height || 700;
    const cols = Math.ceil(Math.sqrt(this.nodes.length));
    const rows = Math.ceil(this.nodes.length / cols);
    this.nodes.forEach((node, i) => {
      node.x = (w / (cols + 1)) * ((i % cols) + 1);
      node.y = (h / (rows + 1)) * (Math.floor(i / cols) + 1);
      const el = document.getElementById(node.id);
      if (el) { el.style.left = (node.x - 60) + 'px'; el.style.top = (node.y - 22) + 'px'; }
    });
    this.updateConnections();
  },

  addFromChat(label) {
    const rect = this.area?.getBoundingClientRect();
    const w = rect?.width || 600, h = rect?.height || 700;
    const x = 80 + Math.random() * (w - 160);
    const y = 80 + Math.random() * (h - 160);
    return this.addNode(x, y, 'node', label);
  },
};

/* ── Session Management ──────────────────────────── */
const sessionMgr = {
  sessions: [],
  activeId: null,

  init() {
    const saved = localStorage.getItem('sc_sessions');
    if (saved) this.sessions = JSON.parse(saved);
    this.activeId = localStorage.getItem('sc_activeSession');
    if (this.sessions.length === 0) this.create('Session 1');
    else this.render();

    document.getElementById('new-session-btn')?.addEventListener('click', () => {
      const name = prompt('Session name:', 'New Session');
      if (name) { this.create(name); logEvent('click', 'NewSession'); }
    });

    document.getElementById('clear-session-btn')?.addEventListener('click', () => {
      if (confirm('Clear messages in the current session?')) {
        messagesContainer.innerHTML = '';
        conversationHistory.length = 0;
        logEvent('click', 'ClearSession');
      }
    });
  },

  create(name) {
    const id = 'sess-' + Date.now();
    this.sessions.push({ id, name });
    if (!this.activeId) this.activeId = id;
    this.save();
    this.render();
    this.setActive(id);
  },

  setActive(id) {
    this.activeId = id;
    this.save();
    this.render();
  },

  save() {
    localStorage.setItem('sc_sessions', JSON.stringify(this.sessions));
    localStorage.setItem('sc_activeSession', this.activeId);
  },

  render() {
    const list = document.getElementById('session-list');
    if (!list) return;
    list.innerHTML = '';
    this.sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'session-item' + (s.id === this.activeId ? ' session-active' : '');
      item.innerHTML = `<span>${s.name}</span>${s.id === this.activeId ? '<span class="session-dot"></span>' : ''}`;
      item.addEventListener('click', () => this.setActive(s.id));
      list.appendChild(item);
    });
  },
};

/* ── Message Rendering ───────────────────────────── */
const createChatMessage = (message, role, metadata = null) => {
  const elem = document.createElement('div');
  elem.classList.add('message', role);

  const bubble = document.createElement('div');
  bubble.classList.add('bubble');

  if (role === 'assistant') {
    const hasDocs = metadata?.retrievedDocuments?.length > 0;
    if (hasDocs) {
      const tag = document.createElement('div');
      tag.className = 'evidence-tag';
      tag.textContent = '📎 From your document';
      bubble.appendChild(tag);
    }
  }

  const textEl = document.createElement('p');
  textEl.textContent = message;
  bubble.appendChild(textEl);
  elem.appendChild(bubble);

  if (role === 'assistant') {
    const depthRow = document.createElement('div');
    depthRow.className = 'depth-selector';

    [['Quick Answer', 'Give me a quick, concise answer about: '],
     ['Deep Dive',    'Give me a detailed deep dive on: '],
     ['Show Example', 'Show me a concrete example of: ']].forEach(([label, prefix]) => {
      const btn = document.createElement('button');
      btn.className = 'depth-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        const topic = message.split(' ').slice(0, 8).join(' ');
        inputField.value = prefix + topic + '...';
        inputField.focus();
        depthRow.querySelectorAll('.depth-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        logEvent('click', 'DepthButton_' + label.replace(' ', ''));
      });
      depthRow.appendChild(btn);
    });

    const mapBtn = document.createElement('button');
    mapBtn.className = 'add-to-map-btn';
    mapBtn.textContent = '+ Add to Concept Map';
    mapBtn.addEventListener('click', () => {
      const topic = message.split(/[\.\,\!\?]/)[0].substring(0, 40).trim();
      conceptMap.addFromChat(topic || 'Concept');
      logEvent('click', 'AddToConceptMap');
    });
    depthRow.appendChild(mapBtn);
    elem.appendChild(depthRow);

    const hasEvidence = metadata &&
      ((metadata.retrievedDocuments?.length > 0) || metadata.confidenceMetrics);
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

    if (metadata?.suggestedFollowUps?.length) {
      const stepsDiv = document.createElement('div');
      stepsDiv.className = 'suggested-steps';
      const label = document.createElement('span');
      label.className = 'suggested-label';
      label.textContent = 'Suggested Next Steps';
      stepsDiv.appendChild(label);
      metadata.suggestedFollowUps.forEach(q => {
        const btn = document.createElement('button');
        btn.className = 'suggested-item';
        btn.textContent = '→  ' + q;
        btn.addEventListener('click', () => {
          inputField.value = q;
          inputField.focus();
          logEvent('click', 'SuggestedFollowUp');
        });
        stepsDiv.appendChild(btn);
      });
      elem.appendChild(stepsDiv);
    }
  }

  messagesContainer.appendChild(elem);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

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

function renderConfidenceMetrics(metrics) {
  metricOverall.textContent   = metrics?.overallConfidence   ?? 'N/A';
  metricRetrieval.textContent = metrics?.retrievalConfidence ?? 'N/A';
  metricResponse.textContent  = metrics?.responseConfidence  ?? 'N/A';
  metricMethod.textContent    = metrics?.retrievalMethod     ?? 'N/A';
}

function redirectToQualtrics() {
  fetch('/redirect-to-survey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantID }),
  })
    .then(r => r.text())
    .then(url => { logEvent('redirect', 'Qualtrics Survey'); window.open(url, '_blank'); })
    .catch(() => alert('There was an error redirecting to the survey. Please try again.'));
}

document.getElementById('survey-btn')?.addEventListener('click', redirectToQualtrics);

const participantDisplay = document.getElementById('participant-display');
if (participantDisplay) participantDisplay.textContent = participantID;

function logEvent(type, element) {
  fetch('/log-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      participantID,
      eventType: type,
      elementName: element,
      timestamp: new Date(),
    }),
  });
}

const sendMessage = async () => {
  let userMessage = inputField.value.trim();
  if (userMessage === '') { alert('You submitted an empty message'); return; }
  createChatMessage(userMessage, 'user');
  inputField.value = '';

  try {
    const recentHistory = conversationHistory.slice(-MAX_INTERACTIONS * 2);
    const payload = recentHistory.length === 0
      ? { input: userMessage, retrievalMethod: retrievalMethod.value, participantID, systemID }
      : { history: recentHistory, input: userMessage, participantID, systemID, retrievalMethod: retrievalMethod.value };

    const resp = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const data = await resp.json();
      createChatMessage(data.botResponse, 'assistant', {
        retrievedDocuments: data.retrievedDocuments,
        confidenceMetrics:  data.confidenceMetrics,
        suggestedFollowUps: data.suggestedFollowUps,
      });
      conversationHistory.push({ role: 'user',      content: userMessage });
      conversationHistory.push({ role: 'assistant', content: data.botResponse });
    } else {
      console.error('Failed to fetch response from server');
    }
  } catch (err) {
    console.error('Fetch response from server: ', err);
  }
};

const loadChatHistory = async () => {
  try {
    const resp = await fetch('/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantID, limit: MAX_INTERACTIONS }),
    });
    if (!resp.ok) { console.error('Failed to load chat history'); return; }
    const history = await resp.json();
    if (history.interactions?.length > 0) {
      history.interactions.forEach((interaction) => {
        createChatMessage(interaction.userInput, 'user');
        createChatMessage(interaction.botResponse, 'assistant', {
          retrievedDocuments: interaction.retrievedDocuments,
          confidenceMetrics:  interaction.confidenceMetrics,
        });
        conversationHistory.push({ role: 'user',      content: interaction.userInput });
        conversationHistory.push({ role: 'assistant', content: interaction.botResponse });
      });
    }
  } catch (err) {
    console.error('Error loading chat history:', err);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadChatHistory();
  loadDocuments();
  if (document.getElementById('session-list'))      sessionMgr.init();
  if (document.getElementById('concept-map-area'))  conceptMap.init();
});

closeRagBtn?.addEventListener('click', () => {
  ragPanel.classList.remove('is-open');
  ragPanel.setAttribute('aria-hidden', 'true');
});

sendBtn?.addEventListener('click', () => { logEvent('click', 'SendButton'); sendMessage(); });
inputField?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { logEvent('keydown', 'UserInput'); sendMessage(); }
});
sendBtn?.addEventListener('mouseenter', () => logEvent('hover', 'SendButton'));
inputField?.addEventListener('focus', ()  => logEvent('focus', 'UserInput'));
retrievalMethod?.addEventListener('change', () => logEvent('change', 'RetrievalMethodDropdown'));
retrievalMethod?.addEventListener('focus',  () => logEvent('focus',  'RetrievalMethodDropdown'));

/* File name display */
fileInput?.addEventListener('change', () => {
  const display = document.getElementById('file-name-display');
  if (display) display.textContent = fileInput.files[0]?.name || 'No file chosen';
  logEvent('click', 'FileInput');
});

/* Upload inline button triggers file input */
document.getElementById('upload-inline-btn')?.addEventListener('click', () => {
  fileInput?.click();
});

/* Attach button also triggers file input */
document.getElementById('attach-btn')?.addEventListener('click', () => {
  fileInput?.click();
  logEvent('click', 'AttachButton');
});

uploadBtn?.addEventListener('click', async () => {
  const file = fileInput?.files[0];
  if (!file) { alert('Please choose a file first.'); return; }
  console.log('Selected file: ' + file.name);
  const formData = new FormData();
  formData.append('document', file);
  const response = await fetch('/upload-document', { method: 'POST', body: formData });
  await response.json();
  await loadDocuments();
  logEvent('click', 'UploadButton');
});
uploadBtn?.addEventListener('mouseenter', () => logEvent('hover', 'UploadButton'));

async function loadDocuments() {
  const response = await fetch('/documents');
  const docs = await response.json();
  const documentsList = document.getElementById('uploaded-docs');
  documentsList.innerHTML = '';
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
    const span = document.createElement('span');
    span.textContent = `${doc.filename} ${doc.processingStatus}`;
    item.appendChild(span);
    documentsList.appendChild(item);
  });
}
