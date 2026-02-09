// Style Copier - Background Service Worker

// ============================================
// HOT RELOAD (Development only)
// ============================================
// Set to true when running the dev server (npm run dev)
const DEV_MODE = false;
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

// Start hot reload connection only in development mode
if (DEV_MODE) {
  connectHotReload();
}

// ============================================
// MAIN EXTENSION LOGIC
// ============================================

// Message routing between popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_FONT_DATA' && message.url) {
    fetchFontAsDataUrl(message.url)
      .then((dataUrl) => {
        if (dataUrl) {
          sendResponse({ dataUrl });
        } else {
          sendResponse({ error: 'Font fetch failed' });
        }
      })
      .catch((error) => {
        sendResponse({ error: error?.message || 'Font fetch failed' });
      });
    return true;
  }

  if (message.type === 'START_PICKER' || message.type === 'QUICK_APPLY') {
    // Forward to content script on active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    });
  }

  if (message.type === 'STYLE_SAVED') {
    // Badge count removal requested by user - logic removed
  }

  return true;
});

function isLikelyFontContentType(contentType) {
  if (!contentType) return true;
  const type = contentType.toLowerCase();
  return type.includes('font') ||
    type.includes('application/octet-stream') ||
    type.includes('application/font') ||
    type.includes('application/x-font');
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchFontAsDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') || '';
  if (!isLikelyFontContentType(contentType)) return null;

  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const mime = contentType || 'font/woff2';
  return `data:${mime};base64,${base64}`;
}

// Initialize badge on install - cleared as requested
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});
