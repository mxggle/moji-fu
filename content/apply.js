// Style Copier - Style Application Content Script

(function () {
    'use strict';

    let pickerActive = false;
    let pickerHint = null;
    let currentHighlight = null;
    let pendingStyleId = null;

    // CSS property name mapping (camelCase to kebab-case)
    const PROP_MAP = {
        fontFamily: 'font-family',
        fontSize: 'font-size',
        fontWeight: 'font-weight',
        fontStyle: 'font-style',
        color: 'color',
        lineHeight: 'line-height',
        letterSpacing: 'letter-spacing',
        textDecoration: 'text-decoration',
        textTransform: 'text-transform',
        textShadow: 'text-shadow'
    };

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

    // Generate CSS selector for an element
    function getSelector(element) {
        if (element.id) {
            return `#${element.id}`;
        }

        const path = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let selector = element.tagName.toLowerCase();

            if (element.className && typeof element.className === 'string') {
                const classes = element.className.trim().split(/\s+/)
                    .filter(c => c && !c.startsWith('style-copier-'))
                    .slice(0, 2);
                if (classes.length) {
                    selector += '.' + classes.join('.');
                }
            }

            path.unshift(selector);
            element = element.parentNode;

            // Stop at body or after 3 levels
            if (element === document.body || path.length >= 3) break;
        }

        return path.join(' > ');
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

    // Build CSS rule from saved style
    function buildCssRule(selector, properties, options = {}) {
        if (!options.smartApply) {
            // Standard behavior: apply all properties to the selector
            const declarations = [];
            for (const [prop, data] of Object.entries(properties)) {
                if (data.enabled && PROP_MAP[prop]) {
                    declarations.push(`${PROP_MAP[prop]}: ${data.value} !important`);
                }
            }
            return `${selector} { ${declarations.join('; ')}; }`;
        }

        // Smart Apply behavior
        const identityProps = ['fontFamily', 'color', 'textShadow'];
        const typographyProps = ['fontSize', 'lineHeight', 'fontWeight', 'letterSpacing', 'fontStyle', 'textDecoration', 'textTransform'];

        const identityDecls = [];
        const typographyDecls = [];

        for (const [prop, data] of Object.entries(properties)) {
            if (data.enabled && PROP_MAP[prop]) {
                const rule = `${PROP_MAP[prop]}: ${data.value} !important`;
                if (identityProps.includes(prop)) {
                    identityDecls.push(rule);
                } else if (typographyProps.includes(prop)) {
                    typographyDecls.push(rule);
                }
            }
        }

        const cssRules = [];

        // 1. Identity properties apply to container and ALL descendants
        if (identityDecls.length > 0) {
            const decls = identityDecls.join('; ');
            cssRules.push(`${selector} { ${decls}; }`);
            cssRules.push(`${selector} * { ${decls}; }`);
        }

        // 2. Typography properties apply to container and specific body text elements
        // BUT we intentionally EXCLUDE headings (h1-h6) from these generic sizes
        if (typographyDecls.length > 0) {
            const decls = typographyDecls.join('; ');
            const bodySelectors = [
                selector,
                `${selector} p`,
                `${selector} span`,
                `${selector} li`,
                `${selector} a`,
                `${selector} div`,
                `${selector} td`,
                `${selector} blockquote`,
                `${selector} pre`,
                `${selector} code`
                // Note: h1-h6 are excluded so they keep their own size/weight
            ].join(',\n');

            cssRules.push(`${bodySelectors} { ${decls}; }`);
        }

        return cssRules.join('\n');
    }

    // Build CSS rules for article structure style
    function buildArticleCssRules(baseSelector, structureStyles) {
        const rules = [];

        for (const [tag, data] of Object.entries(structureStyles)) {
            const declarations = [];

            for (const [prop, propData] of Object.entries(data.properties)) {
                if (propData.enabled && PROP_MAP[prop]) {
                    declarations.push(`${PROP_MAP[prop]}: ${propData.value} !important`);
                }
            }

            if (declarations.length > 0) {
                rules.push(`${baseSelector} ${tag.toLowerCase()} { ${declarations.join('; ')}; }`);
            }
        }

        return rules.join('\n');
    }

    // Generate @font-face rule from loaded font data
    function generateFontFaceRule(fontData, sourceUrl) {
        const src = sourceUrl.startsWith('data:')
            ? `url("${sourceUrl}")`
            : `url("${sourceUrl}")`;

        return `@font-face {
            font-family: "${fontData.family}";
            font-weight: ${fontData.weight};
            font-style: ${fontData.style};
            font-stretch: ${fontData.stretch || 'normal'};
            src: ${src};
            ${fontData.unicodeRange ? `unicode-range: ${fontData.unicodeRange};` : ''}
        }`;
    }

    function hasFontFaceRule(existingRules, fontData) {
        const familyNeedle = `font-family: "${fontData.family}"`;
        const weightNeedle = `font-weight: ${fontData.weight}`;
        const styleNeedle = `font-style: ${fontData.style}`;
        return existingRules.includes(familyNeedle) &&
            existingRules.includes(weightNeedle) &&
            existingRules.includes(styleNeedle);
    }

    function buildFontFaceRulesFromDescriptors(descriptors, capturedFonts, existingRulesText) {
        const rules = [];
        const capturedByUrl = new Map();
        const seen = new Set();

        capturedFonts.forEach(font => {
            if (font.dataUrl) {
                capturedByUrl.set(font.url, font.dataUrl);
            }
        });

        descriptors.forEach(descriptor => {
            if (!descriptor || !descriptor.family) return;
            const sources = descriptor.sources || [];
            if (sources.length === 0) return;

            let sourceUrl = sources[0];
            for (const source of sources) {
                if (capturedByUrl.has(source)) {
                    sourceUrl = capturedByUrl.get(source);
                    break;
                }
            }

            const fontData = {
                family: descriptor.family,
                weight: descriptor.weight || 'normal',
                style: descriptor.style || 'normal',
                stretch: descriptor.stretch || 'normal',
                unicodeRange: descriptor.unicodeRange || 'U+0-10FFFF'
            };

            const key = `${fontData.family}|${fontData.weight}|${fontData.style}|${sourceUrl}`;
            if (seen.has(key)) return;
            seen.add(key);

            if (!hasFontFaceRule(existingRulesText + rules.join('\n'), fontData)) {
                rules.push(generateFontFaceRule(fontData, sourceUrl));
            }
        });

        return rules;
    }

    // Inject font resources (Google Fonts links and @font-face rules)
    // Enhanced to handle captured font data and Font Loading API metadata
    function injectFontResources(fontResources) {
        if (!fontResources) return;

        // For article styles, fontResources is an object with keys being tag names
        const isArticleStyle = typeof fontResources === 'object' &&
            Object.keys(fontResources).some(key => ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P'].includes(key));

        let allGoogleFontsLinks = [];
        let allFontFaceRules = [];
        let allFontFaceEntries = [];
        let allLoadedFonts = [];
        let allCapturedFonts = [];
        let allFontUrls = [];

        if (isArticleStyle) {
            // Article style - collect from all element types
            Object.values(fontResources).forEach(resources => {
                if (resources && resources.googleFontsLinks) {
                    allGoogleFontsLinks.push(...resources.googleFontsLinks);
                }
                if (resources && resources.fontFaceRules) {
                    allFontFaceRules.push(...resources.fontFaceRules);
                }
                if (resources && resources.fontFaceEntries) {
                    allFontFaceEntries.push(...resources.fontFaceEntries);
                }
                if (resources && resources.loadedFonts) {
                    allLoadedFonts.push(...resources.loadedFonts);
                }
                if (resources && resources.capturedFonts) {
                    allCapturedFonts.push(...resources.capturedFonts);
                }
                if (resources && resources.fontUrls) {
                    allFontUrls.push(...resources.fontUrls);
                }
            });
        } else {
            // Single style - use directly
            if (fontResources.googleFontsLinks) {
                allGoogleFontsLinks = fontResources.googleFontsLinks;
            }
            if (fontResources.fontFaceRules) {
                allFontFaceRules = fontResources.fontFaceRules;
            }
            if (fontResources.fontFaceEntries) {
                allFontFaceEntries = fontResources.fontFaceEntries;
            }
            if (fontResources.loadedFonts) {
                allLoadedFonts = fontResources.loadedFonts;
            }
            if (fontResources.capturedFonts) {
                allCapturedFonts = fontResources.capturedFonts;
            }
            if (fontResources.fontUrls) {
                allFontUrls = fontResources.fontUrls;
            }
        }

        // Remove duplicates
        allGoogleFontsLinks = [...new Set(allGoogleFontsLinks)];
        allFontFaceRules = [...new Set(allFontFaceRules)];
        allFontUrls = [...new Set(allFontUrls)];

        // Inject Google Fonts links
        allGoogleFontsLinks.forEach(href => {
            const linkId = 'style-copier-font-' + btoa(href).replace(/=/g, '').substring(0, 20);
            if (!document.getElementById(linkId)) {
                const link = document.createElement('link');
                link.id = linkId;
                link.rel = 'stylesheet';
                link.href = href;
                document.head.appendChild(link);
            }
        });

        // Prepare font style element
        let fontFaceStyleEl = document.getElementById('style-copier-fonts');
        if (!fontFaceStyleEl) {
            fontFaceStyleEl = document.createElement('style');
            fontFaceStyleEl.id = 'style-copier-fonts';
            document.head.appendChild(fontFaceStyleEl);
        }

        const existingRules = fontFaceStyleEl.textContent;

        // Inject existing @font-face rules (from accessible stylesheets)
        allFontFaceRules.forEach(rule => {
            if (!existingRules.includes(rule)) {
                fontFaceStyleEl.textContent += '\n' + rule;
            }
        });

        // Generate and inject @font-face rules from captured font data and descriptors
        const descriptors = [...allFontFaceEntries, ...allLoadedFonts];
        const generatedRules = buildFontFaceRulesFromDescriptors(
            descriptors,
            allCapturedFonts,
            fontFaceStyleEl.textContent
        );
        if (generatedRules.length > 0) {
            fontFaceStyleEl.textContent += '\n' + generatedRules.join('\n');
        }

        // If we still have font URLs but no other data, try to load them directly
        // This is a last resort for cross-origin fonts
        if (allFontUrls.length > 0 && allFontFaceRules.length === 0 && allLoadedFonts.length === 0 && allFontFaceEntries.length === 0) {
            console.log('Style Copier: Attempting to load fonts from URLs:', allFontUrls);
            allFontUrls.forEach(url => {
                // Create a basic @font-face rule with the URL
                // Note: This may not work if the font server blocks cross-origin requests
                const fontName = extractFontNameFromUrl(url);
                if (fontName) {
                    const rule = `@font-face {
                        font-family: "${fontName}";
                        src: url("${url}");
                    }`;
                    if (!existingRules.includes(url)) {
                        fontFaceStyleEl.textContent += '\n' + rule;
                    }
                }
            });
        }
    }

    // Try to extract font name from URL path
    function extractFontNameFromUrl(url) {
        try {
            const pathname = new URL(url).pathname;
            const filename = pathname.split('/').pop();
            // Remove extension and common suffixes
            let name = filename.replace(/\.(woff2?|ttf|otf|eot|svg)$/i, '');
            name = name.replace(/[-_](regular|bold|italic|light|medium|semibold|thin|black|condensed)/gi, ' $1');
            return name.trim() || null;
        } catch (e) {
            return null;
        }
    }

    // Apply saved styles for current page
    function applyStoredStyles() {
        chrome.storage.local.get(['appliedRules', 'savedStyles'], (result) => {
            const rules = result.appliedRules || [];
            const styles = result.savedStyles || [];
            const currentUrl = window.location.href;

            // Filter rules for current URL
            const matchingRules = rules.filter(rule => {
                if (rule.urlPattern.endsWith('*')) {
                    const prefix = rule.urlPattern.slice(0, -1);
                    return currentUrl.startsWith(prefix);
                }
                return currentUrl === rule.urlPattern;
            });

            if (matchingRules.length === 0) return;

            // Build and inject stylesheet
            // Reverse the order so the topmost (most recent) rule takes effect last
            let css = '';
            matchingRules.reverse().forEach(rule => {
                const style = styles.find(s => s.id === rule.styleId);
                if (style) {
                    // Inject font resources for this style
                    if (style.fontResources) {
                        injectFontResources(style.fontResources);
                    }

                    if (style.type === 'article' && style.structureStyles) {
                        // Article structure style - apply different rules per element type
                        css += buildArticleCssRules(rule.selector, style.structureStyles) + '\n';
                    } else if (style.properties) {
                        // Single element style
                        css += buildCssRule(rule.selector, style.properties, rule.options) + '\n';
                    }
                }
            });

            if (css) {
                let styleEl = document.getElementById('style-copier-applied');
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = 'style-copier-applied';
                    document.head.appendChild(styleEl);
                }
                styleEl.textContent = css;
            }
        });
    }

    // Show picker mode hint
    function showPickerHint() {
        pickerHint = document.createElement('div');
        pickerHint.className = 'style-copier-picker-hint';
        pickerHint.innerHTML = 'Click an element to apply style <button>Cancel</button>';

        pickerHint.querySelector('button').addEventListener('click', exitPickerMode);
        document.body.appendChild(pickerHint);
    }

    // Enter element picker mode
    function enterPickerMode(styleId) {
        pickerActive = true;
        pendingStyleId = styleId;
        showPickerHint();
        document.body.style.cursor = 'crosshair';
    }

    // Exit picker mode
    function exitPickerMode() {
        pickerActive = false;
        pendingStyleId = null;
        document.body.style.cursor = '';

        if (pickerHint && pickerHint.parentNode) {
            pickerHint.parentNode.removeChild(pickerHint);
            pickerHint = null;
        }

        if (currentHighlight) {
            currentHighlight.classList.remove('style-copier-highlight');
            currentHighlight = null;
        }
    }

    // Handle hover during picker mode
    function handleMouseOver(e) {
        if (!pickerActive) return;

        if (currentHighlight) {
            currentHighlight.classList.remove('style-copier-highlight');
        }

        if (!e.target.closest('.style-copier-picker-hint')) {
            currentHighlight = e.target;
            currentHighlight.classList.add('style-copier-highlight');
        }
    }

    // Handle click during picker mode
    function handlePickerClick(e) {
        if (!pickerActive) return;
        if (e.target.closest('.style-copier-picker-hint')) return;

        e.preventDefault();
        e.stopPropagation();

        const selector = getSelector(e.target);
        const urlPattern = window.location.origin + window.location.pathname + '*';

        // Use Smart Apply for most elements to handle nesting and preserve hierarchy
        // BUT use Exact Apply (smartApply: false) for Headings to allow forcing a specific style on them
        const isHeading = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(e.target.tagName);
        const options = {
            smartApply: !isHeading
        };

        saveAndApplyStyle(pendingStyleId, selector, urlPattern, () => {
            exitPickerMode();
        }, options);
    }

    // Save rule and apply style immediately
    function saveAndApplyStyle(styleId, selector, urlPattern, callback, options = {}) {
        chrome.storage.local.get(['appliedRules', 'savedStyles'], (result) => {
            const rules = result.appliedRules || [];
            const styles = result.savedStyles || [];

            // Check for duplicate rule (same styleId + selector + urlPattern)
            const isDuplicate = rules.some(rule =>
                rule.styleId === styleId &&
                rule.selector === selector &&
                rule.urlPattern === urlPattern
            );

            if (isDuplicate) {
                showToast('Style already applied to this element!');
                if (callback) callback();
                return;
            }

            // Add new rule at the beginning (most recent on top)
            rules.unshift({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                styleId: styleId,
                urlPattern: urlPattern,
                styleId: styleId,
                urlPattern: urlPattern,
                selector: selector,
                options: options
            });

            chrome.storage.local.set({ appliedRules: rules }, () => {
                // Apply immediately
                const style = styles.find(s => s.id === styleId);
                if (style) {
                    // Inject font resources for this style
                    if (style.fontResources) {
                        injectFontResources(style.fontResources);
                    }

                    let styleEl = document.getElementById('style-copier-applied');
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = 'style-copier-applied';
                        document.head.appendChild(styleEl);
                    }

                    if (style.type === 'article' && style.structureStyles) {
                        // Article structure style
                        styleEl.textContent += buildArticleCssRules(selector, style.structureStyles) + '\n';
                    } else if (style.properties) {
                        // Single element style
                        const options = rules.length ? rules[0].options : {}; // Use options from the rule we just saved
                        styleEl.textContent += buildCssRule(selector, style.properties, options) + '\n';
                    }
                }

                showToast('Style applied!');
                if (callback) callback();
            });
        });
    }

    // Quick apply to article content
    function quickApplyToArticle(styleId) {
        const article = findArticleContent();
        if (!article) {
            showToast('No article content found on this page');
            return;
        }

        const selector = getSelector(article);
        const urlPattern = window.location.origin + '/*';

        // Check if this is an article structure style
        chrome.storage.local.get(['savedStyles'], (result) => {
            const styles = result.savedStyles || [];
            const style = styles.find(s => s.id === styleId);

            if (style && style.type === 'article') {
                // For article styles, just use the article selector as base
                // The buildArticleCssRules will handle adding proper element selectors
                saveAndApplyStyle(styleId, selector, urlPattern, null);
            } else {
                // For single styles, use Smart Apply on the container
                // This will apply fonts globally but size/spacing only to body text
                saveAndApplyStyle(styleId, selector, urlPattern, null, { smartApply: true });
            }
        });
    }

    // Get applied rules for current page (for popup)
    function getAppliedRulesForCurrentPage(sendResponse) {
        const currentUrl = window.location.href;

        chrome.storage.local.get(['appliedRules', 'savedStyles'], (result) => {
            const rules = result.appliedRules || [];
            const styles = result.savedStyles || [];

            const matchingRules = rules.filter(rule => {
                if (rule.urlPattern.endsWith('*')) {
                    const prefix = rule.urlPattern.slice(0, -1);
                    return currentUrl.startsWith(prefix);
                }
                return currentUrl === rule.urlPattern;
            }).map(rule => {
                const style = styles.find(s => s.id === rule.styleId);
                return {
                    ...rule,
                    styleName: style ? style.name : 'Unknown'
                };
            });

            sendResponse({ rules: matchingRules, url: currentUrl });
        });
    }

    // Remove an applied rule
    function removeAppliedRule(ruleId, sendResponse) {
        chrome.storage.local.get(['appliedRules'], (result) => {
            const rules = (result.appliedRules || []).filter(r => r.id !== ruleId);
            chrome.storage.local.set({ appliedRules: rules }, () => {
                // Refresh styles on page
                const styleEl = document.getElementById('style-copier-applied');
                if (styleEl) {
                    styleEl.remove();
                }
                applyStoredStyles();
                sendResponse({ success: true });
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

    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'START_PICKER') {
            enterPickerMode(message.styleId);
        }
        if (message.type === 'QUICK_APPLY') {
            quickApplyToArticle(message.styleId);
        }
        if (message.type === 'GET_APPLIED_RULES') {
            getAppliedRulesForCurrentPage(sendResponse);
            return true; // Keep channel open for async response
        }
        if (message.type === 'REMOVE_APPLIED_RULE') {
            removeAppliedRule(message.ruleId, sendResponse);
            return true;
        }
    });

    // Event listeners for picker mode
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('click', handlePickerClick, true);

    // Apply stored styles on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyStoredStyles);
    } else {
        applyStoredStyles();
    }
})();
