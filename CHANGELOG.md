# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-02-18

### ✨ New Features
- **Inline Value Editing**: Click any property value in the edit modal to modify it directly. Different property types get appropriate editors:
  - Text input for font size, line height, letter spacing, font family, text decoration, and text shadow
  - Dropdown select for font weight (100–900), font style (normal/italic/oblique), and text transform (none/uppercase/lowercase/capitalize)
  - Color picker with hex text input for color properties
- **Rich Applied Styles List**: The "Applied" tab now shows full style previews matching the collected styles list, including type badges, styled sample text, article element previews, and font rendering — instead of just a plain title.
- **Edit Applied Styles**: Applied styles now have an edit button, allowing you to tweak property values directly from the Applied tab.

### 🐛 Bug Fixes
- **Applied Tab Edit Button**: Fixed edit button not responding on the Applied tab. The handler was reading the rule ID instead of the saved style ID.

## [1.2.0] - 2026-02-18

### 🚀 Major Improvements
- **Unlimited Storage**: Migrated the storage backend for saved styles from `chrome.storage.local` (limited to ~10MB) to **IndexedDB** (virtually unlimited). This resolves the `QuotaExceededError` when saving multiple styles with embedded font files.
- **Shared Database Architecture**: Implemented a robust background proxy architecture where all IndexedDB operations are handled by the service worker. This ensures a single source of truth for your data, accessible from any webpage or the popup, solving the issue where content scripts would otherwise create isolated databases for each domain.

### 🐛 Bug Fixes
- **Font Capture 404s**: Fixed a critical issue where font URLs in external stylesheets were being resolved relative to the current page instead of the stylesheet. This incorrect resolution caused 404 errors when trying to capture fonts (e.g., `../fonts/inter.woff2` resolving to the wrong path). The extractor now correctly resolves relative URLs against their stylesheet's origin.

### 🔄 Migration
- **Auto-Migration**: Added an automatic migration system. On update, your existing styles in `chrome.storage.local` will be seamlessly moved to the new IndexedDB system, and the old storage will be cleaned up to free space.

## [1.1.0] - Previous Release
- Initial release functionality with reliable font capture and application features.
