(() => {
  const els = {
    apiKey: document.getElementById('apiKey'),
    toggle: document.getElementById('toggleKey'),
    save: document.getElementById('save'),
    clear: document.getElementById('clear'),
    status: document.getElementById('status'),
    back: document.getElementById('backToPopup'),
    provider: document.getElementById('provider'),
    model: document.getElementById('model'),
    allowedDomains: document.getElementById('allowedDomains'),
  };

  document.addEventListener('DOMContentLoaded', async () => {
    // Load saved key
    chrome.storage.local.get(['apiKey', 'provider', 'model', 'allowedDomains'], (res) => {
      if (res.apiKey) {
        els.apiKey.value = res.apiKey; // prefill masked by default
      }
      // Provider
      const p = res.provider || 'auto';
      if (els.provider) els.provider.value = p;
      // Model
      if (els.model) els.model.value = res.model || '';
      // Allowed domains -> textarea lines
      if (Array.isArray(res.allowedDomains) && els.allowedDomains) {
        els.allowedDomains.value = res.allowedDomains.join('\n');
      }
    });

    // Toggle visibility
    els.toggle.addEventListener('click', () => {
      const isPwd = els.apiKey.getAttribute('type') === 'password';
      els.apiKey.setAttribute('type', isPwd ? 'text' : 'password');
    });

    // Save key
    els.save.addEventListener('click', () => {
      const key = (els.apiKey.value || '').trim();
      const provider = els.provider?.value || 'auto';
      const model = (els.model?.value || '').trim();
      const domainsText = (els.allowedDomains?.value || '').trim();
      const allowedDomains = domainsText
        ? domainsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        : [];

      const payload = { provider, model, allowedDomains };
      if (key) payload.apiKey = key;

      chrome.storage.local.set(payload, () => {
        setStatus('Settings saved.', false);
      });
    });

    // Clear key
    els.clear.addEventListener('click', () => {
      chrome.storage.local.remove(['apiKey'], () => {
        els.apiKey.value = '';
        setStatus('API Key cleared. Other settings unchanged.', false);
      });
    });

    // Open the side panel (preferred) or panel.html as fallback
    els.back.addEventListener('click', async () => {
      try {
        if (chrome.sidePanel?.open) {
          const win = await chrome.windows.getCurrent();
          await chrome.sidePanel.open({ windowId: win.id });
        } else {
          const url = chrome.runtime.getURL('panel.html');
          chrome.tabs.create({ url });
        }
      } catch (e) {
        const url = chrome.runtime.getURL('panel.html');
        chrome.tabs.create({ url });
      }
    });
  });

  function setStatus(msg, isError = false) {
    els.status.textContent = msg;
    els.status.classList.toggle('error', !!isError);
    els.status.classList.toggle('success', !isError);
  }
})();
