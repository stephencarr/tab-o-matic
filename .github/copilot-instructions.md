# Tab-o-matic - Copilot Developer Guide

## Repository Overview

**Tab-o-matic** is a Chrome browser extension (Manifest V3) that provides a tab management dashboard with stashing, history tracking, and organization features. The extension replaces the new tab page with a Material Design 3 interface.

**Repository Stats:**
- Size: ~372KB
- Type: Chrome Extension (Manifest V3)
- Language: Vanilla JavaScript (ES6+), HTML5, CSS3
- Framework: None (plain JavaScript)
- Design System: Material Design 3 with Google Fonts & Material Symbols
- No build process, tests, or linting configured

## Project Structure

**Root Files (all source files):**
```
manifest.json         - Chrome extension manifest (Manifest V3)
background.js         - Service worker (138 lines)
popup.html/popup.js   - Extension popup UI (370/269 lines)
dashboard.html/dashboard.js/dashboard.css - New tab dashboard (415/1956/1409 lines)
icon16.png, icon48.png, icon128.png - Extension icons
.gitignore           - Excludes node_modules/, dist/, logs, IDE files
README.md            - Comprehensive feature documentation
QUICKSTART.md        - Installation guide
```

**Architecture:**
- **background.js**: Service worker handling reminders, notifications, keyboard shortcuts, context menus
- **popup.js**: Quick stash interface accessible via extension icon, keyboard shortcut (Ctrl+Shift+S), or right-click menu
- **dashboard.js**: Main application logic for the new tab page with two views:
  - Recent Activity View: Shows open tabs, recent history, closed tabs, most visited sites
  - Stash Management View: Full stashed tabs interface with filters and bulk actions

**Key Chrome APIs Used:**
- `chrome.storage.local` - Data persistence (stashed tabs, settings, reminders)
- `chrome.tabs` - Tab management and queries
- `chrome.history` - Browsing history access
- `chrome.sessions` - Recently closed tabs
- `chrome.alarms` - Reminder scheduling
- `chrome.notifications` - Reminder alerts
- `chrome.contextMenus` - Right-click menu integration
- `chrome.commands` - Keyboard shortcuts

**External Dependencies:**
- Google Fonts API (Roboto font family)
- Google Material Symbols (icon font)
- Google Favicon Service for website icons (e.g., `https://www.google.com/s2/favicons?domain=example.com&sz=32`)

## Development Workflow

**NO BUILD REQUIRED** - This is a plain JavaScript extension with no build, compilation, or bundling steps.

### Loading the Extension (Development/Testing)

**Always follow these steps to load or test changes:**

1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" toggle (top-right corner)
4. Click "Load unpacked" button
5. Select the `/home/runner/work/tab-o-matic/tab-o-matic` directory
6. Extension loads immediately - no build step needed

**After code changes:**
1. Go to `chrome://extensions/`
2. Click the refresh icon on the Tab-o-matic extension card
3. For background.js changes: May need to click "Service worker" link to inspect errors
4. For popup/dashboard changes: Just refresh is sufficient
5. Test by clicking extension icon or opening new tab

### Validation Steps

**Before committing changes, always run:**

```bash
# Validate manifest.json syntax
cat manifest.json | python3 -m json.tool > /dev/null && echo "✓ manifest.json valid" || echo "✗ manifest.json invalid"

# Validate JavaScript syntax for all JS files
for file in *.js; do node -c "$file" 2>&1; done
```

**Expected output:** All files should pass syntax validation with no errors.

**Manual Testing Checklist:**
1. Load extension in Chrome (see above)
2. Check for errors in Chrome DevTools console
3. Test popup by clicking extension icon
4. Test dashboard by opening new tab
5. Test keyboard shortcut: Ctrl+Shift+S (Windows/Linux) or Cmd+Shift+S (Mac)
6. Test right-click context menu "Stash this tab..."
7. Verify no Content Security Policy (CSP) violations in console

### Common Issues & Workarounds

**Issue: External resources not loading (fonts, icons)**
- Cause: Content Security Policy restrictions
- Solution: Only use Google Fonts and Material Symbols as specified in HTML files
- Never add inline scripts or eval() - will violate CSP

**Issue: Service worker (background.js) not running**
- Symptom: Reminders or keyboard shortcuts don't work
- Fix: Go to `chrome://extensions/`, find Tab-o-matic, click "Service worker" link to see errors
- Often requires extension reload after background.js changes

**Issue: Changes not appearing**
- Always click the refresh icon on the extension card at `chrome://extensions/`
- For dashboard.js changes: Also hard refresh the new tab page (Ctrl+Shift+R)
- Clear Chrome's extension data if needed: Right-click extension → "Remove" → Reload

## File Reference & Key Code Locations

### manifest.json
- Extension metadata, version, permissions
- Defines popup (popup.html) and new tab override (dashboard.html)
- Keyboard shortcut: "stash-tab" command (Ctrl+Shift+S)
- Service worker: background.js
- Required permissions: tabs, storage, notifications, alarms, history, contextMenus, sessions, topSites

### background.js (138 lines)
- **Lines 1-11**: Message listener for reminder management
- **Lines 14-18**: Keyboard shortcut handler
- **Lines 21-34**: Context menu creation and click handler
- **Lines 36-63**: Reminder set/clear functions
- **Lines 66-138**: Alarm trigger handler and notification management
- **Key Functions**: `setReminder()`, `clearReminder()`, alarm and notification handlers

### popup.js (269 lines)
- **Lines 1-33**: Initialization and event listeners
- **Lines 35-50**: Modal show/hide functions
- **Lines 52-88**: Stash current tab functionality
- **Lines 90-145**: Quick reminder buttons (1h, 3h, Tomorrow, 1 week)
- **Lines 147-269**: Stashed tabs list rendering and management
- **Key Functions**: `stashCurrentTab()`, `handleQuickReminder()`, `loadStashedTabs()`

