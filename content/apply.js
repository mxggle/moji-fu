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
    function buildCssRule(selector, properties) {
        const declarations = [];

        for (const [prop, data] of Object.entries(properties)) {
            if (data.enabled && PROP_MAP[prop]) {
                declarations.push(`${PROP_MAP[prop]}: ${data.value} !important`);
            }
        }

        return `${selector} { ${declarations.join('; ')}; }`;
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
            let css = '';
            matchingRules.forEach(rule => {
                const style = styles.find(s => s.id === rule.styleId);
                if (style) {
                    if (style.type === 'article' && style.structureStyles) {
                        // Article structure style - apply different rules per element type
                        css += buildArticleCssRules(rule.selector, style.structureStyles) + '\n';
                    } else if (style.properties) {
                        // Single element style
                        css += buildCssRule(rule.selector, style.properties) + '\n';
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

        saveAndApplyStyle(pendingStyleId, selector, urlPattern, () => {
            exitPickerMode();
        });
    }

    // Save rule and apply style immediately
    function saveAndApplyStyle(styleId, selector, urlPattern, callback) {
        chrome.storage.local.get(['appliedRules', 'savedStyles'], (result) => {
            const rules = result.appliedRules || [];
            const styles = result.savedStyles || [];

            // Add new rule
            rules.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                styleId: styleId,
                urlPattern: urlPattern,
                selector: selector
            });

            chrome.storage.local.set({ appliedRules: rules }, () => {
                // Apply immediately
                const style = styles.find(s => s.id === styleId);
                if (style) {
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
                        styleEl.textContent += buildCssRule(selector, style.properties) + '\n';
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
                // For single styles, apply to article and all text elements inside
                const textSelectors = [
                    selector,
                    `${selector} p`,
                    `${selector} h1`,
                    `${selector} h2`,
                    `${selector} h3`,
                    `${selector} h4`,
                    `${selector} li`,
                    `${selector} span`,
                    `${selector} a`
                ].join(', ');

                saveAndApplyStyle(styleId, textSelectors, urlPattern, null);
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
