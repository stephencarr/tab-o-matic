# Tab Stash - Chrome Extension

A simple, lightweight Chrome extension to stash tabs for later with notes and reminders. Perfect for managing tabs that need your attention without keeping them all open.

## Features

- **One-Click Stashing**: Quickly stash the current tab and close it
- **Add Notes**: Associate notes with each stashed tab to remember context
- **Set Reminders**: Optional reminder notifications for time-sensitive tabs
- **Clean Interface**: Beautiful, easy-to-use popup interface
- **Automatic Cleanup**: Opening a stashed tab removes it from your list

## Installation

### Install from Files

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `tab-stash` folder
6. The extension icon (📌) should appear in your toolbar

### Pin the Extension (Recommended)

1. Click the puzzle piece icon in Chrome's toolbar
2. Find "Tab Stash" in the list
3. Click the pin icon to keep it visible

## Usage

### Stashing a Tab

1. Navigate to any tab you want to stash
2. Click the Tab Stash extension icon
3. Click "Stash This Tab"
4. (Optional) Add notes about why you need to return to this tab
5. (Optional) Set a reminder date/time
6. Click "Stash It!"
7. The tab will close and be saved to your stash

### Viewing Stashed Tabs

1. Click the Tab Stash extension icon
2. All your stashed tabs are listed with:
   - Title and URL
   - Your notes (if any)
   - Reminder date (if set)
   - When it was stashed

### Opening Stashed Tabs

1. Click on the tab title or "Open & Remove" button
2. The tab will open in a new tab
3. It will be automatically removed from your stash

### Deleting Stashed Tabs

1. Click the "×" button on any stashed tab
2. It will be removed without opening

### Reminders

- Set a reminder when stashing a tab
- You'll get a browser notification at the specified time
- Click "Open Tab" in the notification to open it
- The tab remains in your stash until you open or delete it

## Use Cases

- **Research**: Stash articles you want to read later with notes on why
- **Shopping**: Keep product pages with notes about comparisons
- **Work Tasks**: Save tabs related to specific tasks with deadlines
- **Learning**: Bookmark tutorials or documentation with context
- **Follow-ups**: Stash emails, tickets, or pages that need action later

## Privacy

- All data is stored locally in Chrome's storage
- No data is sent to external servers
- No tracking or analytics

## Technical Details

- Manifest V3
- Uses Chrome Storage API for persistence
- Uses Chrome Alarms API for reminders
- Uses Chrome Notifications API for alerts

## Keyboard Shortcuts (Optional Enhancement)

To add keyboard shortcuts:
1. Go to `chrome://extensions/shortcuts`
2. Find "Tab Stash"
3. Set a custom shortcut (e.g., `Ctrl+Shift+S`)

## Tips

- Review your stashed tabs regularly to avoid buildup
- Use descriptive notes to remember context
- Set reminders for time-sensitive tabs
- Stash tabs from your daily browsing to reduce tab clutter

## Troubleshooting

**Extension not showing:**
- Make sure Developer Mode is enabled
- Refresh the extensions page and reload the extension

**Reminders not working:**
- Ensure Chrome has notification permissions
- Check that the reminder time is in the future

**Tabs not closing when stashed:**
- This is normal behavior - check your stashed list in the extension popup

## Future Enhancements (Ideas)

- Search/filter stashed tabs
- Categories or tags
- Export/import stash
- Keyboard shortcuts
- Right-click context menu
- Bulk actions
- Statistics dashboard

## License

Free to use and modify for personal use.
