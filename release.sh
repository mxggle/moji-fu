#!/bin/bash

# Extract version from manifest.json
VERSION=$(grep '"version":' manifest.json | cut -d '"' -f 4)
if [ -z "$VERSION" ]; then
    echo "Error: Could not detect version from manifest.json"
    exit 1
fi
echo "Detected version: $VERSION"

# Extract release notes from CHANGELOG.md
# Search for line starting with "## [VERSION]" and read until next line starting with "## ["
NOTES_FILE="release_notes_tmp.md"
awk -v ver="\\\\[$VERSION\\\\]" '$0 ~ "^## " ver {flag=1; next} /^## \[/ {flag=0} flag' CHANGELOG.md | sed -e '1{/^$/d;}' -e '${/^$/d;}' > "$NOTES_FILE"

if [ ! -s "$NOTES_FILE" ]; then
    echo "Error: No release notes found for version $VERSION in CHANGELOG.md"
    rm -f "$NOTES_FILE"
    exit 1
fi

echo "Extracted release notes:"
head -n 5 "$NOTES_FILE"
echo "..."

# Create zip package
ZIP_FILE="moji-fu-v$VERSION.zip"
echo "Creating zip package: $ZIP_FILE"
rm -f "$ZIP_FILE"
# Include only necessary extension files
zip -q -r "$ZIP_FILE" manifest.json background.js storage.js content popup icons

# Create GitHub release
echo "Creating GitHub release v$VERSION..."
# Use --verify-tag if it existed locally, but we are creating a new release which creates a tag usually.
# If tag exists on remote, this might fail or attach to it.
if gh release create "v$VERSION" "$ZIP_FILE" --title "v$VERSION" --notes-file "$NOTES_FILE"; then
    echo "✅ Release v$VERSION created successfully!"
else
    echo "❌ Failed to create release. Please check if the tag already exists or if you have permissions."
fi

# Cleanup
rm -f "$NOTES_FILE"
