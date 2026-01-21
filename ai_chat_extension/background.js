async function setupSidePanelDefaults() {
  try {
    // Set default panel path for all tabs
    if (chrome.sidePanel?.setOptions) {
      await chrome.sidePanel.setOptions({
        path: 'panel.html',
        enabled: true
      });
    }
    // Make action click open the side panel automatically (newer Chrome)
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: true
      });
    }
    console.log('Side panel configured successfully');
  } catch (e) {
    console.warn('Side panel setup failed:', e);
  }
}

async function openPanelForAllWindows() {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    for (const w of windows) {
      if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: w.id });
      } else if (chrome.scripting?.executeScript) {
        // Inject overlay fallback into the active tab of the window
        const activeTab = (w.tabs || []).find(t => t.active && t.id);
        if (activeTab?.id) {
          try {
            await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ['overlay.js'] });
          } catch (e) {
            console.warn('Overlay inject failed:', e);
            // Likely a restricted scheme; open panel.html in a new tab in this window
            const url = chrome.runtime.getURL('panel.html');
            await chrome.tabs.create({ windowId: w.id, url });
          }
        } else {
          // No active tab found (or no tabs), open panel.html in this window
          const url = chrome.runtime.getURL('panel.html');
          await chrome.tabs.create({ windowId: w.id, url });
        }
      }
    }
  } catch (e) {
    console.warn('openPanelForAllWindows failed:', e);
  }
}

function isHttpUrl(url) {
  try { const u = new URL(url || ''); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

async function tryOpenForTab(tab) {
  if (!tab) return;
  try {
    // Ensure options are enabled for this tab if API supports tabId
    if (chrome.sidePanel?.setOptions && tab.id) {
      try { await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'panel.html', enabled: true }); } catch {}
    }
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    }
    // Fallback: try overlay injection on HTTP(s) pages
    if (chrome.scripting?.executeScript && tab.id && isHttpUrl(tab.url)) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
        return;
      } catch (e) {
        console.warn('Overlay inject failed on tab:', e);
      }
    }
    // Last resort: open panel.html in this window
    const url = chrome.runtime.getURL('panel.html');
    await chrome.tabs.create({ windowId: tab.windowId, url });
  } catch (e) {
    console.warn('tryOpenForTab failed:', e);
  }
}

let openedForFirstHttp = false;

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('AI Chat Agent Extension Installed.', details?.reason);
  await setupSidePanelDefaults();
  // Default keepOpen=false on first install to avoid opening tabs automatically
  if (details?.reason === 'install') {
    chrome.storage.local.get(['keepOpen'], (res) => {
      if (typeof res.keepOpen === 'undefined') {
        chrome.storage.local.set({ keepOpen: false });
      }
    });
  }
  // Do not auto-open any tabs or panels on install
});

chrome.runtime.onStartup.addListener(async () => {
  await setupSidePanelDefaults();
  // Do not auto-open tabs/panels on browser startup
});

// Fallback for older builds: open panel on action click
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } else {
      // As a fallback, inject an overlay sidebar into the page
      if (chrome.scripting?.executeScript && tab?.id) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['overlay.js']
        });
      } else {
        // Last resort: open panel.html in a new tab
        const url = chrome.runtime.getURL('panel.html');
        chrome.tabs.create({ url });
      }
    }
  } catch (e) {
    console.warn('Action open failed:', e);
  }
});

// Open panel for newly created windows as they appear
// Disable auto-opening for newly created windows to avoid extra tabs/panels
// chrome.windows.onCreated.addListener(async (win) => {
//   try {
//     await setupSidePanelDefaults();
//     if (chrome.sidePanel?.open) {
//       await chrome.sidePanel.open({ windowId: win.id });
//     }
//   } catch (e) {
//     console.warn('Failed to open side panel for new window:', e);
//   }
// });

// Disable auto-opening on activation and update to prevent extra tabs

// --- Tab focus stabilization for Agent runs ---
let lastActiveTabId = null;

// Track the user's current active tab
if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    if (activeInfo && typeof activeInfo.tabId === 'number') {
      lastActiveTabId = activeInfo.tabId;
    }
  });
}

// Also track window focus changes
if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener(async (winId) => {
    try {
      if (winId === chrome.windows.WINDOW_ID_NONE) return;
      const [tab] = await chrome.tabs.query({ active: true, windowId: winId });
      if (tab && typeof tab.id === 'number') {
        lastActiveTabId = tab.id;
      }
    } catch (_) {}
  });
}

// Refocus logic driven by panel messages
chrome.runtime.onMessage.addListener((msg, sender) => {
  try {
    if (!msg || msg.type !== 'AGENT_CONTROL') return;
    const refocus = (delayMs = 0) => {
      if (!lastActiveTabId) return;
      const run = () => { try { chrome.tabs.update(lastActiveTabId, { active: true }); } catch (_) {} };
      if (delayMs > 0) setTimeout(run, delayMs); else run();
    };

    if (msg.action === 'start') {
      if (sender && sender.tab && typeof sender.tab.id === 'number') lastActiveTabId = sender.tab.id;
      // After CDP actions may create/activate a tab; restore user focus shortly after
      refocus(500);
    } else if (msg.action === 'done') {
      // Ensure user's tab is visible again at completion
      refocus(0);
    }
  } catch (_) {}
});
