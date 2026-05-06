const params = new URLSearchParams(window.location.search);
const participantID = params.get('participantID') || localStorage.getItem('participantID');
const systemID = params.get('systemID');

// Null guards for elements only present on other pages
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

const inputField        = document.getElementById('user-input');
const sendBtn           = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');
const retrievalMethod   = document.getElementById('retrieval-method');
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

/* ─────────────────────────────────────────────────────
   Concept Map
───────────────────────────────────────────────────── */
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

    // Click on empty canvas to add node/note
    this.area.addEventListener('click', (e) => {
      const target = e.target;
      if (target === this.area || target === this.nodesContainer || target === this.hint) {
        if (this.activeTool === 'node' || this.activeTool === 'note') {
          const rect = this.area.getBoundingClientRect();
          this.addNode(e.clientX - rect.left, e.clientY - rect.top, this.activeTool, null);
        }
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
    // Enable SVG pointer events only in delete mode (for clicking links)
    if (this.svg) this.svg.style.pointerEvents = tool === 'delete' ? 'all' : 'none';
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
    if (this.nodes.length === 1) el.classList.add('node-primary');
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

    // Drag
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

  deleteConnection(key) {
    this.connections = this.connections.filter(c => c.key !== key);
    this.updateConnections();
  },

  updateConnections() {
    this.svg.innerHTML = '';
    this.connections.forEach(conn => {
      const from = this.nodes.find(n => n.id === conn.from);
      const to   = this.nodes.find(n => n.id === conn.to);
      if (!from || !to) return;

      // Visible line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x);   line.setAttribute('y2', to.y);
      line.setAttribute('stroke', '#b0b8cc');
      line.setAttribute('stroke-width', '1.5');
      line.style.pointerEvents = 'none';
      this.svg.appendChild(line);

      // Wider transparent hit target for clicking/deleting
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hit.setAttribute('x1', from.x); hit.setAttribute('y1', from.y);
      hit.setAttribute('x2', to.x);   hit.setAttribute('y2', to.y);
      hit.setAttribute('stroke', '#000');
      hit.setAttribute('stroke-width', '16');
      hit.setAttribute('opacity', '0');
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', (e) => {
        if (this.activeTool === 'delete') {
          e.stopPropagation();
          this.deleteConnection(conn.key);
        }
      });
      this.svg.appendChild(hit);
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

  saveState() {
    return {
      nodes: this.nodes.map(n => ({ ...n })),
      connections: this.connections.map(c => ({ ...c })),
      nodeIdCounter: this.nodeIdCounter,
    };
  },

  loadState(state) {
    if (!this.nodesContainer) return;
    this.nodesContainer.innerHTML = '';
    this.svg.innerHTML = '';
    this.nodes = (state.nodes || []).map(n => ({ ...n }));
    this.connections = (state.connections || []).map(c => ({ ...c }));
    this.nodeIdCounter = state.nodeIdCounter || 0;
    this.nodes.forEach(node => this.renderNode(node));
    this.updateConnections();
    if (this.hint) this.hint.style.display = this.nodes.length === 0 ? '' : 'none';
  },
};

/* ─────────────────────────────────────────────────────
   Session Management
───────────────────────────────────────────────────── */
// Per-session state: messages (for UI recreation) and conversationHistory (for API)
const sessionMessages     = []; // {role, content, metadata}
const conversationHistory = [];

const sessionMgr = {
  sessions: [],
  activeId: null,

  init() {
    const saved = localStorage.getItem('sc_sessions');
    if (saved) this.sessions = JSON.parse(saved);
    this.activeId = localStorage.getItem('sc_activeSession');
    if (this.sessions.length === 0) {
      this.create('Session 1', false);
    } else {
      this.render();
    }

    document.getElementById('new-session-btn')?.addEventListener('click', () => {
      const name = prompt('Session name:', 'New Session');
      if (name) { this.create(name, true); logEvent('click', 'NewSession'); }
    });

    document.getElementById('clear-session-btn')?.addEventListener('click', () => {
      if (confirm('Clear chat for this session? (Concept map will be kept.)')) {
        messagesContainer.innerHTML = '';
        conversationHistory.length = 0;
        sessionMessages.length = 0;
        this._persist(); // save cleared state, map unchanged
        logEvent('click', 'ClearSession');
      }
    });
  },

  create(name, switchTo = true) {
    const id = 'sess-' + Date.now();
    this.sessions.push({ id, name });
    if (!this.activeId) this.activeId = id;
    this._saveIndex();
    this.render();
    if (switchTo) this.setActive(id);
  },

  setActive(id) {
    if (this.activeId && this.activeId !== id) {
      this._persist(); // save current session before switching
    }
    this.activeId = id;
    this._saveIndex();

    // Restore target session
    const data = this._load(id);
    messagesContainer.innerHTML = '';
    conversationHistory.length = 0;
    sessionMessages.length = 0;

    if (data) {
      (data.messages || []).forEach(m => {
        _renderMessage(m.content, m.role, m.metadata);
      });
      conversationHistory.push(...(data.conversationHistory || []));
      sessionMessages.push(...(data.messages || []));
      conceptMap.loadState(data.mapState || {});
    } else {
      conceptMap.loadState({});
    }

    this.render();
  },

  _persist() {
    if (!this.activeId) return;
    const data = {
      messages: [...sessionMessages],
      conversationHistory: [...conversationHistory],
      mapState: conceptMap.saveState(),
    };
    localStorage.setItem('sc_data_' + this.activeId, JSON.stringify(data));
  },

  _load(id) {
    const raw = localStorage.getItem('sc_data_' + id);
    return raw ? JSON.parse(raw) : null;
  },

  _saveIndex() {
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

/* ─────────────────────────────────────────────────────
   AI Message Helpers
───────────────────────────────────────────────────── */
function generateFollowUps(text) {
  const concept = extractConceptLabel(text);

  if (!concept || concept === 'Concept') {
    return [
      'Can you explain this in simpler terms?',
      'Give me a concrete example.',
      'How does this apply in practice?',
    ];
  }

  return [
    `Can you explain ${concept} in simpler terms?`,
    `Can you give a concrete example of ${concept}?`,
    `When would I use ${concept} in practice?`,
  ];
}


function generateSupplemental(text) {
  // Return the last complete sentence as a simplified takeaway
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length >= 2) {
    return sentences[sentences.length - 1].trim();
  }
  return 'Try the depth buttons above to explore a quick answer, deep dive, or example.';
}
function extractConceptLabel(text) {
  const cleaned = String(text || '')
    .replace(/[’]/g, "'")
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Concept';

  const working = cleaned
    .replace(/^(?:certainly|sure|absolutely|definitely|of course|yes)[!,.]?\s*/i, '')
    .replace(/^(?:here's|here is)\s+(?:a|an)\s+(?:quick answer|brief explanation|simple explanation|detailed explanation|detailed deep dive|deep dive|overview|summary)\s+(?:into|of|on|about)\s+(?:how\s+)?/i, '')
    .trim();

  const acronymWithExpansion = working.match(/\b([A-Z]{2,}(?:\s*\([^)]+\))?)/);
  if (acronymWithExpansion) return acronymWithExpansion[1].trim();

  const firstClause = (working.match(/^[^:.!?]+/)?.[0] || working).trim();

  const patterns = [
    /^(.+?)\s+(?:is|are|was|were|refers to|means|describes|involves|happens when|occurs when|reduces|improves|helps|allows|enables|uses|transforms|captures|makes|provides|shows|works)\b/i,
    /^(.+?)\s*:/,
  ];

  for (const pattern of patterns) {
    const match = firstClause.match(pattern);
    if (!match) continue;

    const candidate = match[1]
      .replace(/^(?:a|an|the|how)\s+/i, '')
      .replace(/^[^A-Za-z0-9(]+|[^A-Za-z0-9)]+$/g, '')
      .trim();

    if (candidate && !/^(?:it|this|that|they|these|those|here)$/i.test(candidate)) {
      return candidate.split(/\s+/).slice(0, 6).join(' ');
    }
  }

  const capitalizedPhrase = firstClause.match(
    /\b(?:[A-Z][a-zA-Z0-9+-]*|[A-Z]{2,})(?:\s+(?:[A-Z][a-zA-Z0-9+-]*|[A-Z]{2,}|\([^)]+\))){0,5}\b/
  );
  if (capitalizedPhrase) return capitalizedPhrase[0].trim();

  const keywords = firstClause
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word && !/^(?:a|an|the|this|that|these|those|it|is|are|was|were|to|of|in|on|for|with|by|as|at|from|and|or|but|how|here|s|certainly|sure|absolutely|definitely|course|yes)$/i.test(word));

  return keywords.slice(0, 4).join(' ') || 'Concept';
}



/* ─────────────────────────────────────────────────────
   Message Rendering
   _renderMessage is the raw DOM builder (no side-effects on session state).
   createChatMessage wraps it and also records to sessionMessages.
───────────────────────────────────────────────────── */
function _renderMessage(message, role, metadata = null) {
  const elem = document.createElement('div');
  elem.classList.add('message', role);

  // ── User bubble ──
  if (role === 'user') {
    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    bubble.textContent = message;
    elem.appendChild(bubble);
    messagesContainer.appendChild(elem);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return;
  }

  // ── Assistant: main bubble with optional evidence tag ──
  const bubble = document.createElement('div');
  bubble.classList.add('bubble');

  const hasDocs = metadata?.retrievedDocuments?.length > 0;
  if (hasDocs) {
    const tag = document.createElement('div');
    tag.className = 'evidence-tag';
    tag.textContent = '📎 From your document';
    bubble.appendChild(tag);
  }

  const textEl = document.createElement('p');
  textEl.textContent = message;
  bubble.appendChild(textEl);
  elem.appendChild(bubble);

  // ── Supplemental learning bubble ──
  const suppDiv = document.createElement('div');
  suppDiv.className = 'supp-bubble';
  const suppTag = document.createElement('div');
  suppTag.className = 'supp-tag';
  suppTag.textContent = '✦ Additional learning support';
  const suppText = document.createElement('p');
  suppText.textContent = metadata?.supplementalResponse || generateSupplemental(message);
  suppDiv.appendChild(suppTag);
  suppDiv.appendChild(suppText);
  elem.appendChild(suppDiv);

  // ── Depth selector + Add to Concept Map ──
  const depthRow = document.createElement('div');
  depthRow.className = 'depth-selector';

  [['Quick Answer', 'Give me a quick, concise answer about: '],
   ['Deep Dive',    'Give me a detailed deep dive on: '],
   ['Show Example', 'Show me a concrete example of: ']].forEach(([label, prefix]) => {
    const btn = document.createElement('button');
    btn.className = 'depth-btn';
    btn.textContent = label;
    btn.addEventListener('click', async () => {
      const topic = message.split(' ').slice(0, 8).join(' ');
      const prompt = prefix + topic + '...';

      depthRow.querySelectorAll('.depth-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      logEvent('click', 'DepthButton_' + label.replace(/\s/g, ''));

      await sendMessage(prompt, label);
    });

    depthRow.appendChild(btn);
  });

  const mapBtn = document.createElement('button');
  mapBtn.className = 'add-to-map-btn';
  mapBtn.textContent = '+ Add to Concept Map';
  mapBtn.addEventListener('click', () => {
    const topic = extractConceptLabel(message);
    conceptMap.addFromChat(topic || 'Concept');
    logEvent('click', 'AddToConceptMap');
  });
  depthRow.appendChild(mapBtn);
  elem.appendChild(depthRow);

  // ── Evidence link (opens RAG panel) ──
  if (hasDocs || metadata?.confidenceMetrics) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    const evidenceBtn = document.createElement('button');
    evidenceBtn.type = 'button';
    evidenceBtn.className = 'evidence-toggle';
    evidenceBtn.textContent = 'View evidence';
    evidenceBtn.addEventListener('click', () => {
      renderRetrievedEvidence(metadata?.retrievedDocuments || []);
      renderConfidenceMetrics(metadata?.confidenceMetrics || null);
      ragPanel.classList.add('is-open');
      ragPanel.setAttribute('aria-hidden', 'false');
    });
    actions.appendChild(evidenceBtn);
    elem.appendChild(actions);
  }

  // ── Suggested next steps (always 3) ──
  const followUps = metadata?.suggestedFollowUps?.length
    ? metadata.suggestedFollowUps
    : generateFollowUps(message);

  const stepsDiv = document.createElement('div');
  stepsDiv.className = 'suggested-steps';
  const stepsLabel = document.createElement('span');
  stepsLabel.className = 'suggested-label';
  stepsLabel.textContent = 'Suggested Next Steps';
  stepsDiv.appendChild(stepsLabel);

  followUps.slice(0, 3).forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'suggested-item';
    btn.textContent = '→  ' + q;
    btn.addEventListener('click', () => {
      inputField.value = q;
      autoGrow();
      inputField.focus();
      logEvent('click', 'SuggestedFollowUp');
    });
    stepsDiv.appendChild(btn);
  });
  elem.appendChild(stepsDiv);

  messagesContainer.appendChild(elem);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

const createChatMessage = (message, role, metadata = null) => {
  _renderMessage(message, role, metadata);
  sessionMessages.push({ role, content: message, metadata });
};

/* ─────────────────────────────────────────────────────
   Evidence / Metrics rendering
───────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────
   Send Message
───────────────────────────────────────────────────── */
const sendMessage = async (messageOverride = null, displayMessageOverride = null) => {
  const userMessage = (messageOverride ?? inputField.value).trim();
  const displayMessage = (displayMessageOverride ?? userMessage).trim();

  if (!userMessage) { alert('You submitted an empty message'); return; }

  createChatMessage(displayMessage, 'user');

  if (messageOverride === null) {
    inputField.value = '';
    autoGrow();
  }

  sessionMgr._persist();

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
        confidenceMetrics: data.confidenceMetrics,
        suggestedFollowUps: data.suggestedFollowUps,
        supplementalResponse: data.supplementalResponse,
      });
      conversationHistory.push({ role: 'user', content: userMessage });
      conversationHistory.push({ role: 'assistant', content: data.botResponse });
      sessionMgr._persist();
    } else {
      console.error('Failed to fetch response from server');
    }
  } catch (err) {
    console.error('Fetch response from server: ', err);
  }
};



