// Style Copier - Popup Script

(function () {
    'use strict';

    // Property display names
    const PROP_LABELS = {
        fontFamily: 'Font Family',
        fontSize: 'Font Size',
        fontWeight: 'Font Weight',
        fontStyle: 'Font Style',
        color: 'Color',
        lineHeight: 'Line Height',
        letterSpacing: 'Letter Spacing',
        textDecoration: 'Text Decoration',
        textTransform: 'Text Transform',
        textShadow: 'Text Shadow'
    };

    // CSS property mapping for inline styles
    const CSS_PROPS = {
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

    let savedStyles = [];
    let appliedRules = [];
    let editingStyleId = null;
    let editingProperties = null;
    let editingType = null; // Track the type of style being edited

    // DOM Elements
    const styleList = document.getElementById('style-list');
    const emptyState = document.getElementById('empty-state');
    const appliedList = document.getElementById('applied-list');
    const appliedEmpty = document.getElementById('applied-empty');
    const editModal = document.getElementById('edit-modal');
    const editPreview = document.getElementById('edit-preview');
    const propertyList = document.getElementById('property-list');
    const closeModalBtn = document.getElementById('close-modal');
    const saveChangesBtn = document.getElementById('save-changes');
    const cancelEditBtn = document.getElementById('cancel-edit');
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');

            if (targetTab === 'applied') {
                loadAppliedRules();
            }
        });
    });

    // Load saved styles from storage
    function loadStyles() {
        chrome.storage.local.get(['savedStyles'], (result) => {
            savedStyles = result.savedStyles || [];
            renderStyleList();
        });
    }

    // Load applied rules for current page
    function loadAppliedRules() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_APPLIED_RULES' }, (response) => {
                    if (chrome.runtime.lastError) {
                        appliedEmpty.style.display = 'block';
                        appliedEmpty.innerHTML = '<p>Cannot access this page.</p>';
                        appliedList.innerHTML = '';
                        return;
                    }
                    if (response && response.rules) {
                        appliedRules = response.rules;
                        renderAppliedList();
                    }
                });
            }
        });
    }

    // Inject font resources into the popup for previews
    function injectFontResourcesForPreview(fontResources) {
        if (!fontResources) return;

        // For article styles, fontResources is an object with keys being tag names
        const isArticleStyle = typeof fontResources === 'object' &&
            Object.keys(fontResources).some(key => ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P'].includes(key));

        let allGoogleFontsLinks = [];
        let allFontFaceRules = [];

        if (isArticleStyle) {
            // Article style - collect from all element types
            Object.values(fontResources).forEach(resources => {
                if (resources && resources.googleFontsLinks) {
                    allGoogleFontsLinks.push(...resources.googleFontsLinks);
                }
                if (resources && resources.fontFaceRules) {
                    allFontFaceRules.push(...resources.fontFaceRules);
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
        }

        // Remove duplicates
        allGoogleFontsLinks = [...new Set(allGoogleFontsLinks)];
        allFontFaceRules = [...new Set(allFontFaceRules)];

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

        // Inject @font-face rules
        if (allFontFaceRules.length > 0) {
            let fontFaceStyleEl = document.getElementById('style-copier-popup-fonts');
            if (!fontFaceStyleEl) {
                fontFaceStyleEl = document.createElement('style');
                fontFaceStyleEl.id = 'style-copier-popup-fonts';
                document.head.appendChild(fontFaceStyleEl);
            }

            // Append new font-face rules (avoiding duplicates)
            const existingRules = fontFaceStyleEl.textContent;
            allFontFaceRules.forEach(rule => {
                if (!existingRules.includes(rule)) {
                    fontFaceStyleEl.textContent += '\n' + rule;
                }
            });
        }
    }

    // Render the style list
    function renderStyleList() {
        if (savedStyles.length === 0) {
            emptyState.style.display = 'block';
            styleList.innerHTML = '';
            return;
        }

        emptyState.style.display = 'none';
        styleList.innerHTML = savedStyles.map(style => {
            // Inject font resources so preview shows correct fonts
            if (style.fontResources) {
                injectFontResourcesForPreview(style.fontResources);
            }

            const isArticle = style.type === 'article';
            const typeBadge = isArticle
                ? '<span class="type-badge article-badge">Article</span>'
                : '<span class="type-badge single-badge">Single</span>';

            if (isArticle) {
                // Article structure style display
                const elementPreviews = Object.entries(style.structureStyles || {})
                    .map(([tag, data]) => {
                        const previewStyle = buildInlineStyle(data.properties);
                        return `<div class="element-preview"><span class="element-tag">${tag}</span><span style="${previewStyle}">${escapeHtml(data.sampleText)}</span></div>`;
                    }).join('');

                return `
                    <li class="style-item" data-id="${style.id}">
                        <div class="style-header">
                            ${typeBadge}
                            <span class="style-name">${escapeHtml(style.name)}</span>
                            <div class="style-actions">
                                <button class="icon-btn edit-btn" title="Edit">✎</button>
                                <button class="icon-btn delete delete-btn" title="Delete">×</button>
                            </div>
                        </div>
                        <div class="article-preview">
                            ${elementPreviews}
                        </div>
                        <div class="source-url" title="${escapeHtml(style.sourceUrl)}">
                            ${escapeHtml(truncateUrl(style.sourceUrl))}
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-primary quick-apply-btn" title="Auto-apply to article content">⚡ Auto Apply</button>
                            <button class="btn btn-secondary apply-btn" title="Select element to apply">Select</button>
                        </div>
                    </li>
                `;
            } else {
                // Single element style display (original)
                return `
                    <li class="style-item" data-id="${style.id}">
                        <div class="style-header">
                            ${typeBadge}
                            <span class="style-name">${escapeHtml(style.name)}</span>
                            <div class="style-actions">
                                <button class="icon-btn edit-btn" title="Edit">✎</button>
                                <button class="icon-btn delete delete-btn" title="Delete">×</button>
                            </div>
                        </div>
                        <div class="preview-text" style="${buildInlineStyle(style.properties)}">
                            ${escapeHtml(style.sampleText || 'Sample Text')}
                        </div>
                        <div class="source-url" title="${escapeHtml(style.sourceUrl)}">
                            ${escapeHtml(truncateUrl(style.sourceUrl))}
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-primary quick-apply-btn" title="Auto-apply to article content">⚡ Auto Apply</button>
                            <button class="btn btn-secondary apply-btn" title="Select element to apply">Select</button>
                        </div>
                    </li>
                `;
            }
        }).join('');

        // Attach event listeners
        styleList.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', handleEdit);
        });
        styleList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', handleDelete);
        });
        styleList.querySelectorAll('.apply-btn').forEach(btn => {
            btn.addEventListener('click', handleApply);
        });
        styleList.querySelectorAll('.quick-apply-btn').forEach(btn => {
            btn.addEventListener('click', handleQuickApply);
        });
    }

    // Render applied rules list
    function renderAppliedList() {
        if (appliedRules.length === 0) {
            appliedEmpty.style.display = 'block';
            appliedList.innerHTML = '';
            return;
        }

        appliedEmpty.style.display = 'none';
        // Reverse to show most recent on top (since we use unshift when adding)
        const displayRules = [...appliedRules].reverse();
        appliedList.innerHTML = displayRules.map(rule => `
      <li class="style-item applied-item" data-id="${rule.id}">
        <div class="style-header">
          <span class="style-name">${escapeHtml(rule.styleName)}</span>
          <button class="icon-btn delete remove-rule-btn" title="Remove">×</button>
        </div>
        <div class="applied-info">
          <div class="applied-selector" title="${escapeHtml(rule.selector)}">
            <strong>Selector:</strong> ${escapeHtml(truncateText(rule.selector, 40))}
          </div>
          <div class="applied-url" title="${escapeHtml(rule.urlPattern)}">
            <strong>URL:</strong> ${escapeHtml(truncateText(rule.urlPattern, 35))}
          </div>
        </div>
      </li>
    `).join('');

        // Attach remove listeners
        appliedList.querySelectorAll('.remove-rule-btn').forEach(btn => {
            btn.addEventListener('click', handleRemoveRule);
        });
    }

    // Handle remove applied rule
    function handleRemoveRule(e) {
        const id = e.target.closest('.applied-item').dataset.id;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'REMOVE_APPLIED_RULE', ruleId: id }, () => {
                    loadAppliedRules();
                });
            }
        });
    }

    // Build inline style string from properties
    function buildInlineStyle(properties) {
        return Object.entries(properties)
            .filter(([_, data]) => data.enabled)
            .map(([prop, data]) => `${CSS_PROPS[prop]}: ${data.value}`)
            .join('; ');
    }

    // Truncate URL for display
    function truncateUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname + (urlObj.pathname.length > 20
                ? urlObj.pathname.slice(0, 20) + '...'
                : urlObj.pathname);
        } catch {
            return url.slice(0, 40) + '...';
        }
    }

    // Truncate text
    function truncateText(text, maxLen) {
        return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Get style ID from button click
    function getStyleId(btn) {
        return btn.closest('.style-item').dataset.id;
    }

    // Handle edit button click
    function handleEdit(e) {
        const id = getStyleId(e.target);
        const style = savedStyles.find(s => s.id === id);
        if (!style) return;

        editingStyleId = id;
        editingType = style.type || 'single';

        if (editingType === 'article') {
            // For article styles, show structure editing
            editingProperties = JSON.parse(JSON.stringify(style.structureStyles));
            editPreview.innerHTML = Object.entries(editingProperties)
                .map(([tag, data]) => `<div class="edit-element-preview" data-tag="${tag}"><strong>${tag}:</strong> <span style="${buildInlineStyle(data.properties)}">${escapeHtml(data.sampleText)}</span></div>`)
                .join('');
            renderArticleEditModal();
        } else {
            // Single element style
            editingProperties = JSON.parse(JSON.stringify(style.properties));
            editPreview.textContent = style.sampleText || 'Sample Text';
            renderEditModal();
            updateEditPreview();
        }

        editModal.classList.remove('hidden');
    }

    // Render edit modal property list for single element
    function renderEditModal() {
        propertyList.innerHTML = Object.entries(editingProperties).map(([prop, data]) => `
            <li class="property-item">
                <div class="property-info">
                    <div class="property-name">${PROP_LABELS[prop]}</div>
                    <div class="property-value" title="${escapeHtml(data.value)}">${escapeHtml(data.value)}</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" data-prop="${prop}" ${data.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </li>
        `).join('');

        propertyList.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', handleToggle);
        });
    }

    // Render edit modal for article structure styles
    function renderArticleEditModal() {
        let html = '';

        for (const [tag, data] of Object.entries(editingProperties)) {
            html += `
                <li class="property-section">
                    <div class="section-header">${tag}</div>
                    <ul class="section-properties">
            `;

            for (const [prop, propData] of Object.entries(data.properties)) {
                html += `
                    <li class="property-item">
                        <div class="property-info">
                            <div class="property-name">${PROP_LABELS[prop]}</div>
                            <div class="property-value" title="${escapeHtml(propData.value)}">${escapeHtml(propData.value)}</div>
                        </div>
                        <label class="toggle">
                            <input type="checkbox" data-tag="${tag}" data-prop="${prop}" ${propData.enabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </li>
                `;
            }

            html += `
                    </ul>
                </li>
            `;
        }

        propertyList.innerHTML = html;

        propertyList.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', handleArticleToggle);
        });
    }

    // Handle property toggle for article styles
    function handleArticleToggle(e) {
        const tag = e.target.dataset.tag;
        const prop = e.target.dataset.prop;
        editingProperties[tag].properties[prop].enabled = e.target.checked;
        updateArticleEditPreview();
    }

    // Update article edit preview
    function updateArticleEditPreview() {
        editPreview.innerHTML = Object.entries(editingProperties)
            .map(([tag, data]) => `<div class="edit-element-preview" data-tag="${tag}"><strong>${tag}:</strong> <span style="${buildInlineStyle(data.properties)}">${escapeHtml(data.sampleText)}</span></div>`)
            .join('');
    }

    // Handle property toggle
    function handleToggle(e) {
        const prop = e.target.dataset.prop;
        editingProperties[prop].enabled = e.target.checked;
        updateEditPreview();
    }

    // Update edit modal preview
    function updateEditPreview() {
        editPreview.style.cssText = buildInlineStyle(editingProperties);
    }

    // Close edit modal
    function closeModal() {
        editModal.classList.add('hidden');
        editingStyleId = null;
        editingProperties = null;
        editingType = null;
    }

    // Save edited style
    function saveEdit() {
        const idx = savedStyles.findIndex(s => s.id === editingStyleId);
        if (idx === -1) return;

        if (editingType === 'article') {
            savedStyles[idx].structureStyles = editingProperties;
        } else {
            savedStyles[idx].properties = editingProperties;
        }

        chrome.storage.local.set({ savedStyles }, () => {
            renderStyleList();
            closeModal();
        });
    }

    // Handle delete button click
    function handleDelete(e) {
        const id = getStyleId(e.target);
        savedStyles = savedStyles.filter(s => s.id !== id);

        chrome.storage.local.set({ savedStyles }, () => {
            renderStyleList();
            chrome.runtime.sendMessage({ type: 'STYLE_SAVED' });
        });
    }

    // Handle apply button click
    function handleApply(e) {
        const id = getStyleId(e.target);
        chrome.runtime.sendMessage({ type: 'START_PICKER', styleId: id });
        window.close();
    }

    // Handle quick apply button click
    function handleQuickApply(e) {
        const id = getStyleId(e.target);
        chrome.runtime.sendMessage({ type: 'QUICK_APPLY', styleId: id });
        window.close();
    }

    // Event listeners
    closeModalBtn.addEventListener('click', closeModal);
    cancelEditBtn.addEventListener('click', closeModal);
    saveChangesBtn.addEventListener('click', saveEdit);

    // Selection-based collect button (toggle)
    const selectionCollectBtn = document.getElementById('selection-collect-btn');
    if (selectionCollectBtn) {
        // Check current selection mode state when popup opens
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTION_MODE_STATE' }, (response) => {
                    if (chrome.runtime.lastError) {
                        return; // Can't access page
                    }
                    if (response && response.isActive) {
                        selectionCollectBtn.textContent = '✕ Exit Select';
                        selectionCollectBtn.classList.add('btn-active');
                    }
                });
            }
        });

        // Toggle selection mode on click
        selectionCollectBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_SELECTION_MODE' }, (response) => {
                        if (chrome.runtime.lastError) {
                            // Show error state briefly
                            selectionCollectBtn.textContent = '❌ Failed';
                            setTimeout(() => {
                                selectionCollectBtn.textContent = '✨ Select Text';
                            }, 1500);
                            return;
                        }

                        if (response && response.isActive) {
                            // Selection mode is now ON - close popup to let user select
                            window.close();
                        } else {
                            // Selection mode is now OFF - update button
                            selectionCollectBtn.textContent = '✨ Select Text';
                            selectionCollectBtn.classList.remove('btn-active');
                        }
                    });
                }
            });
        });
    }

    // Auto-collect button
    const autoCollectBtn = document.getElementById('auto-collect-btn');
    if (autoCollectBtn) {
        autoCollectBtn.addEventListener('click', () => {
            autoCollectBtn.disabled = true;
            autoCollectBtn.textContent = 'Collecting...';

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'AUTO_COLLECT_ARTICLE' }, (response) => {
                        autoCollectBtn.disabled = false;
                        autoCollectBtn.textContent = '📄 Collect';

                        if (chrome.runtime.lastError) {
                            // Show error state briefly
                            autoCollectBtn.textContent = '❌ Failed';
                            setTimeout(() => {
                                autoCollectBtn.textContent = '📄 Collect';
                            }, 1500);
                            return;
                        }

                        if (response && response.success) {
                            autoCollectBtn.textContent = '✓ Collected!';
                            setTimeout(() => {
                                autoCollectBtn.textContent = '📄 Collect';
                            }, 1500);
                            // Refresh the style list
                            loadStyles();
                        }
                    });
                }
            });
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !editModal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Initialize
    loadStyles();
})();
