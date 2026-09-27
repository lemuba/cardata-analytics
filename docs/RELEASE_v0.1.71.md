Tag: `v0.1.71`

Title: `v0.1.71 — Optional iPhone Location Requests for CarPlay Tracks`

## 0.1.71 — Optional iPhone Location Requests for CarPlay Tracks

- Add an opt-in iPhone Companion App location request to each CarPlay auto-recording rule. Choose the phone's `notify.mobile_app_*` action and an interval of 10, 20, 30, 60, 120, 300 or 600 seconds; existing rules default to Off.
- Send silent `request_location_update` commands only while the corresponding automatic trip is connected. Stop repeated requests on disconnect, manual stop, rule removal, vehicle unload and source changes.
- After CarPlay disconnects, request one final fix and accept at most one fresh phone location within 20 seconds to help complete the route at its destination. Keep the 90-second reconnection window.
- Continue recording GPS coordinates from the selected location entity, including the iPhone `device_tracker`; the SSID sensor only controls the CarPlay trigger. Preserve existing GPS quality and movement filters, trip folders and analytics.
- Update the frontend resource to `cardata-analytics-card-0.1.71.js?v=0.1.71`.

10-second requests are experimental. iOS decides whether and when to provide an updated GPS fix, and frequent requests may consume significant battery. A 60-second starting interval is recommended. Validate actual point density and the final point with a short drive.
