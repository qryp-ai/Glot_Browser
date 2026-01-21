(() => {
  const ENDPOINT = 'http://127.0.0.1:8000/run-agent';
  const STREAM_ENDPOINT = 'http://127.0.0.1:8000/run-agent-stream';
  const HEALTHZ = 'http://127.0.0.1:8000/healthz';
  const MESSAGES_KEY = 'chatHistory';
  const CONVERSATIONS_KEY = 'chatConversations';

  const els = {
    statusDot: document.getElementById('statusDot'),
    messages: document.getElementById('messages'),
    prompt: document.getElementById('prompt'),
    send: document.getElementById('send'),
    clear: document.getElementById('clearChat'),
    status: document.getElementById('status'),
    openSettings: document.getElementById('openSettings'),
    closeSettings: document.getElementById('closeSettings'),
    drawer: document.getElementById('settingsDrawer'),
    apiKey: document.getElementById('apiKey'),
    provider: document.getElementById('provider'),
    model: document.getElementById('model'),
    allowedDomains: document.getElementById('allowedDomains'),
    enableAllSites: document.getElementById('enableAllSites'),
    keepOpen: document.getElementById('keepOpen'),
    saveSettings: document.getElementById('saveSettings'),
    resetSettings: document.getElementById('resetSettings'),
    // Document uploader UI
    dropZone: document.getElementById('dropZone'),
    chooseFile: document.getElementById('chooseFile'),
    docFile: document.getElementById('docFile'),
    docList: document.getElementById('docList'),
    addDoc: document.getElementById('addDoc'),
  };

  let chat = [];
  let sending = false;
  let apiKey = null;
  let sessionId = null;
  let docListState = [];
  let uploading = false;
  let openingPicker = false;
  let conversations = [];
  let currentConversationId = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    wireUI();
    loadState().then(() => {
      render();
      updateUIState();
      startHealthPing();
      if (!apiKey) setStatus('No API key set. Open settings (gear).');
    });

    // Document uploader wiring
    // Re-query in case DOM changed after initial element cache
    els.addDoc = els.addDoc || document.getElementById('addDoc');
    els.docFile = els.docFile || document.getElementById('docFile');
    els.chooseFile = els.chooseFile || document.getElementById('chooseFile');
    if (els.chooseFile && els.docFile) {
      els.chooseFile.addEventListener('click', () => els.docFile.click());
    }

    if (els.addDoc && els.docFile && !els.addDoc.dataset.bound) {
      els.addDoc.addEventListener('click', onAddDocClick, { passive: false });
      els.addDoc.dataset.bound = '1';
    }
    if (els.docFile && !els.docFile.dataset.bound) {
      els.docFile.addEventListener('change', onDocFileChange);
      els.docFile.dataset.bound = '1';
    }
    if (els.dropZone) {
      const prevent = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      ['dragenter','dragover','dragleave','drop'].forEach(evt => {
        els.dropZone.addEventListener(evt, prevent);
      });
      ['dragenter','dragover'].forEach(evt => {
        els.dropZone.addEventListener(evt, () => els.dropZone.classList.add('dragover'));
      });
      ['dragleave','drop'].forEach(evt => {
        els.dropZone.addEventListener(evt, () => els.dropZone.classList.remove('dragover'));
      });
      els.dropZone.addEventListener('drop', async (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) {
          await uploadFiles(dt.files);
        }
      });
    }
  }

  function saveConversations() {
    chrome.storage.local.set({ [CONVERSATIONS_KEY]: conversations.slice(0, 30) });
  }

  function archiveCurrentChat() {
    try {
      const clean = Array.isArray(chat) ? chat.filter(m => m && typeof m.content === 'string' && !m.typing && m.content.trim()) : [];
      const hasContent = clean.some(m => (m.role === 'user' || m.role === 'assistant') && m.content.trim());
      if (!hasContent) return;
      const firstUser = clean.find(m => m.role === 'user' && m.content.trim());
      const titleSrc = firstUser ? firstUser.content : (clean[0]?.content || 'Conversation');
      let title = String(titleSrc).split('\n')[0].trim();
      if (title.length > 80) title = title.slice(0, 80) + '…';
      if (currentConversationId) {
        const idx = conversations.findIndex(c => c && c.id === currentConversationId);
        if (idx !== -1) {
          const existing = conversations[idx];
          const updated = { ...existing, title, messages: clean };
          conversations.splice(idx, 1);
          conversations.unshift(updated);
          conversations = conversations.slice(0, 30);
          saveConversations();
          return;
        }
        // Fallback: if id not found (e.g., history cleared), create a new one
      }
      {
        const conv = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          createdAt: Date.now(),
          title,
          messages: clean,
        };
        conversations.unshift(conv);
        conversations = conversations.slice(0, 30);
        saveConversations();
      }
    } catch (_) {}
  }

  function renderHistoryList() {
    if (!Array.isArray(conversations) || conversations.length === 0) return;
    const wrap = document.createElement('div');
    wrap.className = 'history-wrap';

    const controls = document.createElement('div');
    controls.className = 'history-controls';
    controls.innerHTML = '<button type="button" class="history-clear-all" title="Clear all">Clear all</button>';
    wrap.appendChild(controls);

    const list = document.createElement('div');
    list.className = 'history-list';
    for (const c of conversations.slice(0, 10)) {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.dataset.id = c.id;
      div.setAttribute('role', 'button');
      div.setAttribute('tabindex', '0');

      const t = document.createElement('div');
      t.className = 'history-title';
      t.textContent = String(c.title || 'Conversation');

      const del = document.createElement('button');
      del.className = 'history-del';
      del.setAttribute('type', 'button');
      del.setAttribute('title', 'Delete');
      del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm-1 6h2v9H8V9zm4 0h2v9h-2V9zm-6 0h2v9H6V9zm10 0h2v9h-2V9z"/></svg>';

      div.appendChild(t);
      div.appendChild(del);
      list.appendChild(div);
    }
    wrap.appendChild(list);
    els.messages.appendChild(wrap);
  }

  function deleteConversation(id) {
    try {
      const before = conversations.length;
      conversations = conversations.filter(c => c && c.id !== id);
      if (conversations.length !== before) {
        saveConversations();
        if (chat.length === 0) {
          render();
        }
      }
    } catch (_) {}
  }

  function clearAllConversations() {
    try {
      if (!Array.isArray(conversations) || conversations.length === 0) return;
      conversations = [];
      saveConversations();
      currentConversationId = null;
      if (chat.length === 0) {
        render();
      }
      setStatus('History cleared');
    } catch (_) {}
  }

  function openConversation(id) {
    try {
      const c = conversations.find(x => x && x.id === id);
      if (!c) return;
      chat = Array.isArray(c.messages) ? c.messages.map(m => ({ role: m.role, content: m.content })) : [];
      sessionId = null; // do not reuse old sessions automatically
      saveChat();
      render();
      setStatus('Loaded conversation');
      currentConversationId = id;
    } catch (_) {}
  }
  
  function wireUI() {
    autoResize(els.prompt);
    els.prompt.addEventListener('input', () => autoResize(els.prompt));
    els.prompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });
    els.send.addEventListener('click', onSend);
    els.clear.addEventListener('click', clearChat);

    // History open/delete/clear-all handler (event delegation)
    els.messages.addEventListener('click', (e) => {
      const clearBtn = e.target.closest('.history-clear-all');
      if (clearBtn) {
        e.preventDefault();
        clearAllConversations();
        return;
      }
      const delBtn = e.target.closest('.history-del');
      if (delBtn) {
        const container = e.target.closest('.history-item');
        if (container && container.dataset && container.dataset.id) {
          e.preventDefault();
          e.stopPropagation();
          deleteConversation(container.dataset.id);
        }
        return;
      }
      const item = e.target.closest('.history-item');
      if (item && item.dataset && item.dataset.id) {
        e.preventDefault();
        openConversation(item.dataset.id);
      }
    });

    els.openSettings.addEventListener('click', openDrawer);
    els.closeSettings.addEventListener('click', closeDrawer);
    els.saveSettings.addEventListener('click', saveSettings);
    els.resetSettings.addEventListener('click', resetSettings);

    // Toggle requests optional <all_urls> at runtime
    els.enableAllSites.addEventListener('change', async (e) => {
      const want = !!e.target.checked;
      if (want) {
        chrome.permissions.request({ origins: ['<all_urls>'] }, (granted) => {
          if (!granted) {
            e.target.checked = false;
            setStatus('All-sites permission was denied.');
          } else {
            chrome.storage.local.set({ enableAllSites: true });
            setStatus('All-sites permission granted.');
          }
        });
      } else {
        chrome.permissions.remove({ origins: ['<all_urls>'] }, (removed) => {
          chrome.storage.local.set({ enableAllSites: false });
          setStatus('All-sites permission removed.');
        });
      }
    });
  }

  function openDrawer() {
    els.drawer.classList.add('open');
    els.drawer.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    els.drawer.classList.remove('open');
    els.drawer.setAttribute('aria-hidden', 'true');
  }

  async function loadState() {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(['apiKey','provider','model','allowedDomains','keepOpen','enableAllSites', MESSAGES_KEY, 'sessionId', 'docList', CONVERSATIONS_KEY], (res) => resolve(res || {}));
    });
    apiKey = data.apiKey || null;
    sessionId = data.sessionId || null;
    if (els.provider) els.provider.value = (data.provider || 'auto');
    if (els.model) els.model.value = (data.model || '');
    if (els.allowedDomains) els.allowedDomains.value = Array.isArray(data.allowedDomains) ? data.allowedDomains.join('\n') : '';
    if (els.keepOpen) els.keepOpen.checked = !!data.keepOpen;

    // reflect current permission state
    chrome.permissions.contains({ origins: ['<all_urls>'] }, (has) => {
      if (els.enableAllSites) els.enableAllSites.checked = !!has;
    });

    chat = Array.isArray(data[MESSAGES_KEY]) ? data[MESSAGES_KEY] : [];
    docListState = Array.isArray(data.docList) ? data.docList : [];
    renderDocList();
    conversations = Array.isArray(data[CONVERSATIONS_KEY]) ? data[CONVERSATIONS_KEY] : [];
  }

  function saveChat() {
    const capped = chat.slice(-50);
    chrome.storage.local.set({ [MESSAGES_KEY]: capped });
  }

  function render() {
    els.messages.innerHTML = '';
    if (chat.length === 0) {
      // Full-width banner; inner layout controlled by panel_welcome.css
      const banner = document.createElement('div');
      banner.className = 'welcome-banner';
      const hasHistory = Array.isArray(conversations) && conversations.length > 0;
      const innerClass = hasHistory ? 'welcome-inner welcome-inline' : 'welcome-inner welcome-centered';
      const historyCTA = hasHistory
        ? '<div class="history-cta"><div class="history-label">Chat history</div><div class="down-indicator" aria-hidden="true"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg></div></div>'
        : '';
      banner.innerHTML = `
        <div class="${innerClass}">
          <img src="${chrome.runtime.getURL('icons/Logo glot.png')}" alt="GlotBrowser Logo" class="logo" />
          <div class="welcome-line">Welcome to</div>
          <div class="brand-line">GlotBrowser AI</div>
          <p class="subtitle">Click the Settings (⚙️) to configure your API key and other settings.<br><br>Once configured, you can ask me to help with tasks on any webpage.</p>
          ${historyCTA}
        </div>
      `;
      
      els.messages.appendChild(banner);
      renderHistoryList();
    } else {
      const items = Array.isArray(chat) ? chat : [];
      for (const m0 of items) {
        const m = (m0 && typeof m0 === 'object') ? m0 : {};
        const role = (m.role === 'user' || m.role === 'assistant') ? m.role : 'assistant';
        const content = (typeof m.content === 'string') ? m.content : '';
        const typingClass = m.typing ? 'typing' : '';
        const item = document.createElement('div');
        item.className = `msg ${role}`;
        item.innerHTML = `<div class="bubble"><p class="${typingClass}">${escapeHTML(content)}</p></div>`;
        els.messages.appendChild(item);
      }
    }
    // Keep scroll at top on welcome screen; scroll to bottom only for active chats
    requestAnimationFrame(() => {
      if (Array.isArray(chat) && chat.length > 0) {
        els.messages.scrollTop = els.messages.scrollHeight + 1000;
      } else {
        els.messages.scrollTop = 0;
      }
    });
  }

  function autoResize(textarea) {
    const MIN = 40;
    const MAX = 96;
    if (!textarea) return;
    // If empty (e.g., on reload), force compact height and exit so it doesn't start tall
    if (!textarea.value || !textarea.value.trim()) {
      textarea.style.height = MIN + 'px';
      updateUIState();
      return;
    }
    textarea.style.height = 'auto';
    const h = Math.min(Math.max(textarea.scrollHeight, MIN), MAX);
    textarea.style.height = h + 'px';
    updateUIState();
  }

  function updateUIState() {
    const hasKey = Boolean(apiKey);
    els.send.disabled = sending || !hasKey || !els.prompt.value.trim();
  }

  function onAddDocClick(e) {
    try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch (_) {}
    if (!els.docFile) return;
    if (openingPicker) return; // prevent duplicate opens
    openingPicker = true;
    try { if (els.addDoc) els.addDoc.disabled = true; } catch(_) {}
    try { els.docFile.value = ''; } catch (_) {}
    const resetIfNoChange = () => setTimeout(() => {
      openingPicker = false;
      try { if (els.addDoc) els.addDoc.disabled = false; } catch(_) {}
    }, 3000);
    try {
      if (typeof els.docFile.showPicker === 'function') {
        els.docFile.showPicker();
        resetIfNoChange();
      } else {
        els.docFile.click();
        resetIfNoChange();
      }
    } catch (_) {
      // Fallback
      try { els.docFile.click(); resetIfNoChange(); } catch (_) { openingPicker = false; }
    }
  }

  async function onDocFileChange(e) {
    const input = e.target;
    const files = input?.files;
    if (!files || files.length === 0) return;
    openingPicker = false; // user completed selection
    try { if (els.addDoc) els.addDoc.disabled = false; } catch(_) {}
    await uploadFiles(files);
    try { input.value = ''; } catch (_) {}
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function saveSessionId() {
    if (sessionId) {
      chrome.storage.local.set({ sessionId });
    }
  }

  function saveDocList() {
    chrome.storage.local.set({ docList: docListState });
  }

  function renderDocList() {
    if (!els.docList) {
      els.docList = document.getElementById('docList');
      if (!els.docList) return;
    }
    els.docList.innerHTML = '';
    if (!docListState.length) return;
    for (const d of docListState) {
      const div = document.createElement('div');
      div.className = 'doc-item';
      const fields = d.fields || {};
      const meta = [];
      if (fields.name) meta.push(`Name: ${escapeHTML(String(fields.name))}`);
      if (fields.email) meta.push(`Email: ${escapeHTML(String(fields.email))}`);
      if (Array.isArray(fields.skills) && fields.skills.length) meta.push(`Skills: ${escapeHTML(fields.skills.slice(0,8).join(', '))}`);
      const metaHtml = meta.length ? `<div class="meta small muted">${meta.join(' • ')}</div>` : '';
      const preview = d.preview ? `<div class="preview">${escapeHTML(String(d.preview))}</div>` : '';
      div.innerHTML = `<div class="title">${escapeHTML(String(d.file || 'Document'))}</div>${metaHtml}${preview}`;
      els.docList.appendChild(div);
    }
  }

  async function uploadFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);
    for (const file of arr) {
      await uploadOne(file);
    }
  }

  async function uploadOne(file) {
    if (uploading) return; // avoid overlapping
    uploading = true;
    const doUpload = async () => {
      const fd = new FormData();
      fd.append('file', file);
      if (sessionId) fd.append('sessionId', sessionId);
      const res = await fetch('http://127.0.0.1:8000/upload-doc', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let info;
      try {
        info = await res.json();
      } catch {
        const txt = await res.text();
        try { info = JSON.parse(txt); } catch { throw new Error('Invalid server response'); }
      }
      if (info.sessionId && !sessionId) {
        sessionId = info.sessionId;
        saveSessionId();
      }
      const docRec = { file: info.file || file.name, fields: info.fields || {}, chars: info.chars || 0, preview: info.preview || '' };
      docListState.push(docRec);
      saveDocList();
      renderDocList();
    };
    try {
      setStatus(`Uploading ${file.name}…`);
      await doUpload();
      setStatus('Document attached');
    } catch (e1) {
      console.warn('Upload error (first attempt):', e1);
      // brief automatic retry once (covers server cold start / transient errors)
      setStatus('Retrying upload…');
      try {
        await new Promise(r => setTimeout(r, 700));
        await doUpload();
        setStatus('Document attached');
      } catch (e2) {
        console.warn('Upload error (retry failed):', e2);
        setStatus('Upload failed');
      }
    } finally {
      uploading = false;
    }
  }

  async function onSend() {
    if (sending) return;
    const text = els.prompt.value.trim();
    if (!text) return;

    // refresh key
    await new Promise((resolve) => chrome.storage.local.get(['apiKey'], (res) => { apiKey = res.apiKey || null; resolve(); }));
    if (!apiKey) {
      setStatus('No API key set. Open settings (gear).');
      updateUIState();
      return;
    }

    sending = true;
    updateUIState();
    setStatus('Sending…');

    const userText = text;
    els.prompt.value = '';
    autoResize(els.prompt);

    chat.push({ role: 'user', content: userText });
    // typing placeholder
    const idx = chat.push({ role: 'assistant', content: '…', typing: true }) - 1;
    render();

    try {
      const settings = await new Promise((resolve) => {
        chrome.storage.local.get(['provider','model','allowedDomains'], (res) => resolve(res || {}));
      });

      // Try streaming first; fallback to non-stream if it fails
      try {
        await streamAgent(userText, idx, settings);
      } catch (streamErr) {
        // Fallback to one-shot
        try { chrome.runtime.sendMessage({ type: 'AGENT_CONTROL', action: 'start' }); } catch (_) {}
        const body = { prompt: userText, apiKey };
        const p = (settings.provider || '').toLowerCase();
        if (p === 'openai' || p === 'google' || p === 'ollama') body.provider = p;
        if (settings.model && typeof settings.model === 'string' && settings.model.trim()) body.model = settings.model.trim();
        if (Array.isArray(settings.allowedDomains) && settings.allowedDomains.length > 0) body.allowedDomains = settings.allowedDomains;
        if (sessionId) body.sessionId = sessionId;
        const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const answer = (data && (data.answer || data.output || data.response)) || 'No response received.';
        chat[idx] = { role: 'assistant', content: answer };
        saveChat();
        render();
        setStatus('Ready');
        try { chrome.runtime.sendMessage({ type: 'AGENT_CONTROL', action: 'done' }); } catch (_) {}
      }
    } catch (err) {
      chat[idx] = { role: 'assistant', content: `Error: ${err.message}` };
      saveChat();
      render();
      setStatus('Request failed');
      try { chrome.runtime.sendMessage({ type: 'AGENT_CONTROL', action: 'done' }); } catch (_) {}
    } finally {
      sending = false;
      updateUIState();
    }
  }

  async function streamAgent(userText, placeholderIndex, settings) {
    setStatus('Agent running…');
    try { chrome.runtime.sendMessage({ type: 'AGENT_CONTROL', action: 'start' }); } catch (_) {}
    const body = { prompt: userText, apiKey };
    const p = (settings.provider || '').toLowerCase();
    if (p === 'openai' || p === 'google' || p === 'ollama') body.provider = p;
    if (settings.model && typeof settings.model === 'string' && settings.model.trim()) body.model = settings.model.trim();
    if (Array.isArray(settings.allowedDomains) && settings.allowedDomains.length > 0) body.allowedDomains = settings.allowedDomains;
    if (sessionId) body.sessionId = sessionId;

    const res = await fetch(STREAM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Process SSE chunks separated by double newlines
      let idxSep;
      while ((idxSep = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, idxSep);
        buffer = buffer.slice(idxSep + 2);
        const lines = rawEvent.split('\n');
        let evType = 'message';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event:')) evType = line.slice(6).trim();
          else if (line.startsWith('data: ')) dataStr += line.slice(6).trim();
          else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
        }
        if (evType === 'done') {
          setStatus('Ready');
          try { chrome.runtime.sendMessage({ type: 'AGENT_CONTROL', action: 'done' }); } catch (_) {}
          return;
        }
        if (dataStr) {
          try {
            const obj = JSON.parse(dataStr);
            if (obj.type === 'log' && obj.level === 'INFO') {
              // Only allow Agent/Tools logs
              const ch = (obj.channel || '').toLowerCase();
              const logger = (obj.logger || '').toLowerCase();
              const isAgentOrTools = (ch === 'agent' || ch === 'tools' || logger.includes('agent') || logger.includes('tools') || logger === 'agent' || logger === 'tools');
              if (!isAgentOrTools) {
                continue; // skip non-agent/tools logs like 'bubus', 'service', http logs, etc.
              }
              // Replace-only: show only latest message content of INFO logs (sanitized)
              const text = (typeof obj.message === 'string' && obj.message) || '';
              const clean = sanitizeThinking(text);
              // Replace-only: even if clean is empty (e.g., pure 'Step 1' line), overwrite
              chat[placeholderIndex] = { role: 'assistant', content: clean, typing: true };
              render();
            } else if (obj.type === 'final') {
              chat[placeholderIndex] = { role: 'assistant', content: (obj.answer || obj.message || 'No response received.') };
              saveChat();
              render();
              setStatus('Ready');
              try { chrome.runtime.sendMessage({ type: 'AGENT_CONTROL', action: 'done' }); } catch (_) {}
            } else if (obj.type === 'error') {
              chat[placeholderIndex] = { role: 'assistant', content: `Error: ${obj.error}` };
              saveChat();
              render();
              setStatus('Request failed');
              try { chrome.runtime.sendMessage({ type: 'AGENT_CONTROL', action: 'done' }); } catch (_) {}
            }
          } catch (_) {
            // Ignore parse errors
          }
        }
      }
    }
  }

  async function clearChat() {
    try {
      // Archive current chat into local conversation history
      archiveCurrentChat();
      // Clear server-side session (documents) if we have one
      if (sessionId) {
        try {
          await fetch('http://127.0.0.1:8000/clear-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          });
        } catch (e) { /* ignore */ }
      }

      // Clear local chat and document list
      chat = [];
      docListState = [];
      saveChat();
      saveDocList();
      renderDocList();

      // Reset session id
      sessionId = null;
      chrome.storage.local.remove(['sessionId']);

      // Re-render chat
      render();
      setStatus('Cleared chat and documents');
    } catch (e) {
      setStatus('Clear failed');
    }
  }

  async function saveSettings() {
    const key = (els.apiKey.value || '').trim();
    const provider = els.provider?.value || 'auto';
    const model = (els.model?.value || '').trim();
    const domainsText = (els.allowedDomains?.value || '').trim();
    const allowedDomains = domainsText ? domainsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    const keepOpen = !!els.keepOpen?.checked;

    const payload = { provider, model, allowedDomains, keepOpen };
    if (key) payload.apiKey = key;

    // Store original button text and show "Saved"
    const originalText = els.saveSettings.textContent;
    els.saveSettings.textContent = 'Saved';
    els.saveSettings.disabled = true;

    chrome.storage.local.set(payload, () => {
      if (key) apiKey = key;
      setStatus('Settings saved.');
      updateUIState();
      
      // Revert button text after 1.5 seconds
      setTimeout(() => {
        els.saveSettings.textContent = originalText;
        els.saveSettings.disabled = false;
      }, 1500);
    });
  }

  function resetSettings() {
    els.apiKey.value = '';
    els.provider.value = 'auto';
    els.model.value = '';
    els.allowedDomains.value = '';
    els.keepOpen.checked = false;
    els.enableAllSites.checked = false;
    chrome.storage.local.remove(['apiKey','provider','model','allowedDomains','keepOpen','enableAllSites'], () => setStatus('Settings reset.'));
    chrome.permissions.remove({ origins: ['<all_urls>'] }, () => {});
  }

  function startHealthPing() {
    const tick = async () => {
      try {
        const res = await fetch(HEALTHZ, { cache: 'no-store' });
        const ok = res.ok;
        setDot(ok);
      } catch (e) {
        setDot(false);
      }
      setTimeout(tick, 10000);
    };
    tick();
  }

  function setDot(online) {
    els.statusDot.classList.toggle('online', !!online);
    els.statusDot.classList.toggle('offline', !online);
    els.statusDot.title = online ? 'Connected' : 'Offline';
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Remove emojis and common step/bullet prefixes from agent thinking logs
  function sanitizeThinking(text) {
    if (!text) return '';
    // Remove most emoji and pictographs, dingbats, misc symbols
    let s = text.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0E}-\u{FE0F}]/gu, '');
    // Strip ANSI escape codes like \x1b[32m and similar CSI sequences
    s = s.replace(/[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    // Also remove arrow-left encoded sequences like '←[32m' and '←[0m'
    s = s.replace(/[\u2190]\[[0-9;]*[A-Za-z]/g, '');
    // Remove leading 'INFO [Agent]' if present (safety)
    s = s.replace(/^\s*INFO\s*\[Agent\]\s*/i, '');
    // Remove leading 'Step X', 'Step X/Y', numeric bullets like '1.', '1)', '(1)' and common bullets
    s = s.replace(/^(?:\s*[>*\-–—•\u2022\u2023\u25E6\u2043\u2219])?\s*(?:step\s*\d+(?:\s*\/\s*\d+)?\s*[:\-.)]?\s*)/i, '');
    s = s.replace(/^\s*(?:\(?\d+\)?[\.)\-:])\s*/i, '');
    return s.trim();
  }
})();
