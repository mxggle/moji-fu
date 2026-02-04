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
    // Prioritizes generating specific selectors that target only the article content
    function getSelector(element) {
        if (!element || element === document.body || element === document.documentElement) {
            return 'body';
        }

        // 1. If element has a unique ID, use it
        if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
            return `#${element.id}`;
        }

        // 2. For semantic elements, prefer using role or tag directly
        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute('role');

        // Check if we can use a simple selector
        if (tagName === 'article' || tagName === 'main') {
            // Check if there's only one of this element
            if (document.querySelectorAll(tagName).length === 1) {
                return tagName;
            }
        }

        if (role === 'main' || role === 'article') {
            if (document.querySelectorAll(`[role="${role}"]`).length === 1) {
                return `[role="${role}"]`;
            }
        }

        // 3. Build a path with classes
        const path = [];
        let current = element;

        while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
            let selector = current.tagName.toLowerCase();

            // Add meaningful classes (skip utility classes and moji-fu classes)
            if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim().split(/\s+/)
                    .filter(c => c &&
                        !c.startsWith('moji-fu-') &&
                        !c.match(/^(is-|has-|js-|u-|wp-block-)/i) && // Skip utility prefixes
                        c.length > 2 && c.length < 30) // Skip very short or very long classes
                    .slice(0, 2);
                if (classes.length) {
                    selector += '.' + classes.join('.');
                }
            }

            // Add nth-of-type if there are multiple siblings with same selector
            if (current.parentElement) {
                const siblings = current.parentElement.querySelectorAll(`:scope > ${selector}`);
                if (siblings.length > 1) {
                    const index = Array.from(siblings).indexOf(current) + 1;
                    selector += `:nth-of-type(${index})`;
                }
            }

            path.unshift(selector);
            current = current.parentElement;

            // Stop after building 4 levels deep (usually enough for uniqueness)
            if (path.length >= 4) break;
        }

        const fullSelector = path.join(' > ');

        // Verify this selector is unique (matches only the target element)
        try {
            const matches = document.querySelectorAll(fullSelector);
            if (matches.length === 1 && matches[0] === element) {
                return fullSelector;
            }
        } catch (e) {
            // If selector is invalid, fall through
        }

        // 4. Fallback: use a simpler selector with just immediate context
        return path.slice(-2).join(' > ') || tagName;
    }

    // Readability-style content detection
    // Positive indicators for main content
    const POSITIVE_PATTERNS = /article|body|content|entry|main|page|post|text|blog|story|prose/i;
    // Negative indicators (UI elements, navigation, ads)
    const NEGATIVE_PATTERNS = /combx|comment|community|disqus|extra|foot|header|menu|modal|nav|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter|facebook|social|share|related|recommend|widget|overlay|dialog|banner|promo|newsletter/i;
    // Elements that are definitely NOT main content
    const UNLIKELY_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'APPLET', 'NAV', 'ASIDE', 'HEADER', 'FOOTER', 'FORM', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];

    /**
     * Calculate content score for an element using Readability-like heuristics
     */
    function calculateContentScore(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return -1;

        const tagName = element.tagName;

        // Skip unlikely candidates
        if (UNLIKELY_TAGS.includes(tagName)) return -1;

        // Skip elements with very little content
        const text = element.textContent || '';
        if (text.trim().length < 25) return -1;

        let score = 0;

        // 1. Bonus for semantic article containers
        if (tagName === 'ARTICLE') score += 30;
        if (tagName === 'MAIN') score += 25;
        if (element.getAttribute('role') === 'main') score += 25;
        if (element.getAttribute('role') === 'article') score += 30;

        // 2. Score based on class/id names
        const className = element.className || '';
        const id = element.id || '';
        const classAndId = className + ' ' + id;

        if (POSITIVE_PATTERNS.test(classAndId)) score += 25;
        if (NEGATIVE_PATTERNS.test(classAndId)) score -= 50;

        // 3. Count paragraphs - articles have multiple paragraphs
        const paragraphs = element.getElementsByTagName('p');
        const validParagraphs = Array.from(paragraphs).filter(p =>
            p.textContent.trim().length > 50 &&
            p.textContent.split(/\s+/).length > 10
        );
        score += Math.min(validParagraphs.length * 3, 30); // Up to 30 points for paragraphs

        // 4. Text density: ratio of text length to element's HTML length
        const html = element.innerHTML || '';
        const textDensity = text.length / (html.length || 1);
        if (textDensity > 0.25) score += 15; // Good text density
        if (textDensity > 0.5) score += 10;  // Very good density

        // 5. Link density penalty: too many links = probably navigation
        const links = element.getElementsByTagName('a');
        const linkText = Array.from(links).reduce((sum, a) => sum + (a.textContent || '').length, 0);
        const linkDensity = linkText / (text.length || 1);
        if (linkDensity > 0.5) score -= 30; // More than half is links = bad
        if (linkDensity > 0.3) score -= 15;

        // 6. Bonus for containing common article elements
        if (element.querySelector('h1, h2')) score += 5;
        if (element.querySelector('blockquote')) score += 3;
        if (element.querySelector('img')) score += 2;
        if (element.querySelector('figure')) score += 3;

        // 7. Penalty for deeply nested elements (usually not main content)
        let depth = 0;
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
            depth++;
            parent = parent.parentElement;
        }
        if (depth > 8) score -= (depth - 8) * 2;

        // 8. Bonus for reasonable size (not too small, not the entire page)
        const rect = element.getBoundingClientRect();
        if (rect.width > 300 && rect.height > 200) score += 5;

        return score;
    }

    /**
     * Find the main article content using Readability-style scoring
     */
    function findArticleContent() {
        let bestElement = null;
        let bestScore = -Infinity;

        // 1. First, try semantic elements with strong indicators
        const semanticSelectors = [
            'article[role="main"]',
            'main article',
            '[role="main"] article',
            'article',
            '[role="article"]',
            'main',
            '[role="main"]'
        ];

        for (const selector of semanticSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                const score = calculateContentScore(element);
                if (score > bestScore) {
                    bestScore = score;
                    bestElement = element;
                }
            }
        }

        // 2. If semantic search found a good candidate (score > 30), use it
        if (bestScore > 30 && bestElement) {
            console.log('Style Copier: Found article via semantic elements, score:', bestScore);
            return bestElement;
        }

        // 3. Try common article class patterns
        for (const selector of ARTICLE_SELECTORS) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const score = calculateContentScore(element);
                    if (score > bestScore) {
                        bestScore = score;
                        bestElement = element;
                    }
                }
            } catch (e) {
                // Invalid selector, skip
            }
        }

        // 4. If still no good match, do a broader search
        if (bestScore < 20) {
            // Look at all divs and sections
            const candidates = document.querySelectorAll('div, section');
            for (const element of candidates) {
                // Skip very small or very large elements
                const text = element.textContent || '';
                if (text.length < 500 || text.length > 100000) continue;

                const score = calculateContentScore(element);
                if (score > bestScore) {
                    bestScore = score;
                    bestElement = element;
                }
            }
        }

        // 5. Last resort: find the container with the most paragraphs
        if (!bestElement || bestScore < 10) {
            const paragraphs = document.querySelectorAll('p');
            const parentScores = new Map();

            paragraphs.forEach(p => {
                if (p.textContent.trim().length < 50) return;

                let parent = p.parentElement;
                // Go up max 3 levels to find a good container
                for (let i = 0; i < 3 && parent && parent !== document.body; i++) {
                    const current = parentScores.get(parent) || 0;
                    parentScores.set(parent, current + p.textContent.length);
                    parent = parent.parentElement;
                }
            });

            let maxScore = 0;
            for (const [element, score] of parentScores) {
                if (score > maxScore) {
                    maxScore = score;
                    bestElement = element;
                }
            }
        }

        console.log('Style Copier: Best article candidate score:', bestScore, bestElement);
        return bestElement;
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
    // Enhanced to ensure ALL text elements get styled with proper fallbacks
    function buildArticleCssRules(baseSelector, structureStyles) {
        const rules = [];

        // Separate identity properties (apply to all) from typography properties (element-specific)
        const identityProps = ['fontFamily', 'color', 'textShadow'];
        const typographyProps = ['fontSize', 'lineHeight', 'fontWeight', 'letterSpacing', 'fontStyle', 'textDecoration', 'textTransform'];

        // Heading fallback hierarchy: lower headings inherit from higher ones
        const headingFallback = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

        // All text elements that should receive body text styles
        const bodyTextElements = ['p', 'span', 'li', 'td', 'th', 'blockquote', 'figcaption', 'cite', 'q', 'address', 'dd', 'dt', 'label', 'summary'];
        const codeElements = ['code', 'pre', 'kbd', 'samp', 'var'];

        // 1. First, extract identity properties from P (or first available) for universal application
        let baseIdentityProps = {};
        const pStyle = structureStyles['P'] || structureStyles['p'];
        if (pStyle && pStyle.properties) {
            for (const prop of identityProps) {
                const propData = pStyle.properties[prop];
                if (propData && propData.enabled && propData.value) {
                    baseIdentityProps[prop] = propData.value;
                }
            }
        }

        // Fallback to H1 if P not available
        if (Object.keys(baseIdentityProps).length === 0) {
            const h1Style = structureStyles['H1'] || structureStyles['h1'];
            if (h1Style && h1Style.properties) {
                for (const prop of identityProps) {
                    const propData = h1Style.properties[prop];
                    if (propData && propData.enabled && propData.value) {
                        baseIdentityProps[prop] = propData.value;
                    }
                }
            }
        }

        // 2. Apply identity properties (font-family, color) to ALL descendants
        if (Object.keys(baseIdentityProps).length > 0) {
            const identityDecls = Object.entries(baseIdentityProps)
                .map(([prop, value]) => `${PROP_MAP[prop]}: ${value} !important`)
                .join('; ');

            // Apply to container and all descendants
            rules.push(`${baseSelector} { ${identityDecls}; }`);
            rules.push(`${baseSelector} * { ${identityDecls}; }`);
        }

        // 3. Apply specific styles for each captured element type
        for (const [tag, data] of Object.entries(structureStyles)) {
            const declarations = [];

            // For headings, only apply typography props (identity already applied globally)
            // For body text, apply all non-identity props
            for (const [prop, propData] of Object.entries(data.properties)) {
                if (propData.enabled && PROP_MAP[prop] && typographyProps.includes(prop)) {
                    declarations.push(`${PROP_MAP[prop]}: ${propData.value} !important`);
                }
            }

            if (declarations.length > 0) {
                rules.push(`${baseSelector} ${tag.toLowerCase()} { ${declarations.join('; ')}; }`);
            }
        }

        // 4. Create fallback rules for uncaptured headings
        for (let i = 0; i < headingFallback.length; i++) {
            const heading = headingFallback[i];
            if (!structureStyles[heading] && !structureStyles[heading.toLowerCase()]) {
                // Find the closest captured heading to inherit from
                let fallbackStyle = null;

                // First try higher headings (H3 → H2 → H1)
                for (let j = i - 1; j >= 0; j--) {
                    const higherHeading = headingFallback[j];
                    if (structureStyles[higherHeading] || structureStyles[higherHeading.toLowerCase()]) {
                        fallbackStyle = structureStyles[higherHeading] || structureStyles[higherHeading.toLowerCase()];
                        break;
                    }
                }

                // If no higher heading, try lower headings (H3 → H4 → H5 → H6)
                if (!fallbackStyle) {
                    for (let j = i + 1; j < headingFallback.length; j++) {
                        const lowerHeading = headingFallback[j];
                        if (structureStyles[lowerHeading] || structureStyles[lowerHeading.toLowerCase()]) {
                            fallbackStyle = structureStyles[lowerHeading] || structureStyles[lowerHeading.toLowerCase()];
                            break;
                        }
                    }
                }

                if (fallbackStyle && fallbackStyle.properties) {
                    const fallbackDecls = [];
                    for (const [prop, propData] of Object.entries(fallbackStyle.properties)) {
                        if (propData.enabled && PROP_MAP[prop] && typographyProps.includes(prop)) {
                            fallbackDecls.push(`${PROP_MAP[prop]}: ${propData.value} !important`);
                        }
                    }
                    if (fallbackDecls.length > 0) {
                        rules.push(`${baseSelector} ${heading.toLowerCase()} { ${fallbackDecls.join('; ')}; }`);
                    }
                }
            }
        }

        // 5. Apply P's typography to all body text elements that weren't explicitly captured
        if (pStyle && pStyle.properties) {
            const pTypographyDecls = [];
            for (const prop of typographyProps) {
                const propData = pStyle.properties[prop];
                if (propData && propData.enabled && propData.value && PROP_MAP[prop]) {
                    pTypographyDecls.push(`${PROP_MAP[prop]}: ${propData.value} !important`);
                }
            }

            if (pTypographyDecls.length > 0) {
                const decls = pTypographyDecls.join('; ');

                // Apply to common text elements
                for (const el of bodyTextElements) {
                    if (!structureStyles[el.toUpperCase()] && !structureStyles[el]) {
                        rules.push(`${baseSelector} ${el} { ${decls}; }`);
                    }
                }

                // Apply to inline elements within the container
                rules.push(`${baseSelector} a { ${decls}; }`);
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
            Object.keys(fontResources).some(key => ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'BLOCKQUOTE', 'LI'].includes(key));

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
            const linkId = 'moji-fu-font-' + btoa(href).replace(/=/g, '').substring(0, 20);
            if (!document.getElementById(linkId)) {
                const link = document.createElement('link');
                link.id = linkId;
                link.rel = 'stylesheet';
                link.href = href;
                document.head.appendChild(link);
            }
        });

        // Prepare font style element
        let fontFaceStyleEl = document.getElementById('moji-fu-fonts');
        if (!fontFaceStyleEl) {
            fontFaceStyleEl = document.createElement('style');
            fontFaceStyleEl.id = 'moji-fu-fonts';
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
                let styleEl = document.getElementById('moji-fu-applied');
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = 'moji-fu-applied';
                    document.head.appendChild(styleEl);
                }
                styleEl.textContent = css;
            }
        });
    }

    // Show picker mode hint
    function showPickerHint() {
        pickerHint = document.createElement('div');
        pickerHint.className = 'moji-fu-picker-hint';
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
            currentHighlight.classList.remove('moji-fu-highlight');
            currentHighlight = null;
        }
    }

    // Handle hover during picker mode
    function handleMouseOver(e) {
        if (!pickerActive) return;

        if (currentHighlight) {
            currentHighlight.classList.remove('moji-fu-highlight');
        }

        if (!e.target.closest('.moji-fu-picker-hint')) {
            currentHighlight = e.target;
            currentHighlight.classList.add('moji-fu-highlight');
        }
    }

    // Handle click during picker mode
    function handlePickerClick(e) {
        if (!pickerActive) return;
        if (e.target.closest('.moji-fu-picker-hint')) return;

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

                    let styleEl = document.getElementById('moji-fu-applied');
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = 'moji-fu-applied';
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
                const styleEl = document.getElementById('moji-fu-applied');
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
        toast.className = 'moji-fu-toast';
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
