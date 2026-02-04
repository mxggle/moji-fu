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
    let selectionMode = false; // Track if we're in selection mode

    // Generate unique ID
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Extract fonts using the Font Loading API (document.fonts)
    // This works even when stylesheets are cross-origin
    function extractFontsFromDocumentFonts(fontFamily) {
        const fontData = [];

        // Clean and normalize the font family name
        const fontNames = fontFamily.split(',').map(f => f.replace(/['"]/g, '').trim());
        const primaryFont = fontNames[0];
        const normalizedPrimary = primaryFont.toLowerCase().replace(/\s+/g, ' ');

        try {
            // Use the Font Loading API to get loaded fonts
            if (document.fonts && typeof document.fonts.forEach === 'function') {
                document.fonts.forEach(font => {
                    const fontFamilyName = font.family.replace(/['"]/g, '').trim();
                    const normalizedFontFamily = fontFamilyName.toLowerCase().replace(/\s+/g, ' ');

                    // Check if this font matches our target
                    if (normalizedFontFamily === normalizedPrimary ||
                        normalizedPrimary.includes(normalizedFontFamily) ||
                        normalizedFontFamily.includes(normalizedPrimary)) {

                        // Extract font source URLs from the FontFace object
                        let sources = [];
                        if (font.loaded) {
                            // Try to get the CSS source property
                            // FontFace.src contains the source URLs
                            try {
                                // The font.src property might contain url() references
                                if (font.src) {
                                    sources = extractUrlsFromSrc(font.src);
                                }
                            } catch (e) {
                                // Some browsers may not expose src
                            }
                        }

                        fontData.push({
                            family: fontFamilyName,
                            weight: font.weight || 'normal',
                            style: font.style || 'normal',
                            stretch: font.stretch || 'normal',
                            unicodeRange: font.unicodeRange || 'U+0-10FFFF',
                            sources: sources,
                            status: font.status // 'loaded', 'loading', 'error', 'unloaded'
                        });
                    }
                });
            }
        } catch (e) {
            console.warn('Error accessing document.fonts:', e);
        }

        return fontData;
    }

    // Extract URLs from font source string
    function extractUrlsFromSrc(srcString) {
        const urls = [];
        // Match url() patterns in the source string
        const urlRegex = /url\(['"]?([^'"\)]+)['"]?\)/gi;
        let match;

        while ((match = urlRegex.exec(srcString)) !== null) {
            let url = match[1];
            // Convert relative URLs to absolute
            if (url && !url.startsWith('data:') && !url.startsWith('http')) {
                try {
                    url = new URL(url, window.location.href).href;
                } catch (e) {
                    // Keep as-is if URL parsing fails
                }
            }
            if (url) {
                urls.push(url);
            }
        }

        return urls;
    }

    // Extract @font-face rules for a given font family (with fallback)
    function extractFontFaceRules(fontFamily) {
        const fontFaceRules = [];

        // Clean and normalize the font family name
        const fontNames = fontFamily.split(',').map(f => f.replace(/['"]/g, '').trim());
        const primaryFont = fontNames[0];

        try {
            // Iterate through all stylesheets
            for (const sheet of document.styleSheets) {
                try {
                    // Skip cross-origin stylesheets unless CORS is enabled
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;

                    for (const rule of rules) {
                        if (rule instanceof CSSFontFaceRule) {
                            const ruleFontFamily = rule.style.fontFamily.replace(/['"]/g, '').trim();
                            // Check if this @font-face rule matches our font
                            if (ruleFontFamily === primaryFont ||
                                primaryFont.toLowerCase().includes(ruleFontFamily.toLowerCase())) {
                                fontFaceRules.push(rule.cssText);
                            }
                        }
                    }
                } catch (e) {
                    // Cross-origin stylesheet - skip silently
                    // This is expected for CDN stylesheets with CORS restrictions
                }
            }
        } catch (e) {
            console.warn('Error extracting font-face rules:', e);
        }

        return fontFaceRules;
    }

    // Extract @font-face entries with descriptors and sources
    function extractFontFaceEntries(fontFamily) {
        const entries = [];

        const fontNames = fontFamily.split(',').map(f => f.replace(/['"]/g, '').trim());
        const primaryFont = fontNames[0];

        try {
            for (const sheet of document.styleSheets) {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;

                    for (const rule of rules) {
                        if (rule instanceof CSSFontFaceRule) {
                            const ruleFontFamily = rule.style.fontFamily.replace(/['"]/g, '').trim();
                            if (ruleFontFamily === primaryFont ||
                                primaryFont.toLowerCase().includes(ruleFontFamily.toLowerCase())) {
                                const srcValue = rule.style.getPropertyValue('src') || '';
                                const sources = extractUrlsFromSrc(srcValue);
                                entries.push({
                                    family: ruleFontFamily,
                                    weight: rule.style.getPropertyValue('font-weight') || 'normal',
                                    style: rule.style.getPropertyValue('font-style') || 'normal',
                                    stretch: rule.style.getPropertyValue('font-stretch') || 'normal',
                                    unicodeRange: rule.style.getPropertyValue('unicode-range') || 'U+0-10FFFF',
                                    sources: sources
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Cross-origin stylesheet - skip
                }
            }
        } catch (e) {
            console.warn('Error extracting font-face entries:', e);
        }

        return entries;
    }

    // Parse @font-face blocks from CSS text
    function parseFontFaceCss(cssText) {
        const entries = [];
        const blocks = cssText.match(/@font-face\s*{[^}]*}/gi) || [];

        blocks.forEach(block => {
            const familyMatch = block.match(/font-family\s*:\s*([^;]+);/i);
            const weightMatch = block.match(/font-weight\s*:\s*([^;]+);/i);
            const styleMatch = block.match(/font-style\s*:\s*([^;]+);/i);
            const stretchMatch = block.match(/font-stretch\s*:\s*([^;]+);/i);
            const unicodeRangeMatch = block.match(/unicode-range\s*:\s*([^;]+);/i);
            const srcMatch = block.match(/src\s*:\s*([^;]+);/i);

            const family = familyMatch ? familyMatch[1].replace(/['"]/g, '').trim() : '';
            const srcValue = srcMatch ? srcMatch[1] : '';
            const sources = extractUrlsFromSrc(srcValue);

            if (family && sources.length > 0) {
                entries.push({
                    family: family,
                    weight: weightMatch ? weightMatch[1].trim() : 'normal',
                    style: styleMatch ? styleMatch[1].trim() : 'normal',
                    stretch: stretchMatch ? stretchMatch[1].trim() : 'normal',
                    unicodeRange: unicodeRangeMatch ? unicodeRangeMatch[1].trim() : 'U+0-10FFFF',
                    sources: sources
                });
            }
        });

        return entries;
    }

    // Fetch Google Fonts CSS and parse @font-face entries
    async function fetchGoogleFontFaceEntries(googleFontsLinks) {
        const entries = [];

        if (!googleFontsLinks || googleFontsLinks.length === 0) return entries;

        for (const href of googleFontsLinks) {
            try {
                const response = await fetch(href);
                if (!response.ok) continue;
                const cssText = await response.text();
                entries.push(...parseFontFaceCss(cssText));
            } catch (e) {
                // Ignore failures - continue with other links
            }
        }

        return entries;
    }

    function collectFontUrlsFromEntries(entries) {
        const urls = [];
        entries.forEach(entry => {
            if (entry.sources && entry.sources.length > 0) {
                urls.push(...entry.sources);
            }
        });
        return urls;
    }

    // Try to fetch and capture font file data for offline use
    async function captureFontData(fontUrls) {
        const capturedFonts = [];

        for (const url of fontUrls) {
            // Skip data URLs - they're already embedded
            if (url.startsWith('data:')) {
                capturedFonts.push({ url, dataUrl: url });
                continue;
            }

            try {
                const response = await fetch(url, { mode: 'cors' });
                if (response.ok) {
                    const blob = await response.blob();
                    const dataUrl = await blobToDataUrl(blob);
                    capturedFonts.push({
                        url,
                        dataUrl,
                        format: detectFontFormat(url)
                    });
                    continue;
                }
            } catch (e) {
                // Try background fetch as fallback
            }

            const backgroundDataUrl = await fetchFontDataViaBackground(url);
            if (backgroundDataUrl) {
                capturedFonts.push({
                    url,
                    dataUrl: backgroundDataUrl,
                    format: detectFontFormat(url)
                });
            } else {
                // Store URL only if fetch fails
                capturedFonts.push({ url, format: detectFontFormat(url) });
            }
        }

        return capturedFonts;
    }

    function fetchFontDataViaBackground(url) {
        return new Promise((resolve) => {
            if (!chrome.runtime || !chrome.runtime.sendMessage) {
                resolve(null);
                return;
            }

            chrome.runtime.sendMessage({ type: 'FETCH_FONT_DATA', url }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                }
                resolve(response && response.dataUrl ? response.dataUrl : null);
            });
        });
    }

    // Convert blob to data URL
    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Detect font format from URL
    function detectFontFormat(url) {
        const ext = url.split('?')[0].split('.').pop().toLowerCase();
        const formats = {
            'woff2': 'woff2',
            'woff': 'woff',
            'ttf': 'truetype',
            'otf': 'opentype',
            'eot': 'embedded-opentype',
            'svg': 'svg'
        };
        return formats[ext] || 'woff2';
    }

    // Detect Google Fonts links in the page
    function detectGoogleFonts(fontFamily) {
        const cleanFontName = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        const googleFontsLinks = [];

        // Check <link> tags for Google Fonts
        const linkTags = document.querySelectorAll('link[href*="fonts.googleapis.com"]');
        linkTags.forEach(link => {
            const href = link.getAttribute('href');
            // Check if the font name appears in the URL
            if (href && href.toLowerCase().includes(cleanFontName.toLowerCase().replace(/\s+/g, '+'))) {
                googleFontsLinks.push(href);
            }
        });

        // Check @import rules in stylesheets for Google Fonts
        try {
            for (const sheet of document.styleSheets) {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;

                    for (const rule of rules) {
                        if (rule instanceof CSSImportRule && rule.href &&
                            rule.href.includes('fonts.googleapis.com')) {
                            if (rule.href.toLowerCase().includes(cleanFontName.toLowerCase().replace(/\s+/g, '+'))) {
                                googleFontsLinks.push(rule.href);
                            }
                        }
                    }
                } catch (e) {
                    // Cross-origin stylesheet - skip
                }
            }
        } catch (e) {
            console.error('Error detecting Google Fonts:', e);
        }

        return googleFontsLinks;
    }

    // Extract font resources (both @font-face rules and Google Fonts links)
    // Now also uses the Font Loading API for better cross-origin support
    function extractFontResources(fontFamily) {
        const fontFaceRules = extractFontFaceRules(fontFamily);
        const googleFontsLinks = detectGoogleFonts(fontFamily);
        const loadedFonts = extractFontsFromDocumentFonts(fontFamily);
        const fontFaceEntries = extractFontFaceEntries(fontFamily);

        // Collect all font URLs from loaded fonts
        const fontUrls = [];
        loadedFonts.forEach(font => {
            if (font.sources && font.sources.length > 0) {
                fontUrls.push(...font.sources);
            }
        });
        fontFaceEntries.forEach(entry => {
            if (entry.sources && entry.sources.length > 0) {
                fontUrls.push(...entry.sources);
            }
        });

        return {
            fontFaceRules: fontFaceRules,
            googleFontsLinks: googleFontsLinks,
            loadedFonts: loadedFonts,  // FontFace API data
            fontFaceEntries: fontFaceEntries,
            fontUrls: [...new Set(fontUrls)]  // Deduplicated font URLs
        };
    }

    // Async version that also tries to capture font file data
    async function extractFontResourcesAsync(fontFamily) {
        const basic = extractFontResources(fontFamily);

        // Try to parse Google Fonts CSS to capture file URLs
        if (basic.googleFontsLinks && basic.googleFontsLinks.length > 0) {
            try {
                const googleEntries = await fetchGoogleFontFaceEntries(basic.googleFontsLinks);
                if (googleEntries.length > 0) {
                    basic.fontFaceEntries = [...(basic.fontFaceEntries || []), ...googleEntries];
                    const googleUrls = collectFontUrlsFromEntries(googleEntries);
                    basic.fontUrls = [...new Set([...(basic.fontUrls || []), ...googleUrls])];
                }
            } catch (e) {
                // Ignore Google Fonts parse failures
            }
        }

        // Try to capture font data if we have URLs
        if (basic.fontUrls && basic.fontUrls.length > 0) {
            try {
                basic.capturedFonts = await captureFontData(basic.fontUrls);
            } catch (e) {
                console.warn('Could not capture font data:', e);
            }
        }

        return basic;
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

    // Show floating save button near selection (only visible in selection mode)
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

        buttonContainer.appendChild(saveButton);

        // Exit selection mode button
        const exitButton = document.createElement('button');
        exitButton.className = 'style-copier-save-btn style-copier-exit-btn';
        exitButton.textContent = '✕ Exit';
        exitButton.style.position = 'relative';
        exitButton.style.left = 'auto';
        exitButton.style.top = 'auto';
        exitButton.style.background = '#6b7280';
        exitButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            exitSelectionMode();
        });

        buttonContainer.appendChild(exitButton);

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

    // Check if style is duplicate
    function isDuplicateStyle(newStyle, existingStyles) {
        return existingStyles.some(existing => {
            // For article styles, only check if from same URL
            // (Don't compare structure - we just want to avoid collecting same URL twice)
            if (newStyle.type === 'article' && existing.type === 'article') {
                return existing.sourceUrl === newStyle.sourceUrl;
            }

            // For single styles, check same URL AND same properties
            if (newStyle.type === 'single' && existing.type === 'single') {
                if (existing.sourceUrl !== newStyle.sourceUrl) {
                    return false;
                }

                // Compare properties
                if (existing.properties) {
                    const newProps = JSON.stringify(newStyle.properties);
                    const existingProps = JSON.stringify(existing.properties);
                    return newProps === existingProps;
                }
            }

            return false;
        });
    }

    // Handle save button click - now async to download fonts
    async function handleSaveClick(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!capturedStyles) return;

        // Show loading state
        if (saveButton) {
            saveButton.textContent = 'Downloading fonts...';
            saveButton.disabled = true;
        }

        try {
            // Extract font resources AND download font files
            const fontResources = await extractFontResourcesAsync(capturedStyles.fontFamily.value);

            const style = {
                id: generateId(),
                type: 'single', // Single element style
                name: generateName(capturedStyles),
                sourceUrl: window.location.href,
                createdAt: Date.now(),
                properties: capturedStyles,
                sampleText: sampleText || 'Sample Text',
                fontResources: fontResources  // Includes downloaded fonts as data URLs
            };

            // Save to storage
            chrome.storage.local.get(['savedStyles'], (result) => {
                const savedStyles = result.savedStyles || [];

                // Check for duplicates
                if (isDuplicateStyle(style, savedStyles)) {
                    showToast('Style already collected!');
                    removeSaveButton();
                    selectionMode = false;
                    return;
                }

                savedStyles.unshift(style); // Add at beginning for most recent on top

                chrome.storage.local.set({ savedStyles }, () => {
                    const fontCount = fontResources.capturedFonts?.filter(f => f.dataUrl)?.length || 0;
                    if (fontCount > 0) {
                        showToast(`Style collected with ${fontCount} font(s)!`);
                    } else {
                        showToast('Style collected!');
                    }
                    chrome.runtime.sendMessage({ type: 'STYLE_SAVED' });
                    removeSaveButton();
                    selectionMode = false;
                });
            });
        } catch (error) {
            console.error('Error collecting style:', error);
            showToast('Style collected (fonts may be limited)');
            removeSaveButton();
            selectionMode = false;
        }
    }

    // Handle save article structure button click - now async to download fonts
    async function handleSaveArticleClick(e) {
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

        // Show loading state
        if (saveArticleButton) {
            saveArticleButton.textContent = '📄 Downloading fonts...';
            saveArticleButton.disabled = true;
        }

        try {
            // Extract font resources AND download font files for all element types
            const articleFontResources = {};
            let totalFontsDownloaded = 0;

            for (const [tag, data] of Object.entries(structureStyles)) {
                const resources = await extractFontResourcesAsync(data.properties.fontFamily.value);
                articleFontResources[tag] = resources;
                totalFontsDownloaded += resources.capturedFonts?.filter(f => f.dataUrl)?.length || 0;
            }

            const style = {
                id: generateId(),
                type: 'article', // Article structure style
                name: generateArticleName(),
                sourceUrl: window.location.href,
                createdAt: Date.now(),
                structureStyles: structureStyles, // Contains H1, H2, ..., P with their properties
                sampleText: 'Article Structure',
                fontResources: articleFontResources  // Font resources for each element type
            };

            // Save to storage
            chrome.storage.local.get(['savedStyles'], (result) => {
                const savedStyles = result.savedStyles || [];

                // Check for duplicates
                if (isDuplicateStyle(style, savedStyles)) {
                    showToast('Article style already collected!');
                    removeSaveButton();
                    selectionMode = false;
                    return;
                }

                savedStyles.unshift(style); // Add at beginning for most recent on top

                chrome.storage.local.set({ savedStyles }, () => {
                    const elementCount = Object.keys(structureStyles).length;
                    if (totalFontsDownloaded > 0) {
                        showToast(`Article collected! (${elementCount} elements, ${totalFontsDownloaded} fonts)`);
                    } else {
                        showToast(`Article style collected! (${elementCount} elements)`);
                    }
                    chrome.runtime.sendMessage({ type: 'STYLE_SAVED' });
                    removeSaveButton();
                    selectionMode = false;
                });
            });
        } catch (error) {
            console.error('Error collecting article style:', error);
            showToast('Article collected (fonts may be limited)');
            removeSaveButton();
            selectionMode = false;
        }
    }

    // Auto-collect article styles (triggered from popup) - now async to download fonts
    async function autoCollectArticleStyles(sendResponse) {
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

        showToast('Downloading fonts...');

        try {
            // Extract font resources AND download font files for all element types
            const articleFontResources = {};
            let totalFontsDownloaded = 0;

            for (const [tag, data] of Object.entries(structureStyles)) {
                const resources = await extractFontResourcesAsync(data.properties.fontFamily.value);
                articleFontResources[tag] = resources;
                totalFontsDownloaded += resources.capturedFonts?.filter(f => f.dataUrl)?.length || 0;
            }

            const style = {
                id: generateId(),
                type: 'article',
                name: generateArticleName(),
                sourceUrl: window.location.href,
                createdAt: Date.now(),
                structureStyles: structureStyles,
                sampleText: 'Article Structure',
                fontResources: articleFontResources  // Font resources for each element type
            };

            chrome.storage.local.get(['savedStyles'], (result) => {
                const savedStyles = result.savedStyles || [];

                // Check for duplicates
                if (isDuplicateStyle(style, savedStyles)) {
                    showToast('Article style already collected!');
                    sendResponse({ success: false, error: 'Duplicate style' });
                    return;
                }

                savedStyles.unshift(style); // Add at beginning for most recent on top

                chrome.storage.local.set({ savedStyles }, () => {
                    const elementCount = Object.keys(structureStyles).length;
                    if (totalFontsDownloaded > 0) {
                        showToast(`Article collected! (${elementCount} elements, ${totalFontsDownloaded} fonts)`);
                    } else {
                        showToast(`Article style collected! (${elementCount} elements)`);
                    }
                    chrome.runtime.sendMessage({ type: 'STYLE_SAVED' });
                    sendResponse({ success: true, elementCount, fontsDownloaded: totalFontsDownloaded });
                });
            });
        } catch (error) {
            console.error('Error auto-collecting article style:', error);
            showToast('Article collected (fonts may be limited)');
            sendResponse({ success: true, error: 'Font download failed' });
        }
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

            // Only show buttons or collect if in selection mode
            if (selectionMode) {
                // Show the collect buttons near the selection
                const x = rect.left + window.scrollX;
                const y = rect.bottom + window.scrollY;
                showSaveButton(x, y);
            }
            // In normal mode, don't show buttons - just allow native selection
        } else {
            removeSaveButton();
            capturedStyles = null;
            currentSelection = null;
            sampleText = null;
        }
    }

    // Collect style from current selection - now async to download fonts
    async function collectStyleFromSelection() {
        if (!capturedStyles) return;

        showToast('Downloading fonts...');

        try {
            // Extract font resources AND download font files
            const fontResources = await extractFontResourcesAsync(capturedStyles.fontFamily.value);

            const style = {
                id: generateId(),
                type: 'single',
                name: generateName(capturedStyles),
                sourceUrl: window.location.href,
                createdAt: Date.now(),
                properties: capturedStyles,
                sampleText: sampleText || 'Sample Text',
                fontResources: fontResources  // Includes downloaded fonts as data URLs
            };

            // Save to storage
            chrome.storage.local.get(['savedStyles'], (result) => {
                const savedStyles = result.savedStyles || [];

                // Check for duplicates
                if (isDuplicateStyle(style, savedStyles)) {
                    showToast('Style already collected!');
                    // Clear selection and captured data
                    window.getSelection().removeAllRanges();
                    capturedStyles = null;
                    currentSelection = null;
                    sampleText = null;
                    return;
                }

                savedStyles.unshift(style); // Add at beginning for most recent on top

                chrome.storage.local.set({ savedStyles }, () => {
                    const fontCount = fontResources.capturedFonts?.filter(f => f.dataUrl)?.length || 0;
                    if (fontCount > 0) {
                        showToast(`Style collected with ${fontCount} font(s)!`);
                    } else {
                        showToast('Style collected from selection!');
                    }
                    chrome.runtime.sendMessage({ type: 'STYLE_SAVED' });

                    // Clear selection and captured data
                    window.getSelection().removeAllRanges();
                    capturedStyles = null;
                    currentSelection = null;
                    sampleText = null;
                });
            });
        } catch (error) {
            console.error('Error collecting style:', error);
            showToast('Style collected (fonts may be limited)');
            // Clear selection and captured data
            window.getSelection().removeAllRanges();
            capturedStyles = null;
            currentSelection = null;
            sampleText = null;
        }
    }

    // Enable selection mode
    function enableSelectionMode() {
        selectionMode = true;
        showToast('Select mode ON - Select text to collect its style');
    }

    // Exit selection mode
    function exitSelectionMode() {
        selectionMode = false;
        removeSaveButton();
        capturedStyles = null;
        currentSelection = null;
        sampleText = null;
        window.getSelection().removeAllRanges();
        showToast('Select mode OFF');
    }

    // Toggle selection mode
    function toggleSelectionMode() {
        if (selectionMode) {
            exitSelectionMode();
            return false;
        } else {
            enableSelectionMode();
            return true;
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
                    // Don't exit selection mode on click outside - user may want to select different text
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

        if (message.type === 'ENABLE_SELECTION_MODE') {
            enableSelectionMode();
            sendResponse({ success: true, isActive: true });
            return true;
        }

        if (message.type === 'DISABLE_SELECTION_MODE') {
            exitSelectionMode();
            sendResponse({ success: true, isActive: false });
            return true;
        }

        if (message.type === 'TOGGLE_SELECTION_MODE') {
            const isActive = toggleSelectionMode();
            sendResponse({ success: true, isActive: isActive });
            return true;
        }

        if (message.type === 'GET_SELECTION_MODE_STATE') {
            sendResponse({ isActive: selectionMode });
            return true;
        }
    });

    // Initialize
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClick);
})();
