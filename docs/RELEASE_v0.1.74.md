Tag: `v0.1.74`

Title: `v0.1.74 — Adaptive iPhone GPS Track Filtering`

## 0.1.74 — Adaptive iPhone GPS Track Filtering

- Add selectable **Off**, **Detailed**, **Balanced** and **Compact** track point filtering to automatic CarPlay GPS rules. The existing iPhone location request intervals (Off, 10, 20, 30, 60, 120, 300 or 600 seconds) remain independent and unchanged.
- Filter actual phone fixes with a bounded, durable candidate buffer: suppress stationary GPS jitter, retain meaningful bends, and checkpoint long straight routes. Original coordinates and timestamps are preserved.
- Write the last useful pending fix when recording stops or the integration unloads. Restore pending fixes after an integration restart; deleting all or part of an active track also clears matching pending fixes.
- Existing CarPlay rules with a configured location request interval default to Balanced; those without an interval, manual phone trips, native vehicle GPS and Recorder import retain their previous filtering behavior. Select Off to restore the previous automatic recording behavior.
- The live marker follows accepted phone locations even when a point awaits its final track database write; the saved-point count shows only committed track points.
- Update the frontend resource to `cardata-analytics-card-0.1.74.js?v=0.1.74`.

Validation: run Python and frontend regression suites against both the source tree and a fresh extraction of the release archive. Confirm the selected quality setting and the last point of a short drive in a running Home Assistant installation.