/* ─────────────────────────────────────────────────────
   Chat History (load on page open)
───────────────────────────────────────────────────── */
const loadChatHistory = async () => {
  try {
    const resp = await fetch('/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantID, limit: MAX_INTERACTIONS }),
    });
    if (!resp.ok) return;
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

/* ─────────────────────────────────────────────────────
   Documents
───────────────────────────────────────────────────── */
async function loadDocuments() {
  const response = await fetch('/documents');
  const docs = await response.json();

  const dropdown  = document.getElementById('uploaded-docs');
  const countEl   = document.getElementById('docs-count');
  if (countEl) countEl.textContent = docs.length ? `(${docs.length})` : '';

  dropdown.innerHTML = '';
  if (docs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'docs-empty';
    empty.textContent = 'No documents uploaded yet';
    dropdown.appendChild(empty);
    return;
  }
  docs.forEach((doc) => {
    const item = document.createElement('div');
    item.className = 'doc-item';
    const span = document.createElement('span');
    span.textContent = `${doc.filename}${doc.processingStatus ? ' — ' + doc.processingStatus : ''}`;
    item.appendChild(span);
    dropdown.appendChild(item);
  });
}

/* ─────────────────────────────────────────────────────
   File Staging (attach → bubble → upload)
───────────────────────────────────────────────────── */
let stagedFiles = [];
const stagingArea      = document.getElementById('file-staging-area');
const stagedFilesEl    = document.getElementById('staged-files');
const uploadStagedBtn  = document.getElementById('upload-staged-btn');

function showStagingArea() { stagingArea?.classList.add('visible'); }
function hideStagingArea() {
  stagingArea?.classList.remove('visible');
  if (stagedFilesEl) stagedFilesEl.innerHTML = '';
}

function addStagedFileBubble(file) {
  const idx = stagedFiles.length - 1;
  const bubble = document.createElement('div');
  bubble.className = 'staged-file-bubble';
  bubble.dataset.idx = idx;

  const nameSpan = document.createElement('span');
  nameSpan.textContent = file.name;

  const xBtn = document.createElement('button');
  xBtn.className = 'staged-file-remove';
  xBtn.textContent = '×';
  xBtn.setAttribute('aria-label', 'Remove file');

  let hoverTimer = null;
  bubble.addEventListener('mouseenter', () => {
    hoverTimer = setTimeout(() => xBtn.classList.add('visible'), 2000);
  });
  bubble.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    xBtn.classList.remove('visible');
  });

  xBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const i = parseInt(bubble.dataset.idx, 10);
    stagedFiles.splice(i, 1);
    bubble.remove();
    // Re-index remaining bubbles
    stagedFilesEl.querySelectorAll('.staged-file-bubble').forEach((b, newI) => {
      b.dataset.idx = newI;
    });
    if (stagedFiles.length === 0) hideStagingArea();
  });

  bubble.appendChild(nameSpan);
  bubble.appendChild(xBtn);
  stagedFilesEl.appendChild(bubble);
  showStagingArea();
}

