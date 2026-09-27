Tag: `v0.1.73`

Title: `v0.1.73 — Reliable GPS Recording and Centered Live Follow`

## 0.1.73 — Reliable GPS Recording and Centered Live Follow

- Keep the native GPS recording checkbox in sync with its saved database setting after a phone GPS session starts or ends.
- Resume recording native vehicle GPS positions after an external phone GPS trip ends when native recording is enabled; newer native fixes also replace the parked phone position on the live map. Phone-only vehicles remain parked after their sessions end. Recorded points continue to be written directly to the tracking SQLite database; Recorder import remains available to backfill older points.
- Keep the followed vehicle at the map center during zoom buttons, mouse wheel and two-finger pinch. A pinch retains Follow mode; intentionally dragging the map releases it.
- Preserve the existing GPS database, session rules, trip groups and historical playback behavior.
- Update the frontend resource to `cardata-analytics-card-0.1.73.js?v=0.1.73`.

Validation: source tree and freshly extracted release ZIP pass Python and frontend offline regression tests. Test with a running Home Assistant instance before publishing.