### dashboard.js (1956 lines) - LARGEST FILE
- **Lines 1-37**: State variables and settings initialization
- **Lines 40-68**: `loadData()` - Loads stashed tabs, settings, history from Chrome APIs
- **Lines 69-99**: `calculateMostVisited()` - Computes visit counts
- **Lines 101-149**: Event listeners setup
- **Lines 151-198**: View switching (Recent ↔ Stash)
- **Lines 211-323**: Recent Activity panels (Just Now, Earlier Today)
- **Lines 325-373**: Recently Closed and Most Visited rendering
- **Lines 375-497**: Domain filtering functionality
- **Lines 499-583**: Stash sidebar and category filters
- **Lines 585-720**: Stash view rendering with filtering/sorting
- **Lines 883-1088**: Stash tab operations (open, delete, edit, bulk actions)
- **Lines 1523-1620**: Duplicate tab detection and closure
- **Lines 1621-1741**: `groupTabsByDomain()` - Creates tab groups by domain
- **Lines 1745-1827**: `ungroupAll()` - Merges all windows and removes groups
- **Note**: `splitTabsToWindows()` mentioned in README but not fully implemented
- **Key Data Structures**: 
  - `stashedTabs` array with {id, url, title, notes, reminder, timestamp}
  - `settings` object with panels config and stats

### dashboard.html (415 lines)
- Material Design 3 layout with sidebar navigation
- Two main views: Recent Activity (default) and Stash Management
- Inline modal dialogs for editing stashed tabs
- Tab organization buttons: Group by Domain, Split to Windows, Ungroup All, Close Duplicates

### dashboard.css (1409 lines)
- Material Design 3 styling with CSS variables for colors
- Gradient header: `linear-gradient(135deg, #6750A4 0%, #7E57C2 100%)`
- Responsive layout with sidebar (280px) and main content area
- Card-based design with elevation shadows
- Color-coded reminder indicators (overdue: red, today: orange, upcoming: blue)

### popup.html (370 lines)
- Compact modal interface (400px width, 300-600px height)
- Quick stash form with notes input and reminder picker
- Mini list of recent stashed tabs

## Making Code Changes

### Adding Features
1. Identify the right file:
   - Reminder/notification logic → background.js
   - Quick stash UI → popup.js/popup.html
   - Dashboard features → dashboard.js/dashboard.html/dashboard.css
2. Add Chrome API permissions to manifest.json if needed
3. Update storage schema carefully (used by multiple files)
4. Test thoroughly - no automated tests exist

### Modifying Styles
- All dashboard styles in dashboard.css (1409 lines)
- Popup styles are inline in popup.html
- Use Material Design 3 conventions (Roboto font, Material Symbols icons)
- Maintain existing color scheme: Primary #6750A4, Accent #7E57C2

### Data Storage Schema
**chrome.storage.local keys:**
- `stashedTabs`: Array of tab objects
- `settings`: Object with panels config and stats
- `reminders`: Object mapping tab IDs to reminder metadata
- `notification-{id}`: Temporary notification-to-tab mappings

**stashedTabs item structure:**
```javascript
{
  id: 'unique-id-string',
  url: 'https://example.com',
  title: 'Page Title',
  notes: 'User notes',
  reminder: '2025-01-01T10:00:00Z', // ISO 8601 or null
  timestamp: 1234567890000, // Date.now()
  favicon: 'https://www.google.com/s2/favicons?domain=example.com&sz=32'
}
```

### Debugging Tips
1. **Console Access:**
   - Dashboard: Open new tab → F12 → Console
   - Popup: Right-click extension icon → Inspect popup
   - Background: chrome://extensions/ → Click "Service worker"

2. **Common Errors:**
   - CSP violations: Don't use inline scripts/eval
   - Permission errors: Add to manifest.json permissions array
   - Storage race conditions: Use async/await properly

3. **Chrome DevTools:**
   - Application tab → Storage → Local Storage → chrome-extension://[id]
   - View/edit stashedTabs and settings directly

## NO Build/Test/Lint Pipelines

**IMPORTANT:** This repository has:
- ❌ No package.json or npm scripts
- ❌ No automated tests or test framework
- ❌ No linting (ESLint, Prettier, etc.)
- ❌ No CI/CD or GitHub Actions workflows
- ❌ No compilation, transpilation, or bundling
- ❌ No .github/workflows directory

**What this means for you:**
- Don't try to run `npm install`, `npm test`, `npm run build` - they don't exist
- Don't look for test files - there are none
- Manually validate JavaScript syntax using `node -c filename.js`
- Test manually by loading the extension in Chrome
- Follow existing code style by reading the code

## Key Constraints & Conventions

1. **Vanilla JavaScript Only** - No frameworks, no modules, no imports
2. **Manifest V3 Required** - Don't use deprecated Manifest V2 APIs
3. **CSP Compliant** - No inline scripts, no eval(), only approved external resources
4. **Chrome Extension Context** - Code runs in extension pages, not regular web pages
5. **Async/Await Pattern** - Use for all Chrome API calls (they return promises in MV3)
6. **Material Design 3** - Follow existing visual design patterns
7. **No Build Step** - All code must run directly in browser without transpilation

## Trust These Instructions

These instructions are comprehensive and validated. Only search for additional information if:
- You encounter a specific error not covered here
- You need to understand a complex function's implementation
- The instructions appear outdated or incorrect

For routine tasks (adding features, fixing bugs, modifying styles), follow this guide without extensive exploration. The repository is small (372KB, ~4500 lines) and straightforward once you understand the structure above.