fileInput?.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  stagedFiles.push(file);
  addStagedFileBubble(file);
  fileInput.value = ''; // reset so same file can be re-added
  logEvent('click', 'FileAttached');
});

// attach-btn → open file picker
document.getElementById('attach-btn')?.addEventListener('click', () => {
  fileInput?.click();
  logEvent('click', 'AttachButton');
});

// Upload staged files
uploadStagedBtn?.addEventListener('click', async () => {
  if (stagedFiles.length === 0) return;
  for (const file of stagedFiles) {
    const formData = new FormData();
    formData.append('document', file);
    await fetch('/upload-document', { method: 'POST', body: formData });
  }
  stagedFiles = [];
  hideStagingArea();
  await loadDocuments();
  logEvent('click', 'UploadStagedFiles');
});

/* ─────────────────────────────────────────────────────
   Auto-growing textarea
───────────────────────────────────────────────────── */
function autoGrow() {
  if (!inputField) return;
  inputField.style.height = 'auto';
  const lineH  = parseFloat(getComputedStyle(inputField).lineHeight) || 20;
  const maxH   = lineH * 10 + 16; // 10 rows + padding
  inputField.style.height = Math.min(inputField.scrollHeight, maxH) + 'px';
  inputField.style.overflowY = inputField.scrollHeight > maxH ? 'auto' : 'hidden';
}
inputField?.addEventListener('input', autoGrow);

