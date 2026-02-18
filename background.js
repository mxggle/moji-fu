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
// IndexedDB Storage (extension-origin)
// ============================================
// All IndexedDB operations happen here in the background service worker
// so they use the extension's origin (not the web page's origin).

const DB_NAME = 'MojiFuDB';
const DB_VERSION = 1;
const STORE_NAME = 'styles';
const STYLES_KEY = 'savedStyles';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = (event) => {
      console.error('Background: IndexedDB open error', event.target.error);
      reject(event.target.error);
    };
  });
}

function idbGet(key) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function idbSet(key, value) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * One-time migration: move savedStyles from chrome.storage.local to IndexedDB,
 * then remove it from chrome.storage.local to free quota.
 */
function migrateFromChromeStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['savedStyles'], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('Background: Could not read chrome.storage.local for migration', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }

      const existing = result.savedStyles;
      if (!existing || existing.length === 0) {
        resolve(false); // Nothing to migrate
        return;
      }

      // Check if IndexedDB already has data (avoid overwriting)
      idbGet(STYLES_KEY).then(idbStyles => {
        if (idbStyles && idbStyles.length > 0) {
          // Already migrated, just clean up chrome.storage
          chrome.storage.local.remove('savedStyles', () => {
            console.log('Background: Cleaned up chrome.storage.local (IndexedDB already had data)');
            resolve(false);
          });
          return;
        }

        // Migrate
        idbSet(STYLES_KEY, existing).then(() => {
          chrome.storage.local.remove('savedStyles', () => {
            console.log(`Background: Migrated ${existing.length} styles from chrome.storage.local to IndexedDB`);
            resolve(true);
          });
        }).catch(err => {
          console.error('Background: Migration write to IndexedDB failed', err);
          resolve(false);
        });
      });
    });
  });
}

/**
 * Broadcast storage change to all contexts (popup, content scripts)
 */
function broadcastStorageChange() {
  // Send to all extension pages (popup, etc.)
  try {
    chrome.runtime.sendMessage({ type: 'MOJIFU_STORAGE_CHANGED' }).catch(() => {
      // No listeners, that's fine
    });
  } catch (e) {
    // Ignore
  }

  // Send to all content scripts in all tabs
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, { type: 'MOJIFU_STORAGE_CHANGED' }).catch(() => {
          // Tab doesn't have content script, that's fine
        });
      } catch (e) {
        // Ignore
      }
    }
  });
}

// ============================================
// MAIN EXTENSION LOGIC
// ============================================

// Message routing between popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ─── IndexedDB storage proxy ─────────────────
  if (message.type === 'MOJIFU_STORAGE') {
    const { action, styles } = message;

    if (action === 'get') {
      idbGet(STYLES_KEY)
        .then(val => sendResponse({ result: val || [] }))
        .catch(err => sendResponse({ error: err.message }));
      return true;
    }

    if (action === 'set') {
      idbSet(STYLES_KEY, styles)
        .then(() => {
          broadcastStorageChange();
          sendResponse({ result: true });
        })
        .catch(err => sendResponse({ error: err.message }));
      return true;
    }

    if (action === 'migrate') {
      migrateFromChromeStorage()
        .then(migrated => sendResponse({ result: migrated }))
        .catch(err => sendResponse({ error: err.message }));
      return true;
    }

    sendResponse({ error: 'Unknown storage action: ' + action });
    return true;
  }

  // ─── Font data fetching ──────────────────────
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

  // ─── Style picker / apply ────────────────────
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

// ============================================
// INITIALIZATION
// ============================================

// Run migration on install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });

  // Auto-migrate data from chrome.storage.local to IndexedDB
  migrateFromChromeStorage().then(migrated => {
    if (migrated) {
      console.log('Background: Migration completed on install/update');
    }
  });
});

// Also run migration on service worker startup (covers restarts)
migrateFromChromeStorage().catch(err => {
  console.warn('Background: Migration on startup failed', err);
});
