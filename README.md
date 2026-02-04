# Moji-fu (文字風) 🖋️

> **The Art of Typographic Transposition.**  
> A Chrome Extension to capture, collect, and apply font styles across the web with one click.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](#)

---

## 📖 Overview

**Moji-fu** (Japanese for "Character Style" or "Literary Wind") is a precision tool designed for designers and developers who appreciate the nuance of web typography. It allows you to "lift" the typographic identity of any webpage—capturing font families, weights, sizes, and spacing—and apply them instantly elsewhere.

Unlike simple inspectors, **Moji-fu** doesn't just copy names; it captures the actual font files, embedding them as data URLs to ensure your collections remain perfectly styled even if the original source disappears.
<img width="730" height="968" alt="CleanShot 2026-02-04 at 20 52 22@2x" src="https://github.com/user-attachments/assets/9b936a27-7bc3-4215-813f-493df03288f0" />


## ✨ Features

- **🎯 Precision Capture**: Instantly extract font-family, weight, size, line-height, and color from any element.
- **📄 Article DNA Capture**: Capture the entire typographic hierarchy of an article (H1-H6 and Paragraphs) in one click.
- **💾 Font Embedding**: Automatically downloads font files (`.woff2`, `.ttf`, etc.) and converts them to Data URLs, making your collection offline-ready and permanent.
- **⚡ Quick Apply**: Inject collected styles or full article structures into any page to preview how your content looks with premium typography.
- **🎨 Japandi Interface**: A sleek, minimalist popup interface inspired by Japanese aesthetics, featuring a calm palette and smooth transitions.
- **📊 Style Library**: Manage your collected styles with a badge indicator showing your current collection count.

## 🚀 Installation

1. Clone this repository or download the ZIP.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.

## 🛠 Usage

1. **Collect**: 
   - **Selection**: Select any text on a page to see the "Collect Style" button.
   - **Full Article**: Click the popup's "Collect Article" button (or use the floating button) to automatically harvest the hierarchy of the current page.
2. **Library**: View your collection in the popup. Styles are ordered by most recently collected.
3. **Apply**: 
   - Click **Quick Apply** on any saved style to inject it into the current page.
   - For single styles, you can pick a specific element to "paint" with the saved typography.
4. **Edit**: Tweak captured properties in the library before applying them to ensure a perfect fit.

## 📐 Technical Highlights

- **Font Persistence**: Uses the Font Loading API and background fetching to bypass CORS and capture raw font data.
- **Article Detection**: Intelligent selectors find the main content block, excluding ads and navigation for a clean capture.
- **Zero Dependencies**: Built with vanilla JavaScript, CSS, and HTML for maximum performance and a lightweight footprint.

## 🎨 Design Philosophy

Inspired by the concept of *Utsushi* (写し), the project focuses on the respectful study and reproduction of beautiful design patterns. The UI is built to be minimalist, focused, and out of your way—embodying the Zen principle of *Ma* (negative space).

## 📜 License

MIT © 2026. Built with ❤️ for typography lovers.