/* ─────────────────────────────────────────────────────
   Docs dropdown toggle
───────────────────────────────────────────────────── */
document.getElementById('docs-toggle')?.addEventListener('click', () => {
  const dropdown = document.getElementById('uploaded-docs');
  const btn      = document.getElementById('docs-toggle');
  const isOpen   = dropdown.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  const arrow = btn.querySelector('.docs-arrow');
  if (arrow) arrow.textContent = isOpen ? '↓' : '→';
});

/* ─────────────────────────────────────────────────────
   Survey / Participant display
───────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────
   Event logging
───────────────────────────────────────────────────── */
function logEvent(type, element) {
  fetch('/log-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantID, eventType: type, elementName: element, timestamp: new Date() }),
  });
}

/* ─────────────────────────────────────────────────────
   Input listeners
───────────────────────────────────────────────────── */
closeRagBtn?.addEventListener('click', () => {
  ragPanel.classList.remove('is-open');
  ragPanel.setAttribute('aria-hidden', 'true');
});

sendBtn?.addEventListener('click', () => { logEvent('click', 'SendButton'); sendMessage(); });

inputField?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    logEvent('keydown', 'UserInput');
    sendMessage();
  }
});

sendBtn?.addEventListener('mouseenter',    () => logEvent('hover',  'SendButton'));
inputField?.addEventListener('focus',      () => logEvent('focus',  'UserInput'));
retrievalMethod?.addEventListener('change',() => logEvent('change', 'RetrievalMethodDropdown'));
retrievalMethod?.addEventListener('focus', () => logEvent('focus',  'RetrievalMethodDropdown'));

/* ─────────────────────────────────────────────────────
   Init on DOM ready
───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('concept-map-area')) conceptMap.init();
  if (document.getElementById('session-list'))     sessionMgr.init();
  loadChatHistory();
  loadDocuments();
});
