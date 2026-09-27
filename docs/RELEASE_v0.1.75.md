Tag: `v0.1.75`

Title: `v0.1.75 — Trip Folder Moving and Ordering`

## 0.1.75 — Trip Folder Moving and Ordering

- Move a selected GPS history folder to another folder or back to the top level, keeping all its subfolders and trip assignments. Cycles are rejected.
- Move folders up or down among their siblings; ordering persists across restarts. Existing folders migrate automatically in their previous alphabetical order.
- Show full nested folder paths in selectors. When a merged trip spans folders, a folder view shows only its matching trip segments, including map, GPX and playback selection.
- Move an individual trip between folders in one validated database transaction. Batch move and merge behavior remains available.
- Update the Home Assistant frontend resource to `cardata-analytics-card-0.1.75.js?v=0.1.75`.

Validation: Python and frontend regression suites pass against the source tree and fresh archive extraction. Verify folder controls visually in a running Home Assistant installation.
