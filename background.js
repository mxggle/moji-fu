// Style Copier - Background Service Worker

// ============================================
// HOT RELOAD (Development only)
// ============================================
const DEV_SERVER_PORT = 35729;

function connectHotReload() {
  try {
    const ws = new WebSocket(`ws://localhost:${DEV_SERVER_PORT}`);

    ws.onmessage = (event) => {
      if (event.data === 'reload') {
        console.log('🔄 Hot reload triggered');
        chrome.runtime.reload();
      }
    };

    ws.onclose = () => {
      // Retry connection after 2 seconds
      setTimeout(connectHotReload, 2000);
    };

    ws.onerror = () => {
      // Dev server not running, ignore silently
      ws.close();
    };
  } catch (e) {
    // WebSocket not available or connection failed
  }
}

// Start hot reload connection
connectHotReload();

// ============================================
// MAIN EXTENSION LOGIC
// ============================================

// Message routing between popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_PICKER' || message.type === 'QUICK_APPLY') {
    // Forward to content script on active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    });
  }

  if (message.type === 'STYLE_SAVED') {
    // Update badge to show saved styles count
    chrome.storage.local.get(['savedStyles'], (result) => {
      const count = (result.savedStyles || []).length;
      chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#4A90A4' });
    });
  }

  return true;
});

// Initialize badge on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['savedStyles'], (result) => {
    const count = (result.savedStyles || []).length;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#4A90A4' });
  });
});
