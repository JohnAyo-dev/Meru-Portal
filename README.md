# Meru Portal

Meru Portal is a personal desktop command centre built with Electron. It combines a clock, search, shortcut tiles and productivity widgets with a lightweight multi-tab browser, so everyday links open inside the app instead of another Chrome window.

## Features

### Portal

- Large clock with 12/24-hour time, optional seconds, greeting and date
- Search bar with configurable search engines
- Shortcut tiles with favicons, custom icons, colours, groups and drag-and-drop ordering
- Add, edit and remove shortcuts, with undo and an empty state
- Recently visited sites and a searchable history panel
- Command palette for running commands and opening sites

### Browser

- Multi-tab browsing with a tab strip, address bar, back/forward/reload and progress bar
- Friendly error page with retry
- Find in page, zoom controls and fullscreen support
- Right-click context menus with copy, cut, paste and select all
- Download management with pause, resume, cancel, open and show-in-folder
- Popup and new-window handling, plus open-in-system-browser
- Bookmark management with Chrome import, HTML import and HTML export
- Permission prompts for camera, microphone, location and clipboard
- Reopen recently closed tabs

### Widgets

- Notes with automatic saving and a word count
- To-do list with completed counts
- Calendar
- Weather through Open-Meteo (no API key required, needs a network connection)
- Daily quote
- Clipboard history (current session)
- Focus mode and per-widget visibility toggles

### Personalisation

- Light and dark themes and a custom accent colour
- Wallpaper upload, image URL, blur and dim controls
- Clock font, size and position, and shortcut tile size
- Rebindable search, palette and settings shortcuts

### Data and security

- Structured JSON storage in the Electron user data folder, with a rolling backup and version field
- Full backup export and import, history clearing and reset-to-default
- `contextIsolation` on, `nodeIntegration` off, sandboxed renderer and sandboxed webviews
- Navigation restricted to http(s), with validated IPC handlers
- Crash logging and a reload prompt if the renderer stops

## Requirements

- Windows 10 or later
- Node.js 18+ and npm (for development and building)

## Run from source

```powershell
npm install
npm start
```

`npm start` launches the Electron window. It does not open Chrome.

## Build the installer

```powershell
npm run dist
```

The installer is written to `dist\Meru Portal Setup 2.0.0.exe`. It creates Start Menu and desktop shortcuts and lets you choose the install location.

If Electron's download is blocked on your network, pre-download the zip into `%LOCALAPPDATA%\electron\Cache` and re-run the command. If electron-builder cannot fetch its helper binaries, set:

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist
```

## Checks

```powershell
npm run check
```

This parses every JavaScript file, checks for duplicate element ids, and verifies that renderer scripts only reference ids that exist in `renderer\index.html`.

## Using it

- Click a shortcut tile, or type an address in the search bar, to open it inside the app.
- Press `Esc` in the browser to return to the portal, or click the red **M** button.
- Open settings with the gear icon or `Ctrl+,`.
- Import Chrome bookmarks from the Bookmarks panel: **Chrome** reads `%LOCALAPPDATA%\Google\Chrome\User Data\*\Bookmarks`. **HTML** imports a standard bookmarks HTML file. Duplicates are skipped.
- Data is stored in `%APPDATA%\Meru Portal\meru-data.json`, with wallpapers in `%APPDATA%\Meru Portal\wallpapers`.

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `/` | Focus the search bar |
| `Ctrl+K` | Open the command palette |
| `Ctrl+,` | Open settings |
| `Ctrl+Z` | Undo the last removed shortcut |
| `Alt+1` .. `Alt+9` | Open the corresponding shortcut |
| `F` | Toggle focus mode |
| `F11` | Toggle fullscreen |
| `Ctrl+T` / `Ctrl+W` | New tab / close tab |
| `Ctrl+L` | Focus the browser address bar |
| `Ctrl+F` | Find in page |
| `Ctrl+H` / `Ctrl+J` | History / downloads |
| `Ctrl+D` | Bookmark the current page |
| `Ctrl+Shift+T` | Reopen the last closed tab |

## Project structure

```
main/
  main.js       Electron main process, IPC, downloads, permissions, protocol
  preload.js    Safe window.meru bridge
  store.js      JSON storage with backup and versioning
renderer/
  index.html    Portal, browser, panels and dialogs
  styles.css    Themes, wallpaper, layout and components
  scripts/      store, ui, state, portal, widgets, browser, settings, app
assets/
  icon.ico      App and installer icon
  wallpaper.jpg Default background
scripts/
  check.js      Syntax and markup checks
.github/
  workflows/    Windows build workflow
```

## Notes and limitations

- The installer is not code-signed, so Windows SmartScreen may show a warning.
- Automatic updates are not configured; install a newer build over the old one.
- Weather requires network access. Clipboard history is not persisted between sessions.
- The in-app browser uses Electron webviews and blocks Node access from remote pages. Sites that refuse embedding may need to be opened in the system browser.
