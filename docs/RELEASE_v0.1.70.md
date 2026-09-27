Tag: `v0.1.70`

Title: `v0.1.70 — CarPlay Auto Recording and Trip Folders`

## 0.1.70 — CarPlay Auto Recording and Trip Folders

- Start a vehicle's assigned phone GPS recording automatically when a configured Companion App SSID sensor matches a selected CarPlay network. The backend records without an open dashboard; manual controls remain available.
- Pause recording immediately on disconnection. Reconnection within 90 seconds continues the same trip; otherwise it ends. Manually ending an automatic trip suppresses restart until the network disconnects.
- Add persistent trip identities, nested folders and folder-based map filtering within the selected date range. Folder assignments do not modify GPS points.
- Select one or all visible trips; move the selection to a folder or permanently delete it in one validated database operation. Changing trip bounds aborts the entire batch; folder deletion keeps the trips.
- Existing GPS data, SoC/energy calculations, routing and POIs are preserved. The proposed GPS-distance fallback for average consumption was not included.
- Update the physical frontend resource to `cardata-analytics-card-0.1.70.js?v=0.1.70`.

Validation: source tree and freshly extracted ZIP each pass Python and frontend offline regression tests. Real Home Assistant and CarPlay behavior require an installation test.
