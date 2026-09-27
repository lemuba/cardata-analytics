Tag: `v0.1.72`

Title: `v0.1.72 — Merge Selected GPS Trips`

## 0.1.72 — Merge Selected GPS Trips

- Select two or more trips for one vehicle and merge them into a persistent trip group. Extend an existing group or separate it again without changing stored GPS points.
- Display merged totals for GPS distance, driving time, speed and point count. The map, playback and GPX export keep the original segments separate, including when other trips fall between selected segments.
- Calculate merged energy and odometer-based average consumption from each underlying trip's existing Analytics history. An unavailable member keeps the merged energy or average unavailable rather than substituting GPS distance.
- Preserve folder moves and deletion for the underlying members. Reject incomplete or stale selections; when the date filter hides part of a group, show visible parts individually until the entire group is loaded.
- Add two small group-membership tables to the existing tracking SQLite database. Existing GPS data, CarPlay location requests, vehicle analytics and folder assignments remain intact.
- Update the frontend resource to `cardata-analytics-card-0.1.72.js?v=0.1.72`.

Validation: source tree and freshly extracted release ZIP pass Python and frontend offline regression tests. Verify the feature with a running Home Assistant instance before publishing.
