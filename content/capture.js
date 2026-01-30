// Style Copier - Style Capture Content Script

(function () {
    'use strict';

    // Properties to capture
    const TEXT_PROPERTIES = [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'color',
        'lineHeight',
        'letterSpacing',
        'textDecoration',
        'textTransform',
        'textShadow'
    ];

    // Article structure element types to capture
    const ARTICLE_ELEMENTS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P'];

    // Common article content selectors
    const ARTICLE_SELECTORS = [
        'article',
        '[role="article"]',
        '.post-content',
        '.article-content',
        '.entry-content',
        '.content',
        '.post-body',
        '.article-body',
        '.story-body',
        '.markdown-body',
        '.prose',
        'main'
    ];

    let saveButton = null;
    let saveArticleButton = null;
    let currentSelection = null;
    let capturedStyles = null;
    let sampleText = null;

    // Generate unique ID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Extract text styles from an element
    function extractStyles(element) {
        const computed = window.getComputedStyle(element);
        const styles = {};

        TEXT_PROPERTIES.forEach(prop => {
            styles[prop] = {
                value: computed[prop],
                enabled: true
            };
        });

        return styles;
    }

    // Generate auto name from styles
    function generateName(styles) {
        const fontFamily = styles.fontFamily.value.split(',')[0].replace(/['"]/g, '').trim();
        const fontSize = styles.fontSize.value;
        return `${fontFamily}, ${fontSize}`;
    }

    // Find article content on page
    function findArticleContent() {
        for (const selector of ARTICLE_SELECTORS) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim().length > 100) {
                return element;
            }
        }
        // Fallback: find the largest text block
        const paragraphs = document.querySelectorAll('p');
        let best = null;
        let maxLength = 0;
        paragraphs.forEach(p => {
            const parent = p.parentElement;
            if (parent && parent.textContent.length > maxLength) {
                maxLength = parent.textContent.length;
                best = parent;
            }
        });
        return best;
    }

    // Extract article structure styles (all heading levels + paragraphs)
    function extractArticleStructureStyles(articleElement) {
        const structureStyles = {};

        ARTICLE_ELEMENTS.forEach(tagName => {
            const element = articleElement.querySelector(tagName.toLowerCase());
            if (element) {
                structureStyles[tagName] = {
                    properties: extractStyles(element),
                    sampleText: element.textContent.trim().slice(0, 30) + (element.textContent.length > 30 ? '...' : '')
                };
            }
        });

        return structureStyles;
    }

    // Generate name for article structure style
    function generateArticleName() {
        try {
            const hostname = new URL(window.location.href).hostname.replace('www.', '');
            return `Article Style from ${hostname}`;
        } catch {
            return 'Article Style';
        }
    }

    // Show floating save button near selection
    function showSaveButton(x, y) {
        removeSaveButton();

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'style-copier-btn-container';
        buttonContainer.style.left = `${x}px`;
        buttonContainer.style.top = `${y + 10}px`;
        buttonContainer.style.position = 'absolute';
        buttonContainer.style.zIndex = '2147483647';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '5px';

        // Single style button
        saveButton = document.createElement('button');
        saveButton.className = 'style-copier-save-btn';
        saveButton.textContent = 'Collect Style';
        saveButton.style.position = 'relative';
        saveButton.style.left = 'auto';
        saveButton.style.top = 'auto';
        saveButton.addEventListener('click', handleSaveClick);

        // Article structure button
        saveArticleButton = document.createElement('button');
        saveArticleButton.className = 'style-copier-save-btn style-copier-article-btn';
        saveArticleButton.textContent = '📄 Collect Article';
        saveArticleButton.style.position = 'relative';
        saveArticleButton.style.left = 'auto';
        saveArticleButton.style.top = 'auto';
        saveArticleButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        saveArticleButton.addEventListener('click', handleSaveArticleClick);

        buttonContainer.appendChild(saveButton);
        buttonContainer.appendChild(saveArticleButton);
        document.body.appendChild(buttonContainer);

        // Store reference for removal
        saveButton._container = buttonContainer;
    }

    // Remove save button
    function removeSaveButton() {
        if (saveButton && saveButton._container && saveButton._container.parentNode) {
            saveButton._container.parentNode.removeChild(saveButton._container);
            saveButton = null;
            saveArticleButton = null;
        } else if (saveButton && saveButton.parentNode) {
            saveButton.parentNode.removeChild(saveButton);
            saveButton = null;
        }
    }

    // Handle save button click
    function handleSaveClick(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!capturedStyles) return;

        const style = {
            id: generateId(),
            type: 'single', // Single element style
            name: generateName(capturedStyles),
            sourceUrl: window.location.href,
            createdAt: Date.now(),
            properties: capturedStyles,
            sampleText: sampleText || 'Sample Text'
        };

        // Save to storage
        chrome.storage.local.get(['savedStyles'], (result) => {
            const savedStyles = result.savedStyles || [];
            savedStyles.push(style);

            chrome.storage.local.set({ savedStyles }, () => {
                showToast('Style collected!');
                chrome.runtime.sendMessage({ type: 'STYLE_SAVED' });
                removeSaveButton();
            });
        });
    }

    // Handle save article structure button click
    function handleSaveArticleClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const article = findArticleContent();
        if (!article) {
            showToast('No article content found on this page');
            return;
        }

        const structureStyles = extractArticleStructureStyles(article);

        if (Object.keys(structureStyles).length === 0) {
            showToast('No article elements found (H1-H6, P)');
            return;
        }

        const style = {
            id: generateId(),
            type: 'article', // Article structure style
            name: generateArticleName(),
            sourceUrl: window.location.href,
            createdAt: Date.now(),
            structureStyles: structureStyles, // Contains H1, H2, ..., P with their properties
            sampleText: 'Article Structure'
        };

        // Save to storage
        chrome.storage.local.get(['savedStyles'], (result) => {
            const savedStyles = result.savedStyles || [];
            savedStyles.push(style);

            chrome.storage.local.set({ savedStyles }, () => {
                const elementCount = Object.keys(structureStyles).length;
                showToast(`Article style collected! (${elementCount} elements)`);
                chrome.runtime.sendMessage({ type: 'STYLE_SAVED' });
                removeSaveButton();
            });
        });
    }

    // Auto-collect article styles (triggered from popup)
    function autoCollectArticleStyles(sendResponse) {
        const article = findArticleContent();
        if (!article) {
            showToast('No article content found on this page');
            sendResponse({ success: false, error: 'No article found' });
            return;
        }

        const structureStyles = extractArticleStructureStyles(article);

        if (Object.keys(structureStyles).length === 0) {
            showToast('No article elements found (H1-H6, P)');
            sendResponse({ success: false, error: 'No elements found' });
            return;
        }

        const style = {
            id: generateId(),
            type: 'article',
            name: generateArticleName(),
            sourceUrl: window.location.href,
            createdAt: Date.now(),
            structureStyles: structureStyles,
            sampleText: 'Article Structure'
        };

        chrome.storage.local.get(['savedStyles'], (result) => {
            const savedStyles = result.savedStyles || [];
            savedStyles.push(style);

            chrome.storage.local.set({ savedStyles }, () => {
                const elementCount = Object.keys(structureStyles).length;
                showToast(`Article style collected! (${elementCount} elements)`);
                chrome.runtime.sendMessage({ type: 'STYLE_SAVED' });
                sendResponse({ success: true, elementCount });
            });
        });
    }

    // Show toast notification
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'style-copier-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 2500);
    }

    // Handle text selection
    function handleMouseUp(e) {
        // Ignore if clicking on our own UI
        if (e.target.closest('.style-copier-save-btn')) return;

        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText.length > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Get the element containing the start of selection
            let element = range.startContainer;
            if (element.nodeType === Node.TEXT_NODE) {
                element = element.parentElement;
            }

            capturedStyles = extractStyles(element);
            currentSelection = selectedText;
            // Save the selected text as sample (truncate if too long)
            sampleText = selectedText.length > 50
                ? selectedText.slice(0, 50) + '...'
                : selectedText;

            // Position button below the selection
            const x = rect.left + window.scrollX;
            const y = rect.bottom + window.scrollY;
            showSaveButton(x, y);
        } else {
            removeSaveButton();
            capturedStyles = null;
            currentSelection = null;
            sampleText = null;
        }
    }

    // Handle clicks outside to dismiss
    function handleClick(e) {
        if (saveButton && !e.target.closest('.style-copier-save-btn') && !e.target.closest('.style-copier-btn-container')) {
            // Small delay to allow selection events to complete
            setTimeout(() => {
                const selection = window.getSelection();
                if (!selection.toString().trim()) {
                    removeSaveButton();
                }
            }, 10);
        }
    }

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'AUTO_COLLECT_ARTICLE') {
            autoCollectArticleStyles(sendResponse);
            return true; // Keep channel open for async response
        }
    });

    // Initialize
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClick);
})();
