# Release v0.1.69

Tag: `v0.1.69`

Title: `v0.1.69 — Reusable GPS Sources & Manual Trip Recording`

## 0.1.69 — Reusable GPS sources and manual trip recording

- Added centrally managed GPS sources for phones and other Home Assistant location entities, including separate latitude/longitude sensors.
- Assign each source to multiple vehicles and explicitly start/end a trip. A source can only record one vehicle at a time; duplicate entity registrations are rejected.
- Record GPS updates in the Home Assistant backend even when the dashboard is closed. Active sessions and source assignments survive reloads and restarts.
- Keep the last recorded vehicle position after ending a trip, excluding subsequent phone movement. Each new external session creates a separate track segment.
- Show source status, GPS accuracy and the last recorded position. Invalid, stale (over two minutes) or inaccurate (over 100 m) fixes are not recorded.
- Preserve vehicle-based SoC and consumption data. Existing native GPS configuration and all v0.1.67 analytics, playback, POI and routing features are retained.
- Built on stable v0.1.67. No central database migration: one additive table in the existing tracking database stores external sources and sessions.
- Updated frontend resource: `cardata-analytics-card-0.1.69.js?v=0.1.69`.

Validation: two offline QA passes, including a fresh extraction of the final release ZIP. No running Home Assistant instance or physical phone was available for live validation.
