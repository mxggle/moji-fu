/**
 * @typedef {Object} StyleProperty
 * @property {string} value - The CSS property value
 * @property {boolean} enabled - Whether this property should be applied
 */

/**
 * @typedef {Object} StyleProperties
 * @property {StyleProperty} fontFamily
 * @property {StyleProperty} fontSize
 * @property {StyleProperty} fontWeight
 * @property {StyleProperty} fontStyle
 * @property {StyleProperty} color
 * @property {StyleProperty} lineHeight
 * @property {StyleProperty} letterSpacing
 * @property {StyleProperty} textDecoration
 * @property {StyleProperty} textTransform
 * @property {StyleProperty} textShadow
 */

/**
 * @typedef {Object} FontSource
 * @property {string} url - Original font URL
 * @property {string} [dataUrl] - Base64-encoded data URL for offline use
 * @property {string} format - Font format (woff2, woff, ttf, etc.)
 */

/**
 * @typedef {Object} FontFaceEntry
 * @property {string} family - Font family name
 * @property {string} weight - Font weight (100-900 or normal/bold)
 * @property {string} style - Font style (normal/italic/oblique)
 * @property {string} stretch - Font stretch (normal/condensed/expanded)
 * @property {string} unicodeRange - Unicode range (e.g., U+0-10FFFF)
 * @property {string[]} sources - Array of font source URLs
 */

/**
 * @typedef {Object} LoadedFont
 * @property {string} family - Font family name
 * @property {string} weight - Font weight
 * @property {string} style - Font style
 * @property {string} stretch - Font stretch
 * @property {string} unicodeRange - Unicode range
 * @property {string[]} sources - Array of font source URLs
 * @property {string} status - Font loading status (loaded/loading/error/unloaded)
 */

/**
 * @typedef {Object} FontResources
 * @property {string[]} fontFaceRules - Array of @font-face CSS rules
 * @property {string[]} googleFontsLinks - Array of Google Fonts stylesheet URLs
 * @property {LoadedFont[]} loadedFonts - Array of fonts from Font Loading API
 * @property {FontFaceEntry[]} fontFaceEntries - Array of parsed @font-face entries
 * @property {string[]} fontUrls - Array of all font URLs
 * @property {FontSource[]} [capturedFonts] - Array of captured font data (optional)
 */

/**
 * @typedef {Object} ArticleStructureStyle
 * @property {StyleProperties} properties - Style properties for this element
 * @property {string} sampleText - Sample text showing the style
 */

/**
 * @typedef {'single'|'article'} StyleType
 */

/**
 * @typedef {'downloading'|'ready'|'failed'} DownloadStatus
 */

/**
 * @typedef {Object} SingleStyle
 * @property {string} id - Unique style identifier
 * @property {'single'} type - Style type
 * @property {string} name - User-friendly style name
 * @property {string} sourceUrl - URL where style was captured
 * @property {number} createdAt - Timestamp of creation
 * @property {StyleProperties} properties - Captured style properties
 * @property {string} sampleText - Sample text showing the style
 * @property {FontResources|null} fontResources - Captured font resources
 * @property {DownloadStatus} downloadStatus - Font download status
 * @property {number} downloadedFonts - Number of successfully downloaded fonts
 * @property {number} [downloadCompletedAt] - Timestamp of download completion
 * @property {string} [downloadError] - Error message if download failed
 */

/**
 * @typedef {Object} ArticleStyle
 * @property {string} id - Unique style identifier
 * @property {'article'} type - Style type
 * @property {string} name - User-friendly style name
 * @property {string} sourceUrl - URL where style was captured
 * @property {number} createdAt - Timestamp of creation
 * @property {Record<string, ArticleStructureStyle>} structureStyles - Styles by element tag
 * @property {string} sampleText - Sample text
 * @property {Record<string, FontResources>|null} fontResources - Font resources by tag
 * @property {DownloadStatus} downloadStatus - Font download status
 * @property {number} downloadedFonts - Number of successfully downloaded fonts
 * @property {number} [downloadCompletedAt] - Timestamp of download completion
 * @property {string} [downloadError] - Error message if download failed
 */

/**
 * @typedef {SingleStyle|ArticleStyle} SavedStyle
 */

/**
 * @typedef {Object} AppliedRule
 * @property {string} id - Unique rule identifier
 * @property {string} styleId - Reference to saved style
 * @property {string} urlPattern - URL pattern for rule application
 * @property {string} selector - CSS selector for target element
 * @property {{smartApply: boolean}} [options] - Apply options
 */

/**
 * @typedef {Object} StorageWrapper
 * @property {{data: SavedStyle[], version: number}} data - Wrapped data with version
 */
