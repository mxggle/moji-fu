# Moji Fu (文字風) 🖋️

> **Read every word in the fonts you love.**  
> A Chrome Extension to capture, collect, and apply beautiful typography across the web.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](#)

---

## 📖 Overview

**Moji Fu** (Japanese for "Character Style" or "Literary Wind") is a tool for anyone who treats reading as an art form. It allows you to "lift" the typographic identity of your favorite corners of the web—capturing font families, weights, and spacing—and apply them instantly to whatever you are reading.

Unlike simple inspectors, **Moji Fu** doesn't just copy names; it captures the actual font files, embedding them as data URLs to ensure your collections remain perfectly styled even if the original source disappears.
<img width="730" height="968" alt="CleanShot 2026-02-04 at 20 52 22@2x" src="https://github.com/user-attachments/assets/9b936a27-7bc3-4215-813f-493df03288f0" />


## ✨ Features

- **🎯 Precision Capture**: Instantly extract font-family, weight, size, line-height, and color from any element with a single click.
- **📄 Article DNA Capture**: Use the intelligent "Collect Article" feature to harvest the entire typographic hierarchy (H1-H6 and Paragraphs) automatically.
- **💾 Font Persistence**: Automatically captures font files (`.woff2`, `.ttf`, etc.) and converts them to Data URLs, ensuring your stored styles are offline-ready and permanent.
- **⚡ Quick Apply**: Inject collected styles back into any page to preview how content looks with premium typography.
- **📊 Style Library**: Organise and manage your collection with ease, featuring clear indicators for single vs. article-wide capture.

## 🚀 Installation

1. Clone this repository or download the ZIP.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.

## 🛠 Usage

1. **Collect**: 
   - **Manual Selection**: Toggle **Select Text** mode to pick any specific element on a page.
   - **Auto-Collect**: Click **Collect Article** in the popup to automatically identify and harvest the main content's typographic structure.
2. **Review**: Manage your collection within the popup. Styles are categorized and sorted for easy access.
3. **Apply**: 
   - **⚡ Quick Apply**: Instantly project a saved style onto the current page's matching elements.
   - **Precision Apply**: Manually select an element to "paint" with a specific saved typography.
4. **Tune**: Edit captured properties directly in the library to refine the look before deployment.

## 📐 Technical Highlights

- **Article Detection**: Implementation of advanced selectors to identify main content blocks, providing clean captures devoid of ads or navigation noise.
- **Font-Loading Integration**: Utilizes the Font Loading API and background messaging to bypass CORS limitations and secure raw font data.
- **Zero Dependencies**: Pure Vanilla JS, CSS, and HTML for a lightweight (under 100KB) and highly performant footprint.

## ⚠️ Font Licensing Notice

Many fonts are protected by copyright and require a license for use. **Moji Fu** captures styles from fonts that are already served to you by websites (such as Google Fonts, which are free to use). However, users are responsible for ensuring they have the appropriate rights to use any fonts they capture and apply.

This tool is intended for **personal use and experimentation**. If you plan to use captured typography in commercial projects, please verify the font's license terms first.

## 📜 License

MIT © 2026. Built with ❤️ for typography lovers.
