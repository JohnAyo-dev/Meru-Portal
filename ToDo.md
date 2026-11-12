Meru Portal 2.0 is built. This list tracks what is still open.

The three goals remain:

1. Make it a genuinely useful daily productivity application.
2. Make the in-app browser reliable and secure.
3. Give it enough polish to feel like a proper Meru product.

# Meru Portal: Development ToDo

## 1. In-app browser

Potential future features:

- Incognito/private browsing.
- Ad and tracker blocking.

## 2. Productivity features

- Customisable dashboard layout (drag-and-drop widget arrangement).

## 3. Security and reliability

- Test memory consumption during extended browsing sessions.
- Test multiple simultaneous pages.

## 4. Performance and optimisation

- Reduce unnecessary renderer re-renders.
- Optimise application startup time.
- Minimise background CPU consumption.
- Monitor browser memory usage.
- Test on lower-spec Windows computers.

## 5. Build, distribution and maintenance

- Test Windows 10 compatibility.
- Test Windows 11 compatibility.
- Configure application signing.
- Implement automatic updates.
- Add a version/update notification.
- Test installation and uninstallation.
- Test upgrading from previous versions.

# Suggested development priorities

## Phase 1: Stability and release

- Fix existing bugs.
- Test installer reliability.

## Phase 2: Distribution

- Automatic updates.
- Application signing.
- Performance optimisation.
- Release testing.
- Public release.

# My additional ideas for Meru Portal

These are features I'd seriously consider making part of its identity.

## Workspace System

Separate browsing environments for Work, Personal, Development, Entertainment and Research, each with its own shortcuts and tabs.

## Activity Insights

Show frequently visited websites, browsing time and usage patterns, with local-only data storage.

## Verdict

Don't turn Meru Portal into Chrome. That's an enormous undertaking with little advantage. Build a personal desktop command centre with a lightweight browsing experience.

That gives it a much clearer identity.

# Gaps found during review

Suggestions after reading the source. Items are ordered by how much they matter.

## The biggest gap: there is no safety net

`npm run check` only parses JavaScript and matches element ids. Nothing exercises behaviour, and nothing survives a restart to tell you what broke. For an app used every day, this is the largest missing piece.

- Add a real test suite: unit tests for `main/store.js` (write, backup, corrupt-file recovery, import/reset) and integration tests that launch Electron and drive the portal, browser tabs, downloads and bookmarks with Playwright or Spectron's successor.
- Add a smoke test to CI that launches the built app and verifies the window loads without a renderer error.
- Replace `console.error` with a persisted, rotating log file (for example `electron-log`) in `%APPDATA%\Meru Portal\logs`. The README promises crash logging; right now logs disappear when the app closes.
- Add a lightweight diagnostics entry in About that reveals the log folder and copies the last error.

## Reliability and data safety

- Persist open tabs and restore them on launch. Tabs live only in memory today (`renderer/scripts/browser.js`), so a crash or restart loses the session.
- Persist window size, position and maximised state.
- Validate and version stored data. `store.set` accepts any value and `store.import` accepts any object, so one bad write or import can wipe real data. Validate against a schema and keep a pre-import snapshot that can be restored.
- Make writes durable: `main/store.js` writes synchronously with a debounce and a non-atomic fallback. Flush on `before-quit` exists, but a hard crash between debounce windows can lose the last change.
- Handle corrupt primary and backup files together instead of silently starting empty; surface a recovery notice.
- Add a per-tab session partition (`webview` `partition`) so sites do not all share one cookie jar, and a "clear site data" action.
- Guard against unbounded growth: notes, clipboard, closed tabs and history all need explicit caps and pruning.

## Security and privacy

- Add `session.setPermissionCheckHandler` alongside `setPermissionRequestHandler`. Request-only handlers are not the full recommended pair.
- Reconsider auto-allowing `notifications`, `pointerLock` and `clipboard-sanitized-write`. Default them to prompt.
- Validate the sender in IPC handlers (`event.senderFrame`) so only the trusted renderer can mutate the store or export data.
- Restrict webview navigations: `blob:` and `data:` are currently allowed to navigate. Prefer blocking `data:` navigation and limiting `blob:` use.
- Ask before saving downloads, or expose a default-download-folder setting; the current handler writes straight to the Downloads folder without confirmation.
- Pause the clipboard watcher when the window is hidden or unfocused, and offer an ignore list. Polling every 1.5 seconds captures anything copied, including passwords, and burns CPU in the background.
- Add a privacy dashboard: clear history, clipboard, site data and permissions per site.
- Consider an optional app lock (PIN or OS auth) and encryption at rest for notes, todos and history.
- Add certificate error handling with a safe default instead of relying on the platform dialog.

## Browser

- Per-tab back/forward history, not just the webview's internal stack, so tab restoration is accurate.
- Tab groups, pinning, muting, drag-to-reorder and a tab context menu.
- Per-site zoom that persists, and a global default zoom.
- Reader mode and a print action.
- Session restore for "reopen all closed tabs".
- Search across history and bookmarks from one place, with filters.
- Bookmark folders, tags and drag-to-organise; the flat list will not scale.
- A real new-tab page or configurable start page instead of `about:blank`.
- Optional ad and tracker blocking via a filter list, plus an allowlist.
- Incognito/private windows with their own non-persistent partition.

## Productivity and identity

- Finish the Workspace System: per-workspace shortcuts, tabs, wallpaper and history, switchable from the portal and the palette.
- Activity insights as described, kept local, with an opt-out.
- First-run onboarding: name, theme, search engine, first shortcuts.
- Global hotkey plus a tray icon to summon the portal from anywhere, and minimise-to-tray.
- Multi-window support so a workspace or site can live in its own window.
- Quick capture for notes and todos from the palette.
- Calendar integration beyond display: local events, or read-only ICS.
- Offline weather cache and a manual location override.
- Search engine management: edit and delete engines, not only add.
- Export/import for notes, todos and history as separate formats, not just one JSON blob.

## Distribution and release engineering

- Automatic updates with `electron-updater`: publish config, staged rollout, a "restart to update" prompt and release notes.
- Code signing (even a self-signed certificate) to remove the SmartScreen wall.
- Portable build and at least a documented macOS/Linux path, or state Windows-only clearly.
- Automate changelog and GitHub release creation from tags.
- Add lint and format (ESLint + Prettier) to CI, plus a dependency audit (`npm audit` or Dependabot).
- Add an end-to-end release checklist: install, upgrade over an older version, uninstall, and verify user data survives.

## Polish and accessibility

- Focus trap and restore focus for every dialog and panel; they are not keyboard-contained today.
- Announce toasts and status changes with `aria-live`.
- Respect `prefers-reduced-motion` and add a reduced-motion setting.
- Audit contrast and keyboard-only navigation across both themes.
- Add localisation hooks, or at least centralise user-facing strings.
- Add a proper empty/offline state for weather and a retry affordance.
- Add favicon fallbacks and cached icons so tiles do not flash empty.

## Code quality

- Split `main/main.js` (already 500+ lines) into modules: IPC, downloads, permissions, bookmarks, protocol.
- Add JSDoc types or migrate to TypeScript incrementally for the store and state shapes.
- Centralise the settings schema so defaults, validation and migration live in one place.
- Add a small event/state layer to reduce ad-hoc re-renders, matching the performance goal already listed.

## Things to do now ##
- Everytime a new tab is opened, it opens as a blank white screen instead of the page it opens to when the app is originally launched...make sure every new tab opens as the originall stssrt page instead of a white screen
- Add Profiles tab
- Copy EVERY shortcut from google chrome and make them work here too