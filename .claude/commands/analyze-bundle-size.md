# Bundle Size Analysis Command

Analyze bundle size increases in the current branch compared to the main branch. This command follows the GitHub workflow process to accurately measure bundle size changes.

## Features

1. Check current branch status
   - Get current branch name
   - Check git status
   - Confirm comparison with main branch

2. Download main branch build artifacts for comparison
   - Download the latest main branch build from GitHub Pages
   - Use as comparison baseline

3. Build extension using correct commands
   - Clean previous build: `pnpm --filter=@copilot/extension run clean`
   - Use minified build: `pnpm --filter=@copilot/extension run build:minify`
   - Package extension: `pnpm --filter=@copilot/extension run package`
   - **Important**: Use `build:minify` (not `build`) to match CI/CD workflow

4. Compare bundle sizes
   - Get PR zip size
   - Get main zip size
   - Calculate difference and percentage
   - Check if threshold is exceeded (50 KB = 51,200 bytes)

5. Analyze file-level changes
   - List main zip files (sorted by size)
   - List PR zip files (sorted by size)
   - Compare key files:
     - `static/background/index.js`
     - `popup.*.js`
     - `sidepanel.*.js`
     - `tabs/index.*.js`
     - Content script files

6. Check build issues
   - Confirm no `__MACOSX` files (macOS metadata)
   - Confirm no node_modules paths in zip
   - Check file count differences

7. Generate analysis report
   - Record size changes
   - Identify which files increased
   - Calculate total increase
   - Compare with threshold
   - Provide optimization suggestions

## Output Format

Create a markdown report (`bundle-size-analysis.md`) containing:

- **Branch Information**: Current branch name and commit
- **Size Comparison**: 
  - Main zip size
  - PR zip size
  - Difference (bytes, KB, MB, percentage)
  - Threshold check result
- **File-Level Analysis**: Table showing key file size changes
- **Root Cause Analysis**: Why the size increased
- **Optimization Suggestions**: 
  - Code splitting suggestions
  - Dynamic import opportunities
  - Tree shaking improvements
  - Entry point optimization

## Key Commands

```bash
# Download main build
curl -L -o /tmp/main-extension.zip https://raw.githubusercontent.com/solbotorg/frontrun_extension_download/main/frontrun-extension-latest.zip

# Clean and build
cd apps/extension
pnpm run clean
pnpm run build:minify
pnpm run package

# Compare sizes
PR_SIZE=$(stat -f%z build/chrome-mv3-prod.zip)
MAIN_SIZE=$(stat -f%z /tmp/main-extension.zip)
DELTA=$((PR_SIZE - MAIN_SIZE))
THRESHOLD=51200  # 50 KB

# Analyze files
unzip -l build/chrome-mv3-prod.zip | grep -E "\.(js|css)$" | sort -k1 -nr
```

## Threshold

- **Size Threshold**: 50 KB (51,200 bytes)
- CI/CD will fail if threshold is exceeded
- Report should clearly indicate if threshold is exceeded

## Common Issue Checks

1. **Build Command**: Ensure using `build:minify` instead of `build`
2. **Metadata Files**: Check for `__MACOSX` or `.DS_Store` files
3. **Node Modules**: Confirm no node_modules paths in zip
4. **File Count**: Compare file counts between main and PR
5. **Source Maps**: Check if source maps are included (should not be in production)

## Optimization Strategies

When size increase is detected:

1. **Code Splitting**: Extract shared code into separate modules
2. **Dynamic Imports**: Load features on demand
3. **Tree Shaking**: Ensure only used code is included
4. **Entry Point Analysis**: Check why code is included in multiple entry points
5. **Dependency Audit**: Check for unnecessary dependencies

## Notes

- Always use the same build command as CI/CD (`build:minify`)
- Compare with the latest main branch build on GitHub Pages
- Focus on JavaScript files as they are usually the largest
- Reports should be actionable with specific file names and sizes

## Usage Example

User input:
```
analyze-bundle-size
```

Execution flow:
```bash
# 1. Check current branch
git branch --show-current

# 2. Download main build
curl -L -o /tmp/main-extension.zip https://raw.githubusercontent.com/solbotorg/frontrun_extension_download/main/frontrun-extension-latest.zip

# 3. Clean and build
cd apps/extension
pnpm run clean
pnpm run build:minify
pnpm run package

# 4. Compare sizes
# 5. Analyze file changes
# 6. Generate report
```

## Output Example

```
📦 Bundle Size Analysis Report

📊 Size Comparison:
  • Main zip: 10.95 MB (11,491,041 bytes)
  • PR zip: 12.56 MB (13,171,620 bytes)
  • Difference: 1.64 MB (1,641 KB, 14% increase)
  • Threshold: 50 KB
  • ❌ Exceeds threshold by 32x!

📁 File-Level Analysis:
  • popup.js: 3.2 MB → 4.1 MB (+840 KB)
  • sidepanel.js: 3.2 MB → 4.0 MB (+840 KB)
  • background/index.js: 4.5 MB → 4.6 MB (+63 KB)

💡 Optimization Suggestions:
  1. Code Splitting: Extract batch execution functionality to shared module
  2. Dynamic Imports: Use on-demand loading for infrequently used features
  3. Entry Point Optimization: Check why code is included in multiple entry points
```
