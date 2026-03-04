#!/bin/bash

set -e

echo "📦 Moji Fu Release Script"
echo "========================="

# Extract version from manifest.json using a more robust method
VERSION=$(node -p "require('./manifest.json').version")
if [ -z "$VERSION" ]; then
    echo "❌ Error: Could not detect version from manifest.json"
    exit 1
fi
echo "✅ Version: $VERSION"

# Check if release notes exist for this version
if ! grep -q "## \[$VERSION\]" CHANGELOG.md; then
    echo "❌ Error: No release notes found for version $VERSION in CHANGELOG.md"
    echo "   Please add a '## [$VERSION] - YYYY-MM-DD' section to CHANGELOG.md"
    exit 1
fi

# Extract release notes for this version
NOTES_FILE="release_notes_v$VERSION.md"
awk -v ver="\\[$VERSION\\]" '
    $0 ~ "^## " ver { flag=1; next }
    /^## \[/ { if (flag) exit }
    flag { print }
' CHANGELOG.md > "$NOTES_FILE"

# Remove leading/trailing empty lines
sed -i '' '1{/^$/d;}' "$NOTES_FILE"
sed -i '' '${/^$/d;}' "$NOTES_FILE" 2>/dev/null || sed -i '$ {/^$/d;}' "$NOTES_FILE"

if [ ! -s "$NOTES_FILE" ]; then
    echo "❌ Error: Release notes for $VERSION are empty"
    rm -f "$NOTES_FILE"
    exit 1
fi

echo "📝 Release notes:"
echo "---"
head -n 5 "$NOTES_FILE"
echo "..."
echo "---"

# Run linting before release
echo "🔍 Running linter..."
if npm run lint > /dev/null 2>&1; then
    echo "✅ Linting passed"
else
    echo "⚠️  Linting failed. Fix issues before releasing."
    echo "   Run: npm run lint"
    rm -f "$NOTES_FILE"
    exit 1
fi

# Create zip package
ZIP_FILE="moji-fu-v$VERSION.zip"
echo "📦 Creating package: $ZIP_FILE"
rm -f "$ZIP_FILE"

# Create zip with only necessary extension files
zip -q -r "$ZIP_FILE" \
    manifest.json \
    background.js \
    storage.js \
    types.js \
    content/ \
    popup/ \
    icons/

if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ Error: Failed to create zip file"
    rm -f "$NOTES_FILE"
    exit 1
fi

ZIP_SIZE=$(ls -lh "$ZIP_FILE" | awk '{print $5}')
echo "✅ Package created ($ZIP_SIZE)"

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) not found"
    echo "   Install from: https://cli.github.com/"
    rm -f "$NOTES_FILE"
    exit 1
fi

# Check if already logged in
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not authenticated with GitHub"
    echo "   Run: gh auth login"
    rm -f "$NOTES_FILE"
    exit 1
fi

# Create GitHub release
echo "🚀 Creating GitHub release v$VERSION..."

# Check if release already exists
if gh release view "v$VERSION" &> /dev/null; then
    echo "⚠️  Release v$VERSION already exists"
    read -p "Do you want to overwrite it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Release cancelled"
        rm -f "$NOTES_FILE"
        exit 1
    fi
    gh release delete "v$VERSION" --cleanup-tag --yes 2>/dev/null || true
fi

# Create the release
if gh release create "v$VERSION" "$ZIP_FILE" \
    --title "v$VERSION" \
    --notes-file "$NOTES_FILE" \
    --generate-notes; then
    echo "✅ Release v$VERSION created successfully!"
    echo "🔗 View: https://github.com/$(gh repo view --json url -q .url)/releases/tag/v$VERSION"
else
    echo "❌ Failed to create release"
    rm -f "$NOTES_FILE"
    exit 1
fi

# Cleanup
rm -f "$NOTES_FILE"

echo ""
echo "🎉 Release complete!"
