(() => {
  const MESSAGES_KEY = 'chatHistory';
  const ENDPOINT = 'http://127.0.0.1:8000/run-agent';

  const els = {
    messages: document.getElementById('messages'),
    prompt: document.getElementById('prompt'),
    send: document.getElementById('send'),
    clear: document.getElementById('clearChat'),
    status: document.getElementById('status'),
    banner: document.getElementById('keyWarning'),
    goToSettings: document.getElementById('goToSettings'),
    openOptions: document.getElementById('openOptions'),
  };

  let apiKey = null;
  let sending = false;
  let chat = [];

  // Init
  document.addEventListener('DOMContentLoaded', init);
  function init() {
    autoResize(els.prompt);
    els.prompt.addEventListener('input', () => autoResize(els.prompt));

    els.send.addEventListener('click', onSend);
    els.clear.addEventListener('click', clearChat);

    // Enter to send, Shift+Enter for newline
    els.prompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });

    // Open options
    const openOpts = () => chrome.runtime.openOptionsPage();
    els.goToSettings?.addEventListener('click', openOpts);
    els.openOptions?.addEventListener('click', openOpts);

    // Event delegation for copy buttons
    els.messages.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-copy]');
      if (!btn) return;
      const content = btn.closest('.bubble')?.querySelector('p')?.innerText || '';
      if (!content) return;
      navigator.clipboard.writeText(content).then(() => {
        btn.dataset.copied = '1';
        const prev = btn.innerHTML;
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20.3 7.7l-1.4-1.4z"/></svg>';
        setTimeout(() => { btn.innerHTML = prev; btn.dataset.copied = '0'; }, 1200);
      });
    });

    // Load state
    Promise.all([
      getApiKey(),
      loadChat(),
    ]).then(() => {
      render();
      updateUIState();
      if (!apiKey) showKeyBanner(true);
    });
  }

  function showKeyBanner(show) {
    if (show) els.banner?.classList.remove('hidden');
    else els.banner?.classList.add('hidden');
  }

  function setStatus(text, spinner = false) {
    els.status.textContent = text;
    els.status.previousSpinner?.remove?.();
    if (spinner) {
      const s = document.createElement('span');
      s.className = 'spinner';
      els.status.before(s);
      els.status.previousSpinner = s;
    }
  }

  function updateUIState() {
    const hasKey = Boolean(apiKey);
    els.send.disabled = sending || !hasKey || !els.prompt.value.trim();
    showKeyBanner(!hasKey);
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    updateUIState();
  }

  async function getApiKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['apiKey'], (res) => {
        apiKey = res.apiKey || null;
        resolve(apiKey);
      });
    });
  }

  async function loadChat() {
    return new Promise((resolve) => {
      chrome.storage.local.get([MESSAGES_KEY], (res) => {
        chat = Array.isArray(res[MESSAGES_KEY]) ? res[MESSAGES_KEY] : [];
        resolve(chat);
      });
    });
  }

  function saveChat() {
    const capped = chat.slice(-30); // keep last 30 messages
    chrome.storage.local.set({ [MESSAGES_KEY]: capped });
  }

  function render() {
    els.messages.innerHTML = '';
    if (chat.length === 0) {
      const intro = document.createElement('div');
      intro.className = 'msg assistant';
      intro.innerHTML = `<div class="bubble"><p>Hi! I’m your AI assistant. Ask me anything.</p></div>`;
      els.messages.appendChild(intro);
    } else {
      for (const m of chat) {
        const item = document.createElement('div');
        item.className = `msg ${m.role}`;
        const safe = escapeHTML(m.content || '');
        const tools = m.role === 'assistant' ? `<div class="tools"><button class="tool-btn" data-copy title="Copy"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button></div>` : '';
        item.innerHTML = `<div class="bubble"><p>${safe}</p>${tools}</div>`;
        els.messages.appendChild(item);
      }
    }
    requestAnimationFrame(() => {
      els.messages.scrollTop = els.messages.scrollHeight + 1000;
    });
  }

  function addMessage(role, content) {
    chat.push({ role, content, ts: Date.now() });
    saveChat();
    render();
  }

  async function onSend() {
    if (sending) return;
    const text = els.prompt.value.trim();
    if (!text) return;

    // Ensure key is fresh
    await getApiKey();
    if (!apiKey) {
      setStatus('No API key set. Open Settings.');
      updateUIState();
      return;
    }

    sending = true;
    updateUIState();
    setStatus('Sending…', true);

    const userText = text;
    els.prompt.value = '';
    autoResize(els.prompt);

    addMessage('user', userText);

    // Show typing placeholder
    const typingIdx = chat.length;
    chat.push({ role: 'assistant', content: '…', typing: true });
    render();

    try {
      // Load optional settings for provider/model/allowedDomains
      const { provider, model, allowedDomains } = await new Promise((resolve) => {
        chrome.storage.local.get(['provider', 'model', 'allowedDomains'], (res) => resolve(res || {}));
      });

      const body = { prompt: userText, apiKey };
      const p = (provider || '').toLowerCase();
      if (p === 'openai' || p === 'google') body.provider = p;
      if (model && typeof model === 'string' && model.trim()) body.model = model.trim();
      if (Array.isArray(allowedDomains) && allowedDomains.length > 0) body.allowedDomains = allowedDomains;

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const answer = (data && (data.answer || data.output || data.response)) || 'No response received.';

      // Replace typing placeholder
      chat[typingIdx] = { role: 'assistant', content: answer };
      saveChat();
      render();
      setStatus('Ready');
    } catch (err) {
      chat[typingIdx] = { role: 'assistant', content: `Error: ${err.message}` };
      saveChat();
      render();
      setStatus('Request failed');
    } finally {
      sending = false;
      updateUIState();
    }
  }

  function clearChat() {
    chat = [];
    saveChat();
    render();
    setStatus('Cleared');
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
