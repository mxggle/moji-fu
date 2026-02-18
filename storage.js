// Moji Fu - IndexedDB Storage Module
// Replaces chrome.storage.local for savedStyles to support larger data
// (chrome.storage.local has a ~10MB quota; IndexedDB has virtually no limit)
//
// Architecture:
//   - IndexedDB is origin-scoped, so content scripts (running on web pages)
//     cannot access the extension's IndexedDB directly.
//   - All IndexedDB operations are proxied through the background service worker
//     via chrome.runtime.sendMessage, ensuring a single shared database.
//   - The popup (extension origin) also uses the same message-based API for
//     consistency and to avoid race conditions.

const MojiFuStorage = (function () {
    'use strict';

    let _changeListeners = [];
    let _initDone = false;

    // ─── Message-based storage (works from any context) ────────

    function sendStorageMessage(action, data) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: 'MOJIFU_STORAGE', action, ...data },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (response && response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response ? response.result : undefined);
                }
            );
        });
    }

    // ─── Public API ────────────────────────────────

    /**
     * Get savedStyles from IndexedDB (via background).
     * Returns a Promise that resolves with the styles array (never null).
     */
    function getSavedStyles() {
        return sendStorageMessage('get');
    }

    /**
     * Set savedStyles in IndexedDB (via background) and notify listeners.
     * Returns a Promise.
     */
    function setSavedStyles(styles) {
        return sendStorageMessage('set', { styles });
    }

    /**
     * Register a listener that fires when savedStyles changes.
     * Callback receives (key, newValue).
     */
    function onChanged(callback) {
        _changeListeners.push(callback);
    }

    /**
     * Initialize: set up cross-context change listener + trigger migration.
     * Returns a Promise that resolves when ready.
     */
    function init() {
        if (_initDone) return Promise.resolve();
        _initDone = true;

        // Listen for change broadcasts from background
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'MOJIFU_STORAGE_CHANGED') {
                // Re-read from background and notify local listeners
                getSavedStyles().then(styles => {
                    _changeListeners.forEach(fn => {
                        try {
                            fn('savedStyles', styles);
                        } catch (e) {
                            console.error('MojiFuStorage: change listener error', e);
                        }
                    });
                });
            }
        });

        // Trigger migration in background (no-op if already done)
        return sendStorageMessage('migrate').catch(err => {
            console.warn('MojiFuStorage: migration message failed (background may not be ready yet)', err);
        });
    }

    return {
        init,
        getSavedStyles,
        setSavedStyles,
        onChanged
    };
})();

// Auto-initialize when loaded
MojiFuStorage.init().catch(err => {
    console.error('MojiFuStorage: auto-init failed', err);
});
