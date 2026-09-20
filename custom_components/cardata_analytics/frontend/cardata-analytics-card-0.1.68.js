const DOMAIN = "cardata_analytics";
const CARD_TAG = "cardata-analytics-card";
const CARD_VERSION = "0.1.68";
const ROUTE_MAX_WAYPOINTS = 9;
const ROUTE_MOBILE_GOOGLE_WAYPOINTS = 3;
const GPS_MOTION_MIN_SEGMENT_SECONDS = 2;
const GPS_MOTION_MAX_SEGMENT_SECONDS = 15 * 60;
const GPS_MOTION_JITTER_METERS = 12;
const GPS_MOTION_BEARING_METERS = 20;
const GPS_MOTION_MAX_SPEED_KMH = 320;
const GPS_MOTION_STALE_MS = 10 * 60 * 1000;
const POI_RADIUS_OPTIONS_KM = [2, 5, 10, 25, 50, 100, 150, 200, 500, 1000];
const VEHICLE_COLOR_PALETTE = [
  "#4477AA", "#EE6677", "#228833", "#CCBB44",
  "#66CCEE", "#AA3377", "#EE7733", "#0077BB",
];

// Frontend localization. German is the source language; every other Home
// Assistant language falls back to English until more locales are added.
const CARDATA_EN = Object.freeze({
  "Legende": "Legend",
  "Legende anzeigen": "Show legend",
  "Maßstab anzeigen": "Show scale",
  "Keine Daten": "No data",
  "Fahrten sortieren": "Sort trips",
  "Neueste zuerst": "Newest first",
  "Älteste zuerst": "Oldest first",
  "Start-SoC": "Start SoC",
  "End-SoC": "End SoC",
  "Verbrauchte Energie": "Energy consumed",
  "Ø Verbrauch": "Average consumption",
  "Vorhandene Verbrauchsdaten werden geladen …": "Loading existing consumption data …",
  "Verbrauch aus dem gespeicherten Analytics-Energiezähler im Fahrtzeitraum.": "Consumption from the stored Analytics energy counter during this trip.",
  "Für diese Fahrt fehlt der zeitliche Verlauf des Analytics-Energiezählers. Tageswerte können keiner einzelnen Fahrt zugeordnet werden.": "Analytics energy history is missing for this trip. Daily totals cannot be assigned to an individual trip.",
  "Der Analytics-Verlauf enthält eine Datenlücke. Der Fahrtverbrauch ist nicht eindeutig verfügbar.": "Analytics history contains a gap. Trip consumption cannot be determined reliably.",
  "Im Fahrtzeitraum wurde der Energiezähler korrigiert oder zurückgesetzt. Der Fahrtverbrauch ist nicht eindeutig verfügbar.": "The energy counter was corrected or reset during this trip. Trip consumption cannot be determined reliably.",
  "Für diesen Tag wurde eine SoC-Korrektur angewendet. Der korrigierte Tagesverbrauch lässt sich dieser Fahrt nicht eindeutig zuordnen.": "A SoC correction was applied to this day. The corrected daily consumption cannot be assigned reliably to this trip.",
  "Verbrauchsdaten konnten nicht geladen werden. Fahrt erneut auswählen, um es noch einmal zu versuchen.": "Could not load consumption data. Select the trip again to retry.",
  "Berechnungsstrecke (Kilometerzähler)": "Calculation distance (odometer)",
  "Gesamte Auswahl in 30 s": "Entire selection in 30 s",
  "Gesamte Auswahl in 1 min": "Entire selection in 1 min",
  "Gesamte Auswahl in 2 min": "Entire selection in 2 min",
  "Wiedergabeposition": "Playback position",
  "Wiedergabegeschwindigkeit": "Playback speed",
  "Kamera": "Camera",
  "Freie Karte": "Free map",
  "Fahrzeug folgen – Norden oben": "Follow vehicle – north up",
  "Fahrzeug folgen – Fahrtrichtung oben": "Follow vehicle – heading up",
  "Pausen zwischen Fahrten überspringen": "Skip gaps between trips",
  "Fahrzeug": "Vehicle",
  "Fahrzeuge": "Vehicles",
  "Fahrzeugübersicht & Verbrauchsanalyse": "Vehicle overview & consumption analytics",
  "{count} Fahrzeug": "{count} vehicle",
  "{count} Fahrzeuge": "{count} vehicles",
  "Schnellwahl": "Preset",
  "Von": "From",
  "Bis": "To",
  "Benutzerdefiniert": "Custom",
  "Heute": "Today",
  "Letzter Tag": "Last day",
  "Letzte 7 Tage": "Last 7 days",
  "Letzter Monat": "Last month",
  "Letztes Jahr": "Last year",
  "Woche": "Week",
  "Monat": "Month",
  "Jahr": "Year",
  "Kapazität": "Capacity",
  "Kilometerstand": "Odometer",
  "Energie gesamt": "Total energy",
  "Gewählter Zeitraum": "Selected period",
  "SoC-Daten prüfen": "Check SoC data",
  "SoC-Spike-Reparatur": "SoC spike repair",
  "SoC-Verlauf des gewählten Zeitraums analysieren": "Analyze the SoC history for the selected period",
  "Analyse läuft …": "Analyzing …",
  "Keine verdächtigen SoC-Spikes gefunden.": "No suspicious SoC spikes found.",
  "Verdächtige SoC-Spikes": "Suspicious SoC spikes",
  "Bisher": "Current",
  "Vorschlag": "Proposed",
  "Korrektur": "Correction",
  "Bereits korrigiert": "Already repaired",
  "Spikes": "Spikes",
  "Abbrechen": "Cancel",
  "Korrektur übernehmen": "Apply correction",
  "Korrektur wird gespeichert …": "Saving correction …",
  "SoC-Korrektur gespeichert: {value} kWh entfernt.": "SoC correction saved: removed {value} kWh.",
  "Die Analyse verändert noch keine Daten. Erst „Korrektur übernehmen“ schreibt die vorgeschlagenen Werte in Cardatas Daily Ledger und die betroffenen Zähler.": "The analysis does not change any data. Only ‘Apply correction’ writes the proposed values to Cardata's Daily Ledger and affected counters.",
  "Recorder-Historie nicht ausreichend oder Analyse nicht möglich.": "Recorder history is insufficient or the analysis could not be completed.",
  "Korrektur konnte nicht gespeichert werden.": "The correction could not be saved.",
  "Noch kein Fahrzeug in der Integration eingerichtet.": "No vehicle has been configured in the integration yet.",
  "Cardata Analytics wird geladen …": "Cardata Analytics is loading …",
  "In Google Maps öffnen": "Open in Google Maps",
  "Standortzeit unbekannt": "Location time unknown",
  "Standort gerade aktualisiert": "Location updated just now",
  "Standort vor {n} Min. aktualisiert": "Location updated {n} min ago",
  "Standort vor {n} Std. aktualisiert": "Location updated {n} h ago",
  "Standort vor {n} Tag aktualisiert": "Location updated {n} day ago",
  "Standort vor {n} Tagen aktualisiert": "Location updated {n} days ago",
  "Zeitraum liegt teilweise oder vollständig in der Zukunft.": "The selected period is partly or entirely in the future.",
  "Ungültiger Zeitraum: Das Von-Datum liegt nach dem Bis-Datum.": "Invalid period: the From date is after the To date.",
  "Zeitraum kann noch nicht ausgewertet werden – Analytics-Entitäten fehlen.": "The period cannot be evaluated yet – analytics entities are missing.",
  "Zeitraum kann aktuell nicht vollständig ausgewertet werden – der Kilometerstand ist nicht verfügbar.": "The period cannot currently be evaluated completely – the odometer is unavailable.",
  "Zeitraum nicht vollständig auswertbar.": "The period cannot be evaluated completely.",
  "Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab {date}.": "The period cannot be evaluated completely · analytics data available from {date}.",
  "Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab {date} ({covered}/{expected} historische Tage vorhanden).": "The period cannot be evaluated completely · analytics data available from {date} ({covered}/{expected} historical days available).",
  "Zeitraum nicht vollständig auswertbar · einzelne Tagesdaten fehlen ({covered}/{expected} historische Tage vorhanden).": "The period cannot be evaluated completely · individual daily records are missing ({covered}/{expected} historical days available).",
  "Zeitraum nicht vollständig auswertbar ({covered}/{expected} historische Tage vorhanden).": "The period cannot be evaluated completely ({covered}/{expected} historical days available).",
  "Auswertung wird aktualisiert …": "Analytics are being updated …",
  "{best} im gewählten Zeitraum um {diff} kWh/100 km effizienter als {second}.": "{best} is {diff} kWh/100 km more efficient than {second} in the selected period.",

  "Cardata Fahrzeugkarte": "Cardata Vehicle Map",
  "Live-Positionen aus Cardata Analytics": "Live positions from Cardata Analytics",
  "Vollbild": "Fullscreen",
  "Kartendarstellung": "Map style",
  "Kartenfunktionen": "Map controls",
  "Fahrzeugkarte": "Vehicle map",
  "Satellit": "Satellite",
  "OSM+ (detailreich)": "OSM+ (detailed)",
  "3D-Gelände": "3D terrain",
  "3D-Steuerung": "3D controls",
  "3D-Steuerung einblenden": "Show 3D controls",
  "3D-Steuerung ausblenden": "Hide 3D controls",
  "Neigung": "Pitch",
  "Geländeüberhöhung": "Terrain exaggeration",
  "Drehung": "Rotation",
  "Kompass": "Compass",
  "Kompass anzeigen": "Show compass",
  "Nach Norden ausrichten": "Align north",
  "Ein": "On",
  "3D-Ansicht zurücksetzen": "Reset 3D view",
  "DEM-Höhe": "DEM elevation",
  "Höhe am Kartenmittelpunkt": "Elevation at map center",
  "DEM wird geladen …": "DEM loading …",
  "Alle sichtbaren Fahrzeuge einpassen": "Fit all visible vehicles",
  "Alle": "All",
  "Restreichweiten aller Fahrzeuge ein-/ausblenden": "Show or hide remaining-range rings for all vehicles",
  "Restreichweiten ein- oder ausblenden": "Show or hide remaining-range rings",
  "Reichweite": "Range",
  "Alle eingeblendeten Restreichweiten einpassen": "Fit all visible remaining-range rings",
  "Restreichweiten einpassen": "Fit remaining-range rings",
  "Bereich": "Range area",
  "Fahrzeuge ein- oder ausblenden": "Show or hide vehicles",
  "Points of Interest in Fahrzeugnähe": "Points of Interest near vehicles",
  "Route mit POI-Zwischenzielen planen": "Plan a route with POI waypoints",
  "Route planen": "Plan route",
  "Route": "Route",
  "Tracking": "Tracking",
  "GPS-Historie": "GPS history",
  "GPS-Tracking aufzeichnen": "Record GPS tracking",
  "Aufbewahrung": "Retention",
  "Unbegrenzt": "Unlimited",
  "Tage": "days",
  "Gesamttrack anzeigen": "Show full track",
  "Track einpassen": "Fit track",
  "Recorder importieren": "Import Recorder history",
  "GPX herunterladen": "Download GPX",
  "Tracking-Daten löschen": "Delete tracking data",
  "Alle Tracking-Daten löschen": "Delete all tracking data",
  "Tracking-Daten in diesem Zeitraum wirklich löschen?": "Really delete tracking data in this time range?",
  "Fahrzeugfarbe": "Vehicle color",
  "Geschwindigkeit": "Speed",
  "SoC": "SoC",
  "Darstellung": "Display",
  "Primärfahrzeug": "Primary vehicle",
  "Fahrzeuge im Track": "Vehicles in track",
  "Heute": "Today",
  "Letzte 24h": "Last 24h",
  "Dieser Monat": "This month",
  "Anzeigen": "Show",
  "GPS-Punkte": "GPS points",
  "Fahrten": "Trips",
  "Distanz": "Distance",
  "Fahrtzeit": "Driving time",
  "Ø GPS": "Avg GPS",
  "Max GPS": "Max GPS",
  "Playback": "Playback",
  "Pause": "Pause",
  "Abspielen": "Play",
  "Recorder-Import abgeschlossen: {count} neue Punkte.": "Recorder import complete: {count} new points.",
  "Bis jetzt (automatisch aktualisieren)": "Up to now (refresh automatically)",
  "Gespeichert insgesamt: {count} GPS-Punkte": "Stored in total: {count} GPS points",
  "Live: {live} · Recorder-Import: {imported}": "Live: {live} · Recorder import: {imported}",
  "Letzter GPS-Punkt: {date}": "Latest GPS point: {date}",
  "Letzter Live-Punkt: {date}": "Latest live point: {date}",
  "Noch keine GPS-Punkte gespeichert.": "No GPS points stored yet.",
  "Noch keine Live-Punkte gespeichert.": "No live points stored yet.",
  "Bestand aktualisieren": "Refresh stored counts",
  "Zentrale Datenbank: {name}": "Central database: {name}",
  "Gesamttrack liest gespeicherte Daten; Recorder-Import ergänzt ältere GPS-Daten.": "Full track reads stored data; Recorder import adds past GPS data.",
  "Recorder-Import für {vehicle}": "Recorder import for {vehicle}",
  "{inserted} neu gespeichert · {existing} bereits vorhanden · {filtered} herausgefiltert.": "{inserted} newly stored · {existing} already present · {filtered} filtered out.",
  "Datenbank geprüft: {total} GPS-Punkte im Importzeitraum, davon {imported} aus Recorder-Importen.": "Database checked: {total} GPS points in the import period, including {imported} from Recorder imports.",
  "Keine verwertbaren GPS-Punkte im Recorder-Zeitraum gefunden.": "No usable GPS points found in the Recorder period.",
  "Ausgewählte Fahrt": "Selected trip",
  "Geladener Zeitraum": "Loaded period",
  "Nur diese Fahrt auf der Karte anzeigen": "Show only this trip on the map",
  "Gesamttrack anzeigen hebt die Fahrtauswahl auf.": "Show full track clears the trip selection.",
  "Keine Tracking-Daten im gewählten Zeitraum.": "No tracking data in the selected time range.",
  "Tracking ist für dieses Fahrzeug deaktiviert.": "Tracking is disabled for this vehicle.",
  "Keine GPS-Konfiguration für dieses Fahrzeug.": "No GPS configuration for this vehicle.",
  "Tracking-Einstellungen konnten nicht geladen werden.": "Tracking settings could not be loaded.",
  "Track konnte nicht geladen werden.": "Track could not be loaded.",
  "GPX konnte nicht erstellt werden.": "GPX could not be created.",
  "Import aus Home Assistant Recorder": "Import from Home Assistant Recorder",
  "Gesamttrack": "Full track",
  "Vergrößern": "Zoom in",
  "Verkleinern": "Zoom out",
  "Schließen": "Close",
  "Datum": "Date",
  "Alle anzeigen": "Show all",
  "Alle ausblenden": "Hide all",
  "Alle + Reichweite": "All + range",
  "Standort nicht verfügbar": "Location unavailable",
  "Fahrzeug zentrieren": "Center vehicle",
  "Reichweite nicht verfügbar": "Range unavailable",
  "Keine Fahrzeuge mit GPS-Konfiguration gefunden.": "No vehicles with GPS configuration found.",
  "gerade eben": "just now",
  "vor {n} Min.": "{n} min ago",
  "vor {n} Std.": "{n} h ago",
  "vor {n} Tag": "{n} day ago",
  "vor {n} Tagen": "{n} days ago",
  "Vergleich folgt": "waiting for comparison",
  "veraltet": "stale",
  "GPS-Sprung verworfen": "GPS jump rejected",
  "neuer GPS-Punkt · Vergleich folgt": "new GPS point · waiting for comparison",
  "steht": "stationary",
  "fährt": "moving",
  "fährt · {bearing}": "moving · {bearing}",

  "Ladestation": "Charging station",
  "Ladestationen": "Charging stations",
  "Tankstellen": "Fuel stations",
  "Werkstätten": "Workshops",
  "Autowäsche": "Car washes",
  "Reifenservice": "Tyre service",
  "Autoteile": "Car parts",
  "Mietwagen": "Car rental",
  "Parkplätze": "Parking",
  "Parkhäuser": "Parking garages",
  "P+R": "Park & ride",
  "Restaurants & Fast Food": "Restaurants & fast food",
  "Cafés": "Cafés",
  "Bäckereien": "Bakeries",
  "Eisdielen": "Ice cream",
  "Bars & Pubs": "Bars & pubs",
  "Biergärten": "Beer gardens",
  "Supermärkte": "Supermarkets",
  "Minimärkte": "Convenience stores",
  "Einkaufszentren": "Shopping centres",
  "Drogerien": "Drugstores",
  "Getränkemärkte": "Beverage stores",
  "Apotheken": "Pharmacies",
  "Krankenhäuser": "Hospitals",
  "Ärzte": "Doctors",
  "Zahnärzte": "Dentists",
  "Kliniken": "Clinics",
  "Tierärzte": "Veterinarians",
  "Hotels": "Hotels",
  "Motels": "Motels",
  "Hostels": "Hostels",
  "Campingplätze": "Campsites",
  "Wohnmobilstellplätze": "Motorhome sites",
  "Toiletten": "Toilets",
  "Trinkwasser": "Drinking water",
  "Rast- & Serviceplätze": "Rest & service areas",
  "Picknickplätze": "Picnic sites",
  "Duschen": "Showers",
  "Geldautomaten": "ATMs",
  "Banken": "Banks",
  "Postfilialen": "Post offices",
  "Paketstationen": "Parcel lockers",
  "Bahnhöfe": "Railway stations",
  "Busbahnhöfe": "Bus stations",
  "Flughäfen": "Airports",
  "Fährterminals": "Ferry terminals",
  "Taxistände": "Taxi stands",
  "Museen": "Museums",
  "Sehenswürdigkeiten": "Attractions",
  "Aussichtspunkte": "Viewpoints",
  "Burgen & Schlösser": "Castles",
  "Denkmäler": "Monuments",
  "Zoos": "Zoos",
  "Freizeitparks": "Theme parks",
  "Schwimmbäder": "Swimming pools",
  "Polizei": "Police",
  "Feuerwehr": "Fire stations",
  "Rettungswachen": "Ambulance stations",
  "Auto & Mobilität": "Car & mobility",
  "Essen & Trinken": "Food & drink",
  "Einkaufen": "Shopping",
  "Gesundheit": "Health",
  "Reise & Aufenthalt": "Travel & stay",
  "Unterwegs": "On the road",
  "Finanzen & Service": "Finance & services",
  "ÖPNV & Verkehr": "Public transport & traffic",
  "Freizeit & Sehenswürdigkeiten": "Leisure & attractions",
  "Notfall": "Emergency",

  "Routenziel": "Route destination",
  "Ziel": "Destination",
  "Kartenmitte": "Map centre",
  "Fahrzeug · {name}": "Vehicle · {name}",
  "Routenziel · {name}": "Route destination · {name}",
  "POI-Zentrum": "POI centre",
  "POI-Suche ist ausgeschaltet.": "POI search is off.",
  "allgemeine POIs max. 200 km": "general POIs max. 200 km",
  "Wiederholungsversuch {n}/{max}": "retry {n}/{max}",
  "POIs werden über Home Assistant geladen …": "POIs are loading through Home Assistant …",
  "{count} Treffer": "{count} results",
  "{count} Treffer von {raw}": "{count} results of {raw}",
  "Fallback aktiv": "fallback active",
  "Home-Assistant-WebSocket ist nicht verfügbar": "Home Assistant WebSocket is unavailable",
  "Für dieses POI-Zentrum muss zuerst ein Routenziel gesetzt werden.": "Set a route destination before using this POI centre.",
  "Für die POI-Suche ist kein gültiges Zentrum verfügbar.": "No valid centre is available for POI search.",
  "Die Anzeige ist auf {max} POIs begrenzt. Radius oder Filter ggf. verkleinern.": "The display is limited to {max} POIs. Reduce the radius or filters if needed.",
  "{count} von {matched} Treffern angezeigt": "Showing {count} of {matched} results",
  "Suchbasis auf {limit} POIs begrenzt. Die lokale Textsuche kann unvollständig sein. Aktualisieren startet eine gezielte Suche nach „{search}“.": "Search base limited to {limit} POIs. Local text search may be incomplete. Refresh starts a targeted search for “{search}”.",
  "Open Charge Map ist noch nicht konfiguriert. Bitte Cardata Analytics unter Geräte & Dienste neu konfigurieren und den API-Key hinterlegen.": "Open Charge Map is not configured yet. Reconfigure Cardata Analytics under Devices & services and add the API key.",
  "POI-Dienst vorübergehend nicht erreichbar – neuer Versuch {n}/{max} in {seconds} s …": "POI service temporarily unavailable – retry {n}/{max} in {seconds} s …",
  "POI-Abfrage wird in {seconds} s fortgesetzt …": "POI request will continue in {seconds} s …",
  "Open Charge Map ist momentan nicht erreichbar und es liegt noch kein passender lokaler Cache vor.{details}": "Open Charge Map is currently unavailable and no matching local cache is available.{details}",
  "POIs konnten nicht geladen werden: {error}": "POIs could not be loaded: {error}",
  "POI-Aktualisierung fehlgeschlagen; letzte Ergebnisse bleiben sichtbar: {error}": "POI refresh failed; previous results remain visible: {error}",
  "ungültige Antwort vom Cardata-Analytics-Backend": "invalid response from the Cardata Analytics backend",
  "POI-Backend noch nicht aktiv – Home Assistant nach dem Update vollständig neu starten": "POI backend is not active yet – fully restart Home Assistant after the update",
  "Ungültige Satelliten-Konfiguration. satellite_url muss HTTPS mit {z}/{x}/{y} enthalten und satellite_attribution muss gesetzt sein.": "Invalid satellite configuration. satellite_url must use HTTPS and contain {z}/{x}/{y}, and satellite_attribution must be set.",
  "Importierte Vorlage": "Imported template",
  

  "Routenplanung": "Route planning",
  "Zwischenziel auf Karte wählen": "Choose waypoint on map",
  "Ziel auf Karte wählen": "Choose destination on map",
  "Tippe oder klicke auf die gewünschte Position. POIs können weiterhin direkt geöffnet werden.": "Tap or click the desired position. POIs can still be opened directly.",
  "Abbrechen": "Cancel",
  "Kartenauswahl abgebrochen.": "Map selection cancelled.",
  "Routenvorlage": "Route template",
  "Aktuelle Route": "Current route",
  "Eigene · global": "Custom · global",
  "Aktuelle Route global speichern": "Save current route globally",
  "Globale Routenvorlage löschen": "Delete global route template",
  "Startfahrzeug": "Start vehicle",
  "Startpunkt": "Start point",
  "Fahrzeugposition": "Vehicle position",
  "Fahrzeug wählen …": "Select vehicle …",
  "Aktueller Smartphone-Standort": "Current smartphone location",
  "Smartphone": "Smartphone",
  "Smartphone-Standort wird ermittelt …": "Getting smartphone location …",
  "Smartphone-Standort aktualisieren": "Refresh smartphone location",
  "Standortfreigabe erforderlich": "Location permission required",
  "Standort konnte nicht ermittelt werden: {error}": "Location could not be determined: {error}",
  "Standortberechtigung wurde verweigert.": "Location permission was denied.",
  "Standortermittlung hat zu lange gedauert.": "Location request timed out.",
  "Standort ist auf diesem Gerät nicht verfügbar.": "Location is not available on this device.",
  "Smartphone-Standort gesetzt · {age}": "Smartphone location set · {age}",
  "Smartphone-Standort gesetzt.": "Smartphone location set.",
  "Startpunkt zentrieren": "Center start point",
  "Als Start": "As start",
  "Als Startpunkt": "As start point",
  "Ausgewählten Ort als Start verwenden": "Use selected place as start",
  "Startpunkt auf Karte wählen": "Choose start point on map",
  "Tippe oder klicke jetzt auf die gewünschte Startposition in der Karte.": "Tap or click the desired start position on the map.",
  "Kartenstart gesetzt.": "Map start set.",
  "{label} wurde als Startpunkt gesetzt.": "{label} was set as the start point.",
  "Startpunkt auf Fahrzeug „{name}“ gesetzt.": "Start point set to vehicle “{name}”.",
  "Gespeicherte Orte & Zonen": "Saved places & zones",
  "Ort auswählen …": "Select place …",
  "kein GPS": "no GPS",
  "Kein Fahrzeug mit GPS": "No vehicle with GPS",
  "Startposition nicht verfügbar": "Start position unavailable",
  "Startpunkt gesetzt.": "Start point set.",
  "Startfahrzeug zentrieren": "Center start vehicle",
  "Zwischenziele": "Waypoints",
  "Nach oben": "Move up",
  "Nach unten": "Move down",
  "Entfernen": "Remove",
  "POI, Adresse oder Kartenpunkt als Zwischenziel wählen. Cardata verwaltet bis zu {max} Zwischenziele.": "Choose a POI, address or map point as a waypoint. Cardata manages up to {max} waypoints.",
  "innerhalb Luftlinienbereich": "within straight-line range",
  "außerhalb Luftlinienbereich": "outside straight-line range",
  "Luftlinie": "straight line",
  "km Luftlinie": "km straight line",
  "Ziel über POI, gespeicherten Ort, Adresse oder direkt auf der Karte setzen.": "Set the destination from a POI, saved place, address or directly on the map.",
  "Gespeicherte Ziele": "Saved destinations",
  "Gespeichertes Ziel": "Saved destination",
  "Ziel auswählen …": "Select destination …",
  "Home Assistant Zonen": "Home Assistant zones",
  "Ausgewähltes Ziel übernehmen": "Use selected destination",
  "Aktuelles Ziel speichern": "Save current destination",
  "Umbenennen": "Rename",
  "Löschen": "Delete",
  "Adresse suchen": "Search address",
  "Adresse, Ort oder Ziel …": "Address, place or destination …",
  "Adresse wird gesucht …": "Searching address …",
  "Als Zwischenziel": "As waypoint",
  "Als Ziel": "As destination",
  "Global speichern": "Save globally",
  "Punkt auf Karte": "Point on map",
  "Auf Karte tippen …": "Tap map …",
  "Zwischenziel": "Waypoint",
  "POIs wählen": "Choose POIs",
  "Einpassen": "Fit",
  "Navigation": "Navigation",
  "Route löschen": "Delete route",
  "Cardata übergibt Start, Zwischenziele und Ziel. Die echte Straßenroute berechnet Google Maps.": "Cardata passes start, waypoints and destination. Google Maps calculates the actual road route.",
  "Cardata zeichnet nur Routenpunkte – keine irreführende Luftlinienroute.": "Cardata draws route points only – no misleading straight-line route.",
  "Routen und gespeicherte Ziele sind global in Home Assistant gespeichert. Der Startpunkt kann Fahrzeug, Smartphone, gespeicherter Ort, HA-Zone, Adresse oder Kartenpunkt sein.": "Routes and saved destinations are stored globally in Home Assistant. The start can be a vehicle, smartphone, saved place, HA zone, address or map point.",
  "Name der globalen Routenvorlage:": "Name of global route template:",
  "diese Routenvorlage": "this route template",
  "Name des globalen Ziels:": "Name of global destination:",
  "Neuer Name des globalen Ziels:": "New name of global destination:",
  "Adresse": "Address",
  "Tippe oder klicke jetzt auf die gewünschte Position für das nächste Zwischenziel.": "Tap or click the desired position for the next waypoint.",
  "Tippe oder klicke jetzt auf die gewünschte Zielposition in der Karte.": "Tap or click the desired destination position on the map.",
  "Route gelöscht.": "Route deleted.",
  "Zwischenziel-Reihenfolge geändert.": "Waypoint order changed.",
  "Zwischenziel entfernt.": "Waypoint removed.",
  "Ziel entfernt.": "Destination removed.",
  "Keine passende Adresse gefunden.": "No matching address found.",
  "Ziel gesetzt.": "Destination set.",
  "Zwischenziel hinzugefügt.": "Waypoint added.",
  "Maximal {max} Zwischenziele in Cardata.": "Maximum {max} waypoints in Cardata.",
  "Kartenziel gesetzt. Google Maps berechnet beim Öffnen die tatsächliche Straßenroute.": "Map destination set. Google Maps calculates the actual road route when opened.",
  "Routenvorlage „{name}“ geladen.": "Route template “{name}” loaded.",
  "Routenvorlage „{name}“ geladen. Smartphone-Standort wird aktualisiert.": "Route template “{name}” loaded. Smartphone location is being refreshed.",
  "Hinweis: Cardata behält alle {count} Zwischenziele, übergibt auf diesem mobilen Gerät an Google Maps aber nur die ersten {mobile}.": "Note: Cardata keeps all {count} waypoints, but on this mobile device only the first {mobile} are passed to Google Maps.",
  "Hinweis: Cardata/Google Maps Desktop kann bis zu {max} Zwischenziele übergeben; mobile Browser garantieren nur {mobile}.": "Note: Cardata/Google Maps Desktop can pass up to {max} waypoints; mobile browsers guarantee only {mobile}.",
  "{label} ist bereits das Ziel.": "{label} is already the destination.",
  "{label} ist bereits als Zwischenziel enthalten.": "{label} is already included as a waypoint.",
  "{label} wurde als Zwischenziel {index} hinzugefügt.": "{label} was added as waypoint {index}.",
  "{label} wurde als Ziel gesetzt.": "{label} was set as the destination.",
  "Adresssuche fehlgeschlagen: {error}": "Address search failed: {error}",
  "Dieser POI ist bereits das Ziel.": "This POI is already the destination.",
  "Dieser POI ist bereits als Zwischenziel enthalten.": "This POI is already included as a waypoint.",
  "Dieser POI wurde als Ziel gesetzt.": "This POI was set as the destination.",
  "Home-Assistant-Zone": "Home Assistant zone",
  "Diese Route enthält {count} Zwischenziele. Cardata behält alle, aber Google Maps erhält auf diesem mobilen Gerät aus Kompatibilitätsgründen nur die ersten {mobile}.": "This route contains {count} waypoints. Cardata keeps all of them, but for compatibility Google Maps receives only the first {mobile} on this mobile device.",
  "Diese Route enthält {count} Zwischenziele und wird auf diesem Gerät vollständig an Google Maps übergeben. Hinweis: Mobile Browser garantieren nur {mobile} Zwischenziele.": "This route contains {count} waypoints and is passed completely to Google Maps on this device. Note: mobile browsers guarantee only {mobile} waypoints.",
  "Routenvorlage „{name}“ global gespeichert.": "Route template “{name}” saved globally.",
  "Routenvorlage konnte nicht gespeichert werden: {error}": "Route template could not be saved: {error}",
  "Globale Routenvorlage „{name}“ löschen?": "Delete global route template “{name}”?",
  "Routenvorlage gelöscht. Die aktuelle Route bleibt bestehen.": "Route template deleted. The current route remains unchanged.",
  "Routenvorlage konnte nicht gelöscht werden: {error}": "Route template could not be deleted: {error}",
  "Startfahrzeug geändert. Die Google-Maps-Route verwendet dessen aktuelle GPS-Position.": "Start vehicle changed. The Google Maps route uses its current GPS position.",
  "Ziel „{name}“ global gespeichert.": "Destination “{name}” saved globally.",
  "Ziel konnte nicht gespeichert werden: {error}": "Destination could not be saved: {error}",
  "Ziel in „{name}“ umbenannt.": "Destination renamed to “{name}”.",
  "Ziel konnte nicht umbenannt werden: {error}": "Destination could not be renamed: {error}",
  "Globales Ziel „{name}“ löschen?": "Delete global destination “{name}”?",
  "Gespeichertes Ziel gelöscht. Eine bereits aktive Route bleibt bestehen.": "Saved destination deleted. An already active route remains unchanged.",
  "Ziel konnte nicht gelöscht werden: {error}": "Destination could not be deleted: {error}",
  
  

  "Aktuelles Fahrzeug": "Current vehicle",
  "Routenziel fehlt": "Route destination missing",
  "nicht gesetzt": "not set",
  "Kein Zentrum verfügbar": "No centre available",
  "Auf ausgewähltes Fahrzeug zoomen": "Zoom to selected vehicle",
  "Vorlagen": "Templates",
  "POI-Vorlage": "POI template",
  "Aktuelle Filter": "Current filters",
  "Aktuelle Filter global speichern": "Save current filters globally",
  "Eigene globale Vorlage löschen": "Delete custom global template",
  "Kategorie suchen": "Search category",
  "z. B. Bäckerei, Museum, Geldautomat …": "e.g. bakery, museum, ATM …",
  "Aktive POI-Kategorien": "Active POI categories",
  "abwählen": "deselect",
  "Keine Kategorie ausgewählt": "No category selected",
  "Allgemeine POI-Suche": "General POI search",
  "Suche": "Search",
  "z. B. Starbucks, Apotheke, Hotel …": "e.g. Starbucks, pharmacy, hotel …",
  "aktivieren": "enable",
  "Alle Betreiber / Netzwerke": "All operators / networks",
  "Betreiber hinzufügen": "Add operator",
  "Stecker": "Connector",
  "Mindestleistung": "Minimum power",
  "Lader mit unbekannter Leistung einbeziehen": "Include chargers with unknown power",
  "Umkreis": "Radius",
  "Aktualisieren": "Refresh",
  "Aus": "Off",
  "Allgemeine POIs © OpenStreetMap-Mitwirkende · Ladestationen: Open Charge Map · OCM bis 1000 km, allgemeine Overpass-POIs bis 200 km · Vorlagen global in Home Assistant gespeichert · Cardata {version}.": "General POIs © OpenStreetMap contributors · Charging stations: Open Charge Map · OCM up to 1000 km, general Overpass POIs up to 200 km · Templates stored globally in Home Assistant · Cardata {version}.",
  "Name der globalen POI-Vorlage:": "Name of global POI template:",
  "POI-Vorlage konnte nicht global gespeichert werden: {error}": "POI template could not be saved globally: {error}",
  "Globale POI-Vorlage „{name}“ löschen?": "Delete global POI template “{name}”?",
  "POI-Vorlage konnte nicht gelöscht werden: {error}": "POI template could not be deleted: {error}",
  
  "diese Vorlage": "this template",
  "Betreiber": "Operator",
  "Marke": "Brand",
  "Netz": "Network",
  "Max. Leistung": "Max. power",
  "Öffnung": "Opening hours",
  "Zugang": "Access",
  "Gebühr": "Fee",
  "Quelle": "Source",
  "Mehrere Quellen": "Multiple sources",
  "{name} entfernen": "Remove {name}",
  "Lizenz": "License",
  "im Luftlinien-Reichweitenbereich": "within straight-line range",
  "Website": "Website",
  "Bewegung": "Motion",
  "GPS-Update": "GPS update",
  "GPS Ø": "GPS avg.",
  "Folgen": "Follow",
  "Ring aus": "Ring off",
  "Ring an": "Ring on",
  "Karte konnte nicht geladen werden: {error}": "Map could not be loaded: {error}",
  "Keine gültige Fahrzeugposition verfügbar. Bitte Latitude und Longitude beim Fahrzeug konfigurieren.": "No valid vehicle position is available. Configure latitude and longitude for the vehicle.",
  "Alle Fahrzeuge sind ausgeblendet.": "All vehicles are hidden.",
  "Kartenrenderer konnte nicht geladen werden.": "Map renderer could not be loaded.",
  "MapLibre wurde geladen, ist aber nicht verfügbar.": "MapLibre loaded but is unavailable.",
  "MapLibre konnte nicht geladen werden.": "MapLibre could not be loaded.",
  "Automatische Analysekarte für alle Fahrzeuge der Cardata Analytics Integration.": "Automatic analytics card for all vehicles in the Cardata Analytics integration.",
  "Interaktive Karte für alle GPS-fähigen Fahrzeuge in Cardata Analytics.": "Interactive map for all GPS-enabled vehicles in Cardata Analytics.",
  "Kartendaten": "Map data",
  "Darstellung": "Rendering",
  "Daten": "Data",
  "Kilometer": "Odometer",
  "Z": "D",
  "z. B. IONITY, EnBW, Tesla": "e.g. IONITY, EnBW, Tesla",
});

function cardataLanguage(hass) {
  const raw = String(hass?.locale?.language || hass?.language || navigator?.language || "en").toLowerCase();
  return raw.startsWith("de") ? "de" : "en";
}

function cardataLocale(hass) {
  const raw = String(hass?.locale?.language || hass?.language || navigator?.language || "").trim();
  if (raw) return raw;
  return cardataLanguage(hass) === "de" ? "de-DE" : "en";
}

function cardataT(hass, source, vars = {}) {
  let text = cardataLanguage(hass) === "de" ? source : (CARDATA_EN[source] || source);
  for (const [key, value] of Object.entries(vars || {})) {
    text = text.replaceAll(`{${key}}`, String(value));
  }
  return text;
}

// MapLibre is the single rendering engine for every basemap and for the live
// vehicle/POI geometry. Keeping one geographic renderer prevents HTML overlays
// from drifting away from the map during pan/zoom, especially on iOS WebView.
// If another custom card already loaded MapLibre, reuse that global instance.
const CARDATA_MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js";
const CARDATA_OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const CARDATA_OPENFREEMAP_BRIGHT_STYLE = "https://tiles.openfreemap.org/styles/bright";
const CARDATA_OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const CARDATA_TERRARIUM_TILE_TEMPLATE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const CARDATA_TERRAIN_SOURCE_ID = "cardata-terrain-dem";
const CARDATA_TERRAIN_HILLSHADE_LAYER_ID = "cardata-terrain-hillshade";
const CARDATA_TERRAIN_DEM_MAX_ZOOM = 14;
const CARDATA_DEM_PROTOCOL = "cardata-dem";
const CARDATA_TERRAIN_DEFAULT_PITCH = 50;
const CARDATA_TERRAIN_DEFAULT_EXAGGERATION = 1.5;
const CARDATA_TERRAIN_DEFAULT_BEARING = 0;
const CARDATA_TERRAIN_DEFAULT_COMPASS_VISIBLE = true;
const CARDATA_TILE_DB_NAME = "cardata-analytics-map-tiles";
const CARDATA_TILE_STORE = "tiles";

let _cardataTileDBPromise = null;
function _cardataTileDBOpen() {
  if (_cardataTileDBPromise) return _cardataTileDBPromise;
  _cardataTileDBPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(CARDATA_TILE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(CARDATA_TILE_STORE)) req.result.createObjectStore(CARDATA_TILE_STORE);
        } catch (_) { /* best effort */ }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  }).catch((err) => {
    // Private browsing / hardened WebViews may disable IndexedDB. Terrain still
    // works; only the persistent DEM cache is skipped.
    console.warn("[Cardata Analytics] terrain tile cache disabled", err?.message || err);
    return null;
  });
  return _cardataTileDBPromise;
}

async function _cardataTileCacheGet(url) {
  try {
    const db = await _cardataTileDBOpen();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(CARDATA_TILE_STORE, "readonly");
      const request = tx.objectStore(CARDATA_TILE_STORE).get(url);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (_) {
    return null;
  }
}

async function _cardataTileCachePut(url, blob) {
  try {
    const db = await _cardataTileDBOpen();
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction(CARDATA_TILE_STORE, "readwrite");
      tx.objectStore(CARDATA_TILE_STORE).put(blob, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (_) { /* best effort */ }
}

function registerCardataMapLibreProtocols(maplibregl) {
  if (!maplibregl || typeof maplibregl.addProtocol !== "function") return false;
  const registeredLibs = window.__cardataMapLibreProtocolLibs instanceof WeakSet
    ? window.__cardataMapLibreProtocolLibs
    : (window.__cardataMapLibreProtocolLibs = new WeakSet());
  if (registeredLibs.has(maplibregl)) return true;

  maplibregl.addProtocol(CARDATA_DEM_PROTOCOL, async (params, abortController) => {
    const prefix = `${CARDATA_DEM_PROTOCOL}://`;
    const raw = String(params?.url || "");
    if (!raw.startsWith(prefix)) throw new Error("Invalid Cardata DEM URL");
    const url = `https://${raw.slice(prefix.length)}`;

    let blob = await _cardataTileCacheGet(url);
    if (!blob) {
      const response = await fetch(url, {
        mode: "cors",
        signal: abortController?.signal,
      });
      if (!response.ok) throw new Error(`Cardata DEM tile ${response.status}`);
      blob = await response.blob();
      void _cardataTileCachePut(url, blob);
    }
    return { data: await blob.arrayBuffer() };
  });
  registeredLibs.add(maplibregl);
  return true;
}

function ensureCardataMapLibre() {
  if (window.maplibregl && typeof window.maplibregl.Map === "function") {
    return Promise.resolve(window.maplibregl);
  }
  if (window.__cardataMapLibrePromise) return window.__cardataMapLibrePromise;

  window.__cardataMapLibrePromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.maplibregl && typeof window.maplibregl.Map === "function") resolve(window.maplibregl);
      else reject(new Error("MapLibre wurde geladen, ist aber nicht verfügbar."));
    };
    const existing = [...document.scripts].find((script) => /maplibre-gl(?:@|\/)/i.test(script.src || ""));
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("MapLibre konnte nicht geladen werden.")), { once: true });
      if (window.maplibregl && typeof window.maplibregl.Map === "function") finish();
      return;
    }
    const script = document.createElement("script");
    script.src = CARDATA_MAPLIBRE_JS;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = finish;
    script.onerror = () => reject(new Error("MapLibre konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
  return window.__cardataMapLibrePromise;
}

class CardataAnalyticsCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._registryLoaded = false;
    this._loadingRegistry = false;
    this._entities = [];
    this._devices = [];
    this._unsubEntityRegistry = null;
    this._unsubDeviceRegistry = null;
    this._subscriptionsStarted = false;
    this._registryReloadTimer = null;
    this._controlInteraction = false;
    this._renderPending = false;
    this._lastStateSignature = null;
    this._lastStructureSignature = null;
    this._domBuilt = false;
    this._repairPreview = null;
    this._repairBusyEntryId = null;
    this._repairApplying = false;
    this._repairNotice = "";
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._ensureRegistrySubscriptions();
  }

  disconnectedCallback() {
    clearTimeout(this._preferencesTimer);
    this._flushDatabasePreferences();
    this._stopRegistrySubscriptions();
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = config || {};
  }

  _t(source, vars = {}) {
    return cardataT(this._hass, source, vars);
  }

  _locale() {
    return cardataLocale(this._hass);
  }

  // In Home Assistant's Sections view we want enough horizontal room for
  // two vehicle columns by default. Masonry views still control card width.
  getGridOptions() {
    return {
      columns: "full",
      min_columns: 6,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureRegistrySubscriptions();

    if (!this._registryLoaded && !this._loadingRegistry) {
      this._loadRegistry();
      return;
    }

    if (!this._registryLoaded) return;

    const signature = this._stateSignature();
    if (signature === this._lastStateSignature) return;

    if (this._isControlInteractionActive()) {
      this._renderPending = true;
      return;
    }

    // State changes only update the already existing DOM nodes. This keeps
    // focus and scroll position stable in iOS/iPadOS WebView.
    if (this._domBuilt && this._structureSignature() === this._lastStructureSignature) {
      this._updateValues();
      this._lastStateSignature = signature;
      return;
    }

    this._renderFull();
  }

  getCardSize() {
    return Math.max(4, this._vehicleGroups().length * 4 + 3);
  }

  _isControlInteractionActive() {
    // Only suppress updates while a native picker/dropdown is actually open.
    // A SELECT/INPUT may keep keyboard focus after the user has committed a
    // value. Treating mere focus as an active interaction left later HA state
    // updates queued forever until the field was blurred, so the dashboard
    // could show the new dates together with stale selected-period values.
    return this._controlInteraction;
  }

  _beginControlInteraction() {
    this._controlInteraction = true;
  }

  _finishControlInteraction(delay = 0) {
    window.setTimeout(() => {
      this._controlInteraction = false;
      this._flushPendingValues();
    }, delay);
  }

  _flushPendingValues() {
    // Always patch once after a committed control change. Home Assistant may
    // deliver the global date/select state before the vehicle sensor states;
    // later hass-setter calls remain unblocked and patch again when those
    // sensor states arrive. This prevents a focused control from pinning stale
    // selected-period values indefinitely.
    this._renderPending = false;
    if (this._domBuilt && this._structureSignature() === this._lastStructureSignature) {
      this._updateValues();
      this._lastStateSignature = this._stateSignature();
    } else {
      this._renderFull();
    }
  }

  _wireControlInteraction(el) {
    if (!el) return;
    el.addEventListener("pointerdown", () => this._beginControlInteraction());
    el.addEventListener("focus", () => this._beginControlInteraction());
    el.addEventListener("blur", () => this._finishControlInteraction(50));
  }

  async _ensureRegistrySubscriptions() {
    if (!this.isConnected || !this._hass?.connection || this._subscriptionsStarted) return;
    this._subscriptionsStarted = true;
    try {
      this._unsubEntityRegistry = await this._hass.connection.subscribeEvents(
        () => this._scheduleRegistryReload(),
        "entity_registry_updated"
      );
      this._unsubDeviceRegistry = await this._hass.connection.subscribeEvents(
        () => this._scheduleRegistryReload(),
        "device_registry_updated"
      );
    } catch (err) {
      this._subscriptionsStarted = false;
      console.warn("Cardata Analytics: Registry-Abonnement nicht verfügbar", err);
    }
  }

  _stopRegistrySubscriptions() {
    for (const unsub of [this._unsubEntityRegistry, this._unsubDeviceRegistry]) {
      try { if (typeof unsub === "function") unsub(); } catch (_) { /* no-op */ }
    }
    this._unsubEntityRegistry = null;
    this._unsubDeviceRegistry = null;
    this._subscriptionsStarted = false;
    if (this._registryReloadTimer) {
      clearTimeout(this._registryReloadTimer);
      this._registryReloadTimer = null;
    }
  }

  _scheduleRegistryReload() {
    if (this._registryReloadTimer) clearTimeout(this._registryReloadTimer);
    this._registryReloadTimer = setTimeout(() => {
      this._registryReloadTimer = null;
      this._loadRegistry();
    }, 150);
  }

  async _loadRegistry() {
    if (!this._hass || this._loadingRegistry) return;
    this._loadingRegistry = true;
    try {
      const [entities, devices] = await Promise.all([
        this._hass.callWS({ type: "config/entity_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
      ]);
      this._entities = (entities || []).filter((e) => e.platform === DOMAIN && !e.disabled_by);
      this._devices = devices || [];
      this._registryLoaded = true;
      this._lastStateSignature = null;
      this._lastStructureSignature = null;
    } catch (err) {
      console.error("Cardata Analytics: Registry konnte nicht geladen werden", err);
    } finally {
      this._loadingRegistry = false;
      this._renderFull();
    }
  }

  _deviceName(deviceId) {
    const dev = this._devices.find((d) => d.id === deviceId);
    return dev?.name_by_user || dev?.name || this._t("Fahrzeug");
  }

  _vehicleGroups() {
    const groups = new Map();
    for (const ent of this._entities) {
      if (!ent.device_id) continue;
      const uid = ent.unique_id || "";
      if (uid.startsWith("global_")) continue;
      if (!groups.has(ent.device_id)) {
        const entryIdFromUid = /^[0-9a-f]{32}_/i.test(uid) ? uid.slice(0, 32) : null;
        groups.set(ent.device_id, {
          deviceId: ent.device_id,
          entryId: ent.config_entry_id || entryIdFromUid || null,
          name: this._deviceName(ent.device_id),
          entities: {},
        });
      }
      const group = groups.get(ent.device_id);
      if (!group.entryId && ent.config_entry_id) group.entryId = ent.config_entry_id;
      if (!group.entryId && /^[0-9a-f]{32}_/i.test(uid)) group.entryId = uid.slice(0, 32);
      const key = this._keyFromUniqueId(uid);
      if (key) group.entities[key] = ent.entity_id;
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, this._locale()));
  }

  _keyFromUniqueId(uid) {
    const suffixMap = [
      ["custom_average_consumption", "custom_average_consumption"],
      ["custom_distance", "custom_distance"],
      ["custom_energy", "custom_energy"],
      ["average_consumption_day", "average_consumption_today"],
      ["average_consumption_week", "average_consumption_week"],
      ["average_consumption_month", "average_consumption_month"],
      ["average_consumption_year", "average_consumption_year"],
      ["distance_day", "distance_today"],
      ["distance_week", "distance_week"],
      ["distance_month", "distance_month"],
      ["distance_year", "distance_year"],
      ["energy_day", "energy_consumed_today"],
      ["energy_week", "energy_consumed_week"],
      ["energy_month", "energy_consumed_month"],
      ["energy_year", "energy_consumed_year"],
      ["energy_consumed_total", "energy_consumed_total"],
      ["battery_capacity", "battery_capacity"],
      ["mileage", "mileage"],
      ["soc", "soc"],
      ["soh", "soh"],
      ["range", "range"],
      ["latitude", "latitude"],
      ["longitude", "longitude"],
      ["current_address", "current_address"],
    ];
    for (const [suffix, key] of suffixMap) {
      if (uid.endsWith(`_${suffix}`)) return key;
    }
    return null;
  }

  _globalEntity(uniqueId) {
    return this._entities.find((e) => e.unique_id === uniqueId)?.entity_id || null;
  }

  _state(entityId, fallback = "—") {
    if (!entityId || !this._hass) return fallback;
    const obj = this._hass.states[entityId];
    if (!obj || ["unknown", "unavailable"].includes(obj.state)) return fallback;
    return obj.state;
  }

  _num(entityId, decimals = 1) {
    const raw = this._state(entityId, null);
    if (raw === null) return "—";
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return n.toLocaleString(this._locale(), {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  _unit(entityId, fallback = "") {
    return this._hass?.states?.[entityId]?.attributes?.unit_of_measurement || fallback;
  }

  _addressText(entityId) {
    const obj = entityId ? this._hass?.states?.[entityId] : null;
    const value = obj?.state;
    return !value || ["unknown", "unavailable", "none", ""].includes(String(value).toLowerCase())
      ? null
      : String(value);
  }

  _locationAvailable(entities) {
    if (!entities?.current_address || !this._addressText(entities.current_address)) return false;
    const rawLat = this._state(entities.latitude, null);
    const rawLon = this._state(entities.longitude, null);
    if (rawLat == null || rawLon == null || String(rawLat).trim() === "" || String(rawLon).trim() === "") return false;
    const lat = Number(rawLat);
    const lon = Number(rawLon);
    return Number.isFinite(lat) && Number.isFinite(lon)
      && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  _locationUpdatedAt(entities) {
    const timestamps = [entities?.latitude, entities?.longitude]
      .map((id) => this._hass?.states?.[id])
      .map((obj) => obj?.last_updated || obj?.last_changed)
      .filter(Boolean)
      .sort();
    if (timestamps.length) return timestamps.at(-1);
    return this._hass?.states?.[entities?.current_address]?.attributes?.last_geocoded || null;
  }

  _locationAgeText(entities) {
    const iso = this._locationUpdatedAt(entities);
    if (!iso) return this._t("Standortzeit unbekannt");
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return this._t("Standortzeit unbekannt");
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 60) return this._t("Standort gerade aktualisiert");
    const min = Math.round(sec / 60);
    if (min < 60) return this._t("Standort vor {n} Min. aktualisiert", { n: min });
    const hrs = Math.round(min / 60);
    if (hrs < 24) return this._t("Standort vor {n} Std. aktualisiert", { n: hrs });
    const days = Math.round(hrs / 24);
    return this._t(days === 1 ? "Standort vor {n} Tag aktualisiert" : "Standort vor {n} Tagen aktualisiert", { n: days });
  }

  _googleMapsUrl(entityId) {
    if (!entityId || !this._hass) return null;
    const stateObj = this._hass.states[entityId];
    const url = stateObj?.attributes?.google_maps_url;
    if (typeof url === "string" && url.startsWith("https://")) return url;
    const lat = Number(stateObj?.attributes?.latitude);
    const lon = Number(stateObj?.attributes?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
  }

  _stateSignature() {
    if (!this._hass || !this._registryLoaded) return null;
    const parts = [`locale=${this._locale()}|language=${cardataLanguage(this._hass)}`];
    const ids = this._entities.map((e) => e.entity_id).filter(Boolean).sort();
    for (const entityId of ids) {
      const stateObj = this._hass.states[entityId];
      if (!stateObj) {
        parts.push(`${entityId}=<missing>`);
        continue;
      }
      let extra = "";
      if (entityId.startsWith("select.")) {
        extra = `|${JSON.stringify(stateObj.attributes?.options || [])}`;
      }
      const registryEntry = this._entities.find((entry) => entry.entity_id === entityId);
      if ((registryEntry?.unique_id || "").endsWith("_current_address")) {
        extra += `|location=${JSON.stringify({
          google_maps_url: stateObj.attributes?.google_maps_url || "",
          last_geocoded: stateObj.attributes?.last_geocoded || "",
          using_cached_address: stateObj.attributes?.using_cached_address === true,
        })}`;
      }
      if ((registryEntry?.unique_id || "").endsWith("_latitude")
          || (registryEntry?.unique_id || "").endsWith("_longitude")) {
        extra += `|updated=${stateObj.last_updated || stateObj.last_changed || ""}`;
      }
      if (Object.prototype.hasOwnProperty.call(stateObj.attributes || {}, "data_complete")) {
        extra += `|coverage=${JSON.stringify({
          data_complete: stateObj.attributes?.data_complete,
          coverage_status: stateObj.attributes?.coverage_status,
          tracking_started_at: stateObj.attributes?.tracking_started_at,
          tracking_started_date: stateObj.attributes?.tracking_started_date,
          history_complete_from: stateObj.attributes?.history_complete_from,
          effective_data_from: stateObj.attributes?.effective_data_from,
          coverage_available_from: stateObj.attributes?.coverage_available_from,
          historical_days_expected: stateObj.attributes?.historical_days_expected,
          historical_days_covered: stateObj.attributes?.historical_days_covered,
          requested_from: stateObj.attributes?.requested_from,
          requested_to: stateObj.attributes?.requested_to,
          partial_energy_kwh: stateObj.attributes?.partial_energy_kwh,
          partial_distance_km: stateObj.attributes?.partial_distance_km,
          partial_average_consumption: stateObj.attributes?.partial_average_consumption,
        })}`;
      }
      parts.push(`${entityId}=${stateObj.state}${extra}`);
    }
    return parts.join(";");
  }

  _structureSignature() {
    const vehicles = this._vehicleGroups().map((v) => [
      v.deviceId,
      v.entryId,
      v.name,
      Object.entries(v.entities).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    return JSON.stringify({
      locale: this._locale(),
      language: cardataLanguage(this._hass),
      vehicles,
      preset: this._globalEntity("global_range_preset"),
      from: this._globalEntity("global_range_from"),
      to: this._globalEntity("global_range_to"),
    });
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    }));
  }

  _socColor(entityId) {
    const n = Number(this._state(entityId, 0));
    return n >= 60
      ? "var(--success-color, #2e7d32)"
      : n >= 30
        ? "var(--warning-color, #f9a825)"
        : "var(--error-color, #c62828)";
  }

  _vehicleId(v) {
    return String(v.deviceId || "vehicle").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  _metric(entityId, label, unit = "", decimals = 1, icon = "mdi:gauge", bind = "") {
    const val = this._num(entityId, decimals);
    const shownUnit = unit || this._unit(entityId);
    const clickable = entityId ? " clickable" : "";
    return `<div class="metric${clickable}" data-entity="${this._esc(entityId || "")}">
      <div class="metric-icon"><ha-icon icon="${this._esc(icon)}"></ha-icon></div>
      <div class="metric-text">
        <div class="metric-value"><span class="value" data-bind="${this._esc(bind)}">${this._esc(val)}</span>${shownUnit ? ` <span>${this._esc(shownUnit)}</span>` : ""}</div>
        <div class="metric-label">${this._esc(label)}</div>
      </div>
    </div>`;
  }

  _periodCard(v, period, label) {
    const e = v.entities;
    const suffix = { today: "today", week: "week", month: "month", year: "year" }[period];
    const distance = e[`distance_${suffix}`];
    const energy = e[`energy_consumed_${suffix}`];
    const avg = e[`average_consumption_${suffix}`];
    const id = this._vehicleId(v);
    return `<div class="period clickable" data-entity="${this._esc(avg || distance || energy || "")}">
      <div class="period-title">${label}</div>
      <div><span data-bind="${id}:${period}:distance">${this._esc(this._num(distance, 1))}</span> km</div>
      <div><span data-bind="${id}:${period}:energy">${this._esc(this._num(energy, 2))}</span> kWh</div>
      <div>Ø <span data-bind="${id}:${period}:avg">${this._esc(this._num(avg, 1))}</span> kWh/100 km</div>
    </div>`;
  }

  _formatCoverageDate(value) {
    if (!value) return "";
    const raw = String(value);
    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(this._locale());
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleDateString(this._locale());
  }

  _localDateKey(value) {
    if (!value) return "";
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  _coverageInfo(entityId) {
    const stateObj = entityId ? this._hass?.states?.[entityId] : null;
    const attrs = stateObj?.attributes || {};
    const status = attrs.coverage_status || "";
    const complete = attrs.data_complete === true;

    if (complete) return { show: false, text: "", status };

    const availableFrom = this._formatCoverageDate(
      attrs.coverage_available_from || attrs.effective_data_from
      || attrs.tracking_started_at || attrs.history_complete_from
    );
    const expectedDays = Number(attrs.historical_days_expected ?? 0);
    const coveredDays = Number(attrs.historical_days_covered ?? 0);
    const daysVars = { covered: coveredDays, expected: expectedDays };

    let text;
    if (status === "future") {
      text = this._t("Zeitraum liegt teilweise oder vollständig in der Zukunft.");
    } else if (status === "invalid_range") {
      text = this._t("Ungültiger Zeitraum: Das Von-Datum liegt nach dem Bis-Datum.");
    } else if (status === "entities_missing") {
      text = this._t("Zeitraum kann noch nicht ausgewertet werden – Analytics-Entitäten fehlen.");
    } else if (status === "source_unavailable") {
      text = this._t("Zeitraum kann aktuell nicht vollständig ausgewertet werden – der Kilometerstand ist nicht verfügbar.");
    } else if (status === "missing_daily_history") {
      if (availableFrom && expectedDays > 0) {
        text = this._t("Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab {date} ({covered}/{expected} historische Tage vorhanden).", { date: availableFrom, ...daysVars });
      } else if (availableFrom) {
        text = this._t("Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab {date}.", { date: availableFrom });
      } else if (expectedDays > 0) {
        text = this._t("Zeitraum nicht vollständig auswertbar · einzelne Tagesdaten fehlen ({covered}/{expected} historische Tage vorhanden).", daysVars);
      } else {
        text = this._t("Zeitraum nicht vollständig auswertbar.");
      }
    } else if (status === "no_history" || status === "calculation_error") {
      text = availableFrom
        ? this._t("Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab {date}.", { date: availableFrom })
        : this._t("Zeitraum nicht vollständig auswertbar.");
    } else if (status === "partial") {
      if (availableFrom && expectedDays > 0) {
        text = this._t("Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab {date} ({covered}/{expected} historische Tage vorhanden).", { date: availableFrom, ...daysVars });
      } else if (availableFrom) {
        text = this._t("Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab {date}.", { date: availableFrom });
      } else if (expectedDays > 0) {
        text = this._t("Zeitraum nicht vollständig auswertbar ({covered}/{expected} historische Tage vorhanden).", daysVars);
      } else {
        text = this._t("Zeitraum nicht vollständig auswertbar.");
      }
    } else if (status === "initializing" || !status) {
      text = this._t("Auswertung wird aktualisiert …");
    } else {
      text = availableFrom
        ? this._t("Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab {date}.", { date: availableFrom })
        : this._t("Zeitraum nicht vollständig auswertbar.");
    }
    return { show: true, text, status };
  }

  _coverageWarning(v) {
    const id = this._vehicleId(v);
    const info = this._coverageInfo(v.entities.custom_average_consumption || v.entities.custom_energy);
    return `<div class="coverage-warning${info.show ? "" : " hidden"}" data-bind="${this._esc(`${id}:coverage`)}">
      <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
      <span>${this._esc(info.text)}</span>
    </div>`;
  }

  _vehicleCard(v) {
    const e = v.entities;
    const id = this._vehicleId(v);
    const soc = this._num(e.soc, 1);
    const soh = e.soh ? this._num(e.soh, 1) : null;
    const range = e.range ? this._num(e.range, 0) : null;
    return `<section class="vehicle" data-vehicle="${this._esc(id)}">
      <div class="vehicle-head clickable" data-entity="${this._esc(e.soc || "")}">
        <div class="car-dot" data-bind="${id}:soc-color" style="background:${this._socColor(e.soc)}"><ha-icon icon="mdi:car-electric"></ha-icon></div>
        <div>
          <h2>${this._esc(v.name)}</h2>
          <div class="sub">
            SoC <span data-bind="${id}:soc">${this._esc(soc)}</span> %
            ${e.soh ? ` · SoH <span data-bind="${id}:soh">${this._esc(soh)}</span> %` : ""}
            ${e.range ? ` · <span data-bind="${id}:range">${this._esc(range)}</span> km` : ""}
          </div>
        </div>
      </div>
      ${e.current_address ? `<div class="location-row${this._locationAvailable(e) ? "" : " hidden"}" data-bind-row="${id}:location">
        <ha-icon icon="mdi:map-marker"></ha-icon>
        <span class="location-copy">
          <span class="location-text" data-bind="${id}:address">${this._esc(this._addressText(e.current_address) || "")}</span>
          <small class="location-age" data-bind="${id}:location-age">${this._esc(this._locationAgeText(e))}</small>
        </span>
        <a class="maps-btn${this._googleMapsUrl(e.current_address) ? "" : " hidden"}" data-bind-link="${id}:maps" href="${this._esc(this._googleMapsUrl(e.current_address) || "#")}" target="_blank" rel="noopener" title="${this._esc(this._t("In Google Maps öffnen"))}"><ha-icon icon="mdi:google-maps"></ha-icon><span>Maps</span></a>
      </div>` : ""}
      <div class="metrics">
        ${this._metric(e.battery_capacity, this._t("Kapazität"), "kWh", 2, "mdi:battery-high", `${id}:capacity`)}
        ${this._metric(e.mileage, this._t("Kilometerstand"), "km", 1, "mdi:counter", `${id}:mileage`)}
        ${this._metric(e.energy_consumed_total, this._t("Energie gesamt"), "kWh", 2, "mdi:lightning-bolt", `${id}:energy-total`)}
      </div>
      <div class="periods">
        ${this._periodCard(v, "today", this._t("Heute"))}
        ${this._periodCard(v, "week", this._t("Woche"))}
        ${this._periodCard(v, "month", this._t("Monat"))}
        ${this._periodCard(v, "year", this._t("Jahr"))}
      </div>
      <div class="selected-period clickable" data-entity="${this._esc(e.custom_average_consumption || "")}">
        <strong>${this._esc(this._t("Gewählter Zeitraum"))}</strong>
        <span><span data-bind="${id}:custom-distance">${this._esc(this._num(e.custom_distance, 1))}</span> km</span>
        <span><span data-bind="${id}:custom-energy">${this._esc(this._num(e.custom_energy, 2))}</span> kWh</span>
        <span>Ø <span data-bind="${id}:custom-avg">${this._esc(this._num(e.custom_average_consumption, 1))}</span> kWh/100 km</span>
        ${this._coverageWarning(v)}
      </div>
      ${v.entryId ? `<div class="repair-actions"><button class="repair-btn" data-repair-entry="${this._esc(v.entryId)}" title="${this._esc(this._t("SoC-Verlauf des gewählten Zeitraums analysieren"))}" ${this._repairBusyEntryId === v.entryId ? "disabled" : ""}><ha-icon icon="mdi:chart-bell-curve"></ha-icon><span>${this._esc(this._t(this._repairBusyEntryId === v.entryId ? "Analyse läuft …" : "SoC-Daten prüfen"))}</span></button></div>` : ""}
    </section>`;
  }

  _repairDialog() {
    const preview = this._repairPreview;
    if (!preview) return "";
    const affected = (preview.rows || []).filter((row) => Number(row.spike_count) > 0);
    const rows = affected.map((row) => {
      const current = row.current_cardata_kwh == null ? "—" : `${Number(row.current_cardata_kwh).toLocaleString(this._locale(), { maximumFractionDigits: 2 })} kWh`;
      const proposed = row.proposed_cardata_kwh == null ? "—" : `${Number(row.proposed_cardata_kwh).toLocaleString(this._locale(), { maximumFractionDigits: 2 })} kWh`;
      const reductionValue = Number(row.reduction_kwh || 0);
      const reduction = reductionValue.toLocaleString(this._locale(), { maximumFractionDigits: 2 });
      const alreadyValue = Number(row.already_repaired_kwh || 0);
      const already = alreadyValue.toLocaleString(this._locale(), { maximumFractionDigits: 2 });
      const correction = reductionValue > 0.001
        ? `−${this._esc(reduction)} kWh`
        : (alreadyValue > 0.001 ? `${this._esc(this._t("Bereits korrigiert"))} · −${this._esc(already)} kWh` : `0 kWh`);
      return `<tr><td>${this._esc(new Date(`${row.date}T12:00:00`).toLocaleDateString(this._locale()))}</td><td>${this._esc(row.spike_count)}</td><td>${this._esc(current)}</td><td>${this._esc(proposed)}</td><td>${correction}</td></tr>`;
    }).join("");
    const reduction = Number(preview.reduction_kwh || 0);
    const canApply = reduction > 0.001 && affected.some((row) => row.repairable);
    return `<div class="repair-backdrop" id="repair-backdrop">
      <section class="repair-dialog" role="dialog" aria-modal="true" aria-label="${this._esc(this._t("SoC-Spike-Reparatur"))}">
        <div class="repair-head"><div><strong>${this._esc(this._t("SoC-Spike-Reparatur"))}</strong><small>${this._esc(preview.vehicle || "")}</small></div><button id="repair-close" aria-label="${this._esc(this._t("Schließen"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>
        <p class="repair-note">${this._esc(this._t("Die Analyse verändert noch keine Daten. Erst „Korrektur übernehmen“ schreibt die vorgeschlagenen Werte in Cardatas Daily Ledger und die betroffenen Zähler."))}</p>
        <div class="repair-summary"><span>${this._esc(this._t("Verdächtige SoC-Spikes"))}<b>${this._esc(preview.spike_count || 0)}</b></span><span>${this._esc(this._t("Korrektur"))}<b>−${this._esc(reduction.toLocaleString(this._locale(), { maximumFractionDigits: 2 }))} kWh</b></span></div>
        ${affected.length ? `<div class="repair-table-wrap"><table><thead><tr><th>${this._esc(this._t("Datum"))}</th><th>${this._esc(this._t("Spikes"))}</th><th>${this._esc(this._t("Bisher"))}</th><th>${this._esc(this._t("Vorschlag"))}</th><th>${this._esc(this._t("Korrektur"))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="repair-empty">${this._esc(this._t("Keine verdächtigen SoC-Spikes gefunden."))}</div>`}
        <div class="repair-footer"><button id="repair-cancel">${this._esc(this._t("Abbrechen"))}</button><button class="primary" id="repair-apply" ${canApply && !this._repairApplying ? "" : "disabled"}>${this._esc(this._t(this._repairApplying ? "Korrektur wird gespeichert …" : "Korrektur übernehmen"))}</button></div>
      </section>
    </div>`;
  }

  async _analyzeSocRepair(entryId) {
    if (!entryId || this._repairBusyEntryId) return;
    const fromEntity = this._globalEntity("global_range_from");
    const toEntity = this._globalEntity("global_range_to");
    const startDate = this._state(fromEntity, "");
    const endDate = this._state(toEntity, "");
    if (!startDate || !endDate) return;
    this._repairBusyEntryId = entryId;
    this._repairNotice = "";
    this._renderFull();
    try {
      this._repairPreview = await this._hass.callWS({
        type: `${DOMAIN}/analytics_repair/analyze`,
        entry_id: entryId,
        start_date: startDate,
        end_date: endDate,
      });
    } catch (err) {
      console.error("Cardata Analytics: SoC repair analysis failed", err);
      this._repairNotice = this._t("Recorder-Historie nicht ausreichend oder Analyse nicht möglich.");
      this._repairPreview = null;
    } finally {
      this._repairBusyEntryId = null;
      this._renderFull();
    }
  }

  async _applySocRepair() {
    const preview = this._repairPreview;
    if (!preview || this._repairApplying) return;
    this._repairApplying = true;
    this._renderFull();
    try {
      const result = await this._hass.callWS({
        type: `${DOMAIN}/analytics_repair/apply`,
        entry_id: preview.entry_id,
        token: preview.token,
      });
      const value = Number(result?.reduction_kwh || 0).toLocaleString(this._locale(), { maximumFractionDigits: 2 });
      this._repairNotice = this._t("SoC-Korrektur gespeichert: {value} kWh entfernt.", { value });
      this._repairPreview = null;
    } catch (err) {
      console.error("Cardata Analytics: SoC repair apply failed", err);
      this._repairNotice = this._t("Korrektur konnte nicht gespeichert werden.");
    } finally {
      this._repairApplying = false;
      this._renderFull();
    }
  }

  _closeRepairDialog() {
    if (this._repairApplying) return;
    this._repairPreview = null;
    this._renderFull();
  }

  _comparisonText(vehicles) {
    if (vehicles.length < 2) return "";
    const valid = vehicles
      .map((v) => ({ v, avg: Number(this._state(v.entities.custom_average_consumption, NaN)) }))
      .filter((x) => Number.isFinite(x.avg) && x.avg > 0);
    if (valid.length < 2) return "";
    valid.sort((a, b) => a.avg - b.avg);
    const best = valid[0];
    const second = valid[1];
    const diff = (second.avg - best.avg).toLocaleString(this._locale(), { maximumFractionDigits: 1 });
    return this._t("{best} im gewählten Zeitraum um {diff} kWh/100 km effizienter als {second}.", { best: best.v.name, diff, second: second.v.name });
  }

  _comparison(vehicles) {
    const text = this._comparisonText(vehicles);
    return `<div class="comparison${text ? "" : " hidden"}" id="comparison">${this._esc(text)}</div>`;
  }

  _setText(bind, value) {
    const el = this.shadowRoot?.querySelector(`[data-bind="${CSS.escape(bind)}"]`);
    if (el && el.textContent !== String(value)) el.textContent = String(value);
  }

  _updateVehicleValues(v) {
    const e = v.entities;
    const id = this._vehicleId(v);
    this._setText(`${id}:soc`, this._num(e.soc, 1));
    if (e.soh) this._setText(`${id}:soh`, this._num(e.soh, 1));
    if (e.range) this._setText(`${id}:range`, this._num(e.range, 0));
    this._setText(`${id}:capacity`, this._num(e.battery_capacity, 2));
    this._setText(`${id}:mileage`, this._num(e.mileage, 1));
    this._setText(`${id}:energy-total`, this._num(e.energy_consumed_total, 2));

    if (e.current_address) {
      const locationVisible = this._locationAvailable(e);
      const row = this.shadowRoot?.querySelector(`[data-bind-row="${CSS.escape(`${id}:location`)}"]`);
      row?.classList.toggle("hidden", !locationVisible);
      this._setText(`${id}:address`, this._addressText(e.current_address) || "");
      this._setText(`${id}:location-age`, this._locationAgeText(e));
      const link = this.shadowRoot?.querySelector(`[data-bind-link="${CSS.escape(`${id}:maps`)}"]`);
      if (link) {
        const url = locationVisible ? this._googleMapsUrl(e.current_address) : null;
        link.classList.toggle("hidden", !url);
        if (url && link.getAttribute("href") !== url) link.setAttribute("href", url);
      }
    }

    for (const period of ["today", "week", "month", "year"]) {
      this._setText(`${id}:${period}:distance`, this._num(e[`distance_${period}`], 1));
      this._setText(`${id}:${period}:energy`, this._num(e[`energy_consumed_${period}`], 2));
      this._setText(`${id}:${period}:avg`, this._num(e[`average_consumption_${period}`], 1));
    }

    this._setText(`${id}:custom-distance`, this._num(e.custom_distance, 1));
    this._setText(`${id}:custom-energy`, this._num(e.custom_energy, 2));
    this._setText(`${id}:custom-avg`, this._num(e.custom_average_consumption, 1));

    const coverage = this.shadowRoot?.querySelector(`[data-bind="${CSS.escape(`${id}:coverage`)}"]`);
    if (coverage) {
      const info = this._coverageInfo(e.custom_average_consumption || e.custom_energy);
      const textEl = coverage.querySelector("span");
      if (textEl && textEl.textContent !== info.text) textEl.textContent = info.text;
      coverage.classList.toggle("hidden", !info.show);
    }

    const dot = this.shadowRoot?.querySelector(`[data-bind="${CSS.escape(`${id}:soc-color`)}"]`);
    if (dot) dot.style.background = this._socColor(e.soc);
  }

  _updateValues() {
    if (!this.shadowRoot || !this._domBuilt) return;

    const vehicles = this._vehicleGroups();
    for (const v of vehicles) this._updateVehicleValues(v);

    const preset = this._globalEntity("global_range_preset");
    const from = this._globalEntity("global_range_from");
    const to = this._globalEntity("global_range_to");
    const active = this.shadowRoot.activeElement;

    const presetEl = this.shadowRoot.getElementById("preset");
    const fromEl = this.shadowRoot.getElementById("from");
    const toEl = this.shadowRoot.getElementById("to");

    if (presetEl && active !== presetEl) {
      const options = this._hass.states[preset]?.attributes?.options || [];
      const oldOptions = [...presetEl.options].map((o) => o.value);
      if (JSON.stringify(oldOptions) !== JSON.stringify(options)) {
        presetEl.replaceChildren(...options.map((option) => {
          const el = document.createElement("option");
          el.value = option;
          el.textContent = this._t(option);
          return el;
        }));
      }
      const value = this._state(preset, "");
      if (presetEl.value !== value) presetEl.value = value;
    }
    if (fromEl && active !== fromEl) {
      const value = this._state(from, "");
      if (fromEl.value !== value) fromEl.value = value;
    }
    if (toEl && active !== toEl) {
      const value = this._state(to, "");
      if (toEl.value !== value) toEl.value = value;
    }

    const comparison = this.shadowRoot.getElementById("comparison");
    if (comparison) {
      const text = this._comparisonText(vehicles);
      comparison.textContent = text;
      comparison.classList.toggle("hidden", !text);
    }
  }

  _renderFull() {
    if (!this.shadowRoot) return;
    if (!this._hass || !this._registryLoaded) {
      this.shadowRoot.innerHTML = `<ha-card><div class="loading">${this._esc(this._t("Cardata Analytics wird geladen …"))}</div></ha-card>`;
      this._domBuilt = false;
      return;
    }

    const vehicles = this._vehicleGroups();
    const preset = this._globalEntity("global_range_preset");
    const from = this._globalEntity("global_range_from");
    const to = this._globalEntity("global_range_to");
    const options = this._hass.states[preset]?.attributes?.options || [];
    const optionHtml = options
      .map((o) => `<option value="${this._esc(o)}" ${this._state(preset) === o ? "selected" : ""}>${this._esc(this._t(o))}</option>`)
      .join("");

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="wrap">
          <header>
            <div><h1>Cardata Analytics</h1><div class="muted">${this._esc(this._t("Fahrzeugübersicht & Verbrauchsanalyse"))}</div></div>
            <div class="count">${this._esc(this._t(vehicles.length === 1 ? "{count} Fahrzeug" : "{count} Fahrzeuge", { count: vehicles.length }))}</div>
          </header>
          <div class="range">
            <label>${this._esc(this._t("Schnellwahl"))}<select id="preset" ${preset ? "" : "disabled"}>${optionHtml}</select></label>
            <label>${this._esc(this._t("Von"))}<input id="from" type="date" value="${this._esc(this._state(from, ""))}" ${from ? "" : "disabled"}></label>
            <label>${this._esc(this._t("Bis"))}<input id="to" type="date" value="${this._esc(this._state(to, ""))}" ${to ? "" : "disabled"}></label>
          </div>
          ${this._comparison(vehicles)}
          ${this._repairNotice ? `<div class="repair-notice">${this._esc(this._repairNotice)}</div>` : ""}
          <div class="vehicles ${vehicles.length === 1 ? "single" : ""}">${vehicles.map((v) => this._vehicleCard(v)).join("") || `<div class="empty">${this._esc(this._t("Noch kein Fahrzeug in der Integration eingerichtet."))}</div>`}</div>
        </div>
        ${this._repairDialog()}
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => this._moreInfo(el.dataset.entity));
    });
    this.shadowRoot.querySelectorAll("[data-repair-entry]").forEach((button) => {
      button.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._analyzeSocRepair(button.dataset.repairEntry);
      });
    });
    this.shadowRoot.getElementById("repair-close")?.addEventListener("click", () => this._closeRepairDialog());
    this.shadowRoot.getElementById("repair-cancel")?.addEventListener("click", () => this._closeRepairDialog());
    this.shadowRoot.getElementById("repair-apply")?.addEventListener("click", () => this._applySocRepair());
    this.shadowRoot.getElementById("repair-backdrop")?.addEventListener("click", (ev) => {
      if (ev.target?.id === "repair-backdrop") this._closeRepairDialog();
    });

    const presetEl = this.shadowRoot.getElementById("preset");
    const fromEl = this.shadowRoot.getElementById("from");
    const toEl = this.shadowRoot.getElementById("to");
    for (const control of [presetEl, fromEl, toEl]) this._wireControlInteraction(control);

    if (presetEl && preset) {
      presetEl.addEventListener("change", async (ev) => {
        // The native dropdown has already committed/closed when change fires.
        // Release the interaction guard immediately so the vehicle sensor
        // state changes produced by the service call can patch the card even
        // while the SELECT itself keeps focus.
        this._controlInteraction = false;
        const option = ev.target.value;
        try {
          await this._hass.callService("select", "select_option", {
            entity_id: preset,
            option,
          });
        } finally {
          this._flushPendingValues();
        }
      });
    }

    if (fromEl && from) {
      fromEl.addEventListener("change", async (ev) => {
        this._controlInteraction = false;
        const date = ev.target.value;
        try {
          await this._hass.callService("date", "set_value", {
            entity_id: from,
            date,
          });
        } finally {
          this._flushPendingValues();
        }
      });
    }

    if (toEl && to) {
      toEl.addEventListener("change", async (ev) => {
        this._controlInteraction = false;
        const date = ev.target.value;
        try {
          await this._hass.callService("date", "set_value", {
            entity_id: to,
            date,
          });
        } finally {
          this._flushPendingValues();
        }
      });
    }

    this._domBuilt = true;
    this._lastStructureSignature = this._structureSignature();
    this._lastStateSignature = this._stateSignature();
  }

  _esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[c]));
  }

  _styles() {
    return `
      :host { display:block; container-type:inline-size; }
      ha-card { overflow:hidden; }
      .wrap { padding:18px; color:var(--primary-text-color); }
      header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; }
      h1 { margin:0; font-size:28px; line-height:1.15; letter-spacing:-0.02em; }
      h2 { margin:0; font-size:21px; line-height:1.2; }
      .muted,.sub,.metric-label { color:var(--secondary-text-color); }
      .muted { margin-top:4px; font-size:15px; }
      .count { background:var(--secondary-background-color); border-radius:18px; padding:7px 12px; font-size:13px; white-space:nowrap; }

      .range { display:grid; grid-template-columns:minmax(150px,0.9fr) minmax(170px,1fr) minmax(170px,1fr); gap:12px; margin-bottom:14px; }
      label { display:flex; flex-direction:column; gap:5px; font-size:12px; color:var(--secondary-text-color); font-weight:700; }
      select,input { box-sizing:border-box; width:100%; min-height:44px; border:1px solid var(--divider-color); border-radius:12px; background:var(--card-background-color); color:var(--primary-text-color); padding:8px 12px; font:inherit; font-size:15px; }

      .comparison { padding:11px 13px; border-radius:12px; background:var(--secondary-background-color); margin-bottom:14px; font-size:14px; }
      .comparison.hidden { display:none; }
      .vehicles { display:grid; gap:14px; }
      .vehicles.single { grid-template-columns:1fr; }
      .vehicles:not(.single) { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .vehicle { border:1px solid var(--divider-color); border-radius:16px; padding:14px; min-width:0; background:var(--card-background-color); }
      .vehicle-head { display:flex; align-items:center; gap:12px; margin-bottom:12px; min-width:0; }
      .vehicle-head > div:last-child { min-width:0; }
      .car-dot { width:42px; height:42px; border-radius:50%; display:grid; place-items:center; color:white; flex:0 0 auto; }
      .car-dot ha-icon { --mdc-icon-size:23px; }
      .sub { margin-top:4px; font-size:14px; line-height:1.4; }
      .location-row { display:flex; align-items:center; gap:7px; margin:-3px 0 10px 54px; min-width:0; color:var(--secondary-text-color); font-size:12px; }
      .location-row.hidden { display:none; }
      .location-row > ha-icon { --mdc-icon-size:17px; color:var(--primary-color); flex:0 0 auto; }
      .location-copy { display:flex; flex-direction:column; min-width:0; flex:1; }
      .location-text { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:var(--primary-text-color); }
      .location-age { margin-top:2px; color:var(--secondary-text-color); font-size:10px; }
      .maps-btn { margin-left:auto; flex:0 0 auto; display:inline-flex; align-items:center; gap:4px; min-height:30px; padding:0 9px; border:1px solid var(--divider-color); border-radius:9px; color:var(--primary-text-color); background:var(--secondary-background-color); text-decoration:none; font-weight:700; }
      .maps-btn ha-icon { --mdc-icon-size:16px; color:var(--primary-color); }
      .maps-btn.hidden { display:none; }

      .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:9px; }
      .metric { display:flex; align-items:center; gap:10px; padding:11px 12px; background:var(--secondary-background-color); border-radius:12px; min-width:0; }
      .metric-icon { width:32px; height:32px; border-radius:50%; display:grid; place-items:center; flex:0 0 auto; background:var(--card-background-color); }
      .metric-icon ha-icon { --mdc-icon-size:19px; color:var(--primary-color); }
      .metric-text { min-width:0; }
      .metric-value { font-size:17px; line-height:1.2; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .metric-value > span:last-child { font-size:12px; font-weight:500; color:var(--secondary-text-color); }
      .metric-label { font-size:11px; margin-top:2px; }

      .periods { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:9px; }
      .period { padding:11px 12px; background:var(--secondary-background-color); border-radius:12px; font-size:13px; line-height:1.5; min-width:0; }
      .period-title { font-size:14px; font-weight:700; margin-bottom:3px; }

      .selected-period { display:grid; grid-template-columns:minmax(145px,1.35fr) repeat(3,minmax(95px,1fr)); gap:10px; align-items:center; margin-top:9px; padding:11px 12px; border:1px dashed var(--divider-color); border-radius:12px; font-size:13px; }
      .selected-period strong { font-size:14px; }
      .repair-actions { display:flex; justify-content:flex-end; margin-top:8px; }
      .repair-btn { min-height:34px; padding:0 10px; border:1px solid var(--divider-color); border-radius:9px; background:var(--secondary-background-color); color:var(--primary-text-color); display:inline-flex; align-items:center; gap:6px; cursor:pointer; font:inherit; font-size:11px; font-weight:700; }
      .repair-btn:disabled { opacity:.55; cursor:progress; }
      .repair-btn ha-icon { --mdc-icon-size:16px; color:var(--primary-color); }
      .repair-notice { margin:0 0 12px; padding:9px 11px; border-radius:10px; background:color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color)); border:1px solid color-mix(in srgb, var(--primary-color) 25%, var(--divider-color)); font-size:12px; }
      .repair-backdrop { position:fixed; z-index:100000; inset:0; padding:calc(env(safe-area-inset-top, 0px) + 18px) 14px calc(env(safe-area-inset-bottom, 0px) + 18px); box-sizing:border-box; background:rgba(0,0,0,.42); display:grid; place-items:center; }
      .repair-dialog { width:min(720px,100%); max-height:min(82dvh,720px); overflow:auto; box-sizing:border-box; padding:16px; border-radius:16px; background:var(--card-background-color); color:var(--primary-text-color); box-shadow:0 12px 42px rgba(0,0,0,.38); }
      .repair-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .repair-head > div { display:flex; flex-direction:column; gap:3px; }
      .repair-head strong { font-size:18px; }
      .repair-head small { color:var(--secondary-text-color); }
      .repair-head button { width:38px; height:38px; padding:0; border:0; border-radius:50%; background:var(--secondary-background-color); color:var(--primary-text-color); cursor:pointer; }
      .repair-note { margin:12px 0; font-size:12px; line-height:1.45; color:var(--secondary-text-color); }
      .repair-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
      .repair-summary span { padding:10px 11px; border-radius:10px; background:var(--secondary-background-color); font-size:11px; color:var(--secondary-text-color); }
      .repair-summary b { display:block; margin-top:3px; font-size:16px; color:var(--primary-text-color); }
      .repair-table-wrap { overflow:auto; border:1px solid var(--divider-color); border-radius:10px; }
      .repair-table-wrap table { width:100%; border-collapse:collapse; font-size:11px; white-space:nowrap; }
      .repair-table-wrap th,.repair-table-wrap td { padding:8px 9px; text-align:left; border-bottom:1px solid var(--divider-color); }
      .repair-table-wrap tr:last-child td { border-bottom:0; }
      .repair-table-wrap th { color:var(--secondary-text-color); font-size:10px; }
      .repair-empty { padding:18px; text-align:center; color:var(--secondary-text-color); background:var(--secondary-background-color); border-radius:10px; }
      .repair-footer { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
      .repair-footer button { min-height:40px; padding:0 14px; border:1px solid var(--divider-color); border-radius:10px; background:var(--secondary-background-color); color:var(--primary-text-color); font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
      .repair-footer button.primary { background:var(--primary-color); color:var(--text-primary-color,#fff); border-color:var(--primary-color); }
      .repair-footer button:disabled { opacity:.5; cursor:default; }
      .coverage-warning { grid-column:1 / -1; display:flex; align-items:flex-start; gap:7px; margin-top:2px; padding:8px 10px; border-radius:9px; background:color-mix(in srgb, var(--warning-color, #f9a825) 14%, transparent); color:var(--primary-text-color); line-height:1.35; }
      .coverage-warning ha-icon { --mdc-icon-size:18px; color:var(--warning-color, #f9a825); flex:0 0 auto; margin-top:1px; }
      .coverage-warning.hidden { display:none; }

      .clickable { cursor:pointer; transition:background-color .15s ease, transform .15s ease; }
      .clickable:hover { background-color:color-mix(in srgb, var(--secondary-background-color) 88%, var(--primary-color) 12%); }
      .loading,.empty { padding:24px; text-align:center; color:var(--secondary-text-color); }

      @container (max-width: 760px) {
        .wrap { padding:14px; }
        header { align-items:center; }
        h1 { font-size:24px; }
        .range { grid-template-columns:1fr; }
        .selected-period { grid-template-columns:1fr 1fr; }
      }

      /* Two vehicles stay side-by-side down to tablet/card widths. The card
         only stacks on genuinely narrow phone-sized containers. */
      @container (max-width: 460px) {
        .vehicles:not(.single) { grid-template-columns:1fr; }
      }

      @container (max-width: 500px) {
        .wrap { padding:12px; }
        header { gap:10px; }
        h1 { font-size:22px; }
        .muted { font-size:14px; }
        .count { padding:6px 9px; }
        .vehicle { padding:12px; }
        h2 { font-size:19px; }
        .metrics { grid-template-columns:1fr; }
        .periods { grid-template-columns:1fr 1fr; }
        .selected-period { grid-template-columns:1fr; }
        .repair-actions { justify-content:stretch; }
        .repair-btn { width:100%; justify-content:center; min-height:40px; }
        .repair-summary { grid-template-columns:1fr; }
        .repair-dialog { padding:13px; max-height:88dvh; }
        .repair-footer { display:grid; grid-template-columns:1fr 1fr; }
      }
    `;
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, CardataAnalyticsCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "Cardata Analytics",
    description: cardataT({ language: navigator?.language }, "Automatische Analysekarte für alle Fahrzeuge der Cardata Analytics Integration."),
    preview: true,
  });
}

const MAP_CARD_TAG = "cardata-analytics-map-card";

class CardataAnalyticsMapCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._registryLoaded = false;
    this._loadingRegistry = false;
    this._entities = [];
    this._devices = [];
    this._subscriptionsStarted = false;
    this._unsubEntityRegistry = null;
    this._unsubDeviceRegistry = null;
    this._registryReloadTimer = null;
    this._domBuilt = false;
    this._lastStructureSignature = null;
    this._lastStateSignature = null;

    this._tileSize = 256;
    this._zoom = 13;
    this._center = { lat: 51.0, lon: 10.0 };
    this._mode = "osm";
    this._lastFreeMode = "osm";
    this._selectedVehicleId = null;
    this._hiddenVehicles = new Set();
    // Per-vehicle live remaining-range overlays. The set contains vehicle IDs
    // whose current range should be drawn. Geometry is rendered by MapLibre so
    // it remains geographically locked while panning/zooming and follows GPS.
    this._rangeVehicles = new Set();
    this._drag = null;
    this._resizeObserver = null;
    this._pseudoFullscreen = false;
    this._mapInitialized = false;
    // Keep currently visible tile DOM nodes by world tile coordinate. This avoids
    // re-requesting the complete viewport whenever GPS follow or panning crosses
    // a single tile boundary. A provider/zoom change still starts a fresh set.
    this._tileElements = new Map();
    this._tileGenerationKey = null;
    this._vectorMap = null;
    this._mapRouteClickHandler = null;
    this._vectorMapInitPromise = null;
    this._vectorMapError = "";
    this._maplibreLib = null;
    this._mapStyleId = null;
    this._mapStyleReady = false;
    this._terrainPitch = CARDATA_TERRAIN_DEFAULT_PITCH;
    this._terrainExaggeration = CARDATA_TERRAIN_DEFAULT_EXAGGERATION;
    this._terrainBearing = CARDATA_TERRAIN_DEFAULT_BEARING;
    this._terrainCompassVisible = CARDATA_TERRAIN_DEFAULT_COMPASS_VISIBLE;
    this._terrainControlsVisible = true;
    this._terrainElevationMeters = null;
    this._mapPoiHandlers = null;
    this._mapTrackingHandlers = null;
    this._trackingPopupMaplibre = null;
    this._vehicleMapMarkers = new Map();
    // Programmatic camera moves (Follow / vehicle focus) must not be confused
    // with manual user panning. Keep a short guard window while MapLibre animates.
    this._programmaticCameraUntil = 0;
    this._storageKey = "cardata_analytics_map_card_v1";

    // GPS Track History & Explorer. This subsystem is intentionally isolated
    // from Analytics writes; trip details only read existing Analytics history.
    this._trackingStatus = null;
    this._trackingStatusLoading = false;
    this._trackingSelectedEntries = new Set();
    this._trackingPrimaryEntryId = "";
    this._trackingColorMode = "vehicle";
    this._trackingTripSort = "newest";
    this._trackingLegendVisible = true;
    this._trackingLegendExpanded = true;
    this._mapScaleVisible = false;
    this._mapScaleControl = null;
    this._trackingTripDetails = null;
    this._trackingDetailsVersion = 0;
    this._trackingStartLocal = "";
    this._trackingEndLocal = "";
    this._trackingFollowNow = false;
    this._trackingRangePreset = "custom";
    this._trackingResult = null;
    this._trackingSelectedTrip = null;
    this._trackingQueryVersion = 0;
    this._trackingRefreshTimer = null;
    this._trackingRefreshing = false;
    this._trackingLoading = false;
    this._trackingMessage = "";
    this._trackingPlaybackTimer = null;
    this._trackingPlaybackFlat = [];
    this._trackingPlaybackIndex = 0;
    this._trackingPlaybackSpeed = "duration:30";
    this._trackingSkipPauses = true;
    this._trackingCameraMode = "free";
    this._trackingPlaybackTimeline = [];
    this._trackingPlaybackPosition = 0;
    this._trackingCameraBearing = null;
    this._trackingCameraActive = false;
    this._trackingLastFrameTime = null;
    this._trackingVisibilityHandler = () => { if (document.hidden) this._stopTrackingPlayback(); };
    this._trackingPlaybackPoint = null;
    this._trackingPlaybackRunning = false;
    this._trackingPlaybackEngaged = false;

    // POIs are opt-in. Queries are debounced, rate-limited and cached locally
    // so public Overpass infrastructure is never polled continuously.
    this._poiCategories = new Set();
    this._poiRadiusKm = 5;
    this._poiSearchText = "";
    // The text field is only an editor; active charging operators live in the
    // array so several networks can be combined with OR semantics.
    this._poiOperatorText = "";
    this._poiOperators = [];
    this._poiCenterMode = "vehicle";
    this._poiMinPowerKw = 0;
    this._poiConnector = "any";
    this._poiIncludeUnknownPower = true;
    this._poiActiveTemplate = "";
    // Custom POI templates are global from 0.1.39 and live in Home Assistant's
    // backend Store. Browser-local templates from older versions are migrated
    // once after the backend list is available.
    this._poiGlobalTemplates = {};
    this._poiTemplatesLoaded = false;
    this._poiTemplatesLoading = false;
    this._poiOpenGroups = new Set();
    this._poiRawResults = [];
    this._poiResults = [];
    this._poiMatchedCount = 0;
    this._poiCandidateLimitHit = false;
    this._poiCandidateLimit = 0;
    this._poiSourceVehicleId = null;
    this._poiSourceLat = null;
    this._poiSourceLon = null;
    this._poiSourceCenterKey = "";
    this._poiSourceCenterLabel = "";
    this._poiLoading = false;
    this._poiError = "";
    this._poiFetchTimer = null;
    this._poiLastNetworkAt = 0;
    this._poiBackoffUntil = 0;
    // Robust POI request state machine. A running request is never invalidated
    // merely because Home Assistant publishes another state update. Instead the
    // newest desired query is remembered and, if necessary, executed exactly once
    // after the active request finishes. This prevents endless stale-request loops.
    this._poiLifecycleEpoch = 0;
    this._poiRequestSeq = 0;
    this._poiActiveRequestId = 0;
    this._poiActiveRequestKey = "";
    this._poiDesiredRequestKey = "";
    this._poiPendingRequestKey = "";
    this._poiPendingForce = false;
    this._poiScheduledForce = false;
    this._poiRequestInFlight = false;
    this._poiRetryKey = "";
    this._poiRetryCount = 0;
    this._poiMaxAutoRetries = 2;
    this._poiLastSuccessAt = 0;
    this._poiLastDurationMs = null;
    this._selectedPoiId = null;

    // Lightweight route planning. Cardata manages only start/waypoints/destination;
    // Google Maps performs the actual road routing and turn-by-turn navigation.
    this._routeVehicleId = null;
    this._routeStartMode = "vehicle";
    this._routeStartPoint = null;
    this._routeStartUpdatedAt = 0;
    this._routeDeviceLocationLoading = false;
    this._routeDeviceLocationError = "";
    this._routeWaypoints = [];
    this._routeDestination = null;
    this._routePickMode = "";
    this._routeMessage = "";
    this._mapRouteClickHandler = null;
    // Route templates and named destinations are integration-wide from 0.1.44.
    // Only the currently edited route remains local to the browser/device.
    this._routeGlobalTemplates = {};
    this._routeDestinations = {};
    this._routeDataLoaded = false;
    this._routeDataLoading = false;
    this._routeActiveTemplate = "";
    this._routeSelectedDestinationKey = "";
    this._routeGeocodeQuery = "";
    this._routeGeocodeResults = [];
    this._routeGeocodeLoading = false;
    this._routeGeocodeError = "";
    this._lastFollowPositionKey = "";

    // Per-vehicle motion is derived exclusively in the map frontend from two
    // consecutive, synchronized latitude/longitude samples. It is informational
    // only and never feeds Analytics, consumption or remaining-range calculations.
    this._gpsMotion = new Map();

    this._poiCacheTtlMs = 15 * 60 * 1000;
    this._poiMaxResults = 500;
    this._poiRequestTimeoutMs = 35000;
    this._poiLastEndpoint = "";
    this._poiLastSources = [];
    this._poiLastWarnings = [];
    this.attachShadow({ mode: "open" });
  }

  static getStubConfig() {
    return { title: cardataT({ language: navigator?.language }, "Cardata Fahrzeugkarte") };
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6 };
  }

  getCardSize() {
    return 8;
  }

  setConfig(config) {
    this._config = config || {};
    if (config?.storage_key) this._storageKey = String(config.storage_key);
    if (Number.isFinite(Number(config?.poi_cache_minutes))) {
      this._poiCacheTtlMs = Math.max(5, Math.min(120, Number(config.poi_cache_minutes))) * 60 * 1000;
    }
    if (Number.isFinite(Number(config?.poi_max_results))) {
      this._poiMaxResults = Math.max(50, Math.min(1000, Math.round(Number(config.poi_max_results))));
    }
    if (Number.isFinite(Number(config?.poi_request_timeout_seconds))) {
      this._poiRequestTimeoutMs = Math.max(15, Math.min(90, Number(config.poi_request_timeout_seconds))) * 1000;
    }
    this._restorePreferences();
  }

  _t(source, vars = {}) {
    return cardataT(this._hass, source, vars);
  }

  _locale() {
    return cardataLocale(this._hass);
  }

  connectedCallback() {
    this._restorePreferences();
    document.addEventListener?.("visibilitychange", this._trackingVisibilityHandler);
    this._ensureRegistrySubscriptions();
    this._startTrackingRefresh();
    queueMicrotask(() => this._restorePseudoFullscreen());
  }

  disconnectedCallback() {
    this._stopRegistrySubscriptions();
    document.removeEventListener?.("visibilitychange", this._trackingVisibilityHandler);
    if (this._trackingRefreshTimer) clearInterval(this._trackingRefreshTimer);
    this._trackingRefreshTimer = null;
    this._trackingQueryVersion += 1;
    this._trackingDetailsVersion += 1;
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._eventController) {
      this._eventController.abort();
      this._eventController = null;
    }
    if (this._poiFetchTimer) {
      clearTimeout(this._poiFetchTimer);
      this._poiFetchTimer = null;
    }
    this._stopTrackingPlayback();
    this._destroyVectorBasemap();
    this._resetPoiRequestState(true);
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureRegistrySubscriptions();
    this._loadDatabasePreferences();
    if (this._pendingDatabasePreferences && !this._preferencesSaving) this._queueDatabasePreferences();
    this._loadGlobalPoiTemplates();
    this._loadGlobalRouteData();
    if (!this._registryLoaded && !this._loadingRegistry) {
      this._loadRegistry();
      return;
    }
    if (!this._registryLoaded) return;

    const structure = this._structureSignature();
    if (!this._domBuilt || structure !== this._lastStructureSignature) {
      this._renderFull();
      return;
    }

    const state = this._stateSignature();
    this._updateGpsMotionFromHass();
    if (state === this._lastStateSignature) return;
    this._updateFromHass();
    this._lastStateSignature = state;
  }

  async _ensureRegistrySubscriptions() {
    if (!this.isConnected || !this._hass?.connection || this._subscriptionsStarted) return;
    this._subscriptionsStarted = true;
    try {
      this._unsubEntityRegistry = await this._hass.connection.subscribeEvents(
        () => this._scheduleRegistryReload(),
        "entity_registry_updated"
      );
      this._unsubDeviceRegistry = await this._hass.connection.subscribeEvents(
        () => this._scheduleRegistryReload(),
        "device_registry_updated"
      );
    } catch (err) {
      this._subscriptionsStarted = false;
      console.warn("Cardata Analytics Map: registry subscription unavailable", err);
    }
  }

  _stopRegistrySubscriptions() {
    for (const unsub of [this._unsubEntityRegistry, this._unsubDeviceRegistry]) {
      try { if (typeof unsub === "function") unsub(); } catch (_) { /* no-op */ }
    }
    this._unsubEntityRegistry = null;
    this._unsubDeviceRegistry = null;
    this._subscriptionsStarted = false;
    if (this._registryReloadTimer) clearTimeout(this._registryReloadTimer);
    this._registryReloadTimer = null;
  }

  _scheduleRegistryReload() {
    if (this._registryReloadTimer) clearTimeout(this._registryReloadTimer);
    this._registryReloadTimer = setTimeout(() => {
      this._registryReloadTimer = null;
      this._loadRegistry();
    }, 150);
  }

  async _loadRegistry() {
    if (!this._hass || this._loadingRegistry) return;
    this._loadingRegistry = true;
    try {
      const [entities, devices] = await Promise.all([
        this._hass.callWS({ type: "config/entity_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
      ]);
      this._entities = (entities || []).filter((e) => e.platform === DOMAIN && !e.disabled_by);
      this._devices = devices || [];
      this._registryLoaded = true;
      this._lastStructureSignature = null;
      this._lastStateSignature = null;
    } catch (err) {
      console.error("Cardata Analytics Map: registry could not be loaded", err);
    } finally {
      this._loadingRegistry = false;
      this._renderFull();
    }
  }

  _deviceName(deviceId) {
    const dev = this._devices.find((d) => d.id === deviceId);
    return dev?.name_by_user || dev?.name || this._t("Fahrzeug");
  }

  _keyFromUniqueId(uid) {
    const suffixMap = [
      ["current_address", "current_address"],
      ["latitude", "latitude"],
      ["longitude", "longitude"],
      ["mileage", "mileage"],
      ["range", "range"],
      ["soc", "soc"],
      ["soh", "soh"],
    ];
    for (const [suffix, key] of suffixMap) {
      if (uid.endsWith(`_${suffix}`)) return key;
    }
    return null;
  }

  _vehicleGroups() {
    const groups = new Map();
    for (const ent of this._entities) {
      if (!ent.device_id || (ent.unique_id || "").startsWith("global_")) continue;
      if (!groups.has(ent.device_id)) {
        groups.set(ent.device_id, {
          deviceId: ent.device_id,
          entryId: ent.config_entry_id || (Array.isArray(ent.config_entry_ids) ? ent.config_entry_ids[0] : "") || "",
          name: this._deviceName(ent.device_id),
          entities: {},
        });
      }
      const key = this._keyFromUniqueId(ent.unique_id || "");
      if (key) groups.get(ent.device_id).entities[key] = ent.entity_id;
    }
    return [...groups.values()]
      .filter((v) => v.entities.latitude && v.entities.longitude)
      .sort((a, b) => a.name.localeCompare(b.name, this._locale()));
  }

  _structureSignature() {
    return JSON.stringify({
      locale: this._locale(),
      language: cardataLanguage(this._hass),
      vehicles: this._vehicleGroups().map((v) => [
        v.deviceId,
        v.name,
        Object.entries(v.entities).sort(([a], [b]) => a.localeCompare(b)),
      ]),
    });
  }

  _stateSignature() {
    if (!this._hass) return null;
    const parts = [`locale=${this._locale()}|language=${cardataLanguage(this._hass)}`];
    for (const v of this._vehicleGroups()) {
      for (const key of ["latitude", "longitude", "soc", "range", "mileage", "current_address"]) {
        const id = v.entities[key];
        if (!id) continue;
        const stateObj = this._hass.states[id];
        parts.push(`${id}=${stateObj?.state ?? "<missing>"}`);
        if ((key === "latitude" || key === "longitude") && stateObj) {
          parts.push(`${id}:updated=${stateObj.last_updated || stateObj.last_changed || ""}`);
        }
        if (key === "current_address" && stateObj) {
          parts.push(`${id}:url=${stateObj.attributes?.google_maps_url || ""}`);
          parts.push(`${id}:geo=${stateObj.attributes?.last_geocoded || ""}`);
        }
      }
    }
    return parts.join(";");
  }

  _number(entityId) {
    if (!entityId || !this._hass) return null;
    const obj = this._hass.states[entityId];
    if (!obj || ["unknown", "unavailable", "none", ""].includes(obj.state)) return null;
    const n = Number(obj.state);
    return Number.isFinite(n) ? n : null;
  }

  _text(entityId) {
    if (!entityId || !this._hass) return null;
    const obj = this._hass.states[entityId];
    if (!obj || ["unknown", "unavailable", "none", ""].includes(obj.state)) return null;
    return String(obj.state);
  }

  _vehicleData(v) {
    const e = v.entities;
    const lat = this._number(e.latitude);
    const lon = this._number(e.longitude);
    const addressObj = e.current_address ? this._hass?.states?.[e.current_address] : null;
    const address = this._text(e.current_address);
    const googleMapsUrl = addressObj?.attributes?.google_maps_url
      || (lat != null && lon != null
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`
        : null);
    const lastChanged = [
      this._hass?.states?.[e.latitude]?.last_updated || this._hass?.states?.[e.latitude]?.last_changed,
      this._hass?.states?.[e.longitude]?.last_updated || this._hass?.states?.[e.longitude]?.last_changed,
    ].filter(Boolean).sort().at(-1) || null;
    return {
      ...v,
      lat,
      lon,
      valid: lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180,
      soc: this._number(e.soc),
      range: this._number(e.range),
      mileage: this._number(e.mileage),
      address,
      googleMapsUrl,
      lastChanged,
    };
  }

  _vehicles() {
    return this._vehicleGroups().map((v) => this._vehicleData(v));
  }

  _visibleVehicles() {
    return this._vehicles().filter((v) => v.valid && !this._hiddenVehicles.has(v.deviceId));
  }

  _vehicleColor(deviceId) {
    const target = String(deviceId || "vehicle");
    const ids = [...new Set(this._vehicleGroups().map((v) => String(v.deviceId || "vehicle")))].sort();
    if (!ids.includes(target)) ids.push(target);
    const assigned = new Map();
    const used = new Set();
    const hashIndex = (value) => {
      let hash = 2166136261;
      for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0) % VEHICLE_COLOR_PALETTE.length;
    };
    for (const id of ids) {
      const base = hashIndex(id);
      let index = base;
      if (ids.length <= VEHICLE_COLOR_PALETTE.length) {
        for (let step = 0; step < VEHICLE_COLOR_PALETTE.length; step += 1) {
          const candidate = (base + step) % VEHICLE_COLOR_PALETTE.length;
          if (!used.has(candidate)) { index = candidate; break; }
        }
      }
      assigned.set(id, VEHICLE_COLOR_PALETTE[index]);
      used.add(index);
    }
    return assigned.get(target) || VEHICLE_COLOR_PALETTE[0];
  }

  _rangeCapableVehicles({ visibleOnly = false } = {}) {
    const source = visibleOnly ? this._visibleVehicles() : this._vehicles().filter((v) => v.valid);
    return source.filter((v) => Number.isFinite(Number(v.range)) && Number(v.range) > 0);
  }

  _destinationPoint(lat, lon, distanceKm, bearingDeg) {
    const radiusKm = 6371.0088;
    const angular = Math.max(0, Number(distanceKm) || 0) / radiusKm;
    const bearing = Number(bearingDeg) * Math.PI / 180;
    const phi1 = Number(lat) * Math.PI / 180;
    const lambda1 = Number(lon) * Math.PI / 180;
    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const sinAngular = Math.sin(angular);
    const cosAngular = Math.cos(angular);
    const phi2 = Math.asin(sinPhi1 * cosAngular + cosPhi1 * sinAngular * Math.cos(bearing));
    const lambda2 = lambda1 + Math.atan2(
      Math.sin(bearing) * sinAngular * cosPhi1,
      cosAngular - sinPhi1 * Math.sin(phi2),
    );
    const outLon = ((lambda2 * 180 / Math.PI + 540) % 360) - 180;
    return [outLon, phi2 * 180 / Math.PI];
  }

  _rangeRingCoordinates(vehicle, steps = 96) {
    const rangeKm = Number(vehicle?.range);
    if (!vehicle?.valid || !Number.isFinite(rangeKm) || rangeKm <= 0) return [];
    const coords = [];
    for (let i = 0; i <= steps; i += 1) {
      coords.push(this._destinationPoint(vehicle.lat, vehicle.lon, rangeKm, (360 * i) / steps));
    }
    return coords;
  }

  _rangeGeoJson() {
    const features = [];
    for (const vehicle of this._visibleVehicles()) {
      if (!this._rangeVehicles.has(vehicle.deviceId)) continue;
      const coordinates = this._rangeRingCoordinates(vehicle);
      if (coordinates.length < 4) continue;
      const color = this._vehicleColor(vehicle.deviceId);
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coordinates] },
        properties: {
          deviceId: vehicle.deviceId,
          name: vehicle.name,
          rangeKm: Number(vehicle.range),
          color,
        },
      });
    }
    return { type: "FeatureCollection", features };
  }

  _rangeLabelGeoJson() {
    const features = [];
    for (const vehicle of this._visibleVehicles()) {
      if (!this._rangeVehicles.has(vehicle.deviceId)) continue;
      const rangeKm = Number(vehicle.range);
      if (!Number.isFinite(rangeKm) || rangeKm <= 0) continue;
      const point = this._destinationPoint(vehicle.lat, vehicle.lon, rangeKm, 0);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: point },
        properties: {
          deviceId: vehicle.deviceId,
          label: (() => {
            const motion = this._gpsMotionInfo(vehicle.deviceId);
            return motion.speedKmh == null
              ? `${Math.round(rangeKm)} km`
              : `${Math.round(rangeKm)} km\n${this._t("GPS Ø")} ${Math.round(motion.speedKmh)} km/h`;
          })(),
          color: this._vehicleColor(vehicle.deviceId),
        },
      });
    }
    return { type: "FeatureCollection", features };
  }

  _esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[c]));
  }

  _formatNumber(value, decimals = 1) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return Number(value).toLocaleString(this._locale(), { maximumFractionDigits: decimals });
  }

  _formatAge(iso) {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 60) return this._t("gerade eben");
    const min = Math.round(sec / 60);
    if (min < 60) return this._t("vor {n} Min.", { n: min });
    const hrs = Math.round(min / 60);
    if (hrs < 24) return this._t("vor {n} Std.", { n: hrs });
    const days = Math.round(hrs / 24);
    return this._t(days === 1 ? "vor {n} Tag" : "vor {n} Tagen", { n: days });
  }

  _poiDefinitions() {
    return {
      charging: { label: this._t("Ladestationen"), icon: "mdi:ev-station", group: "auto", clauses: ['["amenity"="charging_station"]'] },
      fuel: { label: this._t("Tankstellen"), icon: "mdi:gas-station", group: "auto", clauses: ['["amenity"="fuel"]'] },
      workshop: { label: this._t("Werkstätten"), icon: "mdi:wrench", group: "auto", clauses: ['["shop"="car_repair"]', '["craft"="car_repair"]'] },
      car_wash: { label: this._t("Autowäsche"), icon: "mdi:car-wash", group: "auto", clauses: ['["amenity"="car_wash"]'] },
      tyres: { label: this._t("Reifenservice"), icon: "mdi:tire", group: "auto", clauses: ['["shop"="tyres"]'] },
      car_parts: { label: this._t("Autoteile"), icon: "mdi:car-cog", group: "auto", clauses: ['["shop"="car_parts"]'] },
      car_rental: { label: this._t("Mietwagen"), icon: "mdi:car-key", group: "auto", clauses: ['["amenity"="car_rental"]'] },
      parking: { label: this._t("Parkplätze"), icon: "mdi:parking", group: "auto", clauses: ['["amenity"="parking"]'] },
      parking_garage: { label: this._t("Parkhäuser"), icon: "mdi:garage", group: "auto", clauses: ['["amenity"="parking"]["parking"~"^(multi-storey|underground)$"]'] },
      park_ride: { label: this._t("P+R"), icon: "mdi:car-multiple", group: "auto", clauses: ['["amenity"="parking"]["park_ride"~"^(yes|designated)$"]'] },

      restaurant: { label: this._t("Restaurants & Fast Food"), icon: "mdi:silverware-fork-knife", group: "food", clauses: ['["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="food_court"]'] },
      cafe: { label: this._t("Cafés"), icon: "mdi:coffee", group: "food", clauses: ['["amenity"="cafe"]'] },
      bakery: { label: this._t("Bäckereien"), icon: "mdi:baguette", group: "food", clauses: ['["shop"="bakery"]'] },
      ice_cream: { label: this._t("Eisdielen"), icon: "mdi:ice-cream", group: "food", clauses: ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'] },
      bar_pub: { label: this._t("Bars & Pubs"), icon: "mdi:glass-mug-variant", group: "food", clauses: ['["amenity"="bar"]', '["amenity"="pub"]'] },
      biergarten: { label: this._t("Biergärten"), icon: "mdi:beer", group: "food", clauses: ['["amenity"="biergarten"]'] },

      supermarket: { label: this._t("Supermärkte"), icon: "mdi:cart-outline", group: "shopping", clauses: ['["shop"="supermarket"]'] },
      convenience: { label: this._t("Minimärkte"), icon: "mdi:store", group: "shopping", clauses: ['["shop"="convenience"]'] },
      mall: { label: this._t("Einkaufszentren"), icon: "mdi:shopping", group: "shopping", clauses: ['["shop"="mall"]'] },
      chemist: { label: this._t("Drogerien"), icon: "mdi:bottle-tonic-plus-outline", group: "shopping", clauses: ['["shop"="chemist"]'] },
      beverages: { label: this._t("Getränkemärkte"), icon: "mdi:bottle-soda", group: "shopping", clauses: ['["shop"="beverages"]'] },

      pharmacy: { label: this._t("Apotheken"), icon: "mdi:pharmacy", group: "health", clauses: ['["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'] },
      hospital: { label: this._t("Krankenhäuser"), icon: "mdi:hospital-building", group: "health", clauses: ['["amenity"="hospital"]', '["healthcare"="hospital"]'] },
      doctors: { label: this._t("Ärzte"), icon: "mdi:doctor", group: "health", clauses: ['["amenity"="doctors"]', '["healthcare"="doctor"]'] },
      dentist: { label: this._t("Zahnärzte"), icon: "mdi:tooth-outline", group: "health", clauses: ['["amenity"="dentist"]', '["healthcare"="dentist"]'] },
      clinic: { label: this._t("Kliniken"), icon: "mdi:medical-bag", group: "health", clauses: ['["amenity"="clinic"]', '["healthcare"="clinic"]'] },
      veterinarian: { label: this._t("Tierärzte"), icon: "mdi:paw", group: "health", clauses: ['["amenity"="veterinary"]'] },

      hotel: { label: this._t("Hotels"), icon: "mdi:bed", group: "travel", clauses: ['["tourism"="hotel"]'] },
      motel: { label: this._t("Motels"), icon: "mdi:bed-king-outline", group: "travel", clauses: ['["tourism"="motel"]'] },
      hostel: { label: this._t("Hostels"), icon: "mdi:bunk-bed-outline", group: "travel", clauses: ['["tourism"="hostel"]'] },
      camping: { label: this._t("Campingplätze"), icon: "mdi:tent", group: "travel", clauses: ['["tourism"="camp_site"]'] },
      caravan_site: { label: this._t("Wohnmobilstellplätze"), icon: "mdi:rv-truck", group: "travel", clauses: ['["tourism"="caravan_site"]'] },

      toilets: { label: this._t("Toiletten"), icon: "mdi:human-male-female", group: "road", clauses: ['["amenity"="toilets"]'] },
      drinking_water: { label: this._t("Trinkwasser"), icon: "mdi:water", group: "road", clauses: ['["amenity"="drinking_water"]'] },
      rest_area: { label: this._t("Rast- & Serviceplätze"), icon: "mdi:highway", group: "road", clauses: ['["highway"="rest_area"]', '["highway"="services"]'] },
      picnic_site: { label: this._t("Picknickplätze"), icon: "mdi:table-picnic", group: "road", clauses: ['["tourism"="picnic_site"]'] },
      shower: { label: this._t("Duschen"), icon: "mdi:shower", group: "road", clauses: ['["amenity"="shower"]'] },

      atm: { label: this._t("Geldautomaten"), icon: "mdi:cash", group: "service", clauses: ['["amenity"="atm"]'] },
      bank: { label: this._t("Banken"), icon: "mdi:bank", group: "service", clauses: ['["amenity"="bank"]'] },
      post_office: { label: this._t("Postfilialen"), icon: "mdi:email-outline", group: "service", clauses: ['["amenity"="post_office"]'] },
      parcel_locker: { label: this._t("Paketstationen"), icon: "mdi:package-variant-closed", group: "service", clauses: ['["amenity"="parcel_locker"]'] },

      railway_station: { label: this._t("Bahnhöfe"), icon: "mdi:train", group: "transit", clauses: ['["railway"="station"]'] },
      bus_station: { label: this._t("Busbahnhöfe"), icon: "mdi:bus", group: "transit", clauses: ['["amenity"="bus_station"]'] },
      airport: { label: this._t("Flughäfen"), icon: "mdi:airplane", group: "transit", clauses: ['["aeroway"="aerodrome"]'] },
      ferry_terminal: { label: this._t("Fährterminals"), icon: "mdi:ferry", group: "transit", clauses: ['["amenity"="ferry_terminal"]'] },
      taxi: { label: this._t("Taxistände"), icon: "mdi:taxi", group: "transit", clauses: ['["amenity"="taxi"]'] },

      museum: { label: this._t("Museen"), icon: "mdi:bank-outline", group: "leisure", clauses: ['["tourism"="museum"]'] },
      attraction: { label: this._t("Sehenswürdigkeiten"), icon: "mdi:camera-marker-outline", group: "leisure", clauses: ['["tourism"="attraction"]'] },
      viewpoint: { label: this._t("Aussichtspunkte"), icon: "mdi:binoculars", group: "leisure", clauses: ['["tourism"="viewpoint"]'] },
      castle: { label: this._t("Burgen & Schlösser"), icon: "mdi:castle", group: "leisure", clauses: ['["historic"="castle"]'] },
      monument: { label: this._t("Denkmäler"), icon: "mdi:obelisk", group: "leisure", clauses: ['["historic"="monument"]', '["historic"="memorial"]'] },
      zoo: { label: this._t("Zoos"), icon: "mdi:elephant", group: "leisure", clauses: ['["tourism"="zoo"]'] },
      theme_park: { label: this._t("Freizeitparks"), icon: "mdi:ferris-wheel", group: "leisure", clauses: ['["tourism"="theme_park"]'] },
      swimming_pool: { label: this._t("Schwimmbäder"), icon: "mdi:pool", group: "leisure", clauses: ['["leisure"="swimming_pool"]'] },

      police: { label: this._t("Polizei"), icon: "mdi:police-badge-outline", group: "emergency", clauses: ['["amenity"="police"]'] },
      fire_station: { label: this._t("Feuerwehr"), icon: "mdi:fire-truck", group: "emergency", clauses: ['["amenity"="fire_station"]'] },
      ambulance_station: { label: this._t("Rettungswachen"), icon: "mdi:ambulance", group: "emergency", clauses: ['["emergency"="ambulance_station"]'] },
    };
  }

  _poiCategoryGroups() {
    return [
      { key: "auto", label: this._t("Auto & Mobilität") },
      { key: "food", label: this._t("Essen & Trinken") },
      { key: "shopping", label: this._t("Einkaufen") },
      { key: "health", label: this._t("Gesundheit") },
      { key: "travel", label: this._t("Reise & Aufenthalt") },
      { key: "road", label: this._t("Unterwegs") },
      { key: "service", label: this._t("Finanzen & Service") },
      { key: "transit", label: this._t("ÖPNV & Verkehr") },
      { key: "leisure", label: this._t("Freizeit & Sehenswürdigkeiten") },
      { key: "emergency", label: this._t("Notfall") },
    ];
  }

  _poiCategoryForTags(tags = {}) {
    if (tags.amenity === "charging_station") return "charging";
    if (tags.amenity === "fuel") return "fuel";
    if (tags.shop === "car_repair" || tags.craft === "car_repair") return "workshop";
    if (tags.amenity === "car_wash") return "car_wash";
    if (tags.shop === "tyres") return "tyres";
    if (tags.shop === "car_parts") return "car_parts";
    if (tags.amenity === "car_rental") return "car_rental";
    if (tags.amenity === "parking" && ["yes", "designated"].includes(tags.park_ride)) return "park_ride";
    if (tags.amenity === "parking" && ["multi-storey", "underground"].includes(tags.parking)) return "parking_garage";
    if (tags.amenity === "parking") return "parking";

    if (["restaurant", "fast_food", "food_court"].includes(tags.amenity)) return "restaurant";
    if (tags.amenity === "cafe") return "cafe";
    if (tags.shop === "bakery") return "bakery";
    if (tags.amenity === "ice_cream" || tags.shop === "ice_cream") return "ice_cream";
    if (["bar", "pub"].includes(tags.amenity)) return "bar_pub";
    if (tags.amenity === "biergarten") return "biergarten";

    if (tags.shop === "supermarket") return "supermarket";
    if (tags.shop === "convenience") return "convenience";
    if (tags.shop === "mall") return "mall";
    if (tags.shop === "chemist") return "chemist";
    if (tags.shop === "beverages") return "beverages";

    if (tags.amenity === "pharmacy" || tags.healthcare === "pharmacy") return "pharmacy";
    if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "hospital";
    if (tags.amenity === "doctors" || tags.healthcare === "doctor") return "doctors";
    if (tags.amenity === "dentist" || tags.healthcare === "dentist") return "dentist";
    if (tags.amenity === "clinic" || tags.healthcare === "clinic") return "clinic";
    if (tags.amenity === "veterinary") return "veterinarian";

    if (tags.tourism === "hotel") return "hotel";
    if (tags.tourism === "motel") return "motel";
    if (tags.tourism === "hostel") return "hostel";
    if (tags.tourism === "camp_site") return "camping";
    if (tags.tourism === "caravan_site") return "caravan_site";

    if (tags.amenity === "toilets") return "toilets";
    if (tags.amenity === "drinking_water") return "drinking_water";
    if (["rest_area", "services"].includes(tags.highway)) return "rest_area";
    if (tags.tourism === "picnic_site") return "picnic_site";
    if (tags.amenity === "shower") return "shower";

    if (tags.amenity === "atm") return "atm";
    if (tags.amenity === "bank") return "bank";
    if (tags.amenity === "post_office") return "post_office";
    if (tags.amenity === "parcel_locker") return "parcel_locker";

    if (tags.railway === "station") return "railway_station";
    if (tags.amenity === "bus_station") return "bus_station";
    if (tags.aeroway === "aerodrome") return "airport";
    if (tags.amenity === "ferry_terminal") return "ferry_terminal";
    if (tags.amenity === "taxi") return "taxi";

    if (tags.tourism === "museum") return "museum";
    if (tags.tourism === "attraction") return "attraction";
    if (tags.tourism === "viewpoint") return "viewpoint";
    if (tags.historic === "castle") return "castle";
    if (["monument", "memorial"].includes(tags.historic)) return "monument";
    if (tags.tourism === "zoo") return "zoo";
    if (tags.tourism === "theme_park") return "theme_park";
    if (tags.leisure === "swimming_pool") return "swimming_pool";

    if (tags.amenity === "police") return "police";
    if (tags.amenity === "fire_station") return "fire_station";
    if (tags.emergency === "ambulance_station") return "ambulance_station";
    return null;
  }

  _poiCoordinates(element) {
    const lat = Number(element?.lat ?? element?.center?.lat);
    const lon = Number(element?.lon ?? element?.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  _poiName(tags = {}, category = "") {
    const defs = this._poiDefinitions();
    return String(tags.name || tags.brand || tags.operator || defs[category]?.label || "Point of Interest");
  }

  _poiAddress(tags = {}) {
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ").trim();
    const city = [tags["addr:postcode"], tags["addr:city"] || tags["addr:place"]].filter(Boolean).join(" ").trim();
    const parts = [street, city].filter(Boolean);
    return parts.join(", ") || String(tags["addr:full"] || "").trim() || null;
  }

  _poiSourceLabel(element = {}) {
    const rawSources = String(element.sources || element.provider || "osm")
      .split(",").map((item) => item.trim()).filter(Boolean);
    const labels = rawSources.map((source) => {
      if (source === "ocm") {
        const provider = String(element?.tags?.["cardata:data_provider"] || "").trim();
        return provider && provider.toLowerCase() !== "open charge map"
          ? `Open Charge Map · ${provider}`
          : "Open Charge Map";
      }
      if (source === "bnetza") return "Bundesnetzagentur";
      if (source === "afir") return "AFIR · Mobilithek";
      if (source === "osm") return "OpenStreetMap";
      if (source === "merged") return this._t("Mehrere Quellen");
      return source;
    });
    return [...new Set(labels)].join(" + ") || "OpenStreetMap";
  }

  _safeWebUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const raw = value.trim();
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  _poiConnectorDetails(tags = {}) {
    const labels = {
      "socket:type2": "Type 2",
      "socket:type2_combo": "CCS Type 2",
      "socket:ccs": "CCS",
      "socket:chademo": "CHAdeMO",
      "socket:tesla_supercharger": "Tesla Supercharger",
      "socket:tesla_destination": "Tesla Destination",
      "socket:type1": "Type 1",
      "socket:type1_combo": "CCS Type 1",
    };
    const details = [];
    for (const [key, value] of Object.entries(tags)) {
      if (!key.startsWith("socket:") || key.endsWith(":output") || key.endsWith(":voltage") || key.endsWith(":current")) continue;
      const normalized = String(value || "").trim();
      if (!normalized || ["no", "0"].includes(normalized.toLowerCase())) continue;
      const label = labels[key] || key.slice(7).replaceAll("_", " ");
      const output = tags[`${key}:output`];
      details.push(`${label}: ${normalized}${output ? ` · ${output}` : ""}`);
    }
    return details.slice(0, 8);
  }

  _poiConnectorKeys(tags = {}) {
    const keys = new Set();
    const truthy = (value) => {
      const v = String(value ?? "").trim().toLowerCase();
      return Boolean(v) && !["no", "0", "false", "none"].includes(v);
    };
    if (truthy(tags["socket:ccs"]) || truthy(tags["socket:type2_combo"]) || tags["socket:ccs:output"] || tags["socket:type2_combo:output"]) keys.add("ccs");
    if (truthy(tags["socket:type2"]) || tags["socket:type2:output"]) keys.add("type2");
    if (truthy(tags["socket:chademo"]) || tags["socket:chademo:output"]) keys.add("chademo");
    if (truthy(tags["socket:tesla_supercharger"]) || truthy(tags["socket:tesla_destination"]) || tags["socket:tesla_supercharger:output"] || tags["socket:tesla_destination:output"]) keys.add("tesla");
    return [...keys];
  }

  _parsePowerKw(value) {
    if (value == null) return null;
    const text = String(value).replace(/,/g, ".");
    const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(MW|kW|W)?/gi)];
    let best = null;
    for (const match of matches) {
      let number = Number(match[1]);
      if (!Number.isFinite(number)) continue;
      const unit = String(match[2] || "kW").toLowerCase();
      if (unit === "mw") number *= 1000;
      else if (unit === "w") number /= 1000;
      if (number > 0 && (best == null || number > best)) best = number;
    }
    return best;
  }

  _poiChargingPowerKw(tags = {}) {
    const values = [];
    for (const [key, value] of Object.entries(tags)) {
      if (key.endsWith(":output") || ["charging_station:output", "max_power", "output"].includes(key)) {
        const parsed = this._parsePowerKw(value);
        if (parsed != null) values.push(parsed);
      }
    }
    return values.length ? Math.max(...values) : null;
  }

  _normalizePoiSearchText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase(this._locale())
      .replace(/&/g, " und ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  _poiOperatorsFromTemplate(template = {}) {
    const raw = Array.isArray(template.operators) ? template.operators : [];
    const legacy = String(template.operator || "").trim();
    const values = [...raw, ...(legacy ? [legacy] : [])];
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const clean = String(value || "").trim().slice(0, 80);
      const normalized = this._normalizePoiSearchText(clean);
      if (!clean || !normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(clean);
      if (result.length >= 12) break;
    }
    return result;
  }

  _addPoiOperator(value) {
    const clean = String(value || "").trim().slice(0, 80);
    const normalized = this._normalizePoiSearchText(clean);
    if (!clean || !normalized) return false;
    if (this._poiOperators.some((item) => this._normalizePoiSearchText(item) === normalized)) return false;
    if (this._poiOperators.length >= 12) return false;
    this._poiOperators = [...this._poiOperators, clean];
    this._poiOperatorText = "";
    return true;
  }

  _removePoiOperator(value) {
    const normalized = this._normalizePoiSearchText(value);
    const before = this._poiOperators.length;
    this._poiOperators = this._poiOperators.filter((item) => this._normalizePoiSearchText(item) !== normalized);
    return this._poiOperators.length !== before;
  }

  _poiOperatorIdentity(poi = {}) {
    return String(poi.operator || poi.network || poi.brand || "Ladestation").trim();
  }

  _poiOperatorCode(value) {
    const clean = String(value || "").trim();
    const normalized = this._normalizePoiSearchText(clean);
    if (!normalized || normalized === "ladestation" || normalized === "unbekannt") return "EV";
    if (normalized.includes("ionity")) return "IO";
    if (normalized.includes("enbw")) return "EN";
    if (normalized.includes("tesla")) return "TS";
    if (normalized.includes("fastned")) return "FA";
    if (normalized.includes("allego")) return "AL";
    if (normalized.includes("aral")) return "AR";
    const words = clean.toUpperCase().match(/[A-Z0-9ÄÖÜ]+/g) || [];
    if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.slice(0, 2);
    const compact = (words[0] || "EV").replace(/[^A-Z0-9]/g, "");
    return (compact.slice(0, 2) || "EV").padEnd(2, "V");
  }

  _poiOperatorColor(value) {
    const raw = this._normalizePoiSearchText(value) || "ladestation";
    // Canonicalize the common networks so variants such as "EnBW mobility+"
    // and "EnBW" keep the same color on every device. Unknown networks use
    // their normalized full identity as a deterministic cross-device seed.
    const aliases = [
      ["ionity", "ionity"], ["enbw", "enbw"], ["tesla", "tesla"],
      ["fastned", "fastned"], ["allego", "allego"], ["aral", "aral"],
      ["shell recharge", "shell recharge"], ["e on", "e on"], ["bp pulse", "bp pulse"],
    ];
    const normalized = aliases.find(([needle]) => raw.includes(needle))?.[1] || raw;
    let hash = 2166136261;
    for (let i = 0; i < normalized.length; i += 1) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    const hue = hash % 360;
    const saturation = 62 + ((hash >>> 9) % 13);
    const lightness = 39 + ((hash >>> 17) % 9);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  _poiSearchCenter() {
    if (this._poiCenterMode === "route") {
      const destination = this._normalizeRoutePoint(this._routeDestination);
      if (!destination) return null;
      return {
        mode: "route",
        key: `route:${destination.lat.toFixed(5)},${destination.lon.toFixed(5)}`,
        label: this._t("Routenziel · {name}", { name: destination.label || destination.address || this._t("Ziel") }),
        lat: destination.lat,
        lon: destination.lon,
        deviceId: null,
      };
    }
    if (this._poiCenterMode === "map") {
      let lat = Number(this._center?.lat);
      let lon = Number(this._center?.lon);
      try {
        const current = this._vectorMap?.getCenter?.();
        if (current && Number.isFinite(Number(current.lat)) && Number.isFinite(Number(current.lng))) {
          lat = Number(current.lat);
          lon = Number(current.lng);
        }
      } catch (_) { /* use stored center */ }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        mode: "map",
        key: `map:${lat.toFixed(5)},${lon.toFixed(5)}`,
        label: this._t("Kartenmitte"),
        lat, lon, deviceId: null,
      };
    }
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    if (!vehicle) return null;
    return {
      mode: "vehicle",
      key: `vehicle:${vehicle.deviceId}:${vehicle.lat.toFixed(5)},${vehicle.lon.toFixed(5)}`,
      label: this._t("Fahrzeug · {name}", { name: vehicle.name }),
      lat: vehicle.lat,
      lon: vehicle.lon,
      deviceId: vehicle.deviceId,
    };
  }

  _poiGeneralRadiusLimited() {
    return this._poiRadiusKm > 200 && [...this._poiCategories].some((category) => category !== "charging");
  }

  _poiDisplayName(poi) {
    const raw = String(poi?.name || "POI");
    return raw === "Ladestation" ? this._t("Ladestation") : raw;
  }

  _poiFilterHaystack(poi) {
    return this._normalizePoiSearchText([
      poi.name, poi.address, poi.operator, poi.brand, poi.network,
      poi.tags?.cuisine, poi.tags?.description, poi.tags?.["addr:city"],
    ].filter(Boolean).join(" "));
  }

  _poiTextMatches(poi, searchValue) {
    const needle = this._normalizePoiSearchText(searchValue);
    if (!needle) return true;
    const haystack = this._poiFilterHaystack(poi);
    if (haystack.includes(needle)) return true;
    // Ignore punctuation/spacing differences such as McDonald's / McDonalds / Mc Donalds.
    const compactNeedle = needle.replace(/\s+/g, "");
    const compactHaystack = haystack.replace(/\s+/g, "");
    return compactNeedle.length >= 3 && compactHaystack.includes(compactNeedle);
  }

  _clearChargingSpecificFilters(clearSearch = true) {
    if (clearSearch) this._poiSearchText = "";
    this._poiOperatorText = "";
    this._poiOperators = [];
    this._poiConnector = "any";
    this._poiMinPowerKw = 0;
    this._poiIncludeUnknownPower = true;
  }

  _applyPoiClientFilters() {
    const search = this._poiSearchText.trim();
    const operators = this._poiOperators.map((item) => this._normalizePoiSearchText(item)).filter(Boolean);
    const connector = this._poiConnector;
    const minPower = Number(this._poiMinPowerKw) || 0;
    const includeUnknown = Boolean(this._poiIncludeUnknownPower);
    const matched = (this._poiRawResults || []).filter((poi) => {
      if (!this._poiCategories.has(poi.category)) return false;
      if (search && !this._poiTextMatches(poi, search)) return false;
      if (operators.length && poi.category === "charging") {
        const operatorHaystack = this._normalizePoiSearchText(
          [poi.operator, poi.brand, poi.network, poi.name].filter(Boolean).join(" ")
        );
        if (!operators.some((operator) => operatorHaystack.includes(operator))) return false;
      }
      if (poi.category === "charging") {
        if (connector !== "any" && !(poi.connectorKeys || []).includes(connector)) return false;
        if (minPower > 0) {
          if (poi.maxPowerKw != null && Number.isFinite(Number(poi.maxPowerKw))) {
            if (Number(poi.maxPowerKw) < minPower) return false;
          } else if (!includeUnknown) {
            return false;
          }
        }
      }
      return true;
    });
    this._poiMatchedCount = matched.length;
    // poi_max_results is a display/performance ceiling. The local candidate pool
    // can be larger so free-text filtering remains useful at wider radii.
    this._poiResults = matched.slice(0, this._poiMaxResults);
    if (this._selectedPoiId && !this._poiResults.some((poi) => poi.id === this._selectedPoiId)) {
      this._selectedPoiId = null;
      this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
    }
  }

  _poiTemplateStorageKey() {
    // Legacy browser-local location used only for one-time migration to the
    // integration-wide Home Assistant Store.
    return `${this._storageKey}:poi-templates-v1`;
  }

  _readLocalPoiTemplates() {
    try {
      const raw = localStorage.getItem(this._poiTemplateStorageKey());
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  _readPoiTemplates() {
    return this._poiTemplatesLoaded ? this._poiGlobalTemplates : this._readLocalPoiTemplates();
  }

  _poiTemplateComparable(template = {}) {
    return JSON.stringify({
      categories: [...(template.categories || [])].map(String).sort(),
      radiusKm: Number(template.radiusKm) || 5,
      search: String(template.search || ""),
      operators: this._poiOperatorsFromTemplate(template).map((item) => this._normalizePoiSearchText(item)).sort(),
      minPowerKw: Number(template.minPowerKw) || 0,
      connector: String(template.connector || "any"),
      includeUnknownPower: template.includeUnknownPower !== false,
      centerMode: ["vehicle", "route", "map"].includes(template.centerMode) ? template.centerMode : "vehicle",
    });
  }

  async _loadGlobalPoiTemplates(force = false) {
    if (!this._hass?.callWS || this._poiTemplatesLoading || (this._poiTemplatesLoaded && !force)) return;
    this._poiTemplatesLoading = true;
    try {
      const result = await this._hass.callWS({ type: "cardata_analytics/poi_templates/list" });
      const templates = result?.templates;
      this._poiGlobalTemplates = templates && typeof templates === "object" ? templates : {};
      this._poiTemplatesLoaded = true;
      await this._migrateLocalPoiTemplates();
    } catch (err) {
      // Older backend during a rolling frontend update: keep legacy local
      // templates usable and retry after the next HA/browser restart.
      console.warn("[Cardata Analytics] global POI templates unavailable", err);
    } finally {
      this._poiTemplatesLoading = false;
      if (this._domBuilt) this._renderPoiPanel();
    }
  }

  async _migrateLocalPoiTemplates() {
    const localTemplates = this._readLocalPoiTemplates();
    const entries = Object.entries(localTemplates || {});
    if (!entries.length || !this._hass?.callWS || !this._poiTemplatesLoaded) return;

    let allMigrated = true;
    const existingNames = new Set(Object.values(this._poiGlobalTemplates).map((item) => String(item?.name || "").trim().toLocaleLowerCase(this._locale())));
    for (const [legacyKey, legacyTemplate] of entries) {
      if (!legacyTemplate || typeof legacyTemplate !== "object") continue;
      const comparable = this._poiTemplateComparable(legacyTemplate);
      const duplicate = Object.values(this._poiGlobalTemplates).some((item) =>
        this._poiTemplateComparable(item) === comparable
        && String(item?.name || "").trim().toLocaleLowerCase(this._locale()) === String(legacyTemplate?.name || "").trim().toLocaleLowerCase(this._locale())
      );
      if (duplicate) continue;

      let key = /^custom:[A-Za-z0-9._:-]{1,90}$/.test(legacyKey) && !this._poiGlobalTemplates[legacyKey]
        ? legacyKey
        : `custom:import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const template = { ...legacyTemplate };
      let name = String(template.name || this._t("Importierte Vorlage")).trim().slice(0, 60) || this._t("Importierte Vorlage");
      if (existingNames.has(name.toLocaleLowerCase(this._locale()))) {
        const suffix = " (importiert)";
        name = `${name.slice(0, Math.max(1, 60 - suffix.length))}${suffix}`;
      }
      template.name = name;
      try {
        const result = await this._hass.callWS({ type: "cardata_analytics/poi_templates/save", key, template });
        this._poiGlobalTemplates[key] = result?.template || template;
        existingNames.add(name.toLocaleLowerCase(this._locale()));
      } catch (err) {
        allMigrated = false;
        console.warn("[Cardata Analytics] POI template migration failed", err);
      }
    }
    if (allMigrated) {
      try { localStorage.removeItem(this._poiTemplateStorageKey()); } catch (_) { /* ignore */ }
    }
  }

  async _saveGlobalPoiTemplate(key, template) {
    if (!this._hass?.callWS) throw new Error(this._t("Home-Assistant-WebSocket ist nicht verfügbar"));
    const result = await this._hass.callWS({ type: "cardata_analytics/poi_templates/save", key, template });
    this._poiGlobalTemplates[key] = result?.template || template;
    this._poiTemplatesLoaded = true;
    return this._poiGlobalTemplates[key];
  }

  async _deleteGlobalPoiTemplate(key) {
    if (!this._hass?.callWS) throw new Error(this._t("Home-Assistant-WebSocket ist nicht verfügbar"));
    await this._hass.callWS({ type: "cardata_analytics/poi_templates/delete", key });
    delete this._poiGlobalTemplates[key];
  }

  _snapshotPoiFilter(name = "") {
    return {
      name: String(name || "").trim(),
      categories: [...this._poiCategories],
      radiusKm: this._poiRadiusKm,
      search: this._poiSearchText,
      operators: [...this._poiOperators],
      minPowerKw: Number(this._poiMinPowerKw) || 0,
      connector: this._poiConnector,
      includeUnknownPower: Boolean(this._poiIncludeUnknownPower),
      centerMode: this._poiCenterMode,
    };
  }

  _applyPoiTemplate(key) {
    const custom = this._readPoiTemplates();
    const template = custom[key];
    if (!template) return;
    const valid = new Set(Object.keys(this._poiDefinitions()));
    this._poiCategories = new Set((template.categories || []).map(String).filter((item) => valid.has(item)));
    this._poiRadiusKm = POI_RADIUS_OPTIONS_KM.includes(Number(template.radiusKm)) ? Number(template.radiusKm) : 5;
    this._poiSearchText = String(template.search || "");
    this._poiOperatorText = "";
    this._poiOperators = this._poiOperatorsFromTemplate(template);
    this._poiMinPowerKw = [0, 50, 100, 150, 200, 300, 350].includes(Number(template.minPowerKw)) ? Number(template.minPowerKw) : 0;
    this._poiConnector = ["any", "ccs", "type2", "chademo", "tesla"].includes(template.connector) ? template.connector : "any";
    this._poiIncludeUnknownPower = template.includeUnknownPower !== false;
    this._poiCenterMode = ["vehicle", "route", "map"].includes(template.centerMode) ? template.centerMode : "vehicle";
    this._poiActiveTemplate = key;
    this._savePreferences();
    this._selectedPoiId = null;
    this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
    this._applyPoiClientFilters();
    this._renderPoiPanel();
    this._renderMap(false);
    this._updateControls();
    if (this._poiCategories.size) {
      this._poiLoading = true;
      this._schedulePoiLoad(100, false);
    } else {
      this._poiRawResults = [];
      this._poiResults = [];
      this._poiMatchedCount = 0;
      this._poiCandidateLimitHit = false;
      this._poiCandidateLimit = 0;
      this._renderMap(false);
    }
  }

  _poiStatusText() {
    const count = this._poiResults.length;
    const rawCount = this._poiRawResults.length;
    const matchedCount = Number.isFinite(this._poiMatchedCount) ? this._poiMatchedCount : count;
    const center = this._poiSearchCenter();
    const centerLabel = this._poiSourceCenterLabel || center?.label || this._t("POI-Zentrum");
    const radiusNote = this._poiGeneralRadiusLimited() ? ` · ${this._t("allgemeine POIs max. 200 km")}` : "";
    if (this._poiLoading && this._poiError) return this._poiError;
    if (this._poiLoading) {
      const retry = this._poiRetryCount > 0
        ? ` · ${this._t("Wiederholungsversuch {n}/{max}", { n: this._poiRetryCount, max: this._poiMaxAutoRetries })}`
        : "";
      return `${this._t("POIs werden über Home Assistant geladen …")} · ${this._poiRadiusKm} km · ${centerLabel}${radiusNote}${retry}`;
    }
    if (this._poiError) return this._poiError;
    if (!this._poiCategories.size) return this._t("POI-Suche ist ausgeschaltet.");
    const duration = Number.isFinite(this._poiLastDurationMs) ? ` · ${this._formatNumber(this._poiLastDurationMs / 1000, 1)} s` : "";
    const fallback = Array.isArray(this._poiLastWarnings) && this._poiLastWarnings.length ? ` · ${this._t("Fallback aktiv")}` : "";
    const resultText = matchedCount > this._poiMaxResults
      ? this._t("{count} von {matched} Treffern angezeigt", { count, matched: matchedCount })
      : (matchedCount !== rawCount
        ? this._t("{count} Treffer von {raw}", { count: matchedCount, raw: rawCount })
        : this._t("{count} Treffer", { count }));
    const search = this._poiSearchText.trim();
    const candidateNotice = search && this._poiCandidateLimitHit && this._poiCandidateLimit > 0
      ? ` · ${this._t("Suchbasis auf {limit} POIs begrenzt. Die lokale Textsuche kann unvollständig sein. Aktualisieren startet eine gezielte Suche nach „{search}“.", { limit: this._poiCandidateLimit, search })}`
      : "";
    return `${resultText} · ${centerLabel}${radiusNote}${this._poiLastEndpoint ? ` · ${this._overpassEndpointLabel(this._poiLastEndpoint)}` : ""}${duration}${fallback}${candidateNotice}`;
  }

  _updatePoiStatusDom() {
    const status = this.shadowRoot?.querySelector("#poi-panel .poi-status");
    if (!status) return;
    status.textContent = this._poiStatusText();
    status.classList.toggle("warning", Boolean(this._poiError));
  }

  _distanceKm(lat1, lon1, lat2, lon2) {
    const rad = (value) => value * Math.PI / 180;
    const earthKm = 6371.0088;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }

  _gpsPairTimestampMs(group) {
    if (!group?.entities || !this._hass?.states) return null;
    const timestamps = [group.entities.latitude, group.entities.longitude].map((entityId) => {
      const stateObj = entityId ? this._hass.states[entityId] : null;
      const raw = stateObj?.last_updated || stateObj?.last_changed || null;
      const parsed = raw ? Date.parse(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    });
    if (timestamps.some((value) => value == null)) return null;
    // Use the older timestamp of the pair. HA often publishes latitude and
    // longitude as two consecutive state events; this waits until BOTH values
    // belong to the new GPS update and avoids calculating with a half-old pair.
    return Math.min(...timestamps);
  }

  _bearingDeg(lat1, lon1, lat2, lon2) {
    const rad = (value) => Number(value) * Math.PI / 180;
    const phi1 = rad(lat1);
    const phi2 = rad(lat2);
    const dLon = rad(Number(lon2) - Number(lon1));
    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  _bearingLabel(degrees) {
    if (degrees == null || degrees === "" || !Number.isFinite(Number(degrees))) return "";
    const dirs = cardataLanguage(this._hass) === "de"
      ? ["N", "NO", "O", "SO", "S", "SW", "W", "NW"]
      : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const normalized = ((Number(degrees) % 360) + 360) % 360;
    return `${dirs[Math.round(normalized / 45) % 8]} · ${Math.round(normalized)}°`;
  }

  _updateGpsMotionFromHass() {
    if (!this._hass || !this._registryLoaded) return;
    const activeIds = new Set();
    for (const group of this._vehicleGroups()) {
      activeIds.add(group.deviceId);
      const lat = this._number(group.entities.latitude);
      const lon = this._number(group.entities.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
      const timestampMs = this._gpsPairTimestampMs(group);
      if (!Number.isFinite(timestampMs)) continue;
      const previous = this._gpsMotion.get(group.deviceId);
      if (!previous) {
        this._gpsMotion.set(group.deviceId, {
          sampleLat: lat, sampleLon: lon, sampleAtMs: timestampMs, lastSeenAtMs: timestampMs,
          measurementAtMs: timestampMs, speedKmh: null, bearingDeg: null,
          segmentMeters: null, segmentSeconds: null, quality: "initial",
        });
        continue;
      }
      if (timestampMs <= Number(previous.lastSeenAtMs || previous.sampleAtMs || 0)) continue;

      const segmentSeconds = (timestampMs - Number(previous.sampleAtMs || timestampMs)) / 1000;
      const distanceKm = this._distanceKm(previous.sampleLat, previous.sampleLon, lat, lon);
      const segmentMeters = distanceKm * 1000;
      if (!Number.isFinite(segmentSeconds) || segmentSeconds < GPS_MOTION_MIN_SEGMENT_SECONDS) {
        // Do not move the accepted baseline yet. On 1 Hz GPS streams the next
        // sample can then form a >=2 s segment instead of staying permanently
        // below the minimum interval. Keep the last displayed motion meanwhile.
        this._gpsMotion.set(group.deviceId, { ...previous, lastSeenAtMs: timestampMs });
        continue;
      }
      if (segmentSeconds > GPS_MOTION_MAX_SEGMENT_SECONDS) {
        this._gpsMotion.set(group.deviceId, {
          ...previous, sampleLat: lat, sampleLon: lon, sampleAtMs: timestampMs, lastSeenAtMs: timestampMs,
          measurementAtMs: timestampMs, speedKmh: null, bearingDeg: null,
          segmentMeters, segmentSeconds, quality: "gap",
        });
        continue;
      }
      if (segmentMeters < GPS_MOTION_JITTER_METERS) {
        this._gpsMotion.set(group.deviceId, {
          ...previous, sampleLat: lat, sampleLon: lon, sampleAtMs: timestampMs, lastSeenAtMs: timestampMs,
          measurementAtMs: timestampMs, speedKmh: 0, bearingDeg: null,
          segmentMeters, segmentSeconds, quality: "stationary",
        });
        continue;
      }

      const speedKmh = distanceKm / (segmentSeconds / 3600);
      if (!Number.isFinite(speedKmh) || speedKmh > GPS_MOTION_MAX_SPEED_KMH) {
        // Keep the last accepted baseline so a single GPS jump cannot poison
        // the next valid segment. The rejected sample is still surfaced in UI.
        this._gpsMotion.set(group.deviceId, {
          ...previous, lastSeenAtMs: timestampMs, measurementAtMs: timestampMs, speedKmh: null, bearingDeg: null,
          segmentMeters, segmentSeconds, quality: "jump",
        });
        continue;
      }

      this._gpsMotion.set(group.deviceId, {
        sampleLat: lat, sampleLon: lon, sampleAtMs: timestampMs, lastSeenAtMs: timestampMs,
        measurementAtMs: timestampMs, speedKmh,
        bearingDeg: segmentMeters >= GPS_MOTION_BEARING_METERS ? this._bearingDeg(previous.sampleLat, previous.sampleLon, lat, lon) : null,
        segmentMeters, segmentSeconds, quality: speedKmh < 1 ? "stationary" : "moving",
      });
    }
    for (const deviceId of [...this._gpsMotion.keys()]) {
      if (!activeIds.has(deviceId)) this._gpsMotion.delete(deviceId);
    }
  }

  _gpsMotionInfo(deviceId) {
    const raw = this._gpsMotion.get(deviceId) || null;
    if (!raw) return { speedKmh: null, bearingDeg: null, bearingLabel: "", stale: false, status: this._t("Vergleich folgt"), quality: "initial" };
    const ageMs = Math.max(0, Date.now() - Number(raw.measurementAtMs || raw.sampleAtMs || Date.now()));
    const stale = ageMs > GPS_MOTION_STALE_MS;
    const speedKmh = !stale && raw.speedKmh != null && raw.speedKmh !== "" && Number.isFinite(Number(raw.speedKmh)) ? Number(raw.speedKmh) : null;
    const bearingDeg = speedKmh != null && speedKmh > 0 && Number.isFinite(Number(raw.bearingDeg)) ? Number(raw.bearingDeg) : null;
    const bearingLabel = this._bearingLabel(bearingDeg);
    let status = this._t("Vergleich folgt");
    if (stale) status = this._t("veraltet");
    else if (raw.quality === "jump") status = this._t("GPS-Sprung verworfen");
    else if (raw.quality === "gap") status = this._t("neuer GPS-Punkt · Vergleich folgt");
    else if (speedKmh === 0) status = this._t("steht");
    else if (speedKmh != null) status = bearingLabel ? this._t("fährt · {bearing}", { bearing: bearingLabel }) : this._t("fährt");
    return { ...raw, speedKmh, bearingDeg, bearingLabel, stale, status, ageMs };
  }

  _gpsMotionCompactText(vehicle) {
    const motion = this._gpsMotionInfo(vehicle?.deviceId);
    const speed = motion.speedKmh == null ? "—" : `${this._formatNumber(motion.speedKmh, 0)} km/h`;
    return `${this._t("GPS Ø")} ${speed} · ${motion.status} · ${this._formatAge(vehicle?.lastChanged)}`;
  }

  _poiNavigationUrl(poi) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${poi.lat},${poi.lon}`)}&travelmode=driving`;
  }

  _poiSearchUrl(poi) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${poi.lat},${poi.lon}`)}`;
  }

  _normalizeRoutePoint(item) {
    if (!item || typeof item !== "object") return null;
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    const fallback = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    return {
      id: String(item.id || `point:${lat.toFixed(6)},${lon.toFixed(6)}`),
      lat,
      lon,
      label: String(item.label || item.name || fallback).slice(0, 180),
      address: String(item.address || "").slice(0, 240),
      category: String(item.category || ""),
    };
  }

  _routePointKey(point) {
    const p = this._normalizeRoutePoint(point);
    return p ? `${p.lat.toFixed(6)},${p.lon.toFixed(6)}` : "";
  }

  _routeStartVehicle() {
    const vehicles = this._vehicles().filter((v) => v.valid);
    let vehicle = vehicles.find((v) => v.deviceId === this._routeVehicleId)
      || vehicles.find((v) => v.deviceId === this._selectedVehicleId)
      || vehicles[0]
      || null;
    if (vehicle && this._routeVehicleId !== vehicle.deviceId) this._routeVehicleId = vehicle.deviceId;
    return vehicle;
  }

  _routeStart() {
    if (this._routeStartMode === "vehicle") {
      const vehicle = this._routeStartVehicle();
      if (!vehicle) return null;
      return {
        ...vehicle,
        lat: Number(vehicle.lat),
        lon: Number(vehicle.lon),
        label: vehicle.name,
        startType: "vehicle",
      };
    }
    const point = this._normalizeRoutePoint(this._routeStartPoint);
    return point ? { ...point, name: point.label, startType: this._routeStartMode } : null;
  }

  _routeStartDescriptor() {
    if (this._routeStartMode === "vehicle") {
      return { type: "vehicle", vehicleId: String(this._routeVehicleId || "").slice(0, 160) };
    }
    if (this._routeStartMode === "device") return { type: "device" };
    const point = this._normalizeRoutePoint(this._routeStartPoint);
    return point ? { type: this._routeStartMode, point } : { type: "vehicle", vehicleId: String(this._routeVehicleId || "").slice(0, 160) };
  }

  _setRouteStartPoint(point, mode = "address", message = this._t("Startpunkt gesetzt."), updatedAt = 0) {
    const normalized = this._normalizeRoutePoint(point);
    if (!normalized) return false;
    this._routeStartMode = ["device", "saved", "zone", "address", "map"].includes(mode) ? mode : "address";
    this._routeStartPoint = normalized;
    this._routeStartUpdatedAt = Number(updatedAt) || (this._routeStartMode === "device" ? Date.now() : 0);
    this._routeDeviceLocationError = "";
    this._routeMarkChanged(message);
    this._cancelRouteMapPick();
    this._savePreferences();
    this._syncRouteMapSource();
    this._renderRoutePanel();
    this._updateControls();
    return true;
  }

  _setRouteStartVehicle(vehicleId, message = "") {
    const vehicle = this._vehicles().find((item) => item.deviceId === vehicleId && item.valid);
    if (!vehicle) return false;
    this._routeVehicleId = vehicle.deviceId;
    this._routeStartMode = "vehicle";
    this._routeStartPoint = null;
    this._routeStartUpdatedAt = 0;
    this._routeDeviceLocationError = "";
    this._routeMarkChanged(message || this._t("Startpunkt auf Fahrzeug „{name}“ gesetzt.", { name: vehicle.name }));
    this._cancelRouteMapPick();
    this._savePreferences();
    this._syncRouteMapSource();
    this._renderRoutePanel();
    this._updateControls();
    return true;
  }

  async _refreshRouteDeviceLocation() {
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation?.getCurrentPosition) {
      this._routeDeviceLocationError = this._t("Standort ist auf diesem Gerät nicht verfügbar.");
      this._routeDeviceLocationLoading = false;
      this._renderRoutePanel();
      return false;
    }
    this._routeDeviceLocationLoading = true;
    this._routeDeviceLocationError = "";
    this._renderRoutePanel();
    try {
      const position = await new Promise((resolve, reject) => geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }));
      const lat = Number(position?.coords?.latitude);
      const lon = Number(position?.coords?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(this._t("Standort ist auf diesem Gerät nicht verfügbar."));
      const accuracy = Number(position?.coords?.accuracy);
      const point = this._normalizeRoutePoint({
        id: "device-location",
        lat,
        lon,
        label: this._t("Aktueller Smartphone-Standort"),
        address: Number.isFinite(accuracy) ? `${lat.toFixed(6)}, ${lon.toFixed(6)} · ±${Math.round(accuracy)} m` : `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
        category: "device_location",
      });
      const updatedAt = Number(position?.timestamp) || Date.now();
      this._routeStartMode = "device";
      this._routeStartPoint = point;
      this._routeStartUpdatedAt = updatedAt;
      this._routeMarkChanged(this._t("Smartphone-Standort gesetzt."));
      this._savePreferences();
      this._syncRouteMapSource();
      return true;
    } catch (err) {
      let message = err?.message || String(err || "");
      if (Number(err?.code) === 1) message = this._t("Standortberechtigung wurde verweigert.");
      else if (Number(err?.code) === 3) message = this._t("Standortermittlung hat zu lange gedauert.");
      else if (Number(err?.code) === 2) message = this._t("Standort ist auf diesem Gerät nicht verfügbar.");
      this._routeDeviceLocationError = this._t("Standort konnte nicht ermittelt werden: {error}", { error: message });
      return false;
    } finally {
      this._routeDeviceLocationLoading = false;
      this._renderRoutePanel();
      this._updateControls();
    }
  }

  _focusRouteStart() {
    const start = this._routeStart();
    if (!start) return;
    if (start.startType === "vehicle" && start.deviceId) {
      this._focusVehicle(start.deviceId, { follow: false, showPopup: false, animate: true });
      return;
    }
    if (this._mode === "gps") this._mode = this._lastFreeMode || "osm";
    const map = this._vectorMap;
    if (map && this._mapStyleReady) {
      try {
        map.easeTo({ center: [start.lon, start.lat], zoom: Math.max(Number(map.getZoom?.() || this._zoom || 12), 13), duration: 320 });
        return;
      } catch (_) { /* fall through */ }
    }
    this._center = { lat: start.lat, lon: start.lon };
    this._zoom = Math.max(Number(this._zoom || 12), 13);
    this._renderMap(true);
  }

  _routePointFromPoi(poi) {
    if (!poi) return null;
    return this._normalizeRoutePoint({
      id: `poi:${poi.id || `${poi.lat},${poi.lon}`}`,
      lat: poi.lat,
      lon: poi.lon,
      label: this._poiDisplayName(poi),
      address: poi.address || "",
      category: poi.category || "poi",
    });
  }

  _routeMarkChanged(message = "") {
    this._routeActiveTemplate = "";
    if (message) this._routeMessage = message;
  }

  _poiRouteCenterChanged() {
    if (this._poiCenterMode !== "route" || !this._poiCategories.size) return;
    this._poiSourceCenterKey = "";
    this._poiSourceCenterLabel = "";
    this._renderMap(false);
    if (this._normalizeRoutePoint(this._routeDestination)) {
      this._poiLoading = true;
      this._poiError = "";
      this._schedulePoiLoad(120, false);
    } else {
      this._poiLoading = false;
      this._poiError = this._t("Für dieses POI-Zentrum muss zuerst ein Routenziel gesetzt werden.");
    }
    if (this._domBuilt) this._renderPoiPanel();
  }

  _snapshotRouteTemplate(name = "") {
    const destination = this._normalizeRoutePoint(this._routeDestination);
    if (!destination) return null;
    return {
      name: String(name || "").trim().slice(0, 80),
      vehicleId: String(this._routeVehicleId || "").slice(0, 160),
      start: this._routeStartDescriptor(),
      waypoints: this._routeWaypoints.slice(0, ROUTE_MAX_WAYPOINTS).map((point) => this._normalizeRoutePoint(point)).filter(Boolean),
      destination,
    };
  }

  async _loadGlobalRouteData(force = false) {
    if (!this._hass?.callWS || this._routeDataLoading || (this._routeDataLoaded && !force)) return;
    this._routeDataLoading = true;
    try {
      const result = await this._hass.callWS({ type: "cardata_analytics/routes/list" });
      this._routeGlobalTemplates = result?.templates && typeof result.templates === "object" ? result.templates : {};
      this._routeDestinations = result?.destinations && typeof result.destinations === "object" ? result.destinations : {};
      if (this._routeActiveTemplate && !this._routeGlobalTemplates[this._routeActiveTemplate]) this._routeActiveTemplate = "";
      if (this._routeSelectedDestinationKey.startsWith("destination:") && !this._routeDestinations[this._routeSelectedDestinationKey]) this._routeSelectedDestinationKey = "";
      this._routeDataLoaded = true;
    } catch (err) {
      console.warn("[Cardata Analytics] global route data unavailable", err);
    } finally {
      this._routeDataLoading = false;
      if (this._domBuilt && !this.shadowRoot?.getElementById("route-panel")?.classList.contains("hidden")) this._renderRoutePanel();
    }
  }

  async _saveGlobalRouteTemplate(key, template) {
    if (!this._hass?.callWS) throw new Error(this._t("Home-Assistant-WebSocket ist nicht verfügbar"));
    const result = await this._hass.callWS({ type: "cardata_analytics/routes/templates/save", key, template });
    this._routeGlobalTemplates[key] = result?.template || template;
    this._routeDataLoaded = true;
    return this._routeGlobalTemplates[key];
  }

  async _deleteGlobalRouteTemplate(key) {
    if (!this._hass?.callWS) throw new Error(this._t("Home-Assistant-WebSocket ist nicht verfügbar"));
    await this._hass.callWS({ type: "cardata_analytics/routes/templates/delete", key });
    delete this._routeGlobalTemplates[key];
  }

  _applyRouteTemplate(key) {
    const template = this._routeGlobalTemplates?.[key];
    if (!template) return false;
    const vehicles = this._vehicles().filter((v) => v.valid);
    const desiredVehicle = String(template?.start?.vehicleId || template.vehicleId || "");
    const startType = String(template?.start?.type || "vehicle");
    if (startType === "vehicle") {
      if (desiredVehicle && vehicles.some((vehicle) => vehicle.deviceId === desiredVehicle)) this._routeVehicleId = desiredVehicle;
      this._routeStartMode = "vehicle";
      this._routeStartPoint = null;
      this._routeStartUpdatedAt = 0;
    } else if (startType === "device") {
      this._routeStartMode = "device";
      this._routeStartPoint = null;
      this._routeStartUpdatedAt = 0;
    } else {
      const templateStart = this._normalizeRoutePoint(template?.start?.point);
      if (templateStart) {
        this._routeStartMode = ["saved", "zone", "address", "map"].includes(startType) ? startType : "address";
        this._routeStartPoint = templateStart;
        this._routeStartUpdatedAt = 0;
      } else {
        this._routeStartMode = "vehicle";
        this._routeStartPoint = null;
      }
    }
    this._routeWaypoints = Array.isArray(template.waypoints)
      ? template.waypoints.map((point) => this._normalizeRoutePoint(point)).filter(Boolean).slice(0, ROUTE_MAX_WAYPOINTS)
      : [];
    this._routeDestination = this._normalizeRoutePoint(template.destination);
    if (!this._routeDestination) return false;
    this._routeActiveTemplate = key;
    this._routeMessage = startType === "device"
      ? this._t("Routenvorlage „{name}“ geladen. Smartphone-Standort wird aktualisiert.", { name: template.name || this._t("Route") })
      : this._t("Routenvorlage „{name}“ geladen.", { name: template.name || this._t("Route") });
    this._cancelRouteMapPick();
    this._savePreferences();
    this._syncRouteMapSource();
    this._renderRoutePanel();
    this._updateControls();
    this._poiRouteCenterChanged();
    if (startType === "device") this._refreshRouteDeviceLocation();
    return true;
  }

  _savedDestinationPoint(key, item) {
    if (!item) return null;
    return this._normalizeRoutePoint({
      id: `saved:${key}`,
      lat: item.lat,
      lon: item.lon,
      label: item.name || this._t("Gespeichertes Ziel"),
      address: item.address || "",
      category: "saved_destination",
    });
  }

  _haZoneDestinations() {
    if (!this._hass?.states) return [];
    return Object.entries(this._hass.states)
      .filter(([entityId, state]) => entityId.startsWith("zone.") && state?.attributes)
      .map(([entityId, state]) => {
        const lat = Number(state.attributes.latitude);
        const lon = Number(state.attributes.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return {
          key: `zone:${entityId}`,
          name: String(state.attributes.friendly_name || state.name || entityId.replace(/^zone\./, "")),
          lat,
          lon,
          address: this._t("Home-Assistant-Zone"),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, this._locale()));
  }

  async _saveGlobalDestination(key, destination) {
    if (!this._hass?.callWS) throw new Error(this._t("Home-Assistant-WebSocket ist nicht verfügbar"));
    const result = await this._hass.callWS({ type: "cardata_analytics/routes/destinations/save", key, destination });
    this._routeDestinations[key] = result?.destination || destination;
    this._routeDataLoaded = true;
    return this._routeDestinations[key];
  }

  async _deleteGlobalDestination(key) {
    if (!this._hass?.callWS) throw new Error(this._t("Home-Assistant-WebSocket ist nicht verfügbar"));
    await this._hass.callWS({ type: "cardata_analytics/routes/destinations/delete", key });
    delete this._routeDestinations[key];
  }

  _setRouteDestination(point, message = this._t("Ziel gesetzt.")) {
    const normalized = this._normalizeRoutePoint(point);
    if (!normalized) return false;
    const destinationKey = this._routePointKey(normalized);
    this._routeWaypoints = this._routeWaypoints.filter((item) => this._routePointKey(item) !== destinationKey);
    this._routeDestination = normalized;
    this._routeMarkChanged(message);
    this._cancelRouteMapPick();
    this._savePreferences();
    this._syncRouteMapSource();
    this._renderRoutePanel();
    this._updateControls();
    this._poiRouteCenterChanged();
    return true;
  }

  _routeUsesMobileGoogleLimit() {
    const nav = globalThis.navigator || {};
    if (nav.userAgentData && typeof nav.userAgentData.mobile === "boolean") return nav.userAgentData.mobile;
    const ua = String(nav.userAgent || "");
    if (/Android|iPhone|iPod|IEMobile|Opera Mini|Mobile/i.test(ua)) return true;
    // iPadOS can identify itself as Macintosh while still behaving like a mobile/touch device.
    if (/Macintosh/i.test(ua) && Number(nav.maxTouchPoints || 0) > 1) return true;
    try {
      return Boolean(globalThis.matchMedia?.("(pointer: coarse)")?.matches)
        && Math.min(Number(globalThis.innerWidth || 9999), Number(globalThis.innerHeight || 9999)) <= 1024;
    } catch (_) {
      return false;
    }
  }

  _routeGoogleWaypointLimit() {
    return this._routeUsesMobileGoogleLimit() ? ROUTE_MOBILE_GOOGLE_WAYPOINTS : ROUTE_MAX_WAYPOINTS;
  }

  _routeWaypointNotice(message = "") {
    const count = this._routeWaypoints.length;
    if (count <= ROUTE_MOBILE_GOOGLE_WAYPOINTS) return message;
    const note = this._routeUsesMobileGoogleLimit()
      ? this._t("Hinweis: Cardata behält alle {count} Zwischenziele, übergibt auf diesem mobilen Gerät an Google Maps aber nur die ersten {mobile}.", { count, mobile: ROUTE_MOBILE_GOOGLE_WAYPOINTS })
      : this._t("Hinweis: Cardata/Google Maps Desktop kann bis zu {max} Zwischenziele übergeben; mobile Browser garantieren nur {mobile}.", { max: ROUTE_MAX_WAYPOINTS, mobile: ROUTE_MOBILE_GOOGLE_WAYPOINTS });
    return [message, note].filter(Boolean).join(" ");
  }

  _addRouteWaypoint(point, message = this._t("Zwischenziel hinzugefügt.")) {
    const normalized = this._normalizeRoutePoint(point);
    if (!normalized) return false;
    const key = this._routePointKey(normalized);
    if (this._routeDestination && this._routePointKey(this._routeDestination) === key) {
      this._routeMessage = this._t("{label} ist bereits das Ziel.", { label: normalized.label });
      this._cancelRouteMapPick();
      this._renderRoutePanel();
      return false;
    }
    if (this._routeWaypoints.some((item) => this._routePointKey(item) === key)) {
      this._routeMessage = this._t("{label} ist bereits als Zwischenziel enthalten.", { label: normalized.label });
      this._cancelRouteMapPick();
      this._renderRoutePanel();
      return false;
    }
    if (this._routeWaypoints.length >= ROUTE_MAX_WAYPOINTS) {
      this._routeMessage = this._t("Maximal {max} Zwischenziele in Cardata.", { max: ROUTE_MAX_WAYPOINTS });
      this._cancelRouteMapPick();
      this._renderRoutePanel();
      return false;
    }
    this._routeWaypoints.push(normalized);
    this._routeMarkChanged(this._routeWaypointNotice(message || this._t("{label} wurde als Zwischenziel {index} hinzugefügt.", { label: normalized.label, index: this._routeWaypoints.length })));
    this._cancelRouteMapPick();
    this._savePreferences();
    this._syncRouteMapSource();
    this._renderRoutePanel();
    this._updateControls();
    return true;
  }

  async _searchRouteAddress(query) {
    const clean = String(query || "").trim();
    if (clean.length < 3 || !this._hass?.callWS) return;
    this._routeGeocodeQuery = clean;
    this._routeGeocodeLoading = true;
    this._routeGeocodeError = "";
    this._routeGeocodeResults = [];
    this._renderRoutePanel();
    try {
      const result = await this._hass.callWS({ type: "cardata_analytics/routes/geocode", query: clean, limit: 5 });
      this._routeGeocodeResults = Array.isArray(result?.results) ? result.results : [];
      if (!this._routeGeocodeResults.length) this._routeGeocodeError = this._t("Keine passende Adresse gefunden.");
    } catch (err) {
      this._routeGeocodeError = this._t("Adresssuche fehlgeschlagen: {error}", { error: err?.message || err });
    } finally {
      this._routeGeocodeLoading = false;
      this._renderRoutePanel();
    }
  }

  _followSelectedVehiclePosition({ animate = true } = {}) {
    if (this._mode !== "gps") return false;
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    if (!vehicle) return false;
    if (this._selectedVehicleId !== vehicle.deviceId) this._selectedVehicleId = vehicle.deviceId;
    const positionKey = `${vehicle.deviceId}:${vehicle.lat.toFixed(7)},${vehicle.lon.toFixed(7)}`;
    this._center = { lat: vehicle.lat, lon: vehicle.lon };
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady) {
      this._lastFollowPositionKey = positionKey;
      return true;
    }
    try {
      const current = map.getCenter?.();
      const currentZoom = Number(map.getZoom?.());
      if (Number.isFinite(currentZoom)) this._zoom = currentZoom;
      const changed = !current
        || Math.abs(Number(current.lat) - vehicle.lat) > 1e-7
        || Math.abs(Number(current.lng) - vehicle.lon) > 1e-7;
      if (changed) {
        this._programmaticCameraUntil = Date.now() + (animate ? 1000 : 250);
        map.stop?.();
        const camera = { center: [vehicle.lon, vehicle.lat], zoom: this._zoom };
        if (animate && typeof map.easeTo === "function") map.easeTo({ ...camera, duration: 320, essential: true });
        else map.jumpTo?.(camera);
      }
      this._lastFollowPositionKey = positionKey;
      return true;
    } catch (err) {
      console.warn("[Cardata Analytics] continuous GPS follow failed", err);
      return false;
    }
  }

  _addPoiToRoute(poi, kind = "waypoint") {
    const point = this._routePointFromPoi(poi);
    if (!point) return false;
    const key = this._routePointKey(point);
    if (kind === "destination") {
      this._routeWaypoints = this._routeWaypoints.filter((item) => this._routePointKey(item) !== key);
      this._routeDestination = point;
      this._cancelRouteMapPick();
      this._routeMarkChanged(this._t("{label} wurde als Ziel gesetzt.", { label: point.label }));
    } else {
      if (this._routeDestination && this._routePointKey(this._routeDestination) === key) {
        this._routeMessage = this._t("Dieser POI ist bereits das Ziel.");
        this._openRoutePanel();
        return false;
      }
      if (this._routeWaypoints.some((item) => this._routePointKey(item) === key)) {
        this._routeMessage = this._t("Dieser POI ist bereits als Zwischenziel enthalten.");
        this._openRoutePanel();
        return false;
      }
      if (this._routeWaypoints.length >= ROUTE_MAX_WAYPOINTS) {
        this._routeMessage = this._t("Maximal {max} Zwischenziele in Cardata.", { max: ROUTE_MAX_WAYPOINTS });
        this._openRoutePanel();
        return false;
      }
      this._routeWaypoints.push(point);
      this._routeMarkChanged(this._routeWaypointNotice(this._t("{label} wurde als Zwischenziel {index} hinzugefügt.", { label: point.label, index: this._routeWaypoints.length })));
    }
    this._savePreferences();
    this._syncRouteMapSource();
    if (kind === "destination") this._poiRouteCenterChanged();
    this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
    this._openRoutePanel();
    return true;
  }

  _routeGoogleMapsUrl(navigate = false) {
    const start = this._routeStart();
    const destination = this._normalizeRoutePoint(this._routeDestination);
    if (!start || !destination) return "";
    const params = new URLSearchParams();
    params.set("api", "1");
    params.set("origin", `${start.lat},${start.lon}`);
    params.set("destination", `${destination.lat},${destination.lon}`);
    params.set("travelmode", "driving");
    if (this._routeWaypoints.length) {
      const googleWaypointLimit = this._routeGoogleWaypointLimit();
      params.set("waypoints", this._routeWaypoints.slice(0, googleWaypointLimit).map((point) => `${point.lat},${point.lon}`).join("|"));
    }
    if (navigate) params.set("dir_action", "navigate");
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  _routeGeoJson() {
    const features = [];
    const start = this._routeStart();
    if (start) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [start.lon, start.lat] },
        properties: { kind: "start", marker: "S", label: start.label || start.name || this._t("Startpunkt") },
      });
    }
    this._routeWaypoints.slice(0, ROUTE_MAX_WAYPOINTS).forEach((point, index) => {
      const p = this._normalizeRoutePoint(point);
      if (!p) return;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { kind: "waypoint", marker: String(index + 1), label: p.label },
      });
    });
    const destination = this._normalizeRoutePoint(this._routeDestination);
    if (destination) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [destination.lon, destination.lat] },
        properties: { kind: "destination", marker: "Z", label: destination.label },
      });
    }
    return { type: "FeatureCollection", features };
  }

  _syncRouteMapSource() {
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady) return;
    this._ensureMapDataLayers();
    const source = map.getSource("cardata-route-points");
    if (source?.setData) source.setData(this._routeGeoJson());
  }

  _cancelRouteMapPick() {
    this._routePickMode = "";
    try {
      const canvas = this._vectorMap?.getCanvas?.();
      if (canvas) canvas.style.cursor = "";
    } catch (_) { /* map may be rebuilding */ }
  }

  _bindMapRouteClick() {
    const map = this._vectorMap;
    if (!map || this._mapRouteClickHandler) return;
    this._mapRouteClickHandler = (event) => {
      const pickMode = this._routePickMode;
      if (pickMode !== "destination" && pickMode !== "waypoint" && pickMode !== "start") return;
      try {
        const poiHits = map.queryRenderedFeatures?.(event.point, { layers: ["cardata-poi-points", "cardata-poi-clusters"] }) || [];
        if (poiHits.length) return;
      } catch (_) { /* style may be rebuilding */ }
      const lat = Number(event?.lngLat?.lat);
      const lon = Number(event?.lngLat?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const point = this._normalizeRoutePoint({
        id: `map:${lat.toFixed(6)},${lon.toFixed(6)}`,
        lat,
        lon,
        label: `${this._t("Punkt auf Karte")} ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        address: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
        category: "map",
      });
      if (!point) return;
      if (pickMode === "waypoint") {
        this._addRouteWaypoint(point, this._t("{label} wurde als Zwischenziel {index} hinzugefügt.", { label: this._t("Punkt auf Karte"), index: this._routeWaypoints.length + 1 }));
      } else if (pickMode === "start") {
        this._setRouteStartPoint(point, "map", this._t("Kartenstart gesetzt."));
      } else {
        this._setRouteDestination(point, this._t("Kartenziel gesetzt. Google Maps berechnet beim Öffnen die tatsächliche Straßenroute."));
      }
    };
    map.on("click", this._mapRouteClickHandler);
  }

  _openRoutePanel() {
    const panel = this.shadowRoot?.getElementById("route-panel");
    if (!panel) return;
    this.shadowRoot?.getElementById("vehicle-panel")?.classList.add("hidden");
    this.shadowRoot?.getElementById("poi-panel")?.classList.add("hidden");
    panel.classList.remove("hidden");
    this._loadGlobalRouteData(true);
    this._renderRoutePanel();
    this._updateControls();
  }

  _fitRoutePoints(save = true) {
    const start = this._routeStart();
    const points = [
      ...(start ? [{ lat: start.lat, lon: start.lon }] : []),
      ...this._routeWaypoints.map((item) => this._normalizeRoutePoint(item)).filter(Boolean),
      ...(this._routeDestination ? [this._normalizeRoutePoint(this._routeDestination)].filter(Boolean) : []),
    ];
    if (!points.length) return;
    if (points.length === 1 && start) {
      this._focusRouteStart();
      return;
    }
    const minLat = Math.min(...points.map((p) => p.lat));
    const maxLat = Math.max(...points.map((p) => p.lat));
    const minLon = Math.min(...points.map((p) => p.lon));
    const maxLon = Math.max(...points.map((p) => p.lon));
    this._center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
    const map = this._vectorMap;
    if (map && this._mapStyleReady) {
      try {
        map.stop?.();
        map.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
          padding: { top: 70, bottom: 70, left: 70, right: 360 },
          maxZoom: Math.min(15, this._tileProvider().maxZoom),
          duration: 420,
        });
        if (save) setTimeout(() => this._savePreferences(), 480);
        return;
      } catch (err) {
        console.warn("[Cardata Analytics] route fitBounds failed", err);
      }
    }
    this._renderMap(true);
    if (save) this._savePreferences();
  }

  _poiCacheStorageKey() {
    return `${this._storageKey}:poi-cache-v8`;
  }

  _readPoiCache() {
    try {
      const raw = localStorage.getItem(this._poiCacheStorageKey());
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  _writePoiCache(cache) {
    try {
      const entries = Object.entries(cache || {})
        .filter(([, value]) => value && Number(value.timestamp) > Date.now() - 24 * 60 * 60 * 1000)
        .sort((a, b) => Number(b[1].timestamp) - Number(a[1].timestamp))
        .slice(0, 6);
      localStorage.setItem(this._poiCacheStorageKey(), JSON.stringify(Object.fromEntries(entries)));
    } catch (_) { /* localStorage may be unavailable or full */ }
  }

  _poiCacheKey(center) {
    const categories = [...this._poiCategories].sort().join(",");
    const chargingSelected = this._poiCategories.has("charging");
    const operators = chargingSelected
      ? this._poiOperators.map((item) => this._normalizePoiSearchText(item)).filter(Boolean).sort().join(",")
      : "";
    return [
      center.mode, center.lat.toFixed(3), center.lon.toFixed(3), this._poiRadiusKm, categories,
      operators, chargingSelected ? this._poiConnector : "any",
    ].join("|");
  }

  _currentPoiRequestKey() {
    const center = this._poiSearchCenter();
    if (!center || !this._poiCategories.size) return "";
    return this._poiCacheKey(center);
  }

  _resetPoiRequestState(invalidateActive = false) {
    if (this._poiFetchTimer) {
      clearTimeout(this._poiFetchTimer);
      this._poiFetchTimer = null;
    }
    this._poiDesiredRequestKey = "";
    this._poiPendingRequestKey = "";
    this._poiPendingForce = false;
    this._poiScheduledForce = false;
    this._poiRetryKey = "";
    this._poiRetryCount = 0;
    if (invalidateActive) {
      this._poiLifecycleEpoch += 1;
      this._poiActiveRequestId = 0;
      this._poiActiveRequestKey = "";
      this._poiRequestInFlight = false;
    }
  }

  _schedulePoiLoad(delay = 750, force = false) {
    const key = this._currentPoiRequestKey();
    const previousDesiredKey = this._poiDesiredRequestKey;
    this._poiDesiredRequestKey = key;

    if (!key) {
      this._resetPoiRequestState(false);
      return;
    }

    // Never cancel/poison an active websocket request. If that request already
    // represents the current desired query, it is allowed to finish normally.
    // Otherwise remember only the single newest query for a follow-up request.
    if (this._poiRequestInFlight) {
      if (key === this._poiActiveRequestKey && !force) {
        this._poiPendingRequestKey = "";
        this._poiPendingForce = false;
      } else {
        const samePending = key === this._poiPendingRequestKey;
        this._poiPendingRequestKey = key;
        this._poiPendingForce = samePending ? (this._poiPendingForce || Boolean(force)) : Boolean(force);
      }
      this._poiLoading = true;
      this._updatePoiStatusDom();
      return;
    }

    const sameScheduled = key === previousDesiredKey;
    this._poiScheduledForce = sameScheduled ? (this._poiScheduledForce || Boolean(force)) : Boolean(force);
    if (this._poiFetchTimer) clearTimeout(this._poiFetchTimer);
    this._poiFetchTimer = setTimeout(() => {
      this._poiFetchTimer = null;
      const scheduledKey = this._currentPoiRequestKey();
      const scheduledForce = this._poiScheduledForce;
      this._poiScheduledForce = false;
      this._loadPois(scheduledForce, scheduledKey);
    }, Math.max(0, delay));
  }

  _poiRequestSnapshot(center, force = false) {
    const categories = [...this._poiCategories].sort();
    return {
      key: this._poiCacheKey(center),
      epoch: this._poiLifecycleEpoch,
      center: { ...center },
      radiusKm: this._poiRadiusKm,
      categories,
      // Typing in the general search stays purely local. A deliberate Refresh
      // or a radius change while a general text filter is active performs a
      // targeted Overpass query. This avoids huge broad 100-km restaurant
      // requests without creating network traffic for every keystroke.
      searchFilter: force && categories.some((category) => category !== "charging")
        ? this._poiSearchText.trim().slice(0, 80)
        : "",
      operatorFilters: [...this._poiOperators],
      connectorFilter: this._poiConnector,
      minPowerKw: 0,
      includeUnknownPower: true,
      maxResults: this._poiMaxResults,
      timeoutSeconds: Math.round(this._poiRequestTimeoutMs / 1000),
      forceRefresh: Boolean(force),
    };
  }

  _isTransientPoiError(err) {
    const text = String(err?.message || err || "").toLowerCase();
    if (/backend noch nicht aktiv|unknown command|ungültige antwort|invalid|400/.test(text)) return false;
    return /timeout|timed out|busy|belegt|beschäftigt|beschaeftigt|406|429|502|503|504|network|websocket|overpass|temporär|temporar|verfügbar|verfuegbar|connection|connect|reset|dns|proxy|gesamtzeit/.test(text);
  }

  _overpassEndpointLabel(endpoint) {
    try {
      return new URL(endpoint).hostname;
    } catch (_) {
      return endpoint;
    }
  }

  async _fetchOverpass(request) {
    // POIs always go through Home Assistant. The client watchdog is intentionally
    // slightly longer than the backend's total request budget, so a lost websocket
    // reply can never leave the panel spinning forever.
    if (!this._hass?.callWS) {
      throw new Error(this._t("Home-Assistant-WebSocket ist nicht verfügbar"));
    }

    let timeoutId = null;
    try {
      const call = this._hass.callWS({
        type: "cardata_analytics/poi",
        latitude: request.center.lat,
        longitude: request.center.lon,
        radius_km: request.radiusKm,
        categories: request.categories,
        search_filter: request.searchFilter,
        operator_filters: request.operatorFilters,
        connector_filter: request.connectorFilter,
        min_power_kw: request.minPowerKw,
        include_unknown_power: request.includeUnknownPower,
        max_results: request.maxResults,
        timeout_seconds: request.timeoutSeconds,
        force_refresh: request.forceRefresh,
      });
      const watchdogMs = Math.max(50000, this._poiRequestTimeoutMs + 15000);
      const watchdog = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Frontend-Watchdog: keine Backend-Antwort nach ${Math.round(watchdogMs / 1000)} s`)), watchdogMs);
      });
      const result = await Promise.race([call, watchdog]);
      if (!result || !Array.isArray(result.elements)) {
        throw new Error(this._t("ungültige Antwort vom Cardata-Analytics-Backend"));
      }
      this._poiLastEndpoint = result.endpoint || "Home Assistant";
      this._poiLastSources = Array.isArray(result.sources) ? result.sources : [];
      this._poiLastWarnings = Array.isArray(result.warnings) ? result.warnings : [];
      return {
        elements: result.elements,
        cached: Boolean(result.cached),
        elapsedMs: Number(result.elapsed_ms),
        sources: this._poiLastSources,
        warnings: this._poiLastWarnings,
        chargingStatus: String(result.charging_status || "unused"),
        retryAfterSeconds: Number(result.retry_after_seconds || 0),
        candidateLimitHit: Boolean(result.candidate_limit_hit),
        candidateLimit: Number(result.candidate_limit || 0),
      };
    } catch (err) {
      const message = err?.message || String(err);
      if (/unknown command|unknown_command|not found/i.test(message)) {
        throw new Error(this._t("POI-Backend noch nicht aktiv – Home Assistant nach dem Update vollständig neu starten"));
      }
      throw new Error(`Home-Assistant-POI-Proxy: ${message}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async _loadPois(force = false, scheduledKey = "") {
    const center = this._poiSearchCenter();
    if (!this._poiCategories.size) {
      this._resetPoiRequestState(true);
      this._poiRawResults = [];
      this._poiResults = [];
      this._poiMatchedCount = 0;
      this._poiCandidateLimitHit = false;
      this._poiCandidateLimit = 0;
      this._poiSourceVehicleId = null;
      this._poiSourceLat = null;
      this._poiSourceLon = null;
      this._poiSourceCenterKey = "";
      this._poiSourceCenterLabel = "";
      this._poiError = "";
      this._poiLoading = false;
      this._selectedPoiId = null;
      this._renderPoiPanel();
      this._renderMap(false);
      return;
    }
    if (!center) {
      this._poiError = this._poiCenterMode === "route"
        ? this._t("Für dieses POI-Zentrum muss zuerst ein Routenziel gesetzt werden.")
        : this._t("Für die POI-Suche ist kein gültiges Zentrum verfügbar.");
      this._poiLoading = false;
      this._renderPoiPanel();
      return;
    }

    const currentKey = this._poiCacheKey(center);
    this._poiDesiredRequestKey = currentKey;
    if (scheduledKey && scheduledKey !== currentKey) {
      this._schedulePoiLoad(0, force);
      return;
    }

    if (this._poiRequestInFlight) {
      this._schedulePoiLoad(0, force);
      return;
    }

    if (!force) {
      const cache = this._readPoiCache();
      const cached = cache[currentKey];
      if (cached && Date.now() - Number(cached.timestamp) <= this._poiCacheTtlMs
          && Array.isArray(cached.results) && cached.results.length > 0) {
        this._poiRawResults = cached.results;
        this._applyPoiClientFilters();
        this._poiSourceVehicleId = center.deviceId || null;
        this._poiSourceLat = center.lat;
        this._poiSourceLon = center.lon;
        this._poiSourceCenterKey = center.key;
        this._poiSourceCenterLabel = center.label;
        this._poiError = "";
        this._poiLoading = false;
        this._poiRetryKey = "";
        this._poiRetryCount = 0;
        this._poiLastEndpoint = cached.endpoint || "Browser-Cache";
        this._poiLastSources = Array.isArray(cached.sources) ? cached.sources : [];
        this._poiLastWarnings = Array.isArray(cached.warnings) ? cached.warnings : [];
        this._poiCandidateLimitHit = Boolean(cached.candidateLimitHit);
        this._poiCandidateLimit = Number(cached.candidateLimit || 0);
        this._renderPoiPanel();
        this._renderMap(false);
        return;
      }
    }

    const now = Date.now();
    const earliest = Math.max(this._poiLastNetworkAt + 3000, this._poiBackoffUntil);
    if (now < earliest) {
      this._poiLoading = true;
      const waitSeconds = Math.max(1, Math.ceil((earliest - now) / 1000));
      this._poiError = this._t("POI-Abfrage wird in {seconds} s fortgesetzt …", { seconds: waitSeconds });
      this._renderPoiPanel();
      this._schedulePoiLoad(earliest - now + 100, force);
      return;
    }

    const request = this._poiRequestSnapshot(center, force);
    const requestId = ++this._poiRequestSeq;
    this._poiActiveRequestId = requestId;
    this._poiActiveRequestKey = request.key;
    this._poiRequestInFlight = true;
    this._poiLoading = true;
    this._poiError = "";
    this._renderPoiPanel();
    this._poiLastNetworkAt = Date.now();
    const startedAt = performance?.now ? performance.now() : Date.now();
    let retryDelay = 0;

    try {
      const payload = await this._fetchOverpass(request);
      const stillOwned = this._poiActiveRequestId === requestId && this._poiLifecycleEpoch === request.epoch;
      const stillCurrent = stillOwned && this._currentPoiRequestKey() === request.key;
      if (stillCurrent) {
        const seen = new Set();
        const results = [];
        for (const element of payload?.elements || []) {
          const coords = this._poiCoordinates(element);
          if (!coords) continue;
          const tags = element.tags || {};
          const category = this._poiCategoryForTags(tags);
          if (!category || !request.categories.includes(category)) continue;
          const provider = String(element.provider || tags["cardata:provider"] || "osm");
          const elementType = String(element.type || "");
          const isOsmObject = ["node", "way", "relation"].includes(elementType);
          const id = `${provider}:${elementType || "poi"}:${element.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const poiName = this._poiName(tags, category);
          const operatorIdentity = category === "charging"
            ? String(tags.operator || tags.network || tags.brand || "Ladestation").trim()
            : "";
          results.push({
            id,
            provider,
            sourceLabel: this._poiSourceLabel(element),
            sourceLicense: tags["cardata:data_provider_license"] || null,
            osmType: isOsmObject ? elementType : "",
            osmId: isOsmObject && Number.isFinite(Number(element.id)) ? Number(element.id) : null,
            lat: coords.lat,
            lon: coords.lon,
            category,
            name: poiName,
            address: this._poiAddress(tags),
            operator: tags.operator || null,
            operatorCode: category === "charging" ? this._poiOperatorCode(operatorIdentity) : "",
            operatorColor: category === "charging" ? this._poiOperatorColor(operatorIdentity) : "",
            brand: tags.brand || null,
            network: tags.network || null,
            openingHours: tags.opening_hours || null,
            capacity: tags.capacity || null,
            phone: tags.phone || tags["contact:phone"] || null,
            website: this._safeWebUrl(tags.website || tags["contact:website"] || null),
            access: tags.access || null,
            fee: tags.fee || null,
            connectors: category === "charging" ? this._poiConnectorDetails(tags) : [],
            connectorKeys: category === "charging" ? this._poiConnectorKeys(tags) : [],
            maxPowerKw: category === "charging" ? this._poiChargingPowerKw(tags) : null,
          });
        }
        results.sort((a, b) => this._distanceKm(request.center.lat, request.center.lon, a.lat, a.lon)
          - this._distanceKm(request.center.lat, request.center.lon, b.lat, b.lon));

        if (request.searchFilter) {
          // A targeted explicit refresh augments the broad local candidate pool
          // instead of replacing it. Clearing/changing the text therefore still
          // has useful broad data without another network request.
          const merged = new Map((this._poiRawResults || []).map((poi) => [poi.id, poi]));
          results.forEach((poi) => merged.set(poi.id, poi));
          this._poiRawResults = [...merged.values()].sort((a, b) =>
            this._distanceKm(request.center.lat, request.center.lon, a.lat, a.lon)
            - this._distanceKm(request.center.lat, request.center.lon, b.lat, b.lon)
          ).slice(0, 6000);
        } else {
          this._poiRawResults = results;
        }
        this._poiCandidateLimitHit = Boolean(payload.candidateLimitHit);
        this._poiCandidateLimit = Number(payload.candidateLimit || 0);
        this._applyPoiClientFilters();
        this._poiSourceVehicleId = request.center.deviceId || null;
        this._poiSourceLat = request.center.lat;
        this._poiSourceLon = request.center.lon;
        this._poiSourceCenterKey = request.center.key;
        this._poiSourceCenterLabel = request.center.label;
        this._poiError = "";

        // Only broad category responses populate the reusable browser cache.
        // Targeted text refreshes are deliberately separate and never poison
        // the broad cache used when the user edits or clears the local text.
        if (!request.searchFilter) {
          const cache = this._readPoiCache();
          if (this._poiRawResults.length > 0) {
            cache[request.key] = {
              timestamp: Date.now(),
              results: this._poiRawResults,
              endpoint: this._poiLastEndpoint,
              sources: this._poiLastSources,
              warnings: this._poiLastWarnings,
              candidateLimitHit: this._poiCandidateLimitHit,
              candidateLimit: this._poiCandidateLimit,
            };
          } else {
            delete cache[request.key];
          }
          this._writePoiCache(cache);
        }
        this._poiRetryKey = "";
        this._poiRetryCount = 0;
        this._poiLastSuccessAt = Date.now();
        const localElapsed = (performance?.now ? performance.now() : Date.now()) - startedAt;
        this._poiLastDurationMs = Number.isFinite(payload.elapsedMs) ? payload.elapsedMs : localElapsed;

        if (payload.chargingStatus === "unconfigured" && request.categories.includes("charging")) {
          this._poiError = this._t("Open Charge Map ist noch nicht konfiguriert. Bitte Cardata Analytics unter Geräte & Dienste neu konfigurieren und den API-Key hinterlegen.");
        } else if (payload.chargingStatus === "unavailable" && request.categories.includes("charging")) {
          const details = Array.isArray(payload.warnings) && payload.warnings.length ? ` (${payload.warnings.join(" · ")})` : "";
          this._poiError = this._t("Open Charge Map ist momentan nicht erreichbar und es liegt noch kein passender lokaler Cache vor.{details}", { details });
        }
      }
    } catch (err) {
      const stillOwned = this._poiActiveRequestId === requestId && this._poiLifecycleEpoch === request.epoch;
      const stillCurrent = stillOwned && this._currentPoiRequestKey() === request.key;
      if (stillCurrent) {
        const transient = this._isTransientPoiError(err);
        if (transient) {
          this._poiRetryCount = this._poiRetryKey === request.key ? this._poiRetryCount + 1 : 1;
          this._poiRetryKey = request.key;
        } else {
          this._poiRetryKey = "";
          this._poiRetryCount = 0;
        }
        if (transient && this._poiRetryCount <= this._poiMaxAutoRetries) {
          retryDelay = this._poiRetryCount === 1 ? 2500 : 6000;
          this._poiError = this._t("POI-Dienst vorübergehend nicht erreichbar – neuer Versuch {n}/{max} in {seconds} s …", { n: this._poiRetryCount, max: this._poiMaxAutoRetries, seconds: Math.round(retryDelay / 1000) });
        } else {
          const errorText = err?.message || err;
          this._poiError = (this._poiRawResults || []).length
            ? this._t("POI-Aktualisierung fehlgeschlagen; letzte Ergebnisse bleiben sichtbar: {error}", { error: errorText })
            : this._t("POIs konnten nicht geladen werden: {error}", { error: errorText });
        }
      }
    } finally {
      // Only the request that still owns the active slot may clear it. This also
      // makes disconnect/reconnect safe if an old websocket promise resolves later.
      if (this._poiActiveRequestId === requestId) {
        this._poiActiveRequestId = 0;
        this._poiActiveRequestKey = "";
        this._poiRequestInFlight = false;
      }

      const pendingKey = this._poiPendingRequestKey;
      const pendingForce = this._poiPendingForce;
      this._poiPendingRequestKey = "";
      this._poiPendingForce = false;
      const newestKey = this._currentPoiRequestKey();
      const needsNewest = newestKey && newestKey !== request.key;
      const shouldRetry = retryDelay > 0 && newestKey === request.key;

      if (pendingKey || needsNewest || shouldRetry) {
        this._poiLoading = true;
        // Preserve targeted-search semantics across automatic retries. A failed
        // radius-triggered Burger King/McDonald's query must not silently retry
        // as the much larger unfiltered 100-km category request.
        const nextForce = pendingKey ? pendingForce : (shouldRetry ? request.forceRefresh : false);
        const delay = shouldRetry ? retryDelay : 100;
        this._renderPoiPanel();
        this._renderMap(false);
        this._schedulePoiLoad(delay, nextForce);
      } else {
        this._poiLoading = false;
        this._renderPoiPanel();
        this._renderMap(false);
      }
    }
  }

  async _loadDatabasePreferences() {
    if (!this._hass?.callWS || !this._hass?.user?.id) return;
    const key = `${this._hass.user.id}:${this._storageKey}`;
    if (this._preferencesLoaded === key || this._preferencesLoading === key) return;
    this._preferencesLoading = key;
    const revision = this._preferencesRevision || 0;
    const card = this._storageKey;
    try {
      const result = await this._hass.callWS({ type: "cardata_analytics/preferences/get", card });
      if (`${this._hass.user.id}:${this._storageKey}` !== key) return;
      this._preferencesLoaded = key;
      if (revision === (this._preferencesRevision || 0) && result?.preferences) {
        this._restorePreferences(result.preferences);
        try { localStorage.setItem(card, JSON.stringify(result.preferences)); } catch (_) { /* cache only */ }
        if (this._domBuilt) this._renderFull();
      } else {
        // First visit migrates the browser's preferences; newer local edits win.
        this._savePreferences();
      }
    } catch (_) {
      // A reconnect retries. Never overwrite server preferences after a failed read.
    } finally {
      if (this._preferencesLoading === key) this._preferencesLoading = null;
    }
  }

  _queueDatabasePreferences() {
    if (!this._hass?.callWS || this._preferencesLoaded !== `${this._hass?.user?.id}:${this._storageKey}`) return;
    clearTimeout(this._preferencesTimer);
    this._preferencesTimer = setTimeout(() => this._flushDatabasePreferences(), 1000);
  }

  async _flushDatabasePreferences() {
    if (this._preferencesSaving || !this._pendingDatabasePreferences || !this._hass?.callWS) return;
    const key = `${this._hass?.user?.id}:${this._storageKey}`;
    if (this._preferencesLoaded !== key) return;
    const payload = this._pendingDatabasePreferences;
    this._pendingDatabasePreferences = null;
    this._preferencesSaving = true;
    let saved = false;
    try {
      await this._hass.callWS({ type: "cardata_analytics/preferences/save", card: this._storageKey, preferences: payload });
      saved = true;
    } catch (_) {
      if (`${this._hass?.user?.id}:${this._storageKey}` === key && !this._pendingDatabasePreferences) this._pendingDatabasePreferences = payload;
    } finally {
      this._preferencesSaving = false;
      if (saved && this._pendingDatabasePreferences) this._queueDatabasePreferences();
    }
  }

  _restorePreferences(saved = null) {
    try {
      const raw = saved ? null : localStorage.getItem(this._storageKey);
      if (!saved && !raw) return;
      const data = saved || JSON.parse(raw);
      if (["osm", "osm_detail", "topo", "satellite", "terrain", "gps"].includes(data.mode)) this._mode = data.mode;
      if (["osm", "osm_detail", "topo", "satellite", "terrain"].includes(data.lastFreeMode)) this._lastFreeMode = data.lastFreeMode;
      if (Number.isFinite(Number(data.terrainPitch))) this._terrainPitch = Math.round(Math.max(0, Math.min(75, Number(data.terrainPitch))));
      if (Number.isFinite(Number(data.terrainExaggeration))) this._terrainExaggeration = Math.round(Math.max(1, Math.min(3, Number(data.terrainExaggeration))) * 10) / 10;
      if (Number.isFinite(Number(data.terrainBearing))) this._terrainBearing = this._normalizeTerrainBearing(data.terrainBearing);
      if (typeof data.terrainCompassVisible === "boolean") this._terrainCompassVisible = data.terrainCompassVisible;
      if (typeof data.terrainControlsVisible === "boolean") this._terrainControlsVisible = data.terrainControlsVisible;
      if (Array.isArray(data.trackingSelectedEntries)) this._trackingSelectedEntries = new Set(data.trackingSelectedEntries.map(String));
      if (typeof data.trackingPrimaryEntryId === "string") this._trackingPrimaryEntryId = data.trackingPrimaryEntryId;
      if (["vehicle", "speed", "soc"].includes(data.trackingColorMode)) this._trackingColorMode = data.trackingColorMode;
      if (["newest", "oldest"].includes(data.trackingTripSort)) this._trackingTripSort = data.trackingTripSort;
      if (typeof data.trackingLegendVisible === "boolean") this._trackingLegendVisible = data.trackingLegendVisible;
      if (typeof data.trackingLegendExpanded === "boolean") this._trackingLegendExpanded = data.trackingLegendExpanded;
      if (typeof data.mapScaleVisible === "boolean") this._mapScaleVisible = data.mapScaleVisible;
      if (["free", "north", "heading"].includes(data.trackingCameraMode)) this._trackingCameraMode = data.trackingCameraMode;
      if (typeof data.trackingSkipPauses === "boolean") this._trackingSkipPauses = data.trackingSkipPauses;
      if (this._trackingSpeedOptions().some(([value]) => value === String(data.trackingPlaybackSpeed))) this._trackingPlaybackSpeed = String(data.trackingPlaybackSpeed);
      if (typeof data.trackingStartLocal === "string") this._trackingStartLocal = data.trackingStartLocal;
      if (typeof data.trackingEndLocal === "string") this._trackingEndLocal = data.trackingEndLocal;
      // Old saved ranges remain fixed until a preset or Follow now is chosen.
      this._trackingFollowNow = data.trackingFollowNow === true;
      this._trackingRangePreset = ["today", "24h", "7d", "month"].includes(data.trackingRangePreset) ? data.trackingRangePreset : "custom";
      if (Number.isFinite(data.zoom)) this._zoom = Math.max(2, Math.min(22, Number(data.zoom)));
      if (data.center && Number.isFinite(data.center.lat) && Number.isFinite(data.center.lon)) {
        this._center = { lat: Number(data.center.lat), lon: Number(data.center.lon) };
      }
      if (Array.isArray(data.hiddenVehicles)) this._hiddenVehicles = new Set(data.hiddenVehicles.map(String));
      if (Array.isArray(data.rangeVehicles)) this._rangeVehicles = new Set(data.rangeVehicles.map(String));
      if (data.selectedVehicleId) this._selectedVehicleId = String(data.selectedVehicleId);
      if (Array.isArray(data.poiCategories)) {
        const validPoiKeys = new Set(Object.keys(this._poiDefinitions()));
        this._poiCategories = new Set(data.poiCategories.map(String).filter((key) => validPoiKeys.has(key)));
      }
      if (POI_RADIUS_OPTIONS_KM.includes(Number(data.poiRadiusKm))) this._poiRadiusKm = Number(data.poiRadiusKm);
      if (typeof data.poiSearchText === "string") this._poiSearchText = data.poiSearchText;
      if (Array.isArray(data.poiOperators)) {
        this._poiOperators = this._poiOperatorsFromTemplate({ operators: data.poiOperators });
      } else if (typeof data.poiOperatorText === "string" && data.poiOperatorText.trim()) {
        // One-time preference migration from <= 0.1.44.
        this._poiOperators = this._poiOperatorsFromTemplate({ operator: data.poiOperatorText });
      }
      this._poiOperatorText = "";
      if (["vehicle", "route", "map"].includes(data.poiCenterMode)) this._poiCenterMode = data.poiCenterMode;
      if ([0, 50, 100, 150, 200, 300, 350].includes(Number(data.poiMinPowerKw))) this._poiMinPowerKw = Number(data.poiMinPowerKw);
      if (["any", "ccs", "type2", "chademo", "tesla"].includes(data.poiConnector)) this._poiConnector = data.poiConnector;
      if (typeof data.poiIncludeUnknownPower === "boolean") this._poiIncludeUnknownPower = data.poiIncludeUnknownPower;
      if (typeof data.routeVehicleId === "string" && data.routeVehicleId) this._routeVehicleId = data.routeVehicleId;
      if (["vehicle", "device", "saved", "zone", "address", "map"].includes(data.routeStartMode)) this._routeStartMode = data.routeStartMode;
      this._routeStartPoint = this._normalizeRoutePoint(data.routeStartPoint);
      if (Number.isFinite(Number(data.routeStartUpdatedAt))) this._routeStartUpdatedAt = Number(data.routeStartUpdatedAt);
      if (this._routeStartMode !== "vehicle" && !this._routeStartPoint) this._routeStartMode = "vehicle";
      if (Array.isArray(data.routeWaypoints)) this._routeWaypoints = data.routeWaypoints.map((item) => this._normalizeRoutePoint(item)).filter(Boolean).slice(0, ROUTE_MAX_WAYPOINTS);
      this._routeDestination = this._normalizeRoutePoint(data.routeDestination);
      if (typeof data.routeActiveTemplate === "string") this._routeActiveTemplate = data.routeActiveTemplate;
    } catch (_) { /* ignore invalid browser storage */ }
  }

  _savePreferences() {
    this._preferencesRevision = (this._preferencesRevision || 0) + 1;
    const data = {
        mode: this._mode,
        lastFreeMode: this._lastFreeMode,
        terrainPitch: this._terrainPitch,
        terrainExaggeration: this._terrainExaggeration,
        terrainBearing: this._terrainBearing,
        terrainCompassVisible: this._terrainCompassVisible,
        terrainControlsVisible: this._terrainControlsVisible,
        trackingSelectedEntries: [...this._trackingSelectedEntries],
        trackingPrimaryEntryId: this._trackingPrimaryEntryId,
        trackingColorMode: this._trackingColorMode,
        trackingTripSort: this._trackingTripSort,
        trackingLegendVisible: this._trackingLegendVisible,
        trackingLegendExpanded: this._trackingLegendExpanded,
        mapScaleVisible: this._mapScaleVisible,
        trackingCameraMode: this._trackingCameraMode,
        trackingSkipPauses: this._trackingSkipPauses,
        trackingPlaybackSpeed: this._trackingPlaybackSpeed,
        trackingStartLocal: this._trackingStartLocal,
        trackingEndLocal: this._trackingEndLocal,
        trackingFollowNow: this._trackingFollowNow,
        trackingRangePreset: this._trackingRangePreset,
        zoom: this._zoom,
        center: this._center,
        hiddenVehicles: [...this._hiddenVehicles],
        rangeVehicles: [...this._rangeVehicles],
        selectedVehicleId: this._selectedVehicleId,
        poiCategories: [...this._poiCategories],
        poiRadiusKm: this._poiRadiusKm,
        poiSearchText: this._poiSearchText,
        poiOperators: [...this._poiOperators],
        poiOperatorText: "",
        poiCenterMode: this._poiCenterMode,
        poiMinPowerKw: this._poiMinPowerKw,
        poiConnector: this._poiConnector,
        poiIncludeUnknownPower: this._poiIncludeUnknownPower,
        routeVehicleId: this._routeVehicleId,
        routeStartMode: this._routeStartMode,
        routeStartPoint: this._routeStartPoint,
        routeStartUpdatedAt: this._routeStartUpdatedAt,
        routeWaypoints: this._routeWaypoints,
        routeDestination: this._routeDestination,
        routeActiveTemplate: this._routeActiveTemplate,
    };
    try { localStorage.setItem(this._storageKey, JSON.stringify(data)); } catch (_) { /* cache only */ }
    this._pendingDatabasePreferences = data;
    this._queueDatabasePreferences();
  }

  _renderFull() {
    if (!this.shadowRoot) return;
    if (!this._hass || !this._registryLoaded) {
      this.shadowRoot.innerHTML = `<ha-card><div style="padding:24px;text-align:center;color:var(--secondary-text-color)">${this._esc(this._t("Cardata Analytics wird geladen …"))}</div></ha-card>`;
      this._domBuilt = false;
      return;
    }

    this._updateGpsMotionFromHass();
    const vehicles = this._vehicles();
    if (!this._selectedVehicleId || !vehicles.some((v) => v.deviceId === this._selectedVehicleId && v.valid)) {
      this._selectedVehicleId = vehicles.find((v) => v.valid && !this._hiddenVehicles.has(v.deviceId))?.deviceId
        || vehicles.find((v) => v.valid)?.deviceId
        || null;
    }

    const title = this._config.title || this._t("Cardata Fahrzeugkarte");
    this._destroyVectorBasemap();
    this._tileElements.clear();
    this._tileGenerationKey = null;
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="map-card-shell">
          <div class="map-header">
            <div class="title-wrap">
              <ha-icon icon="mdi:map-marker-multiple"></ha-icon>
              <div><div class="title">${this._esc(title)}</div><div class="subtitle">${this._esc(this._t("Live-Positionen aus Cardata Analytics"))} · v${CARD_VERSION}</div></div>
            </div>
            <button class="icon-btn" id="fullscreen" title="${this._esc(this._t("Vollbild"))}" aria-label="${this._esc(this._t("Vollbild"))}"><ha-icon icon="mdi:fullscreen"></ha-icon></button>
          </div>
          <div class="toolbar">
            <div class="mode-group" role="group" aria-label="${this._esc(this._t("Kartendarstellung"))}">
              <button class="mode-btn" data-mode="osm">OSM</button>
              <button class="mode-btn" data-mode="osm_detail" title="${this._esc(this._t("OSM+ (detailreich)"))}">OSM+</button>
              <button class="mode-btn" data-mode="topo">Topo</button>
              <button class="mode-btn" data-mode="satellite"><ha-icon icon="mdi:satellite-variant"></ha-icon> ${this._esc(this._t("Satellit"))}</button>
              <button class="mode-btn" data-mode="terrain" title="${this._esc(this._t("3D-Gelände"))}"><ha-icon icon="mdi:terrain"></ha-icon> 3D</button>
              <button class="mode-btn" data-mode="gps"><ha-icon icon="mdi:crosshairs-gps"></ha-icon> GPS</button>
            </div>
            <div class="tool-group" role="group" aria-label="${this._esc(this._t("Kartenfunktionen"))}">
              <button class="tool-btn" id="fit" title="${this._esc(this._t("Alle sichtbaren Fahrzeuge einpassen"))}" aria-label="${this._esc(this._t("Alle sichtbaren Fahrzeuge einpassen"))}"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon><span>${this._esc(this._t("Alle"))}</span></button>
              <button class="tool-btn" id="ranges-toggle" title="${this._esc(this._t("Restreichweiten aller Fahrzeuge ein-/ausblenden"))}" aria-label="${this._esc(this._t("Restreichweiten ein- oder ausblenden"))}"><ha-icon icon="mdi:map-marker-radius-outline"></ha-icon><span>${this._esc(this._t("Reichweite"))}</span></button>
              <button class="tool-btn" id="fit-ranges" title="${this._esc(this._t("Alle eingeblendeten Restreichweiten einpassen"))}" aria-label="${this._esc(this._t("Restreichweiten einpassen"))}"><ha-icon icon="mdi:arrow-expand-all"></ha-icon><span>${this._esc(this._t("Bereich"))}</span></button>
              <button class="tool-btn" id="vehicles-toggle" title="${this._esc(this._t("Fahrzeuge ein- oder ausblenden"))}" aria-label="${this._esc(this._t("Fahrzeuge ein- oder ausblenden"))}"><ha-icon icon="mdi:car-multiple"></ha-icon><span>${this._esc(this._t("Fahrzeuge"))}</span></button>
              <button class="tool-btn" id="poi-toggle" title="${this._esc(this._t("Points of Interest in Fahrzeugnähe"))}" aria-label="Points of Interest"><ha-icon icon="mdi:map-marker-radius"></ha-icon><span>POIs</span></button>
              <button class="tool-btn" id="route-toggle" title="${this._esc(this._t("Route mit POI-Zwischenzielen planen"))}" aria-label="${this._esc(this._t("Route planen"))}"><ha-icon icon="mdi:map-marker-path"></ha-icon><span>${this._esc(this._t("Route"))}</span></button>
              <button class="tool-btn" id="tracking-toggle" title="${this._esc(this._t("GPS-Historie"))}" aria-label="${this._esc(this._t("GPS-Historie"))}"><ha-icon icon="mdi:map-marker-path"></ha-icon><span>${this._esc(this._t("Tracking"))}</span></button>
            </div>
          </div>
          <div class="map-wrap">
            <div class="map" id="map" tabindex="0" aria-label="${this._esc(this._t("Fahrzeugkarte"))}" style="--cardata-map-height:${Math.max(330, Math.min(900, Number(this._config.height) || 520))}px">
              <div class="vector-map hidden" id="vector-map"></div>
              <div class="tiles" id="tiles"></div>
              <div class="poi-markers" id="poi-markers"></div>
              <div class="markers" id="markers"></div>
              <div class="map-empty" id="map-empty"></div>
              <div class="zoom-controls">
                <button id="zoom-in" aria-label="${this._esc(this._t("Vergrößern"))}" title="${this._esc(this._t("Vergrößern"))}"><ha-icon icon="mdi:plus"></ha-icon></button>
                <button id="zoom-out" aria-label="${this._esc(this._t("Verkleinern"))}" title="${this._esc(this._t("Verkleinern"))}"><ha-icon icon="mdi:minus"></ha-icon></button>
              </div>
              <div class="terrain-controls hidden" id="terrain-controls" aria-label="${this._esc(this._t("3D-Steuerung"))}">
                <div class="terrain-controls-head">
                  <span><ha-icon icon="mdi:terrain"></ha-icon>${this._esc(this._t("3D-Steuerung"))}</span>
                  <div class="terrain-controls-actions">
                    <button id="terrain-collapse" title="${this._esc(this._t("3D-Steuerung ausblenden"))}" aria-label="${this._esc(this._t("3D-Steuerung ausblenden"))}"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
                    <button id="terrain-north" title="${this._esc(this._t("Nach Norden ausrichten"))}" aria-label="${this._esc(this._t("Nach Norden ausrichten"))}"><ha-icon icon="mdi:compass"></ha-icon></button>
                    <button id="terrain-reset" title="${this._esc(this._t("3D-Ansicht zurücksetzen"))}" aria-label="${this._esc(this._t("3D-Ansicht zurücksetzen"))}"><ha-icon icon="mdi:restore"></ha-icon></button>
                  </div>
                </div>
                <label class="terrain-control-row" for="terrain-pitch">
                  <span>${this._esc(this._t("Neigung"))}</span><output id="terrain-pitch-value">${Math.round(this._terrainPitch)}°</output>
                  <input id="terrain-pitch" type="range" min="0" max="75" step="1" value="${Math.round(this._terrainPitch)}">
                </label>
                <label class="terrain-control-row" for="terrain-exaggeration">
                  <span>${this._esc(this._t("Geländeüberhöhung"))}</span><output id="terrain-exaggeration-value">${this._esc(this._formatNumber(this._terrainExaggeration, 1))}×</output>
                  <input id="terrain-exaggeration" type="range" min="1" max="3" step="0.1" value="${this._terrainExaggeration}">
                </label>
                <label class="terrain-control-row" for="terrain-bearing">
                  <span>${this._esc(this._t("Drehung"))}</span><output id="terrain-bearing-value">${Math.round(this._terrainBearing)}°</output>
                  <input id="terrain-bearing" type="range" min="0" max="360" step="1" value="${Math.round(this._terrainBearing)}">
                </label>
                <div class="terrain-toggle-row">
                  <span>${this._esc(this._t("Kompass anzeigen"))}</span>
                  <button id="terrain-compass-toggle" aria-pressed="${this._terrainCompassVisible ? "true" : "false"}">${this._esc(this._t(this._terrainCompassVisible ? "Ein" : "Aus"))}</button>
                </div>
                <div class="terrain-dem-status" title="${this._esc(this._t("Höhe am Kartenmittelpunkt"))}">
                  <span>${this._esc(this._t("DEM-Höhe"))}</span><output id="terrain-dem-elevation">${this._esc(this._t("DEM wird geladen …"))}</output>
                </div>
              </div>
              <button class="terrain-panel-toggle hidden" id="terrain-panel-toggle" title="${this._esc(this._t("3D-Steuerung einblenden"))}" aria-label="${this._esc(this._t("3D-Steuerung einblenden"))}"><ha-icon icon="mdi:tune-variant"></ha-icon><span>3D</span></button>
              <button class="terrain-compass hidden" id="terrain-compass" title="${this._esc(this._t("Nach Norden ausrichten"))}" aria-label="${this._esc(this._t("Nach Norden ausrichten"))}">
                <span class="terrain-compass-letter">N</span><span class="terrain-compass-needle" id="terrain-compass-needle">▲</span>
              </button>
              <div class="attribution" id="attribution"></div>
              <div class="vehicle-panel hidden" id="vehicle-panel"></div>
              <div class="poi-panel hidden" id="poi-panel"></div>
              <div class="route-panel hidden" id="route-panel"></div>
              <div class="tracking-panel hidden" id="tracking-panel"></div>
              <div class="tracking-legend hidden" id="tracking-legend"></div>
              <div class="popup hidden" id="popup"></div>
              <div class="poi-popup hidden" id="poi-popup"></div>
            </div>
          </div>
        </div>
      </ha-card>`;

    this._wireEvents();
    this._domBuilt = true;
    this._lastStructureSignature = this._structureSignature();
    this._lastStateSignature = this._stateSignature();

    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._renderMap());
      this._resizeObserver.observe(this.shadowRoot.getElementById("map"));
    }

    requestAnimationFrame(() => {
      if (!this._mapInitialized && this._visibleVehicles().length) {
        this._fitVisibleVehicles(false);
        this._mapInitialized = true;
      } else {
        this._renderMap();
      }
      this._updateControls();
      this._renderVehiclePanel();
      this._renderPoiPanel();
      this._renderRoutePanel();
      this._renderTrackingPanel();
      if (this._poiCategories.size) this._schedulePoiLoad(300, false);
    });
  }

  _wireEvents() {
    this.shadowRoot.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => this._setMode(btn.dataset.mode));
    });
    this.shadowRoot.getElementById("zoom-in")?.addEventListener("click", () => this._changeZoom(1));
    this.shadowRoot.getElementById("zoom-out")?.addEventListener("click", () => this._changeZoom(-1));
    const terrainPitch = this.shadowRoot.getElementById("terrain-pitch");
    const terrainExaggeration = this.shadowRoot.getElementById("terrain-exaggeration");
    const terrainBearing = this.shadowRoot.getElementById("terrain-bearing");
    terrainPitch?.addEventListener("input", () => this._setTerrainPitch(terrainPitch.value, { save: false }));
    terrainPitch?.addEventListener("change", () => this._setTerrainPitch(terrainPitch.value, { save: true }));
    terrainExaggeration?.addEventListener("input", () => this._setTerrainExaggeration(terrainExaggeration.value, { save: false }));
    terrainExaggeration?.addEventListener("change", () => this._setTerrainExaggeration(terrainExaggeration.value, { save: true }));
    terrainBearing?.addEventListener("input", () => this._setTerrainBearing(terrainBearing.value, { save: false }));
    terrainBearing?.addEventListener("change", () => this._setTerrainBearing(terrainBearing.value, { save: true }));
    this.shadowRoot.getElementById("terrain-compass-toggle")?.addEventListener("click", () => this._setTerrainCompassVisible(!this._terrainCompassVisible));
    this.shadowRoot.getElementById("terrain-collapse")?.addEventListener("click", () => this._setTerrainControlsVisible(false));
    this.shadowRoot.getElementById("terrain-panel-toggle")?.addEventListener("click", () => this._setTerrainControlsVisible(true));
    this.shadowRoot.getElementById("terrain-north")?.addEventListener("click", () => this._setTerrainBearing(0, { save: true, animate: true }));
    this.shadowRoot.getElementById("terrain-compass")?.addEventListener("click", () => this._setTerrainBearing(0, { save: true, animate: true }));
    this.shadowRoot.getElementById("terrain-reset")?.addEventListener("click", () => this._resetTerrainControls());
    this.shadowRoot.getElementById("fit")?.addEventListener("click", () => this._fitVisibleVehicles(true));
    this.shadowRoot.getElementById("ranges-toggle")?.addEventListener("click", () => this._toggleAllRanges());
    this.shadowRoot.getElementById("fit-ranges")?.addEventListener("click", () => this._fitVisibleRanges(true));
    this.shadowRoot.getElementById("vehicles-toggle")?.addEventListener("click", () => {
      this.shadowRoot.getElementById("poi-panel")?.classList.add("hidden");
      this.shadowRoot.getElementById("route-panel")?.classList.add("hidden");
      this.shadowRoot.getElementById("tracking-panel")?.classList.add("hidden");
      this._cancelRouteMapPick();
      this.shadowRoot.getElementById("vehicle-panel")?.classList.toggle("hidden");
    });
    this.shadowRoot.getElementById("poi-toggle")?.addEventListener("click", () => {
      this.shadowRoot.getElementById("vehicle-panel")?.classList.add("hidden");
      this.shadowRoot.getElementById("route-panel")?.classList.add("hidden");
      this.shadowRoot.getElementById("tracking-panel")?.classList.add("hidden");
      this._cancelRouteMapPick();
      const panel = this.shadowRoot.getElementById("poi-panel");
      panel?.classList.toggle("hidden");
      if (panel && !panel.classList.contains("hidden")) {
        this._renderPoiPanel();
        this._loadGlobalPoiTemplates(true);
      }
    });
    this.shadowRoot.getElementById("route-toggle")?.addEventListener("click", () => {
      this.shadowRoot.getElementById("vehicle-panel")?.classList.add("hidden");
      this.shadowRoot.getElementById("poi-panel")?.classList.add("hidden");
      this.shadowRoot.getElementById("tracking-panel")?.classList.add("hidden");
      const panel = this.shadowRoot.getElementById("route-panel");
      panel?.classList.toggle("hidden");
      if (panel && !panel.classList.contains("hidden")) {
        this._loadGlobalRouteData(true);
        this._renderRoutePanel();
      }
      else this._cancelRouteMapPick();
      this._updateControls();
    });
    this.shadowRoot.getElementById("tracking-toggle")?.addEventListener("click", () => {
      this.shadowRoot.getElementById("vehicle-panel")?.classList.add("hidden");
      this.shadowRoot.getElementById("poi-panel")?.classList.add("hidden");
      this.shadowRoot.getElementById("route-panel")?.classList.add("hidden");
      this._cancelRouteMapPick();
      const panel = this.shadowRoot.getElementById("tracking-panel");
      panel?.classList.toggle("hidden");
      if (panel && !panel.classList.contains("hidden")) {
        this._ensureTrackingRange();
        this._loadTrackingStatus(true).then(() => {
          if (this.isConnected && this._trackingFollowNow && !this._trackingSelectedTrip) {
            this._loadTrackingTrack({ background: Boolean(this._trackingResult) });
          }
        });
        this._renderTrackingPanel();
      }
      this._updateControls();
    });
    this.shadowRoot.getElementById("fullscreen")?.addEventListener("click", () => this._toggleFullscreen());

    const lifecycleSignal = this._eventSignal();
    document.addEventListener("fullscreenchange", () => {
      // Native fullscreen is only kept for compatibility with an already active
      // browser fullscreen session. Cardata itself uses persistent CSS fullscreen.
      this._updateFullscreenIcon();
      setTimeout(() => this._resizeMapAfterFullscreenChange(), 60);
    }, { signal: lifecycleSignal });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this._pseudoFullscreen) {
        this.classList.add("pseudo-fullscreen");
        setTimeout(() => this._resizeMapAfterFullscreenChange(), 80);
      }
    }, { signal: lifecycleSignal });
    window.addEventListener("pageshow", () => {
      if (this._pseudoFullscreen) {
        this.classList.add("pseudo-fullscreen");
        setTimeout(() => this._resizeMapAfterFullscreenChange(), 80);
      }
    }, { signal: lifecycleSignal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this._pseudoFullscreen && !document.fullscreenElement) {
        event.preventDefault();
        this._setPseudoFullscreen(false);
      }
    }, { signal: lifecycleSignal });
  }

  _eventSignal() {
    if (this._eventController) this._eventController.abort();
    this._eventController = new AbortController();
    return this._eventController.signal;
  }

  _toLocalDatetimeValue(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  _ensureTrackingRange() {
    if (!this._trackingStartLocal || !this._trackingEndLocal) {
      this._trackingRangePreset = "24h";
      this._trackingFollowNow = true;
    } else if (!this._trackingFollowNow) return;
    const end = new Date();
    let start = null;
    if (this._trackingRangePreset === "today") start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    else if (this._trackingRangePreset === "24h") start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    else if (this._trackingRangePreset === "7d") start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (this._trackingRangePreset === "month") start = new Date(end.getFullYear(), end.getMonth(), 1);
    if (start) this._trackingStartLocal = this._toLocalDatetimeValue(start);
    this._trackingEndLocal = this._toLocalDatetimeValue(end);
  }

  _trackingRangeIso() {
    this._ensureTrackingRange();
    const start = new Date(this._trackingStartLocal);
    // Follow now includes the current seconds, not just the displayed minute.
    const end = this._trackingFollowNow ? new Date() : new Date(this._trackingEndLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error(this._t("Ungültiger Zeitraum: Das Von-Datum liegt nach dem Bis-Datum."));
    }
    return { start: start.toISOString(), end: end.toISOString() };
  }

  _setTrackingPreset(kind) {
    this._trackingRangePreset = kind;
    this._trackingFollowNow = true;
    this._ensureTrackingRange();
    this._clearTrackingResult();
    this._savePreferences();
    this._renderTrackingPanel();
    this._loadTrackingTrack();
  }

  _clearTrackingResult() {
    this._trackingCameraActive = false;
    this._trackingPlaybackEngaged = false;
    this._trackingDetailsVersion += 1;
    this._trackingTripDetails = null;
    this._trackingQueryVersion += 1;
    this._trackingSelectedTrip = null;
    this._trackingResult = null;
    this._stopTrackingPlayback(false);
    this._trackingPlaybackFlat = [];
    this._trackingPlaybackPoint = null;
    this._trackingPlaybackIndex = 0;
    this._trackingPopupMaplibre?.remove();
    this._trackingPopupMaplibre = null;
    this._syncTrackingMapSource();
  }

  _trackingPanelEditing() {
    const panel = this.shadowRoot?.getElementById("tracking-panel");
    const active = this.shadowRoot?.activeElement;
    return Boolean(panel?.contains(active) && (active?.tagName === "SELECT" || ["datetime-local", "range"].includes(active?.type)));
  }

  _startTrackingRefresh() {
    if (this._trackingRefreshTimer) return;
    this._trackingRefreshTimer = setInterval(() => this._refreshTracking(), 15000);
  }

  async _refreshTracking() {
    const panel = this.shadowRoot?.getElementById("tracking-panel");
    if (!this.isConnected || document.hidden || !panel || panel.classList.contains("hidden") ||
        this._trackingRefreshing || this._trackingLoading || this._trackingPlaybackRunning || this._trackingPanelEditing()) return;
    this._trackingRefreshing = true;
    try {
      await this._loadTrackingStatus(true, true);
      // A chosen historical trip stays frozen while inspected or played back.
      if (this._trackingFollowNow && !this._trackingSelectedTrip && !this._trackingPlaybackEngaged && !this._trackingPanelEditing()) {
        await this._loadTrackingTrack({ background: true });
      }
    } finally {
      this._trackingRefreshing = false;
    }
  }

  async _loadTrackingStatus(force = false, quiet = false) {
    if (!this._hass?.callWS || this._trackingStatusLoading || (this._trackingStatus && !force)) return;
    this._trackingStatusLoading = true;
    try {
      this._trackingStatus = await this._hass.callWS({ type: "cardata_analytics/tracking/status" });
      const gps = (this._trackingStatus?.vehicles || []).filter((v) => v.gps_configured);
      const validIds = new Set(gps.map((v) => String(v.entry_id)));
      this._trackingSelectedEntries = new Set([...this._trackingSelectedEntries].filter((id) => validIds.has(id)));
      if (!this._trackingPrimaryEntryId || !validIds.has(this._trackingPrimaryEntryId)) {
        this._trackingPrimaryEntryId = gps.find((v) => v.enabled)?.entry_id || gps[0]?.entry_id || "";
      }
      if (!this._trackingSelectedEntries.size && this._trackingPrimaryEntryId) this._trackingSelectedEntries.add(this._trackingPrimaryEntryId);
      this._savePreferences();
    } catch (err) {
      console.warn("[Cardata Analytics] tracking status failed", err);
      this._trackingMessage = this._t("Tracking-Einstellungen konnten nicht geladen werden.");
    } finally {
      this._trackingStatusLoading = false;
      if (!quiet || !this._trackingPanelEditing()) this._renderTrackingPanel();
    }
  }

  _trackingColorForEntry(entryId) {
    const group = this._vehicleGroups().find((v) => v.entryId === entryId);
    return this._vehicleColor(group?.deviceId || entryId);
  }

  _trackingLineColor(entryId, point) {
    if (this._trackingColorMode === "vehicle") return this._trackingColorForEntry(entryId);
    const raw = point?.[this._trackingColorMode];
    const value = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(value) || value < 0 || (this._trackingColorMode === "soc" && value > 100)) return "#888888";
    return this._trackingColorBands().find((band) => band.accept(value))?.color || "#888888";
  }

  _trackingColorBands() {
    if (this._trackingColorMode === "speed") return [
      { label: "0–30 km/h", color: "#4477aa", accept: (v) => v <= 30 },
      { label: ">30–60 km/h", color: "#228833", accept: (v) => v <= 60 },
      { label: ">60–100 km/h", color: "#ccbb44", accept: (v) => v <= 100 },
      { label: ">100–130 km/h", color: "#ee7733", accept: (v) => v <= 130 },
      { label: ">130 km/h", color: "#d64545", accept: () => true },
    ];
    if (this._trackingColorMode === "soc") return [
      { label: "0–<25 %", color: "#c62828", accept: (v) => v < 25 },
      { label: "25–<50 %", color: "#f9a825", accept: (v) => v < 50 },
      { label: "50–<75 %", color: "#7cb342", accept: (v) => v < 75 },
      { label: "75–100 %", color: "#2e7d32", accept: () => true },
    ];
    return [];
  }

  _renderTrackingLegend() {
    const legend = this.shadowRoot?.getElementById("tracking-legend");
    if (!legend) return;
    const vehicles = this._trackingVisibleVehicles().filter((v) => v.segments?.some((s) => s.length >= 2));
    if (!this._trackingLegendVisible || !vehicles.length) { legend.classList.add("hidden"); return; }
    legend.classList.remove("hidden");
    const bands = this._trackingColorMode === "vehicle"
      ? vehicles.map((v) => ({ label: v.name, color: this._trackingColorForEntry(v.entry_id) }))
      : [...this._trackingColorBands(), { label: this._t("Keine Daten"), color: "#888888" }];
    const title = this._trackingColorMode === "soc" ? "SoC" : this._t(this._trackingColorMode === "speed" ? "Geschwindigkeit" : "Fahrzeugfarbe");
    legend.innerHTML = `<button id="tracking-legend-toggle" aria-expanded="${this._trackingLegendExpanded}">${this._esc(this._t("Legende"))}: ${this._esc(title)} ${this._trackingLegendExpanded ? "▾" : "▸"}</button>${this._trackingLegendExpanded ? `<div class="tracking-legend-bands">${bands.map((b) => `<div><span class="tracking-swatch" style="background:${this._esc(b.color)}"></span><span>${this._esc(b.label)}</span></div>`).join("")}</div>` : ""}`;
    legend.querySelector("#tracking-legend-toggle")?.addEventListener("click", () => { this._trackingLegendExpanded = !this._trackingLegendExpanded; this._savePreferences(); this._renderTrackingLegend(); });
  }

  _syncMapScale() {
    const map = this._vectorMap;
    if (!map) return;
    if (this._mapScaleVisible && !this._mapScaleControl && this._maplibreLib?.ScaleControl) {
      this._mapScaleControl = new this._maplibreLib.ScaleControl({ maxWidth: 120, unit: "metric" });
      map.addControl(this._mapScaleControl, "bottom-left");
    } else if (!this._mapScaleVisible && this._mapScaleControl) {
      map.removeControl(this._mapScaleControl);
      this._mapScaleControl = null;
    }
  }

  async _setTrackingVehicleSettings(entryId, enabled, retentionDays) {
    if (!this._hass?.callWS) return;
    try {
      await this._hass.callWS({
        type: "cardata_analytics/tracking/settings",
        entry_id: entryId,
        enabled: Boolean(enabled),
        retention_days: Number(retentionDays),
      });
      await this._loadTrackingStatus(true);
    } catch (err) {
      this._trackingMessage = String(err?.message || err);
      this._renderTrackingPanel();
    }
  }

  async _loadTrackingTrack({ background = false } = {}) {
    if (!this._hass?.callWS || this._trackingLoading) return;
    const ids = [...this._trackingSelectedEntries];
    if (!ids.length && this._trackingPrimaryEntryId) ids.push(this._trackingPrimaryEntryId);
    if (!ids.length) return;
    if (background && (this._trackingSelectedTrip || this._trackingPlaybackRunning || this._trackingPlaybackEngaged)) return;
    const queryVersion = this._trackingQueryVersion;
    this._trackingLoading = true;
    if (!background) {
      this._trackingSelectedTrip = null;
      this._trackingMessage = "";
      this._stopTrackingPlayback(false);
      this._renderTrackingPanel();
    }
    try {
      const range = this._trackingRangeIso();
      const result = await this._hass.callWS({
        type: "cardata_analytics/tracking/query",
        entry_ids: ids,
        start: range.start,
        end: range.end,
        max_points: 16000,
      });
      if (queryVersion !== this._trackingQueryVersion || !this.isConnected || (background && (this._trackingPlaybackRunning || this._trackingPlaybackEngaged))) return;
      this._trackingResult = result;
      const total = (this._trackingResult?.vehicles || []).reduce((sum, v) => sum + Number(v.point_count || 0), 0);
      if (!total) this._trackingMessage = this._t("Keine Tracking-Daten im gewählten Zeitraum.");
      else if (this._trackingMessage === this._t("Keine Tracking-Daten im gewählten Zeitraum.")) this._trackingMessage = "";
      this._prepareTrackingPlayback();
      if (!background) this._fitTrackingTracks();
    } catch (err) {
      console.warn("[Cardata Analytics] tracking query failed", err);
      this._trackingMessage = this._t("Track konnte nicht geladen werden.") + ` ${err?.message || err}`;
    } finally {
      this._trackingLoading = false;
      if (!background || !this._trackingPanelEditing()) this._renderTrackingPanel();
    }
  }

  async _importTrackingRecorder() {
    if (!this._hass?.callWS || !this._trackingPrimaryEntryId || this._trackingLoading) return;
    this._trackingLoading = true;
    this._trackingMessage = this._t("Import aus Home Assistant Recorder");
    this._renderTrackingPanel();
    try {
      const range = this._trackingRangeIso();
      const result = await this._hass.callWS({
        type: "cardata_analytics/tracking/import_recorder",
        entry_id: this._trackingPrimaryEntryId,
        start: range.start,
        end: range.end,
      });
      const importedMessage = [
        this._t("Recorder-Import für {vehicle}", { vehicle: result?.vehicle_name || this._trackingPrimaryEntryId }),
        `${this._formatTrackingDateTime(range.start)} → ${this._formatTrackingDateTime(range.end)}`,
        this._t("{inserted} neu gespeichert · {existing} bereits vorhanden · {filtered} herausgefiltert.", {
          inserted: Number(result?.inserted || 0), existing: Number(result?.already_stored || 0), filtered: Number(result?.filtered || 0),
        }),
        result?.stored ? this._t("Datenbank geprüft: {total} GPS-Punkte im Importzeitraum, davon {imported} aus Recorder-Importen.", {
          total: Number(result.stored.point_count || 0), imported: Number(result.stored.imported_point_count || 0),
        }) : "",
        !result?.candidates ? this._t("Keine verwertbaren GPS-Punkte im Recorder-Zeitraum gefunden.") : "",
      ].filter(Boolean).join("\n");
      await this._loadTrackingStatus(true);
      // Allow the normal track query to run after the import. Keeping the
      // import's loading flag set here would make _loadTrackingTrack() return
      // immediately and leave the map showing stale pre-import data.
      this._trackingLoading = false;
      await this._loadTrackingTrack();
      this._trackingMessage = importedMessage;
    } catch (err) {
      this._trackingMessage = String(err?.message || err);
    } finally {
      this._trackingLoading = false;
      this._renderTrackingPanel();
    }
  }

  async _downloadTrackingGpx(tripIndex = null) {
    if (!this._hass?.callWS || !this._trackingPrimaryEntryId) return;
    try {
      const selectedIndex = Number.isInteger(tripIndex) ? tripIndex : this._trackingSelectedTrip?.index;
      const trip = this._trackingVehicleResult()?.trips?.find((item) => item.index === selectedIndex);
      // Export the loaded selection, even if the live window has advanced.
      // Exact trip bounds avoid index drift after another client imports data.
      const range = trip || this._trackingResult || this._trackingRangeIso();
      const request = {
        type: "cardata_analytics/tracking/gpx",
        entry_id: this._trackingPrimaryEntryId,
        start: range.start,
        end: range.end,
      };
      const result = await this._hass.callWS(request);
      const blob = new Blob([String(result?.content || "")], { type: "application/gpx+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = String(result?.filename || "cardata-track.gpx");
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      this._trackingMessage = this._t("GPX konnte nicht erstellt werden.") + ` ${err?.message || err}`;
      this._renderTrackingPanel();
    }
  }

  async _deleteTrackingRange() {
    if (!this._hass?.callWS) return;
    const ids = [...this._trackingSelectedEntries];
    if (!ids.length && this._trackingPrimaryEntryId) ids.push(this._trackingPrimaryEntryId);
    if (!ids.length || !window.confirm(this._t("Tracking-Daten in diesem Zeitraum wirklich löschen?"))) return;
    try {
      const range = this._trackingRangeIso();
      const result = await this._hass.callWS({ type: "cardata_analytics/tracking/delete", entry_ids: ids, start: range.start, end: range.end });
      this._trackingMessage = `${Number(result?.deleted || 0)} ${this._t("GPS-Punkte")}`;
      this._clearTrackingResult();
      await this._loadTrackingStatus(true);
    } catch (err) {
      this._trackingMessage = String(err?.message || err);
    }
    this._renderTrackingPanel();
  }

  async _deleteAllTrackingForPrimary() {
    if (!this._hass?.callWS || !this._trackingPrimaryEntryId) return;
    if (!window.confirm(this._t("Alle Tracking-Daten löschen") + "?")) return;
    try {
      const result = await this._hass.callWS({ type: "cardata_analytics/tracking/delete", entry_ids: [this._trackingPrimaryEntryId] });
      this._trackingMessage = `${Number(result?.deleted || 0)} ${this._t("GPS-Punkte")}`;
      this._clearTrackingResult();
      await this._loadTrackingStatus(true);
    } catch (err) {
      this._trackingMessage = String(err?.message || err);
    }
    this._renderTrackingPanel();
  }

  _trackingVehicleResult(entryId = this._trackingPrimaryEntryId) {
    return (this._trackingResult?.vehicles || []).find((v) => String(v.entry_id) === String(entryId)) || null;
  }

  _trackingVisibleVehicles() {
    const selected = this._trackingSelectedTrip;
    if (selected) {
      const vehicle = this._trackingVehicleResult(selected.entryId);
      const trip = vehicle?.trips?.find((item) => item.index === selected.index);
      const segment = vehicle?.segments?.[selected.index];
      if (!trip || !segment || segment.length < 2) return [];
      return [{ ...vehicle, ...trip, trip_count: 1, segments: [segment] }];
    }
    // Isolated observations remain stored/exportable but are not driving tracks.
    return (this._trackingResult?.vehicles || []).map((vehicle) => ({
      ...vehicle, segments: (vehicle.segments || []).filter((segment) => segment.length >= 2),
    }));
  }

  _selectTrackingTrip(entryId, index) {
    const vehicle = this._trackingVehicleResult(entryId);
    if (!vehicle?.trips?.some((trip) => trip.index === index && trip.point_count >= 2)) return;
    this._trackingQueryVersion += 1;
    this._trackingSelectedTrip = { entryId, index };
    this._trackingTripDetails = null;
    this._stopTrackingPlayback(false);
    this._trackingPopupMaplibre?.remove();
    this._trackingPopupMaplibre = null;
    this._prepareTrackingPlayback();
    this._fitTrackingTracks();
    this._renderTrackingPanel();
    this._loadTrackingTripDetails();
  }

  async _loadTrackingTripDetails() {
    const selected = this._trackingSelectedTrip;
    const trip = this._trackingVehicleResult(selected?.entryId)?.trips?.find((item) => item.index === selected?.index);
    if (!selected || !trip || !this._hass?.callWS) return;
    const version = ++this._trackingDetailsVersion;
    this._trackingTripDetails = { energy_status: "loading" };
    this._renderTrackingPanel();
    try {
      const details = await this._hass.callWS({ type: "cardata_analytics/tracking/trip_details", entry_id: selected.entryId, start: trip.start, end: trip.end });
      if (version !== this._trackingDetailsVersion || this._trackingSelectedTrip !== selected || !this.isConnected) return;
      this._trackingTripDetails = details;
    } catch (_) {
      if (version !== this._trackingDetailsVersion || this._trackingSelectedTrip !== selected || !this.isConnected) return;
      this._trackingTripDetails = { energy_status: "unavailable" };
    }
    this._renderTrackingPanel();
  }

  _trackingEnergySummary(trip) {
    if (!this._trackingSelectedTrip || !trip) return "";
    const details = this._trackingTripDetails || {};
    const format = (value, decimals, unit) => value != null && Number.isFinite(Number(value)) ? `${this._formatNumber(value, decimals)} ${unit}` : "–";
    const messages = {
      loading: "Vorhandene Verbrauchsdaten werden geladen …",
      available: "Verbrauch aus dem gespeicherten Analytics-Energiezähler im Fahrtzeitraum.",
      history_missing: "Für diese Fahrt fehlt der zeitliche Verlauf des Analytics-Energiezählers. Tageswerte können keiner einzelnen Fahrt zugeordnet werden.",
      history_gap: "Der Analytics-Verlauf enthält eine Datenlücke. Der Fahrtverbrauch ist nicht eindeutig verfügbar.",
      counter_changed: "Im Fahrtzeitraum wurde der Energiezähler korrigiert oder zurückgesetzt. Der Fahrtverbrauch ist nicht eindeutig verfügbar.",
      repaired_day: "Für diesen Tag wurde eine SoC-Korrektur angewendet. Der korrigierte Tagesverbrauch lässt sich dieser Fahrt nicht eindeutig zuordnen.",
      unavailable: "Verbrauchsdaten konnten nicht geladen werden. Fahrt erneut auswählen, um es noch einmal zu versuchen.",
    };
    return `<div class="tracking-summary tracking-energy"><div>${this._esc(this._t("Start-SoC"))}<b>${format(trip.start_soc, 1, "%")}</b></div><div>${this._esc(this._t("End-SoC"))}<b>${format(trip.end_soc, 1, "%")}</b></div><div>${this._esc(this._t("Verbrauchte Energie"))}<b>${format(details.energy_kwh, 2, "kWh")}</b></div><div>${this._esc(this._t("Ø Verbrauch"))}<b>${format(details.average_kwh_100km, 1, "kWh/100 km")}</b></div></div><div class="tracking-message">${this._esc(this._t(messages[details.energy_status] || messages.loading))}${details.energy_status === "available" ? ` ${this._esc(this._t("Berechnungsstrecke (Kilometerzähler)"))}: ${format(details.analytics_distance_km, 1, "km")}.` : ""}</div>`;
  }

  _trackingSpeedOptions() {
    return [["duration:30", this._t("Gesamte Auswahl in 30 s")], ["duration:60", this._t("Gesamte Auswahl in 1 min")], ["duration:120", this._t("Gesamte Auswahl in 2 min")], ...[1,5,10,30,60,120,300,600,1200,3000].map((v) => [String(v), `${v}×`])];
  }

  _prepareTrackingPlayback() {
    this._stopTrackingPlayback(false);
    this._trackingPlaybackEngaged = false;
    this._trackingCameraActive = false;
    this._trackingCameraBearing = null;
    const vehicle = this._trackingVisibleVehicles().find((v) => String(v.entry_id) === String(this._trackingPrimaryEntryId));
    this._trackingPlaybackFlat = [];
    for (const [segmentIndex, segment] of (vehicle?.segments || []).entries()) {
      for (const point of segment || []) this._trackingPlaybackFlat.push({ ...point, segmentIndex });
    }
    this._buildTrackingTimeline();
    this._trackingPlaybackIndex = 0;
    this._trackingPlaybackPosition = 0;
    this._trackingPlaybackPoint = this._trackingPlaybackFlat[0] || null;
    this._syncTrackingMapSource();
  }

  _buildTrackingTimeline() {
    const points = this._trackingPlaybackFlat || [];
    let time = 0;
    this._trackingPlaybackTimeline = points.map((point, i) => {
      if (i) {
        const previous = points[i - 1];
        const gap = Math.max(0, Date.parse(point.ts) - Date.parse(previous.ts));
        if (!this._trackingSkipPauses || point.segmentIndex === previous.segmentIndex) time += gap;
      }
      return time;
    });
  }

  _setTrackingPlaybackIndex(index) {
    const points = this._trackingPlaybackFlat || [];
    if (!points.length) return;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(Number(index) || 0)));
    this._setTrackingPlaybackPosition(this._trackingPlaybackTimeline[i] || 0);
  }

  _setTrackingPlaybackPosition(position) {
    const points = this._trackingPlaybackFlat || [], times = this._trackingPlaybackTimeline || [];
    if (!points.length) return;
    this._trackingPlaybackEngaged = true;
    const target = Math.max(0, Math.min(times.at(-1) || 0, Number(position) || 0));
    this._trackingPlaybackPosition = target;
    let low = 0, high = times.length;
    while (low < high) { const mid = (low + high) >>> 1; if (times[mid] <= target) low = mid + 1; else high = mid; }
    const index = Math.max(0, low - 1), from = points[index], to = points[index + 1];
    this._trackingPlaybackIndex = index;
    // Interpolation is visual only and never crosses a stored trip boundary.
    let current = from;
    if (to && from.segmentIndex === to.segmentIndex && times[index + 1] > times[index]) {
      const t = (target - times[index]) / (times[index + 1] - times[index]);
      const lonDelta = ((Number(to.lon) - Number(from.lon) + 540) % 360) - 180;
      current = { ...from, lat: Number(from.lat) + (Number(to.lat) - Number(from.lat)) * t,
        lon: ((Number(from.lon) + lonDelta * t + 540) % 360) - 180,
        ts: new Date(Date.parse(from.ts) + (Date.parse(to.ts) - Date.parse(from.ts)) * t).toISOString() };
    }
    this._trackingPlaybackPoint = current;
    const slider = this.shadowRoot?.getElementById("tracking-play-slider");
    if (slider) slider.value = String(target);
    const label = this.shadowRoot?.getElementById("tracking-play-time");
    if (label) label.textContent = this._formatTrackingDateTime(current.ts);
    this._syncTrackingPlaybackMarker();
    this._updateTrackingCamera();
  }

  _trackingPlaybackRate() {
    const setting = String(this._trackingPlaybackSpeed);
    if (setting.startsWith("duration:")) return Math.max(1, this._trackingPlaybackTimeline.at(-1) || 0) / (Number(setting.split(":")[1]) * 1000);
    return Math.max(1, Number(setting) || 30);
  }

  _startTrackingPlayback() {
    const points = this._trackingPlaybackFlat || [];
    if (points.length < 2 || this._trackingPlaybackRunning) return;
    if (this._trackingPlaybackPosition >= (this._trackingPlaybackTimeline.at(-1) || 0)) this._setTrackingPlaybackPosition(0);
    // Live GPS follow and historical playback must not compete for the camera.
    if (this._mode === "gps") { this._mode = this._lastFreeMode || "osm"; this._updateControls(); }
    this._trackingCameraActive = this._trackingCameraMode !== "free";
    this._trackingPlaybackRunning = true;
    this._trackingPlaybackEngaged = true;
    this._trackingLastFrameTime = performance.now();
    this._updateTrackingCamera(true);
    this._trackingPlaybackTimer = requestAnimationFrame(() => this._tickTrackingPlayback());
    this._renderTrackingPanel();
  }

  _tickTrackingPlayback() {
    this._trackingPlaybackTimer = null;
    if (!this._trackingPlaybackRunning || !this.isConnected) return;
    const now = performance.now();
    const elapsed = Math.max(0, now - this._trackingLastFrameTime);
    this._trackingLastFrameTime = now;
    // Background browser throttling must not silently finish a trip offscreen.
    if (!document.hidden) this._setTrackingPlaybackPosition(this._trackingPlaybackPosition + elapsed * this._trackingPlaybackRate());
    if (this._trackingPlaybackPosition >= (this._trackingPlaybackTimeline.at(-1) || 0)) { this._stopTrackingPlayback(); return; }
    this._trackingPlaybackTimer = requestAnimationFrame(() => this._tickTrackingPlayback());
  }

  _stopTrackingPlayback(render = true) {
    this._trackingPlaybackRunning = false;
    if (this._trackingPlaybackTimer != null) cancelAnimationFrame(this._trackingPlaybackTimer);
    const playButton = this.shadowRoot?.getElementById("tracking-play");
    if (playButton) playButton.textContent = this._t("Abspielen");
    this._trackingPlaybackTimer = null;
    if (render) this._renderTrackingPanel();
  }

  _setTrackingCameraMode(mode) {
    if (!["free", "north", "heading"].includes(mode)) return;
    this._trackingCameraMode = mode;
    this._trackingCameraActive = mode !== "free" && Boolean(this._trackingPlaybackPoint);
    this._trackingCameraBearing = null;
    this._updateTrackingCamera(true);
    this._savePreferences();
    this._renderTrackingPanel();
  }

  _updateTrackingCamera(immediate = false) {
    const map = this._vectorMap, point = this._trackingPlaybackPoint;
    if (!map || !this._mapStyleReady || !point || !this._trackingCameraActive || this._trackingCameraMode === "free") return;
    let desired = 0;
    if (this._trackingCameraMode === "heading") {
      const i = this._trackingPlaybackIndex, points = this._trackingPlaybackFlat;
      let from = points[i], to = points[i + 1];
      if (!to || to.segmentIndex !== from.segmentIndex) { from = points[i - 1]; to = points[i]; }
      desired = this._trackingCameraBearing ?? Number(map.getBearing?.() || 0);
      if (from && to && from.segmentIndex === to.segmentIndex && this._distanceKm(from.lat, from.lon, to.lat, to.lon) >= 0.008) desired = this._bearingDeg(from.lat, from.lon, to.lat, to.lon);
    }
    const now = performance.now();
    const previous = this._trackingCameraBearing ?? Number(map.getBearing?.() || 0);
    const delta = ((desired - previous + 540) % 360) - 180;
    const dt = Math.max(0, Math.min(0.1, (now - (this._trackingCameraTime ?? now)) / 1000));
    const maxTurn = 90 * dt;
    this._trackingCameraBearing = immediate || this._trackingCameraMode === "north" ? desired : previous + Math.max(-maxTurn, Math.min(maxTurn, delta));
    this._trackingCameraTime = now;
    // Preserve zoom and pitch. The playback loop already interpolates position.
    map.jumpTo({ center: [Number(point.lon), Number(point.lat)], bearing: this._trackingCameraBearing });
  }

  _formatTrackingDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  _formatTrackingDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "–";
    return new Intl.DateTimeFormat(this._locale(), { dateStyle: "short", timeStyle: "short" }).format(d);
  }

  _renderTrackingPanel() {
    const panel = this.shadowRoot?.getElementById("tracking-panel");
    if (!panel) return;
    const scrollTop = panel.scrollTop;
    const tripScrollTop = panel.querySelector(".tracking-trip-list")?.scrollTop || 0;
    const focusedId = this.shadowRoot.activeElement?.id;
    this._ensureTrackingRange();
    const vehicles = this._trackingStatus?.vehicles || [];
    const gpsVehicles = vehicles.filter((v) => v.gps_configured);
    const primary = gpsVehicles.find((v) => v.entry_id === this._trackingPrimaryEntryId) || gpsVehicles[0];
    if (primary && !this._trackingPrimaryEntryId) this._trackingPrimaryEntryId = primary.entry_id;
    const resultVehicles = this._trackingVisibleVehicles();
    const totalPoints = resultVehicles.reduce((sum, v) => sum + Number(v.point_count || 0), 0);
    const totalDistance = resultVehicles.reduce((sum, v) => sum + Number(v.distance_km || 0), 0);
    const totalTrips = resultVehicles.reduce((sum, v) => sum + Number(v.trip_count || 0), 0);
    const totalDuration = resultVehicles.reduce((sum, v) => sum + Number(v.duration_seconds || 0), 0);
    const primaryResult = this._trackingVehicleResult();
    const primaryVisible = resultVehicles.find((v) => String(v.entry_id) === String(this._trackingPrimaryEntryId));
    const trips = (primaryResult?.trips || []).filter((trip) => trip.point_count >= 2).sort((a, b) => (this._trackingTripSort === "newest" ? -1 : 1) * (Date.parse(a.start) - Date.parse(b.start) || a.index - b.index));
    panel.innerHTML = `
      <div class="panel-title"><span>${this._esc(this._t("GPS-Historie"))}</span><button id="tracking-close" aria-label="${this._esc(this._t("Schließen"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>
      ${this._trackingStatusLoading && !vehicles.length ? `<div class="tracking-message">${this._esc(this._t("Cardata Analytics wird geladen …"))}</div>` : ""}
      <div class="tracking-grid">
        <label class="tracking-field"><span>${this._esc(this._t("Von"))}</span><input id="tracking-start" type="datetime-local" value="${this._esc(this._trackingStartLocal)}"></label>
        <label class="tracking-field"><span>${this._esc(this._t("Bis"))}</span><input id="tracking-end" type="datetime-local" value="${this._esc(this._trackingEndLocal)}"></label>
        <label class="tracking-field"><span>${this._esc(this._t("Primärfahrzeug"))}</span><select id="tracking-primary">${gpsVehicles.map((v) => `<option value="${this._esc(v.entry_id)}" ${v.entry_id === this._trackingPrimaryEntryId ? "selected" : ""}>${this._esc(v.name)}</option>`).join("")}</select></label>
        <label class="tracking-field"><span>${this._esc(this._t("Darstellung"))}</span><select id="tracking-color"><option value="vehicle" ${this._trackingColorMode === "vehicle" ? "selected" : ""}>${this._esc(this._t("Fahrzeugfarbe"))}</option><option value="speed" ${this._trackingColorMode === "speed" ? "selected" : ""}>${this._esc(this._t("Geschwindigkeit"))}</option><option value="soc" ${this._trackingColorMode === "soc" ? "selected" : ""}>SoC</option></select></label>
      </div>
      <div class="tracking-map-options"><label><input id="tracking-legend-visible" type="checkbox" ${this._trackingLegendVisible ? "checked" : ""}> ${this._esc(this._t("Legende anzeigen"))}</label><label><input id="tracking-scale-visible" type="checkbox" ${this._mapScaleVisible ? "checked" : ""}> ${this._esc(this._t("Maßstab anzeigen"))}</label></div>
      <label class="tracking-live"><input id="tracking-follow-now" type="checkbox" ${this._trackingFollowNow ? "checked" : ""}> ${this._esc(this._t("Bis jetzt (automatisch aktualisieren)"))}</label>
      <div class="tracking-quick"><button data-track-preset="today">${this._esc(this._t("Heute"))}</button><button data-track-preset="24h">${this._esc(this._t("Letzte 24h"))}</button><button data-track-preset="7d">${this._esc(this._t("Letzte 7 Tage"))}</button><button data-track-preset="month">${this._esc(this._t("Dieser Monat"))}</button></div>
      <div class="tracking-vehicles">${gpsVehicles.length ? gpsVehicles.map((v) => {
        const selected = this._trackingSelectedEntries.has(String(v.entry_id));
        const status = this._t("Gespeichert insgesamt: {count} GPS-Punkte", { count: Number(v.point_count || 0).toLocaleString(this._locale()) });
        const sources = this._t("Live: {live} · Recorder-Import: {imported}", { live: Number(v.live_point_count || 0).toLocaleString(this._locale()), imported: Number(v.imported_point_count || 0).toLocaleString(this._locale()) });
        const lastPoint = v.last_ts ? this._t("Letzter GPS-Punkt: {date}", { date: this._formatTrackingDateTime(v.last_ts) }) : this._t("Noch keine GPS-Punkte gespeichert.");
        const lastLive = v.last_live_ts ? this._t("Letzter Live-Punkt: {date}", { date: this._formatTrackingDateTime(v.last_live_ts) }) : this._t("Noch keine Live-Punkte gespeichert.");
        return `<div class="tracking-vehicle"><input type="checkbox" data-track-show="${this._esc(v.entry_id)}" aria-label="${this._esc(v.name)}" ${selected ? "checked" : ""}><div><strong>${this._esc(v.name)}</strong><small>${this._esc(status)}</small><small>${this._esc(sources)}</small><small>${this._esc(lastPoint)}</small><small>${this._esc(lastLive)}</small><label><input type="checkbox" data-track-enable="${this._esc(v.entry_id)}" ${v.enabled ? "checked" : ""}> ${this._esc(this._t("GPS-Tracking aufzeichnen"))}</label></div><select data-track-retention="${this._esc(v.entry_id)}" aria-label="${this._esc(this._t("Aufbewahrung"))}"><option value="30" ${v.retention_days === 30 ? "selected" : ""}>30 ${this._t("Tage")}</option><option value="90" ${v.retention_days === 90 ? "selected" : ""}>90 ${this._t("Tage")}</option><option value="180" ${v.retention_days === 180 ? "selected" : ""}>180 ${this._t("Tage")}</option><option value="365" ${v.retention_days === 365 ? "selected" : ""}>365 ${this._t("Tage")}</option><option value="0" ${v.retention_days === 0 ? "selected" : ""}>${this._t("Unbegrenzt")}</option></select></div>`;
      }).join("") : `<div class="tracking-message">${this._esc(this._t("Keine Fahrzeuge mit GPS-Konfiguration gefunden."))}</div>`}</div>
      <div class="tracking-hint">${this._esc(this._t("Zentrale Datenbank: {name}", { name: this._trackingStatus?.database || "–" }))}</div>
      <button class="tracking-refresh" id="tracking-refresh" ${this._trackingStatusLoading ? "disabled" : ""}>${this._esc(this._t("Bestand aktualisieren"))}</button>
      <div class="tracking-hint">${this._esc(this._t("Gesamttrack liest gespeicherte Daten; Recorder-Import ergänzt ältere GPS-Daten."))}</div>
      <div class="tracking-actions"><button id="tracking-show" ${this._trackingLoading ? "disabled" : ""}><ha-icon icon="mdi:map-marker-path"></ha-icon> ${this._esc(this._t("Gesamttrack anzeigen"))}</button><button id="tracking-fit"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon> ${this._esc(this._t("Track einpassen"))}</button><button id="tracking-import" ${!this._trackingPrimaryEntryId || this._trackingLoading ? "disabled" : ""}>${this._esc(this._t("Recorder importieren"))}</button><button id="tracking-gpx" ${!primaryResult?.point_count ? "disabled" : ""}>GPX</button><button id="tracking-delete" ${!totalPoints ? "disabled" : ""} title="${this._esc(this._t("Tracking-Daten löschen"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button><button id="tracking-delete-all" ${!primary?.point_count ? "disabled" : ""} title="${this._esc(this._t("Alle Tracking-Daten löschen"))}"><ha-icon icon="mdi:delete-forever-outline"></ha-icon></button></div>
      ${this._trackingMessage ? `<div class="tracking-message">${this._esc(this._trackingMessage)}</div>` : ""}
      ${totalPoints ? `<div class="tracking-scope"><strong>${this._esc(this._t(this._trackingSelectedTrip ? "Ausgewählte Fahrt" : "Geladener Zeitraum"))}</strong>${this._trackingSelectedTrip ? `<small>${this._esc(this._t("Gesamttrack anzeigen hebt die Fahrtauswahl auf."))}</small>` : ""}</div><div class="tracking-summary"><div>${this._esc(this._t("Distanz"))}<b>${this._formatNumber(totalDistance, 1)} km</b></div><div>${this._esc(this._t("Fahrten"))}<b>${totalTrips}</b></div><div>${this._esc(this._t("GPS-Punkte"))}<b>${totalPoints.toLocaleString(this._locale())}</b></div><div>${this._esc(this._t("Fahrtzeit"))}<b>${this._esc(this._formatTrackingDuration(totalDuration))}</b></div><div>${this._esc(this._t("Ø GPS"))}<b>${this._formatNumber(primaryVisible?.avg_speed_kmh || 0, 1)} km/h</b></div><div>${this._esc(this._t("Max GPS"))}<b>${this._formatNumber(primaryVisible?.max_speed_kmh || 0, 1)} km/h</b></div></div>` : ""}
      ${this._trackingEnergySummary(primaryVisible)}
      ${trips.length ? `<div><div class="tracking-trip-heading"><strong>${this._esc(this._t("Fahrten"))}</strong><select id="tracking-trip-sort" aria-label="${this._esc(this._t("Fahrten sortieren"))}"><option value="newest" ${this._trackingTripSort === "newest" ? "selected" : ""}>${this._esc(this._t("Neueste zuerst"))}</option><option value="oldest" ${this._trackingTripSort === "oldest" ? "selected" : ""}>${this._esc(this._t("Älteste zuerst"))}</option></select></div><div class="tracking-trip-list">${trips.map((trip) => `<div class="tracking-trip-row"><button class="tracking-trip" data-track-trip="${trip.index}" aria-pressed="${this._trackingSelectedTrip?.entryId === this._trackingPrimaryEntryId && this._trackingSelectedTrip?.index === trip.index}" title="${this._esc(this._t("Nur diese Fahrt auf der Karte anzeigen"))}">${this._esc(this._formatTrackingDateTime(trip.start))} → ${this._esc(new Intl.DateTimeFormat(this._locale(), { timeStyle: "short" }).format(new Date(trip.end)))} · ${this._formatNumber(trip.distance_km, 1)} km · ${trip.point_count} ${this._esc(this._t("GPS-Punkte"))}</button><button class="tracking-trip-gpx" data-track-trip-gpx="${trip.index}" title="GPX">GPX</button></div>`).join("")}</div></div>` : ""}
      ${this._trackingPlaybackFlat.length ? `<div class="tracking-playback"><strong>${this._esc(this._t("Playback"))}</strong><div class="tracking-playback-row"><button id="tracking-play">${this._trackingPlaybackRunning ? this._esc(this._t("Pause")) : this._esc(this._t("Abspielen"))}</button><input id="tracking-play-slider" aria-label="${this._esc(this._t("Wiedergabeposition"))}" type="range" min="0" max="${this._trackingPlaybackTimeline.at(-1) || 0}" value="${this._trackingPlaybackPosition}"></div><div class="tracking-grid"><label class="tracking-field wide"><span>${this._esc(this._t("Wiedergabegeschwindigkeit"))}</span><select id="tracking-play-speed">${this._trackingSpeedOptions().map(([value, label]) => `<option value="${value}" ${String(this._trackingPlaybackSpeed) === value ? "selected" : ""}>${this._esc(label)}</option>`).join("")}</select></label><label class="tracking-field wide"><span>${this._esc(this._t("Kamera"))}</span><select id="tracking-camera">${[["free", "Freie Karte"], ["north", "Fahrzeug folgen – Norden oben"], ["heading", "Fahrzeug folgen – Fahrtrichtung oben"]].map(([value, label]) => `<option value="${value}" ${this._trackingCameraMode === value ? "selected" : ""}>${this._esc(this._t(label))}</option>`).join("")}</select></label></div><label class="tracking-live"><input id="tracking-skip-pauses" type="checkbox" ${this._trackingSkipPauses ? "checked" : ""}> ${this._esc(this._t("Pausen zwischen Fahrten überspringen"))}</label><div class="tracking-message" id="tracking-play-time">${this._esc(this._trackingPlaybackPoint?.ts ? this._formatTrackingDateTime(this._trackingPlaybackPoint.ts) : "–")}</div></div>` : ""}`;

    panel.querySelector("#tracking-close")?.addEventListener("click", () => { panel.classList.add("hidden"); this._updateControls(); });
    panel.querySelector("#tracking-start")?.addEventListener("change", (e) => { this._trackingStartLocal = e.target.value; this._trackingRangePreset = "custom"; this._clearTrackingResult(); this._savePreferences(); this._renderTrackingPanel(); });
    panel.querySelector("#tracking-end")?.addEventListener("change", (e) => { this._trackingEndLocal = e.target.value; this._trackingFollowNow = false; this._trackingRangePreset = "custom"; this._clearTrackingResult(); this._savePreferences(); this._renderTrackingPanel(); });
    panel.querySelector("#tracking-follow-now")?.addEventListener("change", (e) => { this._trackingFollowNow = e.target.checked; this._clearTrackingResult(); this._ensureTrackingRange(); this._savePreferences(); this._renderTrackingPanel(); this._loadTrackingTrack(); });
    panel.querySelector("#tracking-primary")?.addEventListener("change", (e) => { this._trackingPrimaryEntryId = e.target.value; this._trackingSelectedEntries.add(e.target.value); this._trackingQueryVersion += 1; this._trackingSelectedTrip = null; this._stopTrackingPlayback(false); this._savePreferences(); this._prepareTrackingPlayback(); this._renderTrackingPanel(); });
    panel.querySelector("#tracking-legend-visible")?.addEventListener("change", (e) => { this._trackingLegendVisible = e.target.checked; this._savePreferences(); this._renderTrackingLegend(); });
    panel.querySelector("#tracking-scale-visible")?.addEventListener("change", (e) => { this._mapScaleVisible = e.target.checked; this._savePreferences(); this._syncMapScale(); });
    panel.querySelector("#tracking-trip-sort")?.addEventListener("change", (e) => { this._trackingTripSort = e.target.value; this._savePreferences(); this._renderTrackingPanel(); const list = panel.querySelector(".tracking-trip-list"); if (list) list.scrollTop = 0; });
    panel.querySelector("#tracking-color")?.addEventListener("change", (e) => { this._trackingColorMode = e.target.value; this._savePreferences(); this._syncTrackingMapSource(); });
    panel.querySelectorAll("[data-track-preset]").forEach((b) => b.addEventListener("click", () => this._setTrackingPreset(b.dataset.trackPreset)));
    panel.querySelectorAll("[data-track-show]").forEach((el) => el.addEventListener("change", () => { const id = el.dataset.trackShow; if (el.checked) this._trackingSelectedEntries.add(id); else this._trackingSelectedEntries.delete(id); this._clearTrackingResult(); this._savePreferences(); this._renderTrackingPanel(); }));
    panel.querySelectorAll("[data-track-enable]").forEach((el) => el.addEventListener("change", () => { const id = el.dataset.trackEnable; const retention = Number(panel.querySelector(`[data-track-retention="${CSS.escape(id)}"]`)?.value || 365); this._setTrackingVehicleSettings(id, el.checked, retention); }));
    panel.querySelectorAll("[data-track-retention]").forEach((el) => el.addEventListener("change", () => { const id = el.dataset.trackRetention; const enabled = Boolean(panel.querySelector(`[data-track-enable="${CSS.escape(id)}"]`)?.checked); this._setTrackingVehicleSettings(id, enabled, Number(el.value)); }));
    panel.querySelector("#tracking-show")?.addEventListener("click", () => this._loadTrackingTrack());
    panel.querySelector("#tracking-refresh")?.addEventListener("click", () => this._loadTrackingStatus(true));
    panel.querySelector("#tracking-fit")?.addEventListener("click", () => this._fitTrackingTracks());
    panel.querySelector("#tracking-import")?.addEventListener("click", () => this._importTrackingRecorder());
    panel.querySelector("#tracking-gpx")?.addEventListener("click", () => this._downloadTrackingGpx());
    panel.querySelector("#tracking-delete")?.addEventListener("click", () => this._deleteTrackingRange());
    panel.querySelector("#tracking-delete-all")?.addEventListener("click", () => this._deleteAllTrackingForPrimary());
    panel.querySelectorAll("[data-track-trip]").forEach((b) => b.addEventListener("click", () => this._selectTrackingTrip(this._trackingPrimaryEntryId, Number(b.dataset.trackTrip))));
    panel.querySelectorAll("[data-track-trip-gpx]").forEach((b) => b.addEventListener("click", () => this._downloadTrackingGpx(Number(b.dataset.trackTripGpx))));
    panel.querySelector("#tracking-play")?.addEventListener("click", () => this._trackingPlaybackRunning ? this._stopTrackingPlayback() : this._startTrackingPlayback());
    panel.querySelector("#tracking-play-slider")?.addEventListener("input", (e) => { this._stopTrackingPlayback(false); this._trackingCameraActive = this._trackingCameraMode !== "free"; this._setTrackingPlaybackPosition(Number(e.target.value)); });
    panel.querySelector("#tracking-play-speed")?.addEventListener("change", (e) => { this._trackingPlaybackSpeed = e.target.value; this._savePreferences(); if (this._trackingPlaybackRunning) { this._stopTrackingPlayback(false); this._startTrackingPlayback(); } });
    panel.querySelector("#tracking-camera")?.addEventListener("change", (e) => this._setTrackingCameraMode(e.target.value));
    panel.querySelector("#tracking-skip-pauses")?.addEventListener("change", (e) => { const running = this._trackingPlaybackRunning; this._stopTrackingPlayback(false); const index = this._trackingPlaybackIndex; this._trackingSkipPauses = e.target.checked; this._buildTrackingTimeline(); this._setTrackingPlaybackIndex(index); this._savePreferences(); if (running) this._startTrackingPlayback(); else this._renderTrackingPanel(); });
    panel.scrollTop = scrollTop;
    const tripList = panel.querySelector(".tracking-trip-list");
    if (tripList) tripList.scrollTop = tripScrollTop;
    if (["tracking-start", "tracking-end"].includes(focusedId)) panel.querySelector(`#${focusedId}`)?.focus({ preventScroll: true });
  }

  _fitTrackingTracks() {
    if (this._trackingCameraActive) this._setTrackingCameraMode("free");
    const coords = [];
    for (const vehicle of this._trackingVisibleVehicles()) {
      for (const segment of vehicle.segments || []) for (const p of segment || []) coords.push([Number(p.lon), Number(p.lat)]);
    }
    this._fitTrackingCoordinates(coords);
  }

  _fitTrackingCoordinates(coords) {
    const clean = coords.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!clean.length || !this._vectorMap || !this._mapStyleReady) return;
    if (this._mode === "gps") {
      this._mode = this._lastFreeMode || "osm";
      this._savePreferences();
      this._updateControls();
    }
    const lons = clean.map((p) => p[0]), lats = clean.map((p) => p[1]);
    try {
      this._vectorMap.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 55, maxZoom: 16, duration: 420 });
    } catch (_) { /* map can be rebuilding */ }
  }

  _syncTrackingMapSource() {
    this._renderTrackingLegend();
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady) return;
    const lineSource = map.getSource("cardata-tracks");
    const markerSource = map.getSource("cardata-track-markers");
    if (!lineSource || !markerSource) return;
    const lines = [];
    const markers = [];
    for (const vehicle of this._trackingVisibleVehicles()) {
      const entryId = String(vehicle.entry_id || "");
      for (const segment of vehicle.segments || []) {
        for (let i = 1; i < segment.length; i += 1) {
          const prev = segment[i - 1], cur = segment[i];
          lines.push({ type: "Feature", properties: { entryId, name: vehicle.name || "", color: this._trackingLineColor(entryId, cur), ts: cur.ts || "", speed: cur.speed ?? null, soc: cur.soc ?? null, odometer: cur.odometer ?? null }, geometry: { type: "LineString", coordinates: [[Number(prev.lon), Number(prev.lat)], [Number(cur.lon), Number(cur.lat)]] } });
        }
      }
      const nonEmpty = (vehicle.segments || []).filter((s) => s?.length);
      if (nonEmpty.length) {
        const start = nonEmpty[0][0], end = nonEmpty[nonEmpty.length - 1].at(-1);
        markers.push({ type: "Feature", properties: { kind: "start", marker: "S", color: this._trackingColorForEntry(entryId) }, geometry: { type: "Point", coordinates: [Number(start.lon), Number(start.lat)] } });
        markers.push({ type: "Feature", properties: { kind: "end", marker: cardataLanguage(this._hass) === "de" ? "Z" : "E", color: this._trackingColorForEntry(entryId) }, geometry: { type: "Point", coordinates: [Number(end.lon), Number(end.lat)] } });
      }
    }
    this._trackingStaticMarkers = markers;
    lineSource.setData({ type: "FeatureCollection", features: lines });
    this._syncTrackingPlaybackMarker();
  }

  _syncTrackingPlaybackMarker() {
    const source = this._vectorMap?.getSource("cardata-track-markers");
    if (!source || !this._mapStyleReady) return;
    const markers = [...(this._trackingStaticMarkers || [])];
    if (this._trackingPlaybackPoint) {
      markers.push({ type: "Feature", properties: { kind: "playback", marker: "▶", color: "#1565c0" }, geometry: { type: "Point", coordinates: [Number(this._trackingPlaybackPoint.lon), Number(this._trackingPlaybackPoint.lat)] } });
    }
    source.setData({ type: "FeatureCollection", features: markers });
  }

  _setMode(mode) {
    if (!["osm", "osm_detail", "topo", "satellite", "terrain", "gps"].includes(mode)) return;
    if (mode === "gps") {
      this._stopTrackingPlayback(false);
      this._trackingCameraActive = false;
      const v = this._selectedVehicle() || this._visibleVehicles()[0];
      if (v) {
        this._focusVehicle(v.deviceId, { follow: true, showPopup: false, animate: true });
        return;
      }
      this._mode = "gps";
    } else {
      this._mode = mode;
      this._lastFreeMode = mode;
    }
    this._savePreferences();
    this._updateControls();
    this._renderMap(true);
  }

  _selectedVehicle() {
    return this._vehicles().find((v) => v.deviceId === this._selectedVehicleId && v.valid && !this._hiddenVehicles.has(v.deviceId)) || null;
  }

  _focusVehicle(vehicleId, { follow = true, showPopup = true, animate = true } = {}) {
    const v = this._vehicles().find((item) => item.deviceId === vehicleId && item.valid);
    if (!v) return false;

    this._stopTrackingPlayback(false);
    this._trackingCameraActive = false;

    this._hiddenVehicles.delete(v.deviceId);
    this._selectedVehicleId = v.deviceId;
    if (follow) this._mode = "gps";
    this._center = { lat: v.lat, lon: v.lon };
    const targetZoom = Math.min(this._tileProvider().maxZoom, Math.max(Number(this._zoom) || 0, 15));
    this._zoom = targetZoom;
    this._programmaticCameraUntil = Date.now() + (animate ? 1200 : 250);

    this._savePreferences();
    this._updateControls();
    this._syncVehicleMapMarkers();
    this._renderVehiclePanel();
    this._renderPoiPanel();
    this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");

    const map = this._vectorMap;
    if (map && this._mapStyleReady) {
      try {
        map.stop?.();
        const camera = { center: [v.lon, v.lat], zoom: targetZoom };
        if (animate && typeof map.easeTo === "function") {
          map.easeTo({ ...camera, duration: 360, essential: true });
        } else if (typeof map.jumpTo === "function") {
          map.jumpTo(camera);
        }
      } catch (err) {
        console.warn("[Cardata Analytics] vehicle focus camera move failed; using map sync fallback", err);
        this._renderMap(true);
      }
    } else {
      this._renderMap(true);
    }

    if (showPopup) this._showPopup(v.deviceId);
    if (this._poiCenterMode === "vehicle" && this._poiCategories.size && this._poiSourceVehicleId !== v.deviceId) this._schedulePoiLoad(500, false);
    return true;
  }

  _changeZoom(delta) {
    const map = this._vectorMap;
    const current = map && this._mapStyleReady && typeof map.getZoom === "function"
      ? Number(map.getZoom())
      : Number(this._zoom);
    const base = Number.isFinite(current) ? current : 13;
    const target = Math.max(2, Math.min(this._tileProvider().maxZoom, base + Number(delta || 0)));
    this._zoom = target;
    this._programmaticCameraUntil = Date.now() + 700;
    if (map && this._mapStyleReady) {
      try {
        map.stop?.();
        if (typeof map.easeTo === "function") map.easeTo({ zoom: target, duration: 180, essential: true });
        else if (typeof map.zoomTo === "function") map.zoomTo(target);
        else map.jumpTo?.({ zoom: target });
      } catch (err) {
        console.warn("[Cardata Analytics] zoom button camera move failed; using map sync fallback", err);
        this._renderMap(true);
      }
    } else {
      this._renderMap(true);
    }
    this._savePreferences();
  }

  _startDrag(ev) {
    if (ev.button != null && ev.button !== 0) return;
    const map = this.shadowRoot.getElementById("map");
    if (!map || ev.target.closest("button, a, .popup, .poi-popup, .vehicle-panel, .poi-panel, .route-panel, .tracking-panel, .tracking-legend")) return;
    map.setPointerCapture?.(ev.pointerId);
    const world = this._latLonToWorld(this._center.lat, this._center.lon, this._zoom);
    this._drag = { pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY, worldX: world.x, worldY: world.y };
    map.classList.add("dragging");
  }

  _moveDrag(ev) {
    if (!this._drag || this._drag.pointerId !== ev.pointerId) return;
    const dx = ev.clientX - this._drag.x;
    const dy = ev.clientY - this._drag.y;
    this._center = this._worldToLatLon(this._drag.worldX - dx, this._drag.worldY - dy, this._zoom);
    if (this._mode === "gps") this._mode = this._lastFreeMode;
    this._renderMap(false);
    this._updateControls();
  }

  _endDrag(ev) {
    if (!this._drag || this._drag.pointerId !== ev.pointerId) return;
    this._drag = null;
    this.shadowRoot.getElementById("map")?.classList.remove("dragging");
    this._savePreferences();
  }

  _latLonToWorld(lat, lon, zoom) {
    const size = this._tileSize * (2 ** zoom);
    const limitedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const x = (lon + 180) / 360 * size;
    const sin = Math.sin(limitedLat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
    return { x, y };
  }

  _worldToLatLon(x, y, zoom) {
    const size = this._tileSize * (2 ** zoom);
    const wrappedX = ((x % size) + size) % size;
    const clampedY = Math.max(0, Math.min(size, y));
    const lon = wrappedX / size * 360 - 180;
    const n = Math.PI - 2 * Math.PI * clampedY / size;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lon };
  }

  _tileProvider() {
    const effectiveMode = this._mode === "gps" ? this._lastFreeMode : this._mode;
    if (effectiveMode === "satellite") {
      const customUrl = typeof this._config.satellite_url === "string" ? this._config.satellite_url.trim() : "";
      const customAttribution = typeof this._config.satellite_attribution === "string" ? this._config.satellite_attribution.trim() : "";
      const validTemplate = /^https:\/\//i.test(customUrl)
        && ["{z}", "{x}", "{y}"].every((token) => customUrl.includes(token));
      const maxZoom = Math.max(2, Math.min(22, Number(this._config.satellite_max_zoom) || 19));

      if (customUrl || customAttribution) {
        if (!validTemplate || !customAttribution) {
          return {
            id: "satellite-custom-invalid",
            maxZoom,
            attribution: "",
            maplibreStyle: null,
            unavailableMessage: this._t("Ungültige Satelliten-Konfiguration. satellite_url muss HTTPS mit {z}/{x}/{y} enthalten und satellite_attribution muss gesetzt sein."),
          };
        }
        return {
          id: `satellite-custom:${customUrl}`,
          maxZoom,
          attribution: this._esc(customAttribution),
          maplibreStyle: this._rasterMapStyle("satellite-custom", [customUrl], maxZoom),
        };
      }

      return {
        id: "satellite-esri-world-imagery",
        maxZoom,
        attribution: "Tiles © Esri · Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        maplibreStyle: this._rasterMapStyle(
          "satellite-esri",
          ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          maxZoom,
        ),
      };
    }
    if (effectiveMode === "terrain") {
      return {
        id: "terrain-openfreemap-liberty",
        maxZoom: 20,
        terrain: true,
        attribution: `<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a> · ${this._t("Daten")} © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · Terrain: AWS Open Data`,
        maplibreStyle: CARDATA_OPENFREEMAP_STYLE,
      };
    }
    if (effectiveMode === "osm_detail") {
      return {
        id: "osm-openfreemap-bright",
        maxZoom: 20,
        attribution: `<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a> · ${this._t("Daten")} © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>`,
        maplibreStyle: CARDATA_OPENFREEMAP_BRIGHT_STYLE,
      };
    }
    if (effectiveMode === "topo") {
      return {
        id: "topo",
        maxZoom: 17,
        attribution: `${this._t("Kartendaten")} © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · ${this._t("Darstellung")} © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>`,
        maplibreStyle: this._rasterMapStyle(
          "topo",
          [
            "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
          ],
          17,
        ),
      };
    }
    return {
      id: "osm-openfreemap-liberty",
      maxZoom: 20,
      attribution: `<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a> · ${this._t("Daten")} © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>`,
      maplibreStyle: CARDATA_OPENFREEMAP_STYLE,
    };
  }

  _rasterMapStyle(id, tiles, maxZoom) {
    return {
      version: 8,
      name: `Cardata ${id}`,
      glyphs: CARDATA_OPENFREEMAP_GLYPHS,
      sources: {
        "cardata-basemap": {
          type: "raster",
          tiles: [...tiles],
          tileSize: 256,
          minzoom: 0,
          maxzoom: maxZoom,
        },
      },
      layers: [
        {
          id: "cardata-basemap-raster",
          type: "raster",
          source: "cardata-basemap",
          paint: { "raster-fade-duration": 0 },
        },
      ],
    };
  }

  _normalizeTerrainBearing(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return CARDATA_TERRAIN_DEFAULT_BEARING;
    const normalized = ((parsed % 360) + 360) % 360;
    return Math.round(normalized * 10) / 10;
  }

  _updateTerrainCompass() {
    const compass = this.shadowRoot?.getElementById("terrain-compass");
    const needle = this.shadowRoot?.getElementById("terrain-compass-needle");
    if (!compass) return;
    const active = this._tileProvider()?.terrain === true;
    compass.classList.toggle("hidden", !active || !this._terrainCompassVisible);
    compass.setAttribute("aria-hidden", active && this._terrainCompassVisible ? "false" : "true");
    if (needle) needle.style.transform = `rotate(${-this._normalizeTerrainBearing(this._terrainBearing)}deg)`;
  }

  _updateTerrainControls() {
    const panel = this.shadowRoot?.getElementById("terrain-controls");
    if (!panel) return;
    const toggle = this.shadowRoot?.getElementById("terrain-panel-toggle");
    const active = this._tileProvider()?.terrain === true;
    panel.classList.toggle("hidden", !active || !this._terrainControlsVisible);
    panel.setAttribute("aria-hidden", active && this._terrainControlsVisible ? "false" : "true");
    if (toggle) {
      toggle.classList.toggle("hidden", !active || this._terrainControlsVisible);
      toggle.setAttribute("aria-hidden", active && !this._terrainControlsVisible ? "false" : "true");
    }

    const collapse = this.shadowRoot.getElementById("terrain-collapse");
    const pitch = this.shadowRoot.getElementById("terrain-pitch");
    const pitchValue = this.shadowRoot.getElementById("terrain-pitch-value");
    const exaggeration = this.shadowRoot.getElementById("terrain-exaggeration");
    const exaggerationValue = this.shadowRoot.getElementById("terrain-exaggeration-value");
    const bearing = this.shadowRoot.getElementById("terrain-bearing");
    const bearingValue = this.shadowRoot.getElementById("terrain-bearing-value");
    const compassToggle = this.shadowRoot.getElementById("terrain-compass-toggle");
    if (collapse) {
      collapse.title = this._t("3D-Steuerung ausblenden");
      collapse.setAttribute("aria-label", this._t("3D-Steuerung ausblenden"));
    }
    if (toggle) {
      toggle.title = this._t("3D-Steuerung einblenden");
      toggle.setAttribute("aria-label", this._t("3D-Steuerung einblenden"));
    }
    if (pitch) pitch.value = String(Math.round(this._terrainPitch));
    if (pitchValue) pitchValue.textContent = `${Math.round(this._terrainPitch)}°`;
    if (exaggeration) exaggeration.value = String(this._terrainExaggeration);
    if (exaggerationValue) exaggerationValue.textContent = `${this._formatNumber(this._terrainExaggeration, 1)}×`;
    if (bearing) bearing.value = String(Math.round(this._normalizeTerrainBearing(this._terrainBearing)));
    if (bearingValue) bearingValue.textContent = `${Math.round(this._normalizeTerrainBearing(this._terrainBearing))}°`;
    if (compassToggle) {
      compassToggle.setAttribute("aria-pressed", this._terrainCompassVisible ? "true" : "false");
      compassToggle.classList.toggle("active", this._terrainCompassVisible);
      compassToggle.textContent = this._t(this._terrainCompassVisible ? "Ein" : "Aus");
    }
    this._updateTerrainCompass();
    if (active) this._updateTerrainElevationReadout();
  }

  _setTerrainControlsVisible(visible) {
    this._terrainControlsVisible = Boolean(visible);
    this._updateTerrainControls();
    this._savePreferences();
  }

  _terrainHillshadeBeforeLayer() {
    const layers = this._vectorMap?.getStyle?.()?.layers || [];
    // Keep relief below roads, labels and 3D buildings so the basemap stays
    // crisp while land-cover fills still receive readable light/shadow relief.
    const layer = layers.find((item) => ["line", "symbol", "fill-extrusion"].includes(item?.type));
    return layer?.id;
  }

  _ensureTerrainHillshadeLayer() {
    const map = this._vectorMap;
    if (!map || !map.getSource(CARDATA_TERRAIN_SOURCE_ID) || map.getLayer(CARDATA_TERRAIN_HILLSHADE_LAYER_ID)) return;
    const beforeId = this._terrainHillshadeBeforeLayer();
    const layer = {
      id: CARDATA_TERRAIN_HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: CARDATA_TERRAIN_SOURCE_ID,
      paint: {
        "hillshade-illumination-direction": 315,
        "hillshade-illumination-anchor": "viewport",
        "hillshade-exaggeration": 0.65,
        "hillshade-shadow-color": "#4a433d",
        "hillshade-highlight-color": "#ffffff",
        "hillshade-accent-color": "#6a625b",
      },
    };
    try {
      if (beforeId) map.addLayer(layer, beforeId);
      else map.addLayer(layer);
    } catch (err) {
      console.warn("[Cardata Analytics] terrain hillshade setup failed", err);
    }
  }

  _updateTerrainElevationReadout() {
    const output = this.shadowRoot?.getElementById("terrain-dem-elevation");
    if (!output) return;
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady || this._tileProvider()?.terrain !== true || typeof map.queryTerrainElevation !== "function") {
      this._terrainElevationMeters = null;
      output.textContent = this._t("DEM wird geladen …");
      return;
    }
    try {
      const center = map.getCenter?.();
      const exaggerated = center ? Number(map.queryTerrainElevation(center)) : NaN;
      if (!Number.isFinite(exaggerated)) {
        this._terrainElevationMeters = null;
        output.textContent = this._t("DEM wird geladen …");
        return;
      }
      // MapLibre returns the elevation after terrain exaggeration. Show the
      // underlying DEM value so the diagnostic remains meaningful while the
      // user moves the exaggeration slider.
      const divisor = Math.max(0.01, Number(this._terrainExaggeration) || 1);
      this._terrainElevationMeters = exaggerated / divisor;
      output.textContent = `${this._formatNumber(Math.round(this._terrainElevationMeters), 0)} m`;
    } catch (_) {
      this._terrainElevationMeters = null;
      output.textContent = this._t("DEM wird geladen …");
    }
  }

  _setTerrainPitch(value, { save = true } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    this._terrainPitch = Math.max(0, Math.min(75, parsed));
    const map = this._vectorMap;
    if (map && this._mapStyleReady && this._tileProvider()?.terrain === true) {
      this._programmaticCameraUntil = Date.now() + 300;
      try { map.jumpTo?.({ pitch: this._terrainPitch }); } catch (_) { /* map may be rebuilding */ }
    }
    if (save) this._savePreferences();
    this._updateTerrainControls();
  }

  _setTerrainBearing(value, { save = true, animate = false } = {}) {
    this._terrainBearing = this._normalizeTerrainBearing(value);
    const map = this._vectorMap;
    if (map && this._mapStyleReady && this._tileProvider()?.terrain === true) {
      this._programmaticCameraUntil = Date.now() + (animate ? 700 : 300);
      try {
        if (animate && typeof map.easeTo === "function") map.easeTo({ bearing: this._terrainBearing, duration: 260, essential: true });
        else map.jumpTo?.({ bearing: this._terrainBearing });
      } catch (_) { /* map may be rebuilding */ }
    }
    if (save) this._savePreferences();
    this._updateTerrainControls();
  }

  _setTerrainCompassVisible(visible, { save = true } = {}) {
    this._terrainCompassVisible = Boolean(visible);
    if (save) this._savePreferences();
    this._updateTerrainControls();
  }

  _syncTerrainRotationInteraction(active) {
    const map = this._vectorMap;
    if (!map) return;
    try {
      if (active) map.dragRotate?.enable?.();
      else map.dragRotate?.disable?.();
    } catch (_) { /* optional MapLibre handler */ }
    try {
      if (active) map.touchZoomRotate?.enableRotation?.();
      else map.touchZoomRotate?.disableRotation?.();
    } catch (_) { /* optional MapLibre handler */ }
  }

  _setTerrainExaggeration(value, { save = true } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    this._terrainExaggeration = Math.round(Math.max(1, Math.min(3, parsed)) * 10) / 10;
    const map = this._vectorMap;
    if (map && this._mapStyleReady && this._tileProvider()?.terrain === true && map.getSource(CARDATA_TERRAIN_SOURCE_ID)) {
      try {
        map.setTerrain({ source: CARDATA_TERRAIN_SOURCE_ID, exaggeration: this._terrainExaggeration });
        this._updateTerrainElevationReadout();
      } catch (_) { /* terrain source may be loading */ }
    }
    if (save) this._savePreferences();
    this._updateTerrainControls();
  }

  _resetTerrainControls() {
    this._terrainPitch = CARDATA_TERRAIN_DEFAULT_PITCH;
    this._terrainExaggeration = CARDATA_TERRAIN_DEFAULT_EXAGGERATION;
    this._terrainBearing = CARDATA_TERRAIN_DEFAULT_BEARING;
    const map = this._vectorMap;
    if (map && this._mapStyleReady && this._tileProvider()?.terrain === true) {
      this._programmaticCameraUntil = Date.now() + 500;
      try {
        if (map.getSource(CARDATA_TERRAIN_SOURCE_ID)) {
          map.setTerrain({ source: CARDATA_TERRAIN_SOURCE_ID, exaggeration: this._terrainExaggeration });
        }
        if (typeof map.easeTo === "function") map.easeTo({ pitch: this._terrainPitch, bearing: this._terrainBearing, duration: 260, essential: true });
        else map.jumpTo?.({ pitch: this._terrainPitch, bearing: this._terrainBearing });
      } catch (_) { /* map may be rebuilding */ }
    }
    this._savePreferences();
    this._updateTerrainControls();
  }

  _syncTerrainView(provider, { animate = true } = {}) {
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady) return;
    const terrainEnabled = provider?.terrain === true;
    const playbackCamera = this._trackingCameraActive && this._trackingCameraMode !== "free";

    if (terrainEnabled) {
      this._syncTerrainRotationInteraction(true);
      try {
        if (!map.getSource(CARDATA_TERRAIN_SOURCE_ID)) {
          map.addSource(CARDATA_TERRAIN_SOURCE_ID, {
            type: "raster-dem",
            tiles: [`${CARDATA_DEM_PROTOCOL}://${CARDATA_TERRARIUM_TILE_TEMPLATE.replace(/^https?:\/\//, "")}`],
            encoding: "terrarium",
            tileSize: 256,
            minzoom: 0,
            // AWS Terrarium provides data through z15. z14 gives the static
            // Cardata terrain view materially finer mountain geometry while
            // keeping network/GPU cost below the full source pyramid.
            maxzoom: CARDATA_TERRAIN_DEM_MAX_ZOOM,
          });
        }
        this._ensureTerrainHillshadeLayer();
        map.setTerrain({ source: CARDATA_TERRAIN_SOURCE_ID, exaggeration: this._terrainExaggeration });
        this._updateTerrainElevationReadout();
        // A DEM tile may arrive after setTerrain(). Retry the diagnostic after
        // the first render window; the map's idle handler below keeps it current.
        setTimeout(() => this._updateTerrainElevationReadout(), 500);
        const currentPitch = Number(map.getPitch?.());
        const currentBearing = this._normalizeTerrainBearing(map.getBearing?.());
        const pitchChanged = !Number.isFinite(currentPitch) || Math.abs(currentPitch - this._terrainPitch) > 0.1;
        const targetBearing = playbackCamera ? currentBearing : this._terrainBearing;
        const bearingChanged = Math.abs(currentBearing - targetBearing) > 0.1
          && Math.abs(Math.abs(currentBearing - targetBearing) - 360) > 0.1;
        if (pitchChanged || bearingChanged) {
          this._programmaticCameraUntil = Date.now() + (animate ? 700 : 250);
          if (animate && typeof map.easeTo === "function") {
            map.easeTo({ pitch: this._terrainPitch, bearing: targetBearing, duration: 320, essential: true });
          } else {
            map.jumpTo?.({ pitch: this._terrainPitch, bearing: targetBearing });
          }
        }
      } catch (err) {
        console.warn("[Cardata Analytics] 3D terrain setup failed", err);
      }
      return;
    }

    this._syncTerrainRotationInteraction(false);
    try { map.setTerrain(null); } catch (_) { /* no active terrain */ }
    try { if (map.getLayer(CARDATA_TERRAIN_HILLSHADE_LAYER_ID)) map.removeLayer(CARDATA_TERRAIN_HILLSHADE_LAYER_ID); } catch (_) { /* style may be changing */ }
    this._terrainElevationMeters = null;
    const currentPitch = Number(map.getPitch?.());
    const currentBearing = Number(map.getBearing?.());
    if ((Number.isFinite(currentPitch) && Math.abs(currentPitch) > 0.1)
        || (!playbackCamera && Number.isFinite(currentBearing) && Math.abs(currentBearing) > 0.1)) {
      this._programmaticCameraUntil = Date.now() + (animate ? 700 : 250);
      try {
        if (animate && typeof map.easeTo === "function") {
          map.easeTo({ pitch: 0, bearing: playbackCamera ? currentBearing : 0, duration: 260, essential: true });
        } else {
          map.jumpTo?.({ pitch: 0, bearing: playbackCamera ? currentBearing : 0 });
        }
      } catch (_) { /* camera may be tearing down during style changes */ }
    }
  }

  _destroyVectorBasemap() {
    this._stopTrackingPlayback(false);
    this._mapScaleControl = null;
    this._trackingCameraActive = false;
    this._unbindMapPoiHandlers();
    this._unbindMapTrackingHandlers();
    try { this._trackingPopupMaplibre?.remove?.(); } catch (_) {}
    this._trackingPopupMaplibre = null;
    for (const marker of this._vehicleMapMarkers.values()) {
      try { marker.marker?.remove(); } catch (_) { /* already detached */ }
    }
    this._vehicleMapMarkers.clear();
    if (this._vectorMap) {
      // Route free-map picking is bound to the concrete MapLibre instance.
      // A full card render destroys that instance, so the handler must be
      // detached and cleared as well; otherwise the replacement map is
      // incorrectly treated as already bound and free destination clicks stop.
      if (this._mapRouteClickHandler) {
        try { this._vectorMap.off?.("click", this._mapRouteClickHandler); } catch (_) { /* map already tearing down */ }
      }
      try { this._vectorMap.remove(); } catch (_) { /* already detached */ }
    }
    this._mapRouteClickHandler = null;
    this._vectorMap = null;
    this._vectorMapInitPromise = null;
    this._vectorMapError = "";
    this._maplibreLib = null;
    this._mapStyleId = null;
    this._mapStyleReady = false;
  }

  _syncVectorBasemap(provider) {
    const container = this.shadowRoot?.getElementById("vector-map");
    if (!container || !provider?.maplibreStyle || this._vectorMapError) return;

    if (this._vectorMap) {
      try {
        this._vectorMap.resize();
        this._vectorMap.setMaxZoom(provider.maxZoom);
        if (this._mapStyleId !== provider.id) {
          this._unbindMapPoiHandlers();
          if (provider?.terrain !== true) this._syncTerrainRotationInteraction(false);
          try { this._vectorMap.setTerrain(null); } catch (_) { /* no active terrain */ }
          this._mapStyleReady = false;
          this._mapStyleId = provider.id;
          this._vectorMap.setStyle(provider.maplibreStyle, { diff: false });
        } else {
          this._syncTerrainView(provider, { animate: false });
        }
        const center = this._vectorMap.getCenter();
        const zoom = this._vectorMap.getZoom();
        if (Math.abs(center.lat - this._center.lat) > 1e-7
            || Math.abs(center.lng - this._center.lon) > 1e-7
            || Math.abs(zoom - this._zoom) > 0.001) {
          this._vectorMap.jumpTo({ center: [this._center.lon, this._center.lat], zoom: this._zoom });
        }
      } catch (err) {
        console.warn("[Cardata Analytics] MapLibre sync failed", err);
      }
      return;
    }

    if (this._vectorMapInitPromise) return;
    this._vectorMapInitPromise = ensureCardataMapLibre()
      .then((maplibregl) => {
        if (!this.isConnected || !this._domBuilt || this.shadowRoot?.getElementById("vector-map") !== container) return;
        this._maplibreLib = maplibregl;
        try { registerCardataMapLibreProtocols(maplibregl); } catch (err) {
          console.warn("[Cardata Analytics] DEM protocol registration failed", err);
        }
        this._mapStyleId = provider.id;
        this._mapStyleReady = false;
        this._vectorMap = new maplibregl.Map({
          container,
          style: provider.maplibreStyle,
          center: [this._center.lon, this._center.lat],
          zoom: this._zoom,
          minZoom: 2,
          maxZoom: provider.maxZoom,
          interactive: true,
          attributionControl: false,
          renderWorldCopies: true,
          fadeDuration: 0,
          dragRotate: false,
          pitchWithRotate: false,
          maxPitch: 80,
        });
        try { this._vectorMap.touchZoomRotate?.disableRotation(); } catch (_) { /* optional */ }
        this._bindMapRouteClick();

        const styleReady = () => {
          if (!this._vectorMap) return;
          this._mapStyleReady = true;
          this._vectorMapError = "";
          try {
            this._vectorMap.resize();
            const activeProvider = this._tileProvider();
            this._syncTerrainView(activeProvider, { animate: false });
            this._ensureMapDataLayers();
            this._syncRangeMapSource();
            this._syncVehicleMapMarkers();
            this._syncPoiMapSource();
            this._syncRouteMapSource();
            this._syncTrackingMapSource();
            this._syncMapScale();
          } catch (err) {
            console.warn("[Cardata Analytics] MapLibre data-layer setup failed", err);
          }
        };
        this._vectorMap.on("load", styleReady);
        this._vectorMap.on("style.load", styleReady);
        // Zooming (mouse wheel / pinch / +/-) keeps Follow active. Only a
        // deliberate user pan/drag leaves GPS Follow mode.
        this._vectorMap.on("dragstart", (event) => {
          if (event?.originalEvent && this._trackingCameraActive) this._setTrackingCameraMode("free");
          const programmatic = Date.now() <= this._programmaticCameraUntil;
          if (event?.originalEvent && !programmatic && this._mode === "gps") {
            this._mode = this._lastFreeMode;
            this._lastFollowPositionKey = "";
            this._savePreferences();
            this._updateControls();
            this._syncVehicleMapMarkers();
          }
        });
        this._vectorMap.on("move", () => {
          if (!this._vectorMap) return;
          const c = this._vectorMap.getCenter();
          this._center = { lat: c.lat, lon: c.lng };
          this._zoom = this._vectorMap.getZoom();
          this._positionPopup();
          this._positionPoiPopup();
        });
        this._vectorMap.on("rotate", () => {
          if (!this._vectorMap || this._tileProvider()?.terrain !== true || this._trackingCameraActive) return;
          this._terrainBearing = this._normalizeTerrainBearing(this._vectorMap.getBearing?.());
          this._updateTerrainControls();
        });
        this._vectorMap.on("rotateend", () => {
          if (!this._vectorMap || this._tileProvider()?.terrain !== true || this._trackingCameraActive) return;
          this._terrainBearing = this._normalizeTerrainBearing(this._vectorMap.getBearing?.());
          this._savePreferences();
          this._updateTerrainControls();
        });
        this._vectorMap.on("moveend", () => {
          if (!this._vectorMap) return;
          const c = this._vectorMap.getCenter();
          this._center = { lat: c.lat, lon: c.lng };
          this._zoom = this._vectorMap.getZoom();
          if (this._trackingPlaybackRunning && this._trackingCameraActive) return;
          this._savePreferences();
          this._updateControls();
          this._positionPopup();
          this._positionPoiPopup();
          if (this._tileProvider()?.terrain === true) this._updateTerrainElevationReadout();
        });
        this._vectorMap.on("idle", () => {
          if (!this._trackingPlaybackRunning && this._tileProvider()?.terrain === true) this._updateTerrainElevationReadout();
        });
        this._vectorMap.on("zoomend", () => {
          // Wheel/pinch zoom deliberately keeps GPS Follow enabled. Recenter at
          // the new zoom level so the followed vehicle stays in the map center.
          if (this._mode === "gps") {
            this._followSelectedVehiclePosition({ animate: false });
            this._savePreferences();
          }
        });
        this._vectorMap.on("error", (event) => {
          const message = event?.error?.message || this._t("Kartenrenderer konnte nicht geladen werden.");
          const terrainTileError = event?.sourceId === CARDATA_TERRAIN_SOURCE_ID
            || String(message).includes("elevation-tiles-prod/terrarium");
          if (terrainTileError) {
            // Terrain is an optional visual layer. A temporary DEM tile failure
            // must not hide an otherwise healthy 2D/3D basemap or its overlays.
            console.warn("[Cardata Analytics] 3D terrain tile error", event?.error || event);
            return;
          }
          console.warn("[Cardata Analytics] MapLibre error", event?.error || event);
          if (!this._vectorMap?.loaded()) {
            this._vectorMapError = String(message);
            this._updateMapEmptyState(provider);
          }
        });
      })
      .catch((err) => {
        this._vectorMapError = this._t(err?.message || String(err) || "MapLibre konnte nicht geladen werden.");
        console.warn("[Cardata Analytics] MapLibre initialization failed", err);
        this._updateMapEmptyState(provider);
      })
      .finally(() => {
        this._vectorMapInitPromise = null;
      });
  }

  _ensureMapDataLayers() {
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady) return;
    if (!map.getSource("cardata-ranges")) {
      map.addSource("cardata-ranges", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer("cardata-range-fill")) {
      map.addLayer({
        id: "cardata-range-fill",
        type: "fill",
        source: "cardata-ranges",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.10,
        },
      });
    }
    if (!map.getLayer("cardata-range-line")) {
      map.addLayer({
        id: "cardata-range-line",
        type: "line",
        source: "cardata-ranges",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2.5,
          "line-opacity": 0.88,
        },
      });
    }
    if (!map.getSource("cardata-range-labels")) {
      map.addSource("cardata-range-labels", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer("cardata-range-labels")) {
      map.addLayer({
        id: "cardata-range-labels",
        type: "symbol",
        source: "cardata-range-labels",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": ["get", "color"],
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });
    }
    if (!map.getSource("cardata-pois")) {
      map.addSource("cardata-pois", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        // A larger clustering radius reduces rendered marker count for wide
        // 500/1000-km charging searches while retaining the proven zoom range.
        clusterRadius: 68,
        clusterMaxZoom: 17,
      });
    }
    if (!map.getLayer("cardata-poi-clusters")) {
      map.addLayer({
        id: "cardata-poi-clusters",
        type: "circle",
        source: "cardata-pois",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#168aad",
          "circle-radius": ["step", ["get", "point_count"], 17, 10, 20, 30, 24, 100, 29],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.92,
        },
      });
    }
    if (!map.getLayer("cardata-poi-cluster-count")) {
      map.addLayer({
        id: "cardata-poi-cluster-count",
        type: "symbol",
        source: "cardata-pois",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });
    }
    if (!map.getLayer("cardata-poi-points")) {
      map.addLayer({
        id: "cardata-poi-points",
        type: "circle",
        source: "cardata-pois",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "category"], "charging"], ["get", "operatorColor"],
            ["match", ["get", "category"],
              "fuel", "#f28e2b",
              "restaurant", "#b65fcf",
              "cafe", "#9c6b30",
              "pharmacy", "#2ca25f",
              "hospital", "#d64545",
              "#168aad"
            ],
          ],
          "circle-radius": [
            "case",
            ["==", ["get", "selected"], 1], 12,
            ["==", ["get", "category"], "charging"], 10,
            8,
          ],
          "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 4, 2],
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.96,
        },
      });
    }
    if (!map.getLayer("cardata-poi-operator-code")) {
      map.addLayer({
        id: "cardata-poi-operator-code",
        type: "symbol",
        source: "cardata-pois",
        minzoom: 7,
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "category"], "charging"]],
        layout: {
          "text-field": ["get", "operatorCode"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 8.5,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.35)",
          "text-halo-width": 0.6,
        },
      });
    }
    if (!map.getSource("cardata-route-points")) {
      map.addSource("cardata-route-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer("cardata-route-points")) {
      map.addLayer({
        id: "cardata-route-points",
        type: "circle",
        source: "cardata-route-points",
        paint: {
          "circle-color": ["case",
            ["==", ["get", "kind"], "destination"], "#c62828",
            ["==", ["get", "kind"], "start"], "#2e7d32",
            "#3949ab"],
          "circle-radius": 13,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.96,
        },
      });
    }
    if (!map.getLayer("cardata-route-labels")) {
      map.addLayer({
        id: "cardata-route-labels",
        type: "symbol",
        source: "cardata-route-points",
        layout: {
          "text-field": ["get", "marker"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
    }
    if (!map.getSource("cardata-tracks")) {
      map.addSource("cardata-tracks", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getLayer("cardata-tracks")) {
      const beforeId = map.getLayer("cardata-poi-clusters") ? "cardata-poi-clusters" : undefined;
      map.addLayer({ id: "cardata-tracks", type: "line", source: "cardata-tracks", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 4.2, "line-opacity": 0.9 } }, beforeId);
    }
    if (!map.getSource("cardata-track-markers")) {
      map.addSource("cardata-track-markers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    if (!map.getLayer("cardata-track-markers")) {
      map.addLayer({ id: "cardata-track-markers", type: "circle", source: "cardata-track-markers", paint: { "circle-color": ["get", "color"], "circle-radius": ["case", ["==", ["get", "kind"], "playback"], 10, 8], "circle-stroke-width": 2.5, "circle-stroke-color": "#ffffff" } });
    }
    if (!map.getLayer("cardata-track-labels")) {
      map.addLayer({ id: "cardata-track-labels", type: "symbol", source: "cardata-track-markers", layout: { "text-field": ["get", "marker"], "text-font": ["Noto Sans Bold"], "text-size": 10, "text-allow-overlap": true }, paint: { "text-color": "#ffffff" } });
    }
    this._bindMapPoiHandlers();
    this._bindMapTrackingHandlers();
  }

  _bindMapTrackingHandlers() {
    const map = this._vectorMap;
    if (!map || !map.getLayer("cardata-tracks")) return;
    this._unbindMapTrackingHandlers();
    const click = (event) => {
      const feature = event?.features?.[0];
      if (!feature) return;
      const props = feature.properties || {};
      const lngLat = event.lngLat || { lng: feature.geometry?.coordinates?.[1]?.[0], lat: feature.geometry?.coordinates?.[1]?.[1] };
      if (!Number.isFinite(Number(lngLat?.lng)) || !Number.isFinite(Number(lngLat?.lat))) return;
      const rows = [];
      if (props.ts) rows.push(this._esc(this._formatTrackingDateTime(props.ts)));
      if (props.speed != null && Number.isFinite(Number(props.speed))) rows.push(`${this._esc(this._t("Geschwindigkeit"))}: ${this._formatNumber(Number(props.speed), 1)} km/h`);
      if (props.soc != null && Number.isFinite(Number(props.soc))) rows.push(`SoC: ${this._formatNumber(Number(props.soc), 0)} %`);
      if (props.odometer != null && Number.isFinite(Number(props.odometer))) rows.push(`${this._esc(this._t("Kilometerstand"))}: ${this._formatNumber(Number(props.odometer), 1)} km`);
      const html = `<strong>${this._esc(props.name || this._t("Fahrzeug"))}</strong><br>${rows.join("<br>")}`;
      try { this._trackingPopupMaplibre?.remove?.(); } catch (_) {}
      try { this._trackingPopupMaplibre = new this._maplibreLib.Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px" }).setLngLat([Number(lngLat.lng), Number(lngLat.lat)]).setHTML(html).addTo(map); } catch (err) { console.debug("[Cardata Analytics] tracking popup failed", err); }
    };
    const enter = () => { try { map.getCanvas().style.cursor = "pointer"; } catch (_) {} };
    const leave = () => { try { map.getCanvas().style.cursor = ""; } catch (_) {} };
    map.on("click", "cardata-tracks", click);
    map.on("mouseenter", "cardata-tracks", enter);
    map.on("mouseleave", "cardata-tracks", leave);
    this._mapTrackingHandlers = { click, enter, leave };
  }

  _unbindMapTrackingHandlers() {
    const map = this._vectorMap;
    const h = this._mapTrackingHandlers;
    if (map && h) {
      try { map.off("click", "cardata-tracks", h.click); } catch (_) {}
      try { map.off("mouseenter", "cardata-tracks", h.enter); } catch (_) {}
      try { map.off("mouseleave", "cardata-tracks", h.leave); } catch (_) {}
    }
    this._mapTrackingHandlers = null;
  }

  _bindMapPoiHandlers() {
    const map = this._vectorMap;
    if (!map || !map.getLayer("cardata-poi-clusters") || !map.getLayer("cardata-poi-points")) return;
    this._unbindMapPoiHandlers();
    const clusterClick = async (event) => {
      const feature = event?.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const coords = feature?.geometry?.coordinates;
      const source = map.getSource("cardata-pois");
      if (clusterId == null || !Array.isArray(coords) || !source?.getClusterExpansionZoom) return;
      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: coords, zoom: Math.min(this._tileProvider().maxZoom, zoom) });
      } catch (err) {
        console.debug("[Cardata Analytics] cluster expansion failed", err);
      }
    };
    const poiClick = (event) => {
      const poiId = String(event?.features?.[0]?.properties?.poiId || "");
      if (!poiId) return;
      this._selectedPoiId = poiId;
      this._syncPoiMapSource();
      this._showPoiPopup(poiId);
    };
    const pointerOn = () => { try { map.getCanvas().style.cursor = "pointer"; } catch (_) {} };
    const pointerOff = () => { try { map.getCanvas().style.cursor = ""; } catch (_) {} };
    map.on("click", "cardata-poi-clusters", clusterClick);
    map.on("click", "cardata-poi-points", poiClick);
    map.on("mouseenter", "cardata-poi-clusters", pointerOn);
    map.on("mouseleave", "cardata-poi-clusters", pointerOff);
    map.on("mouseenter", "cardata-poi-points", pointerOn);
    map.on("mouseleave", "cardata-poi-points", pointerOff);
    this._mapPoiHandlers = { clusterClick, poiClick, pointerOn, pointerOff };
  }

  _unbindMapPoiHandlers() {
    const map = this._vectorMap;
    const handlers = this._mapPoiHandlers;
    if (!map || !handlers) {
      this._mapPoiHandlers = null;
      return;
    }
    for (const [type, layer, handler] of [
      ["click", "cardata-poi-clusters", handlers.clusterClick],
      ["click", "cardata-poi-points", handlers.poiClick],
      ["mouseenter", "cardata-poi-clusters", handlers.pointerOn],
      ["mouseleave", "cardata-poi-clusters", handlers.pointerOff],
      ["mouseenter", "cardata-poi-points", handlers.pointerOn],
      ["mouseleave", "cardata-poi-points", handlers.pointerOff],
    ]) {
      try { map.off(type, layer, handler); } catch (_) { /* layer may be gone */ }
    }
    this._mapPoiHandlers = null;
  }

  _syncRangeMapSource() {
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady) return;
    this._ensureMapDataLayers();
    const source = map.getSource("cardata-ranges");
    if (source?.setData) source.setData(this._rangeGeoJson());
    const labelSource = map.getSource("cardata-range-labels");
    if (labelSource?.setData) labelSource.setData(this._rangeLabelGeoJson());
  }

  _syncVehicleMapMarkers() {
    const map = this._vectorMap;
    const maplibregl = this._maplibreLib;
    if (!map || !maplibregl) return;
    const visible = this._visibleVehicles();
    const wanted = new Set(visible.map((v) => v.deviceId));
    for (const [deviceId, item] of [...this._vehicleMapMarkers.entries()]) {
      if (wanted.has(deviceId)) continue;
      try { item.marker.remove(); } catch (_) {}
      this._vehicleMapMarkers.delete(deviceId);
    }
    for (const vehicle of visible) {
      let item = this._vehicleMapMarkers.get(vehicle.deviceId);
      if (!item) {
        const element = document.createElement("button");
        element.className = "vehicle-marker";
        element.type = "button";
        element.dataset.vehicleId = vehicle.deviceId;
        element.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const current = this._vehicles().find((v) => v.deviceId === vehicle.deviceId && v.valid);
          if (!current) return;
          if (this._mode === "gps") {
            this._focusVehicle(current.deviceId, { follow: true, showPopup: true, animate: true });
            return;
          }
          this._selectedVehicleId = current.deviceId;
          this._savePreferences();
          this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
          this._showPopup(current.deviceId);
          this._syncVehicleMapMarkers();
          this._renderVehiclePanel();
          this._renderPoiPanel();
          if (this._poiCenterMode === "vehicle" && this._poiCategories.size && this._poiSourceVehicleId !== current.deviceId) this._schedulePoiLoad(500, false);
        });
        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([vehicle.lon, vehicle.lat])
          .addTo(map);
        item = { marker, element };
        this._vehicleMapMarkers.set(vehicle.deviceId, item);
      }
      item.marker.setLngLat([vehicle.lon, vehicle.lat]);
      item.element.title = vehicle.name;
      item.element.style.setProperty("--vehicle-color", this._vehicleColor(vehicle.deviceId));
      item.element.classList.toggle("selected", vehicle.deviceId === this._selectedVehicleId);
      item.element.classList.toggle("following", this._mode === "gps" && vehicle.deviceId === this._selectedVehicleId);
      item.element.innerHTML = `<span class="marker-pulse"></span><span class="marker-core"><ha-icon icon="mdi:car-electric"></ha-icon></span><span class="marker-label">${this._esc(vehicle.name)}</span>`;
    }
  }

  _poiGeoJson() {
    if (!this._poiCategories.size || !this._poiSourceCenterKey) {
      return { type: "FeatureCollection", features: [] };
    }
    const currentCenter = this._poiSearchCenter();
    // Keep POIs from the last successful search visible while the SAME vehicle
    // moves. GPS updates can change the rounded center key every few metres,
    // whereas the intentional network refresh threshold is much larger. Hiding
    // on every key change therefore creates a blank POI layer during driving.
    // A vehicle switch still hides the old vehicle's POIs. Route-centered POIs
    // keep the existing strict identity check; map-centered POIs remain visible
    // while panning and are refreshed on demand/filter change.
    if (this._poiCenterMode === "vehicle") {
      if (!currentCenter || currentCenter.deviceId !== this._poiSourceVehicleId) {
        return { type: "FeatureCollection", features: [] };
      }
    } else if (this._poiCenterMode !== "map" && currentCenter && currentCenter.key !== this._poiSourceCenterKey) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: (this._poiResults || []).filter((poi) => this._poiCategories.has(poi.category)).map((poi) => {
        const operatorIdentity = poi.category === "charging" ? this._poiOperatorIdentity(poi) : "";
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [poi.lon, poi.lat] },
          properties: {
            poiId: poi.id,
            category: poi.category,
            name: this._poiDisplayName(poi),
            selected: poi.id === this._selectedPoiId ? 1 : 0,
            operatorCode: poi.category === "charging" ? (poi.operatorCode || this._poiOperatorCode(operatorIdentity)) : "",
            operatorColor: poi.category === "charging" ? (poi.operatorColor || this._poiOperatorColor(operatorIdentity)) : "#168aad",
          },
        };
      }),
    };
  }

  _syncPoiMapSource() {
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady) return;
    this._ensureMapDataLayers();
    const source = map.getSource("cardata-pois");
    if (source?.setData) source.setData(this._poiGeoJson());
  }

  _updateMapEmptyState(provider = this._tileProvider()) {
    const empty = this.shadowRoot?.getElementById("map-empty");
    if (!empty) return;
    const allGpsVehicles = this._vehicles().filter((v) => v.valid);
    const visible = this._visibleVehicles();
    if (provider?.unavailableMessage) {
      empty.textContent = provider.unavailableMessage;
      empty.classList.add("show");
    } else if (this._vectorMapError) {
      empty.textContent = this._t("Karte konnte nicht geladen werden: {error}", { error: this._vectorMapError });
      empty.classList.add("show");
    } else if (!allGpsVehicles.length) {
      empty.textContent = this._t("Keine gültige Fahrzeugposition verfügbar. Bitte Latitude und Longitude beim Fahrzeug konfigurieren.");
      empty.classList.add("show");
    } else if (!visible.length) {
      empty.textContent = this._t("Alle Fahrzeuge sind ausgeblendet.");
      empty.classList.add("show");
    } else {
      empty.textContent = "";
      empty.classList.remove("show");
    }
  }

  _renderMap(forceTiles = false) {
    void forceTiles;
    if (!this._domBuilt) return;
    const mapHost = this.shadowRoot?.getElementById("map");
    const vectorLayer = this.shadowRoot?.getElementById("vector-map");
    if (!mapHost || !vectorLayer) return;

    if (this._mode === "gps") {
      const selected = this._selectedVehicle() || this._visibleVehicles()[0];
      if (selected) {
        this._selectedVehicleId = selected.deviceId;
        this._center = { lat: selected.lat, lon: selected.lon };
      }
    }

    const provider = this._tileProvider();
    if (this._zoom > provider.maxZoom) this._zoom = provider.maxZoom;
    vectorLayer.classList.toggle("hidden", !provider.maplibreStyle);
    this.shadowRoot?.getElementById("tiles")?.classList.add("hidden");
    this.shadowRoot?.getElementById("poi-markers")?.classList.add("hidden");
    this.shadowRoot?.getElementById("markers")?.classList.add("hidden");

    if (provider.maplibreStyle) {
      this._syncVectorBasemap(provider);
      if (this._vectorMap) {
        this._syncRangeMapSource();
        this._syncVehicleMapMarkers();
        this._syncPoiMapSource();
        this._syncRouteMapSource();
        this._syncTrackingMapSource();
      }
    }

    const attribution = this.shadowRoot?.getElementById("attribution");
    if (attribution) attribution.innerHTML = provider.attribution || "";
    this._updateMapEmptyState(provider);
    this._positionPopup();
    this._positionPoiPopup();
  }

  _toggleAllRanges() {
    const available = this._rangeCapableVehicles();
    if (!available.length) return;
    const allEnabled = available.every((vehicle) => this._rangeVehicles.has(vehicle.deviceId));
    if (allEnabled) {
      this._rangeVehicles.clear();
    } else {
      for (const vehicle of available) this._rangeVehicles.add(vehicle.deviceId);
    }
    this._savePreferences();
    this._syncRangeMapSource();
    this._renderVehiclePanel();
    this._updateControls();
  }

  _fitVisibleRanges(save = true) {
    const vehicles = this._visibleVehicles().filter((v) => this._rangeVehicles.has(v.deviceId)
      && Number.isFinite(Number(v.range)) && Number(v.range) > 0);
    if (!vehicles.length) {
      this._fitVisibleVehicles(save);
      return;
    }
    const points = [];
    for (const vehicle of vehicles) {
      points.push(...this._rangeRingCoordinates(vehicle, 72));
    }
    if (!points.length) {
      this._fitVisibleVehicles(save);
      return;
    }
    if (this._mode === "gps") this._mode = this._lastFreeMode || "osm";
    const lons = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    this._center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
    const map = this._vectorMap;
    if (map && this._mapStyleReady) {
      try {
        map.resize();
        const panelOpen = !this.shadowRoot?.getElementById("vehicle-panel")?.classList.contains("hidden")
          || !this.shadowRoot?.getElementById("poi-panel")?.classList.contains("hidden")
          || !this.shadowRoot?.getElementById("route-panel")?.classList.contains("hidden")
          || !this.shadowRoot?.getElementById("tracking-panel")?.classList.contains("hidden");
        const hostWidth = this.shadowRoot?.getElementById("map")?.getBoundingClientRect()?.width || 1000;
        const sidePadding = panelOpen ? Math.min(360, Math.max(80, hostWidth * 0.24)) : 70;
        map.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
          padding: { top: 70, bottom: 70, left: 70, right: sidePadding },
          maxZoom: Math.min(13, this._tileProvider().maxZoom),
          duration: 480,
        });
        if (save) setTimeout(() => this._savePreferences(), 520);
        this._updateControls();
        return;
      } catch (err) {
        console.warn("[Cardata Analytics] range fitBounds failed; using vehicle fit fallback", err);
      }
    }
    this._fitVisibleVehicles(save);
  }

  _fitVisibleVehicles(save = true) {
    const vehicles = this._visibleVehicles();
    if (!vehicles.length) {
      this._renderMap(true);
      return;
    }

    // "Alle" is a free-map action. Leave GPS follow before fitting, otherwise
    // the next render/state update would immediately snap back to one vehicle.
    if (this._mode === "gps") this._mode = this._lastFreeMode || "osm";
    this._selectedVehicleId = vehicles.length === 1 ? vehicles[0].deviceId : this._selectedVehicleId;
    this._updateControls();

    const minLat = Math.min(...vehicles.map((v) => v.lat));
    const maxLat = Math.max(...vehicles.map((v) => v.lat));
    const minLon = Math.min(...vehicles.map((v) => v.lon));
    const maxLon = Math.max(...vehicles.map((v) => v.lon));
    this._center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };

    const map = this._vectorMap;
    if (map && this._mapStyleReady) {
      try {
        map.resize();
        const panelOpen = !this.shadowRoot?.getElementById("vehicle-panel")?.classList.contains("hidden")
          || !this.shadowRoot?.getElementById("poi-panel")?.classList.contains("hidden");
        const hostWidth = this.shadowRoot?.getElementById("map")?.getBoundingClientRect()?.width || 1000;
        const sidePadding = panelOpen ? Math.min(360, Math.max(80, hostWidth * 0.24)) : 70;
        if (vehicles.length === 1) {
          map.easeTo({
            center: [vehicles[0].lon, vehicles[0].lat],
            zoom: Math.min(15, this._tileProvider().maxZoom),
            duration: 320,
          });
        } else {
          map.fitBounds(
            [[minLon, minLat], [maxLon, maxLat]],
            {
              padding: { top: 70, bottom: 70, left: 70, right: sidePadding },
              maxZoom: Math.min(15, this._tileProvider().maxZoom),
              duration: 420,
            }
          );
        }
        if (save) setTimeout(() => this._savePreferences(), 480);
        return;
      } catch (err) {
        console.warn("[Cardata Analytics] MapLibre fitBounds failed; using fallback", err);
      }
    }

    // Fallback for the short initialization window before MapLibre is ready.
    const mapHost = this.shadowRoot.getElementById("map");
    const rect = mapHost?.getBoundingClientRect();
    const width = Math.max(300, rect?.width || 800);
    const height = Math.max(250, rect?.height || 500);
    if (vehicles.length === 1) {
      this._zoom = 15;
    } else {
      let bestZoom = 2;
      for (let z = 17; z >= 2; z--) {
        const nw = this._latLonToWorld(maxLat, minLon, z);
        const se = this._latLonToWorld(minLat, maxLon, z);
        if (Math.abs(se.x - nw.x) <= width - 120 && Math.abs(se.y - nw.y) <= height - 140) {
          bestZoom = z;
          break;
        }
      }
      this._zoom = bestZoom;
    }
    if (save) this._savePreferences();
    this._renderMap(true);
  }

  _updateFromHass() {
    const selected = this._selectedVehicle();
    if (this._mode === "gps" && selected) this._followSelectedVehiclePosition({ animate: true });
    const poiMoveThresholdKm = Math.max(0.5, Math.min(20, this._poiRadiusKm * 0.1));
    if (this._poiCenterMode === "vehicle" && selected && this._poiCategories.size && this._poiSourceVehicleId === selected.deviceId
        && Number.isFinite(this._poiSourceLat) && Number.isFinite(this._poiSourceLon)
        && this._distanceKm(this._poiSourceLat, this._poiSourceLon, selected.lat, selected.lon) >= poiMoveThresholdKm) {
      this._schedulePoiLoad(1500, false);
    }
    this._renderMap();
    this._updateControls();
    this._renderVehiclePanel();
    this._renderPoiPanel();
    const routeAddressEditing = this.shadowRoot?.activeElement?.id === "route-address-query";
    if (!routeAddressEditing) this._renderRoutePanel();
    this._syncRouteMapSource();
    const popup = this.shadowRoot.getElementById("popup");
    if (popup && !popup.classList.contains("hidden") && this._selectedVehicleId) {
      this._showPopup(this._selectedVehicleId, false);
    }
    const poiPopup = this.shadowRoot.getElementById("poi-popup");
    if (poiPopup && !poiPopup.classList.contains("hidden") && this._selectedPoiId) {
      this._showPoiPopup(this._selectedPoiId, false);
    }
  }

  _updateControls() {
    this.shadowRoot.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === this._mode);
    });
    this.shadowRoot.getElementById("poi-toggle")?.classList.toggle("active", this._poiCategories.size > 0);
    const routePanel = this.shadowRoot.getElementById("route-panel");
    const routeActive = Boolean(this._routeDestination || this._routeWaypoints.length || (routePanel && !routePanel.classList.contains("hidden")));
    this.shadowRoot.getElementById("route-toggle")?.classList.toggle("active", routeActive);
    const trackingPanel = this.shadowRoot.getElementById("tracking-panel");
    const trackingActive = Boolean((this._trackingResult?.vehicles || []).some((v) => Number(v.point_count || 0) > 0) || (trackingPanel && !trackingPanel.classList.contains("hidden")));
    this.shadowRoot.getElementById("tracking-toggle")?.classList.toggle("active", trackingActive);
    const rangeButton = this.shadowRoot.getElementById("ranges-toggle");
    const enabledRangeCount = this._rangeCapableVehicles().filter((v) => this._rangeVehicles.has(v.deviceId)).length;
    rangeButton?.classList.toggle("active", enabledRangeCount > 0);
    if (rangeButton) rangeButton.disabled = !this._rangeCapableVehicles().length;
    const fitRangeButton = this.shadowRoot.getElementById("fit-ranges");
    if (fitRangeButton) fitRangeButton.disabled = !this._visibleVehicles().some((v) => this._rangeVehicles.has(v.deviceId) && Number(v.range) > 0);
    this._updateTerrainControls();
    this._updateFullscreenIcon();
  }

  _renderVehiclePanel() {
    const panel = this.shadowRoot.getElementById("vehicle-panel");
    if (!panel) return;
    const vehicles = this._vehicles();
    panel.innerHTML = `
      <div class="panel-title"><span>${this._esc(this._t("Fahrzeuge"))}</span><button id="panel-close" aria-label="${this._esc(this._t("Schließen"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="panel-actions"><button id="show-all">${this._esc(this._t("Alle anzeigen"))}</button><button id="hide-all">${this._esc(this._t("Alle ausblenden"))}</button><button id="fit-all-ranges" ${this._rangeVehicles.size ? "" : "disabled"}>${this._esc(this._t("Alle + Reichweite"))}</button></div>
      <div class="vehicle-list">
        ${vehicles.map((v) => {
          const rangeAvailable = v.valid && Number.isFinite(Number(v.range)) && Number(v.range) > 0;
          const color = this._vehicleColor(v.deviceId);
          return `
          <div class="vehicle-row ${v.valid ? "" : "invalid"}" data-vehicle-row="${this._esc(v.deviceId)}" style="--vehicle-color:${this._esc(color)}">
            <label class="vehicle-visible-toggle">
              <input type="checkbox" data-vehicle-check="${this._esc(v.deviceId)}" ${!this._hiddenVehicles.has(v.deviceId) ? "checked" : ""} ${v.valid ? "" : "disabled"}>
              <span class="vehicle-color-dot" aria-hidden="true"></span>
              <span class="vehicle-row-main"><strong>${this._esc(v.name)}</strong><small>${v.valid ? this._esc(v.address || `${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}`) : this._esc(this._t("Standort nicht verfügbar"))}</small>${v.valid ? `<small class="vehicle-motion">${this._esc(this._gpsMotionCompactText(v))}</small>` : ""}</span>
            </label>
            ${v.valid ? `<button class="focus-btn" data-focus="${this._esc(v.deviceId)}" title="${this._esc(this._t("Fahrzeug zentrieren"))}"><ha-icon icon="mdi:crosshairs-gps"></ha-icon></button>` : ""}
            <label class="vehicle-range-toggle"><input type="checkbox" data-range-check="${this._esc(v.deviceId)}" ${this._rangeVehicles.has(v.deviceId) ? "checked" : ""} ${rangeAvailable ? "" : "disabled"}> <ha-icon icon="mdi:map-marker-radius-outline"></ha-icon>${rangeAvailable ? `${this._esc(this._t("Reichweite"))} ${this._formatNumber(v.range, 0)} km` : this._esc(this._t("Reichweite nicht verfügbar"))}</label>
          </div>`;
        }).join("") || `<div class="panel-empty">${this._esc(this._t("Keine Fahrzeuge mit GPS-Konfiguration gefunden."))}</div>`}
      </div>`;

    panel.querySelector("#panel-close")?.addEventListener("click", () => panel.classList.add("hidden"));
    panel.querySelector("#fit-all-ranges")?.addEventListener("click", () => this._fitVisibleRanges(true));
    panel.querySelector("#show-all")?.addEventListener("click", () => {
      this._hiddenVehicles.clear();
      this._savePreferences();
      this._renderVehiclePanel();
      this._renderMap(true);
      this._renderPoiPanel();
      if (this._poiCategories.size) this._schedulePoiLoad(500, false);
    });
    panel.querySelector("#hide-all")?.addEventListener("click", () => {
      for (const v of vehicles) this._hiddenVehicles.add(v.deviceId);
      this._savePreferences();
      this._renderVehiclePanel();
      this._renderMap(true);
      this._renderPoiPanel();
    });
    panel.querySelectorAll("[data-range-check]").forEach((input) => {
      input.addEventListener("change", (ev) => {
        ev.stopPropagation();
        const id = String(input.dataset.rangeCheck || "");
        if (!id) return;
        if (input.checked) this._rangeVehicles.add(id);
        else this._rangeVehicles.delete(id);
        this._savePreferences();
        this._syncRangeMapSource();
        this._renderVehiclePanel();
        this._updateControls();
      });
    });
    panel.querySelectorAll("[data-vehicle-check]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.vehicleCheck;
        if (input.checked) this._hiddenVehicles.delete(id);
        else this._hiddenVehicles.add(id);
        if (this._selectedVehicleId === id && !input.checked) {
          this.shadowRoot.getElementById("popup")?.classList.add("hidden");
        }
        this._savePreferences();
        this._renderMap(true);
        this._renderPoiPanel();
        if (this._poiCategories.size) this._schedulePoiLoad(500, false);
      });
    });
    panel.querySelectorAll("[data-focus]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._focusVehicle(btn.dataset.focus, { follow: true, showPopup: true, animate: true });
      });
    });
  }

  _renderRoutePanel() {
    const panel = this.shadowRoot?.getElementById("route-panel");
    if (!panel) return;
    const activeBefore = this.shadowRoot?.activeElement;
    const preserveAddressFocus = activeBefore?.id === "route-address-query";
    if (preserveAddressFocus) this._routeGeocodeQuery = String(activeBefore.value || "");
    const addressSelection = preserveAddressFocus ? [activeBefore.selectionStart, activeBefore.selectionEnd] : null;
    const panelScrollTop = panel.scrollTop;
    const restorePanelUi = () => {
      panel.scrollTop = panelScrollTop;
      if (!preserveAddressFocus) return;
      const input = panel.querySelector("#route-address-query");
      if (!input) return;
      requestAnimationFrame(() => {
        try {
          input.focus({ preventScroll: true });
          if (addressSelection && Number.isInteger(addressSelection[0]) && Number.isInteger(addressSelection[1])) input.setSelectionRange(addressSelection[0], addressSelection[1]);
          panel.scrollTop = panelScrollTop;
        } catch (_) { /* focus restoration is best effort */ }
      });
    };
    const routePickActive = ["destination", "waypoint", "start"].includes(this._routePickMode);
    panel.classList.toggle("route-picking", routePickActive);
    if (routePickActive) {
      const pickingWaypoint = this._routePickMode === "waypoint";
      const pickingStart = this._routePickMode === "start";
      panel.innerHTML = `
        <div class="route-mobile-handle" aria-hidden="true"><span></span></div>
        <div class="route-pick-compact">
          <ha-icon icon="${pickingWaypoint ? "mdi:map-marker-plus-outline" : (pickingStart ? "mdi:map-marker-account-outline" : "mdi:flag-checkered")}"></ha-icon>
          <div><strong>${this._esc(this._t(pickingWaypoint ? "Zwischenziel auf Karte wählen" : (pickingStart ? "Startpunkt auf Karte wählen" : "Ziel auf Karte wählen")))}</strong><small>${this._esc(this._t("Tippe oder klicke auf die gewünschte Position. POIs können weiterhin direkt geöffnet werden."))}</small></div>
          <button id="route-pick-cancel" aria-label="${this._esc(this._t("Abbrechen"))}"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>`;
      panel.querySelector("#route-pick-cancel")?.addEventListener("click", () => {
        this._cancelRouteMapPick();
        this._routeMessage = this._t("Kartenauswahl abgebrochen.");
        this._renderRoutePanel();
      });
      restorePanelUi();
      return;
    }

    const vehicles = this._vehicles();
    const start = this._routeStart();
    const destination = this._normalizeRoutePoint(this._routeDestination);
    const googleUrl = this._routeGoogleMapsUrl(false);
    const navigateUrl = this._routeGoogleMapsUrl(true);
    const googleWaypointLimit = this._routeGoogleWaypointLimit();
    const mobileGoogleLimit = googleWaypointLimit === ROUTE_MOBILE_GOOGLE_WAYPOINTS;
    const hasExtendedWaypoints = this._routeWaypoints.length > ROUTE_MOBILE_GOOGLE_WAYPOINTS;
    const googleExportWarning = hasExtendedWaypoints
      ? (mobileGoogleLimit
        ? this._t("Diese Route enthält {count} Zwischenziele. Cardata behält alle, aber Google Maps erhält auf diesem mobilen Gerät aus Kompatibilitätsgründen nur die ersten {mobile}.", { count: this._routeWaypoints.length, mobile: ROUTE_MOBILE_GOOGLE_WAYPOINTS })
        : this._t("Diese Route enthält {count} Zwischenziele und wird auf diesem Gerät vollständig an Google Maps übergeben. Hinweis: Mobile Browser garantieren nur {mobile} Zwischenziele.", { count: this._routeWaypoints.length, mobile: ROUTE_MOBILE_GOOGLE_WAYPOINTS }))
      : "";
    const routeRange = Number(start?.range);
    const routeTemplates = this._routeGlobalTemplates || {};
    const savedDestinations = this._routeDestinations || {};
    const zones = this._haZoneDestinations();
    const selectedTarget = this._routeSelectedDestinationKey;
    const selectedGlobalDestination = selectedTarget.startsWith("destination:") ? savedDestinations[selectedTarget] : null;
    const distanceBadge = (point) => {
      if (!start || !point) return "";
      const distance = this._distanceKm(start.lat, start.lon, point.lat, point.lon);
      const rangeText = Number.isFinite(routeRange) && routeRange > 0
        ? ` · ${this._t(distance <= routeRange ? "innerhalb Luftlinienbereich" : "außerhalb Luftlinienbereich")}`
        : "";
      return `${this._formatNumber(distance, 1)} km ${this._t("Luftlinie")}${rangeText}`;
    };

    panel.innerHTML = `
      <div class="route-mobile-handle" aria-hidden="true"><span></span></div>
      <div class="panel-title"><span>${this._esc(this._t("Routenplanung"))}</span><button id="route-panel-close" aria-label="${this._esc(this._t("Schließen"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>

      <div class="route-section route-template-section">
        <div class="route-section-head"><span>${this._esc(this._t("Routenvorlage"))} ${this._routeDataLoaded ? "· global" : ""}</span></div>
        <div class="route-template-row">
          <select id="route-template" aria-label="${this._esc(this._t("Routenvorlage"))}">
            <option value="" ${!this._routeActiveTemplate ? "selected" : ""}>${this._esc(this._t("Aktuelle Route"))}</option>
            ${Object.keys(routeTemplates).length ? `<optgroup label="${this._esc(this._t("Eigene · global"))}">${Object.entries(routeTemplates).sort((a,b) => String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0]), this._locale())).map(([key, item]) => `<option value="${this._esc(key)}" ${this._routeActiveTemplate === key ? "selected" : ""}>${this._esc(item?.name || key)}</option>`).join("")}</optgroup>` : ""}
          </select>
          <button id="route-template-save" title="${this._esc(this._t("Aktuelle Route global speichern"))}" ${destination ? "" : "disabled"}><ha-icon icon="mdi:content-save-outline"></ha-icon></button>
          <button id="route-template-delete" title="${this._esc(this._t("Globale Routenvorlage löschen"))}" ${this._routeActiveTemplate?.startsWith("route:") ? "" : "disabled"}><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        </div>
      </div>

      <div class="route-section route-start-section">
        <div class="route-section-head"><span>${this._esc(this._t("Startpunkt"))}</span></div>
        <label class="route-field"><span>${this._esc(this._t("Fahrzeugposition"))}</span><select id="route-vehicle-select">
          <option value="" ${this._routeStartMode !== "vehicle" ? "selected" : ""}>${this._esc(this._t("Fahrzeug wählen …"))}</option>
          ${vehicles.map((vehicle) => `<option value="${this._esc(vehicle.deviceId)}" ${this._routeStartMode === "vehicle" && start?.deviceId === vehicle.deviceId ? "selected" : ""} ${vehicle.valid ? "" : "disabled"}>${this._esc(vehicle.name)}${vehicle.valid ? "" : ` · ${this._t("kein GPS")}`}</option>`).join("")}
        </select></label>
        <div class="route-actions route-start-actions">
          <button id="route-use-device-location" class="${this._routeStartMode === "device" ? "active" : ""}" ${this._routeDeviceLocationLoading ? "disabled" : ""}><ha-icon icon="${this._routeDeviceLocationLoading ? "mdi:loading" : "mdi:cellphone-marker"}" class="${this._routeDeviceLocationLoading ? "spin" : ""}"></ha-icon>${this._esc(this._t(this._routeDeviceLocationLoading ? "Smartphone-Standort wird ermittelt …" : "Smartphone"))}</button>
        </div>
        ${this._routeDeviceLocationError ? `<div class="route-search-status warning">${this._esc(this._routeDeviceLocationError)}</div>` : ""}
        <div class="route-start-card">
          <ha-icon icon="${this._routeStartMode === "vehicle" ? "mdi:car-electric" : (this._routeStartMode === "device" ? "mdi:cellphone-marker" : "mdi:map-marker-account-outline")}"></ha-icon>
          <div><strong>${this._esc(start?.name || start?.label || this._t("Startposition nicht verfügbar"))}</strong><small>${start ? this._esc(start.address || `${start.lat.toFixed(5)}, ${start.lon.toFixed(5)}`) : this._esc(this._t("Startposition nicht verfügbar"))}</small>${this._routeStartMode === "device" && this._routeStartUpdatedAt ? `<small>${this._esc(this._t("Smartphone-Standort gesetzt · {age}", { age: this._formatAge(new Date(this._routeStartUpdatedAt).toISOString()) }))}</small>` : ""}</div>
          ${start ? `<button id="route-focus-start" title="${this._esc(this._t("Startpunkt zentrieren"))}"><ha-icon icon="mdi:crosshairs-gps"></ha-icon></button>` : ""}
        </div>
      </div>

      <div class="route-section">
        <div class="route-section-head"><span>${this._esc(this._t("Zwischenziele"))}</span><strong>${this._routeWaypoints.length}/${ROUTE_MAX_WAYPOINTS}</strong></div>
        <div class="route-stop-list">
          ${this._routeWaypoints.length ? this._routeWaypoints.map((item, index) => {
            const point = this._normalizeRoutePoint(item);
            if (!point) return "";
            return `<div class="route-stop">
              <span class="route-badge">${index + 1}</span>
              <div class="route-stop-main"><strong>${this._esc(point.label)}</strong><small>${this._esc(point.address || distanceBadge(point))}</small>${point.address ? `<small>${this._esc(distanceBadge(point))}</small>` : ""}</div>
              <div class="route-stop-actions">
                <button data-route-up="${index}" title="${this._esc(this._t("Nach oben"))}" ${index === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
                <button data-route-down="${index}" title="${this._esc(this._t("Nach unten"))}" ${index === this._routeWaypoints.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
                <button data-route-remove="${index}" title="${this._esc(this._t("Entfernen"))}"><ha-icon icon="mdi:close"></ha-icon></button>
              </div>
            </div>`;
          }).join("") : `<div class="route-empty">${this._esc(this._t("POI, Adresse oder Kartenpunkt als Zwischenziel wählen. Cardata verwaltet bis zu {max} Zwischenziele.", { max: ROUTE_MAX_WAYPOINTS }))}</div>`}
        </div>
        ${googleExportWarning ? `<div class="route-export-warning"><ha-icon icon="mdi:alert-outline"></ha-icon><span>${this._esc(googleExportWarning)}</span></div>` : ""}
      </div>

      <div class="route-section">
        <div class="route-section-head"><span>${this._esc(this._t("Ziel"))}</span>${destination ? `<button id="route-clear-destination" class="route-link-button">${this._esc(this._t("Entfernen"))}</button>` : ""}</div>
        ${destination ? `<div class="route-stop route-destination">
          <span class="route-badge">${this._esc(this._t("Z"))}</span>
          <div class="route-stop-main"><strong>${this._esc(destination.label)}</strong><small>${this._esc(destination.address || distanceBadge(destination))}</small>${destination.address ? `<small>${this._esc(distanceBadge(destination))}</small>` : ""}</div>
        </div>` : `<div class="route-empty">${this._esc(this._t("Ziel über POI, gespeicherten Ort, Adresse oder direkt auf der Karte setzen."))}</div>`}
      </div>

      <div class="route-section route-destination-library">
        <div class="route-section-head"><span>${this._esc(this._t("Gespeicherte Orte & Zonen"))} ${this._routeDataLoaded ? "· global" : ""}</span></div>
        <div class="route-destination-row">
          <select id="route-saved-destination" aria-label="${this._esc(this._t("Gespeichertes Ziel"))}">
            <option value="">${this._esc(this._t("Ort auswählen …"))}</option>
            ${Object.keys(savedDestinations).length ? `<optgroup label="Cardata · global">${Object.entries(savedDestinations).sort((a,b) => String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0]), this._locale())).map(([key, item]) => `<option value="${this._esc(key)}" ${selectedTarget === key ? "selected" : ""}>${this._esc(item?.name || key)}</option>`).join("")}</optgroup>` : ""}
            ${zones.length ? `<optgroup label="${this._esc(this._t("Home Assistant Zonen"))}">${zones.map((zone) => `<option value="${this._esc(zone.key)}" ${selectedTarget === zone.key ? "selected" : ""}>${this._esc(zone.name)}</option>`).join("")}</optgroup>` : ""}
          </select>
          <button id="route-start-use-saved" title="${this._esc(this._t("Ausgewählten Ort als Start verwenden"))}" ${selectedTarget ? "" : "disabled"}><ha-icon icon="mdi:map-marker-account-outline"></ha-icon></button>
          <button id="route-destination-use" title="${this._esc(this._t("Ausgewähltes Ziel übernehmen"))}" ${selectedTarget ? "" : "disabled"}><ha-icon icon="mdi:flag-checkered"></ha-icon></button>
        </div>
        <div class="route-mini-actions">
          <button id="route-destination-save" ${destination ? "" : "disabled"}><ha-icon icon="mdi:content-save-outline"></ha-icon>${this._esc(this._t("Aktuelles Ziel speichern"))}</button>
          <button id="route-destination-rename" ${selectedGlobalDestination ? "" : "disabled"}><ha-icon icon="mdi:rename-outline"></ha-icon>${this._esc(this._t("Umbenennen"))}</button>
          <button id="route-destination-delete" ${selectedGlobalDestination ? "" : "disabled"}><ha-icon icon="mdi:delete-outline"></ha-icon>${this._esc(this._t("Löschen"))}</button>
        </div>
      </div>

      <div class="route-section route-address-section">
        <div class="route-section-head"><span>${this._esc(this._t("Adresse suchen"))}</span></div>
        <div class="route-address-row">
          <input id="route-address-query" type="search" value="${this._esc(this._routeGeocodeQuery)}" placeholder="${this._esc(this._t("Adresse, Ort oder Ziel …"))}" autocomplete="street-address">
          <button id="route-address-search" ${this._routeGeocodeLoading ? "disabled" : ""}><ha-icon icon="mdi:magnify"></ha-icon></button>
        </div>
        ${this._routeGeocodeLoading ? `<div class="route-search-status"><ha-icon icon="mdi:loading" class="spin"></ha-icon> ${this._esc(this._t("Adresse wird gesucht …"))}</div>` : ""}
        ${this._routeGeocodeError ? `<div class="route-search-status warning">${this._esc(this._routeGeocodeError)}</div>` : ""}
        ${this._routeGeocodeResults.length ? `<div class="route-search-results">${this._routeGeocodeResults.map((item, index) => `<div class="route-search-result">
          <div><strong>${this._esc(item.name || item.address || this._t("Ziel"))}</strong><small>${this._esc(item.address || `${Number(item.lat).toFixed(5)}, ${Number(item.lon).toFixed(5)}`)}</small></div>
          <button data-route-search-start="${index}" title="${this._esc(this._t("Als Start"))}"><ha-icon icon="mdi:map-marker-account-outline"></ha-icon></button>
          <button data-route-search-waypoint="${index}" title="${this._esc(this._t("Als Zwischenziel"))}" ${this._routeWaypoints.length >= ROUTE_MAX_WAYPOINTS ? "disabled" : ""}><ha-icon icon="mdi:map-marker-plus-outline"></ha-icon></button>
          <button data-route-search-use="${index}" title="${this._esc(this._t("Als Ziel"))}"><ha-icon icon="mdi:flag-checkered"></ha-icon></button>
          <button data-route-search-save="${index}" title="${this._esc(this._t("Global speichern"))}"><ha-icon icon="mdi:content-save-outline"></ha-icon></button>
        </div>`).join("")}</div>` : ""}
      </div>

      <div class="route-section route-map-pick-section">
        <div class="route-section-head"><span>${this._esc(this._t("Punkt auf Karte"))}</span></div>
        <div class="route-actions route-map-pick-actions">
          <button id="route-pick-start" class="${this._routePickMode === "start" ? "active" : ""}"><ha-icon icon="mdi:map-marker-account-outline"></ha-icon>${this._esc(this._t(this._routePickMode === "start" ? "Auf Karte tippen …" : "Als Start"))}</button>
          <button id="route-pick-waypoint" class="${this._routePickMode === "waypoint" ? "active" : ""}" ${this._routeWaypoints.length >= ROUTE_MAX_WAYPOINTS ? "disabled" : ""}><ha-icon icon="mdi:map-marker-plus-outline"></ha-icon>${this._esc(this._t(this._routePickMode === "waypoint" ? "Auf Karte tippen …" : "Zwischenziel"))}</button>
          <button id="route-pick-destination" class="${this._routePickMode === "destination" ? "active" : ""}"><ha-icon icon="mdi:flag-checkered"></ha-icon>${this._esc(this._t(this._routePickMode === "destination" ? "Auf Karte tippen …" : "Ziel"))}</button>
        </div>
      </div>
      <div class="route-actions">
        <button id="route-open-pois"><ha-icon icon="mdi:map-marker-radius"></ha-icon>${this._esc(this._t("POIs wählen"))}</button>
        <button id="route-fit" ${start && (destination || this._routeWaypoints.length) ? "" : "disabled"}><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon>${this._esc(this._t("Einpassen"))}</button>
      </div>
      <div class="route-actions route-google-actions">
        <a id="route-google" class="${googleUrl ? "" : "disabled"}" href="${this._esc(googleUrl || "#")}" target="_blank" rel="noopener" aria-disabled="${googleUrl ? "false" : "true"}"><ha-icon icon="mdi:google-maps"></ha-icon>Google Maps</a>
        <a id="route-navigate" class="${navigateUrl ? "" : "disabled"}" href="${this._esc(navigateUrl || "#")}" target="_blank" rel="noopener" aria-disabled="${navigateUrl ? "false" : "true"}"><ha-icon icon="mdi:navigation-variant"></ha-icon>${this._esc(this._t("Navigation"))}</a>
      </div>
      <div class="route-actions"><button id="route-clear" ${!destination && !this._routeWaypoints.length ? "disabled" : ""}><ha-icon icon="mdi:delete-outline"></ha-icon>${this._esc(this._t("Route löschen"))}</button></div>
      <div class="route-status ${this._routePickMode ? "active" : ""}">${this._esc(this._routeMessage || (destination ? this._t("Cardata übergibt Start, Zwischenziele und Ziel. Die echte Straßenroute berechnet Google Maps.") : this._t("Cardata zeichnet nur Routenpunkte – keine irreführende Luftlinienroute.")))}</div>
      <div class="route-note">${this._esc(this._t("Routen und gespeicherte Ziele sind global in Home Assistant gespeichert. Der Startpunkt kann Fahrzeug, Smartphone, gespeicherter Ort, HA-Zone, Adresse oder Kartenpunkt sein."))}</div>`;

    panel.querySelector("#route-panel-close")?.addEventListener("click", () => {
      panel.classList.add("hidden");
      this._cancelRouteMapPick();
      this._updateControls();
    });
    panel.querySelector("#route-template")?.addEventListener("change", (event) => {
      const key = String(event.target.value || "");
      if (key) this._applyRouteTemplate(key);
      else { this._routeActiveTemplate = ""; this._savePreferences(); }
    });
    panel.querySelector("#route-template-save")?.addEventListener("click", async () => {
      if (!destination) return;
      const existingName = this._routeActiveTemplate?.startsWith("route:") ? routeTemplates[this._routeActiveTemplate]?.name : "";
      const name = window.prompt(this._t("Name der globalen Routenvorlage:"), existingName || "");
      if (!name || !name.trim()) return;
      const clean = name.trim().slice(0, 80);
      const template = this._snapshotRouteTemplate(clean);
      if (!template) return;
      const key = this._routeActiveTemplate?.startsWith("route:") ? this._routeActiveTemplate : `route:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        await this._saveGlobalRouteTemplate(key, template);
        this._routeActiveTemplate = key;
        this._routeMessage = this._t("Routenvorlage „{name}“ global gespeichert.", { name: clean });
        this._savePreferences();
        this._renderRoutePanel();
      } catch (err) {
        window.alert(this._t("Routenvorlage konnte nicht gespeichert werden: {error}", { error: err?.message || err }));
      }
    });
    panel.querySelector("#route-template-delete")?.addEventListener("click", async () => {
      const key = this._routeActiveTemplate;
      if (!key?.startsWith("route:")) return;
      const name = routeTemplates[key]?.name || this._t("diese Routenvorlage");
      if (!window.confirm(this._t("Globale Routenvorlage „{name}“ löschen?", { name }))) return;
      try {
        await this._deleteGlobalRouteTemplate(key);
        this._routeActiveTemplate = "";
        this._routeMessage = this._t("Routenvorlage gelöscht. Die aktuelle Route bleibt bestehen.");
        this._savePreferences();
        this._renderRoutePanel();
      } catch (err) {
        window.alert(this._t("Routenvorlage konnte nicht gelöscht werden: {error}", { error: err?.message || err }));
      }
    });
    panel.querySelector("#route-vehicle-select")?.addEventListener("change", (event) => {
      const id = String(event.target.value || "");
      if (!id) return;
      this._setRouteStartVehicle(id, this._t("Startfahrzeug geändert. Die Google-Maps-Route verwendet dessen aktuelle GPS-Position."));
    });
    panel.querySelector("#route-use-device-location")?.addEventListener("click", () => this._refreshRouteDeviceLocation());
    panel.querySelector("#route-focus-start")?.addEventListener("click", () => this._focusRouteStart());
    panel.querySelectorAll("[data-route-up]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.routeUp);
      if (!Number.isInteger(index) || index <= 0 || index >= this._routeWaypoints.length) return;
      [this._routeWaypoints[index - 1], this._routeWaypoints[index]] = [this._routeWaypoints[index], this._routeWaypoints[index - 1]];
      this._routeMarkChanged(this._t("Zwischenziel-Reihenfolge geändert."));
      this._savePreferences();
      this._syncRouteMapSource();
      this._renderRoutePanel();
    }));
    panel.querySelectorAll("[data-route-down]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.routeDown);
      if (!Number.isInteger(index) || index < 0 || index >= this._routeWaypoints.length - 1) return;
      [this._routeWaypoints[index + 1], this._routeWaypoints[index]] = [this._routeWaypoints[index], this._routeWaypoints[index + 1]];
      this._routeMarkChanged(this._t("Zwischenziel-Reihenfolge geändert."));
      this._savePreferences();
      this._syncRouteMapSource();
      this._renderRoutePanel();
    }));
    panel.querySelectorAll("[data-route-remove]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.routeRemove);
      if (!Number.isInteger(index) || index < 0 || index >= this._routeWaypoints.length) return;
      this._routeWaypoints.splice(index, 1);
      this._routeMarkChanged(this._t("Zwischenziel entfernt."));
      this._savePreferences();
      this._syncRouteMapSource();
      this._renderRoutePanel();
      this._updateControls();
    }));
    panel.querySelector("#route-clear-destination")?.addEventListener("click", () => {
      this._routeDestination = null;
      this._routeMarkChanged(this._t("Ziel entfernt."));
      this._cancelRouteMapPick();
      this._savePreferences();
      this._syncRouteMapSource();
      this._renderRoutePanel();
      this._updateControls();
      this._poiRouteCenterChanged();
    });

    panel.querySelector("#route-saved-destination")?.addEventListener("change", (event) => {
      this._routeSelectedDestinationKey = String(event.target.value || "");
      this._renderRoutePanel();
    });
    const selectedLibraryPoint = () => {
      const key = this._routeSelectedDestinationKey;
      if (!key) return null;
      if (key.startsWith("destination:")) return this._savedDestinationPoint(key, this._routeDestinations[key]);
      if (key.startsWith("zone:")) {
        const zone = this._haZoneDestinations().find((item) => item.key === key);
        if (zone) return this._normalizeRoutePoint({ id: key, lat: zone.lat, lon: zone.lon, label: zone.name, address: zone.address, category: "ha_zone" });
      }
      return null;
    };
    panel.querySelector("#route-start-use-saved")?.addEventListener("click", () => {
      const point = selectedLibraryPoint();
      if (!point) return;
      const mode = point.category === "ha_zone" ? "zone" : "saved";
      this._setRouteStartPoint(point, mode, this._t("{label} wurde als Startpunkt gesetzt.", { label: point.label }));
    });
    panel.querySelector("#route-destination-use")?.addEventListener("click", () => {
      const point = selectedLibraryPoint();
      if (point) this._setRouteDestination(point, this._t("{label} wurde als Ziel gesetzt.", { label: point.label }));
    });
    panel.querySelector("#route-destination-save")?.addEventListener("click", async () => {
      const point = this._normalizeRoutePoint(this._routeDestination);
      if (!point) return;
      const name = window.prompt(this._t("Name des globalen Ziels:"), point.label || "");
      if (!name || !name.trim()) return;
      const clean = name.trim().slice(0, 80);
      const key = `destination:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        await this._saveGlobalDestination(key, { name: clean, lat: point.lat, lon: point.lon, address: point.address || "" });
        this._routeSelectedDestinationKey = key;
        this._routeMessage = this._t("Ziel „{name}“ global gespeichert.", { name: clean });
        this._renderRoutePanel();
      } catch (err) {
        window.alert(this._t("Ziel konnte nicht gespeichert werden: {error}", { error: err?.message || err }));
      }
    });
    panel.querySelector("#route-destination-rename")?.addEventListener("click", async () => {
      const key = this._routeSelectedDestinationKey;
      const item = key?.startsWith("destination:") ? this._routeDestinations[key] : null;
      if (!item) return;
      const name = window.prompt(this._t("Neuer Name des globalen Ziels:"), item.name || "");
      if (!name || !name.trim()) return;
      const clean = name.trim().slice(0, 80);
      try {
        await this._saveGlobalDestination(key, { ...item, name: clean });
        this._routeMessage = this._t("Ziel in „{name}“ umbenannt.", { name: clean });
        this._renderRoutePanel();
      } catch (err) {
        window.alert(this._t("Ziel konnte nicht umbenannt werden: {error}", { error: err?.message || err }));
      }
    });
    panel.querySelector("#route-destination-delete")?.addEventListener("click", async () => {
      const key = this._routeSelectedDestinationKey;
      const item = key?.startsWith("destination:") ? this._routeDestinations[key] : null;
      if (!item) return;
      if (!window.confirm(this._t("Globales Ziel „{name}“ löschen?", { name: item.name || this._t("Ziel") }))) return;
      try {
        await this._deleteGlobalDestination(key);
        this._routeSelectedDestinationKey = "";
        this._routeMessage = this._t("Gespeichertes Ziel gelöscht. Eine bereits aktive Route bleibt bestehen.");
        this._renderRoutePanel();
      } catch (err) {
        window.alert(this._t("Ziel konnte nicht gelöscht werden: {error}", { error: err?.message || err }));
      }
    });

    const submitAddressSearch = () => {
      const input = panel.querySelector("#route-address-query");
      this._searchRouteAddress(String(input?.value || ""));
    };
    panel.querySelector("#route-address-search")?.addEventListener("click", submitAddressSearch);
    panel.querySelector("#route-address-query")?.addEventListener("input", (event) => {
      this._routeGeocodeQuery = String(event.target.value || "");
    });
    panel.querySelector("#route-address-query")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); submitAddressSearch(); }
    });
    panel.querySelectorAll("[data-route-search-start]").forEach((button) => button.addEventListener("click", () => {
      const item = this._routeGeocodeResults[Number(button.dataset.routeSearchStart)];
      if (!item) return;
      const point = this._normalizeRoutePoint({ id: `address:${item.lat},${item.lon}`, lat: item.lat, lon: item.lon, label: item.name || item.address || this._t("Adresse"), address: item.address || "", category: "address" });
      if (point) this._setRouteStartPoint(point, "address", this._t("{label} wurde als Startpunkt gesetzt.", { label: point.label }));
    }));
    panel.querySelectorAll("[data-route-search-waypoint]").forEach((button) => button.addEventListener("click", () => {
      const item = this._routeGeocodeResults[Number(button.dataset.routeSearchWaypoint)];
      if (!item) return;
      const point = this._normalizeRoutePoint({ id: `address:${item.lat},${item.lon}`, lat: item.lat, lon: item.lon, label: item.name || item.address || this._t("Adresse"), address: item.address || "", category: "address" });
      if (point) this._addRouteWaypoint(point, this._t("{label} wurde als Zwischenziel {index} hinzugefügt.", { label: point.label, index: this._routeWaypoints.length + 1 }));
    }));
    panel.querySelectorAll("[data-route-search-use]").forEach((button) => button.addEventListener("click", () => {
      const item = this._routeGeocodeResults[Number(button.dataset.routeSearchUse)];
      if (!item) return;
      const point = this._normalizeRoutePoint({ id: `address:${item.lat},${item.lon}`, lat: item.lat, lon: item.lon, label: item.name || item.address || this._t("Adresse"), address: item.address || "", category: "address" });
      if (point) this._setRouteDestination(point, this._t("{label} wurde als Ziel gesetzt.", { label: point.label }));
    }));
    panel.querySelectorAll("[data-route-search-save]").forEach((button) => button.addEventListener("click", async () => {
      const item = this._routeGeocodeResults[Number(button.dataset.routeSearchSave)];
      if (!item) return;
      const proposed = item.name || item.address || this._t("Ziel");
      const name = window.prompt(this._t("Name des globalen Ziels:"), proposed);
      if (!name || !name.trim()) return;
      const clean = name.trim().slice(0, 80);
      const key = `destination:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        await this._saveGlobalDestination(key, { name: clean, lat: Number(item.lat), lon: Number(item.lon), address: String(item.address || "") });
        this._routeSelectedDestinationKey = key;
        this._routeMessage = this._t("Ziel „{name}“ global gespeichert.", { name: clean });
        this._renderRoutePanel();
      } catch (err) {
        window.alert(this._t("Ziel konnte nicht gespeichert werden: {error}", { error: err?.message || err }));
      }
    }));

    panel.querySelector("#route-open-pois")?.addEventListener("click", () => {
      this._cancelRouteMapPick();
      panel.classList.add("hidden");
      const poiPanel = this.shadowRoot?.getElementById("poi-panel");
      poiPanel?.classList.remove("hidden");
      this._renderPoiPanel();
      this._loadGlobalPoiTemplates(true);
      this._updateControls();
    });
    panel.querySelector("#route-pick-start")?.addEventListener("click", () => {
      if (this._routePickMode === "start") {
        this._cancelRouteMapPick();
        this._routeMessage = this._t("Kartenauswahl abgebrochen.");
      } else {
        this._routePickMode = "start";
        this._routeMessage = this._t("Tippe oder klicke jetzt auf die gewünschte Startposition in der Karte.");
        try { const canvas = this._vectorMap?.getCanvas?.(); if (canvas) canvas.style.cursor = "crosshair"; } catch (_) {}
      }
      this._renderRoutePanel();
    });
    panel.querySelector("#route-pick-waypoint")?.addEventListener("click", () => {
      if (this._routeWaypoints.length >= ROUTE_MAX_WAYPOINTS) {
        this._routeMessage = this._t("Maximal {max} Zwischenziele in Cardata.", { max: ROUTE_MAX_WAYPOINTS });
        this._renderRoutePanel();
        return;
      }
      if (this._routePickMode === "waypoint") {
        this._cancelRouteMapPick();
        this._routeMessage = this._t("Kartenauswahl abgebrochen.");
      } else {
        this._routePickMode = "waypoint";
        this._routeMessage = this._t("Tippe oder klicke jetzt auf die gewünschte Position für das nächste Zwischenziel.");
        try { const canvas = this._vectorMap?.getCanvas?.(); if (canvas) canvas.style.cursor = "crosshair"; } catch (_) {}
      }
      this._renderRoutePanel();
    });
    panel.querySelector("#route-pick-destination")?.addEventListener("click", () => {
      if (this._routePickMode === "destination") {
        this._cancelRouteMapPick();
        this._routeMessage = this._t("Kartenauswahl abgebrochen.");
      } else {
        this._routePickMode = "destination";
        this._routeMessage = this._t("Tippe oder klicke jetzt auf die gewünschte Zielposition in der Karte.");
        try { const canvas = this._vectorMap?.getCanvas?.(); if (canvas) canvas.style.cursor = "crosshair"; } catch (_) {}
      }
      this._renderRoutePanel();
    });
    panel.querySelector("#route-fit")?.addEventListener("click", () => this._fitRoutePoints(true));
    panel.querySelector("#route-clear")?.addEventListener("click", () => {
      this._routeWaypoints = [];
      this._routeDestination = null;
      this._routeMarkChanged(this._t("Route gelöscht."));
      this._cancelRouteMapPick();
      this._savePreferences();
      this._syncRouteMapSource();
      this._renderRoutePanel();
      this._updateControls();
      this._poiRouteCenterChanged();
    });
    for (const id of ["route-google", "route-navigate"]) {
      panel.querySelector(`#${id}`)?.addEventListener("click", (event) => {
        if (!destination || !start) event.preventDefault();
      });
    }
    restorePanelUi();
  }
  _renderPoiPanel() {
    const panel = this.shadowRoot?.getElementById("poi-panel");
    if (!panel) return;
    const defs = this._poiDefinitions();
    const vehicles = this._vehicles();
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    const selected = [...this._poiCategories];
    const customTemplates = this._readPoiTemplates();
    const poiCenter = this._poiSearchCenter();
    const routeCenterAvailable = Boolean(this._normalizeRoutePoint(this._routeDestination));
    const operatorSuggestions = [...new Set([
      "IONITY", "EnBW", "Tesla", "Fastned", "Allego", "Aral pulse", "E.ON Drive", "Shell Recharge",
      ...this._poiOperators,
      ...(this._poiRawResults || []).flatMap((poi) => [poi.operator, poi.brand, poi.network]).filter(Boolean).map(String),
    ])].sort((a, b) => a.localeCompare(b, this._locale())).slice(0, 60);
    const chargingSelected = this._poiCategories.has("charging");
    const selectedDefs = selected.map((key) => [key, defs[key]]).filter(([, def]) => def);

    panel.innerHTML = `
      <div class="poi-mobile-handle" aria-hidden="true"><span></span></div>
      <div class="poi-sticky-top">
        <div class="panel-title"><span>Points of Interest</span><button id="poi-panel-close" aria-label="${this._esc(this._t("Schließen"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>
        <div class="poi-center-row">
          <label class="poi-field"><span>${this._esc(this._t("POI-Zentrum"))}</span><select id="poi-center-mode">
            <option value="vehicle" ${this._poiCenterMode === "vehicle" ? "selected" : ""}>${this._esc(this._t("Aktuelles Fahrzeug"))}</option>
            <option value="route" ${this._poiCenterMode === "route" ? "selected" : ""} ${routeCenterAvailable ? "" : "disabled"}>${this._esc(this._t("Routenziel"))}${routeCenterAvailable ? "" : ` · ${this._esc(this._t("nicht gesetzt"))}`}</option>
            <option value="map" ${this._poiCenterMode === "map" ? "selected" : ""}>${this._esc(this._t("Kartenmitte"))}</option>
          </select></label>
          <div class="poi-center-hint">${this._esc(poiCenter?.label || (this._poiCenterMode === "route" ? this._t("Routenziel fehlt") : this._t("Kein Zentrum verfügbar")))}</div>
        </div>
        <div class="poi-vehicle-row">
          <label class="poi-field"><span>${this._esc(this._t("Fahrzeug"))}</span><select id="poi-vehicle-select">
            ${vehicles.map((item) => `<option value="${this._esc(item.deviceId)}" ${vehicle?.deviceId === item.deviceId ? "selected" : ""} ${item.valid ? "" : "disabled"}>${this._esc(item.name)}${item.valid ? "" : ` · ${this._t("kein GPS")}`}</option>`).join("")}
          </select></label>
          <button id="poi-vehicle-focus" class="poi-focus-button" title="${this._esc(this._t("Auf ausgewähltes Fahrzeug zoomen"))}" ${vehicle ? "" : "disabled"}><ha-icon icon="mdi:crosshairs-gps"></ha-icon></button>
        </div>

        <div class="poi-filter-section poi-template-section">
          <div class="poi-section-title">${this._esc(this._t("Vorlagen"))} ${this._poiTemplatesLoaded ? "· global" : ""}</div>
          <div class="poi-template-row">
            <select id="poi-template" aria-label="${this._esc(this._t("POI-Vorlage"))}">
              <option value="" ${!this._poiActiveTemplate ? "selected" : ""}>${this._esc(this._t("Aktuelle Filter"))}</option>
              ${Object.keys(customTemplates).length ? `<optgroup label="${this._esc(this._t("Eigene · global"))}">${Object.entries(customTemplates).sort((a,b) => String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0]), this._locale())).map(([key, item]) => `<option value="${this._esc(key)}" ${this._poiActiveTemplate === key ? "selected" : ""}>${this._esc(item.name || key.replace(/^custom:/, ""))}</option>`).join("")}</optgroup>` : ""}
            </select>
            <button id="poi-template-save" title="${this._esc(this._t("Aktuelle Filter global speichern"))}"><ha-icon icon="mdi:content-save-outline"></ha-icon></button>
            <button id="poi-template-delete" title="${this._esc(this._t("Eigene globale Vorlage löschen"))}" ${this._poiActiveTemplate?.startsWith("custom:") ? "" : "disabled"}><ha-icon icon="mdi:delete-outline"></ha-icon></button>
          </div>
        </div>

        <div class="poi-filter-section poi-category-search-section">
          <label class="poi-field poi-category-search"><span>${this._esc(this._t("Kategorie suchen"))}</span><input id="poi-category-search" type="search" placeholder="${this._esc(this._t("z. B. Bäckerei, Museum, Geldautomat …"))}"></label>
          ${selectedDefs.length ? `<div class="poi-selected-chips" aria-label="${this._esc(this._t("Aktive POI-Kategorien"))}">${selectedDefs.map(([key, def]) => `<button type="button" data-remove-poi-category="${this._esc(key)}" title="${this._esc(def.label)} ${this._esc(this._t("abwählen"))}"><ha-icon icon="${this._esc(def.icon)}"></ha-icon><span>${this._esc(def.label)}</span><ha-icon icon="mdi:close"></ha-icon></button>`).join("")}</div>` : `<div class="poi-selected-empty">${this._esc(this._t("Keine Kategorie ausgewählt"))}</div>`}
        </div>
      </div>

      <div class="poi-category-scroll">
        <div class="poi-category-groups">
          ${this._poiCategoryGroups().map((group) => {
            const entries = Object.entries(defs).filter(([, def]) => def.group === group.key);
            const selectedCount = entries.filter(([key]) => this._poiCategories.has(key)).length;
            const open = this._poiOpenGroups.has(group.key);
            return `<details class="poi-category-group" data-poi-group="${this._esc(group.key)}" ${open ? "open" : ""}>
              <summary><span class="poi-group-label">${this._esc(group.label)}</span><span class="poi-group-count">${selectedCount}/${entries.length}</span></summary>
              <div class="poi-categories">
                ${entries.map(([key, def]) => `<label class="poi-category" data-poi-category-label="${this._esc(this._normalizePoiSearchText(def.label))}">
                  <input type="checkbox" data-poi-category="${this._esc(key)}" ${this._poiCategories.has(key) ? "checked" : ""}>
                  <ha-icon icon="${this._esc(def.icon)}"></ha-icon>
                  <span>${this._esc(def.label)}</span>
                </label>`).join("")}
              </div>
            </details>`;
          }).join("")}
        </div>
      </div>

      <div class="poi-sticky-bottom">
        <div class="poi-filter-section poi-general-search-section">
          <div class="poi-section-title">${this._esc(this._t("Allgemeine POI-Suche"))}</div>
          <label class="poi-field"><span>${this._esc(this._t("Suche"))}</span><input id="poi-search" type="search" value="${this._esc(this._poiSearchText)}" placeholder="${this._esc(this._t("z. B. Starbucks, Apotheke, Hotel …"))}"></label>
        </div>

        <div class="poi-filter-section ${chargingSelected ? "" : "poi-disabled-section"}">
          <div class="poi-section-title">${this._esc(this._t("Ladestationen"))} ${chargingSelected ? "" : `· ${this._esc(this._t("aktivieren"))}`}</div>
          ${this._poiOperators.length ? `<div class="poi-operator-chips">${this._poiOperators.map((item, index) => {
            const color = this._poiOperatorColor(item);
            return `<button type="button" data-remove-poi-operator="${index}" title="${this._esc(this._t("{name} entfernen", { name: item }))}" style="--poi-operator-color:${this._esc(color)}"><span>${this._esc(this._poiOperatorCode(item))}</span>${this._esc(item)}<ha-icon icon="mdi:close"></ha-icon></button>`;
          }).join("")}</div>` : `<div class="poi-selected-empty">${this._esc(this._t("Alle Betreiber / Netzwerke"))}</div>`}
          <div class="poi-operator-entry">
            <label class="poi-field"><span>${this._esc(this._t("Betreiber hinzufügen"))}</span><input id="poi-operator" list="poi-operator-list" type="search" value="${this._esc(this._poiOperatorText)}" placeholder="${this._esc(this._t("z. B. IONITY, EnBW, Tesla"))}" ${chargingSelected ? "" : "disabled"}></label>
            <button id="poi-operator-add" type="button" title="${this._esc(this._t("Betreiber hinzufügen"))}" ${chargingSelected && this._poiOperators.length < 12 ? "" : "disabled"}><ha-icon icon="mdi:plus"></ha-icon></button>
          </div>
          <datalist id="poi-operator-list">${operatorSuggestions.map((item) => `<option value="${this._esc(item)}"></option>`).join("")}</datalist>
          <div class="poi-filter-grid poi-charging-grid">
            <label class="poi-field"><span>${this._esc(this._t("Stecker"))}</span><select id="poi-connector" ${chargingSelected ? "" : "disabled"}>
              ${[["any",this._t("Alle")],["ccs","CCS"],["type2","Type 2"],["chademo","CHAdeMO"],["tesla","Tesla"]].map(([value,label]) => `<option value="${value}" ${this._poiConnector === value ? "selected" : ""}>${label}</option>`).join("")}
            </select></label>
            <label class="poi-field"><span>${this._esc(this._t("Mindestleistung"))}</span><select id="poi-min-power" ${chargingSelected ? "" : "disabled"}>
              ${[[0,this._t("Alle")],[50,"≥ 50 kW"],[100,"≥ 100 kW"],[150,"≥ 150 kW"],[200,"≥ 200 kW"],[300,"≥ 300 kW"],[350,"≥ 350 kW"]].map(([value,label]) => `<option value="${value}" ${Number(this._poiMinPowerKw) === value ? "selected" : ""}>${label}</option>`).join("")}
            </select></label>
          </div>
          <label class="poi-check-row"><input id="poi-include-unknown" type="checkbox" ${this._poiIncludeUnknownPower ? "checked" : ""} ${chargingSelected ? "" : "disabled"}><span>${this._esc(this._t("Lader mit unbekannter Leistung einbeziehen"))}</span></label>
        </div>

        <label class="poi-radius-label">${this._esc(this._t("Umkreis"))}
          <select id="poi-radius">
            ${POI_RADIUS_OPTIONS_KM.map((km) => `<option value="${km}" ${this._poiRadiusKm === km ? "selected" : ""}>${km} km</option>`).join("")}
          </select>
        </label>
        <div class="poi-actions">
          <button id="poi-refresh" ${!selected.length || !poiCenter || this._poiLoading ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon> ${this._esc(this._t("Aktualisieren"))}</button>
          <button id="poi-clear" ${!selected.length && !this._poiResults.length ? "disabled" : ""}><ha-icon icon="mdi:map-marker-off-outline"></ha-icon> ${this._esc(this._t("Aus"))}</button>
        </div>
        <div class="poi-status ${this._poiError ? "warning" : ""}">${this._esc(this._poiStatusText())}</div>
        <div class="poi-note">${this._esc(this._t("Allgemeine POIs © OpenStreetMap-Mitwirkende · Ladestationen: Open Charge Map · OCM bis 1000 km, allgemeine Overpass-POIs bis 200 km · Vorlagen global in Home Assistant gespeichert · Cardata {version}.", { version: CARD_VERSION }))}</div>
      </div>`;

    panel.querySelector("#poi-panel-close")?.addEventListener("click", () => panel.classList.add("hidden"));

    panel.querySelector("#poi-center-mode")?.addEventListener("change", (ev) => {
      const mode = String(ev.target.value || "vehicle");
      if (!["vehicle", "route", "map"].includes(mode)) return;
      this._poiCenterMode = mode;
      this._poiActiveTemplate = "";
      this._poiSourceCenterKey = "";
      this._poiSourceCenterLabel = "";
      this._savePreferences();
      this._renderMap(false);
      if (this._poiCategories.size) {
        const center = this._poiSearchCenter();
        if (center) {
          this._poiLoading = true;
          this._poiError = "";
          this._renderPoiPanel();
          this._schedulePoiLoad(120, false);
        } else {
          this._poiLoading = false;
          this._poiError = this._t("Für dieses POI-Zentrum muss zuerst ein Routenziel gesetzt werden.");
          this._renderPoiPanel();
        }
      } else {
        this._renderPoiPanel();
      }
    });

    panel.querySelector("#poi-vehicle-select")?.addEventListener("change", (ev) => {
      const id = String(ev.target.value || "");
      if (!id) return;
      const previousVehicle = this._selectedVehicleId;
      if (!this._focusVehicle(id, { follow: false, showPopup: false, animate: true })) return;
      if (previousVehicle !== id && this._poiCategories.size && this._poiCenterMode === "vehicle") {
        this._poiSourceCenterKey = "";
        this._poiSourceCenterLabel = "";
        this._poiLoading = true;
        this._poiError = "";
        this._schedulePoiLoad(120, false);
      }
    });
    panel.querySelector("#poi-vehicle-focus")?.addEventListener("click", () => {
      const id = String(panel.querySelector("#poi-vehicle-select")?.value || vehicle?.deviceId || "");
      if (id) this._focusVehicle(id, { follow: false, showPopup: false, animate: true });
    });

    panel.querySelector("#poi-template")?.addEventListener("change", (ev) => {
      const key = String(ev.target.value || "");
      if (key) this._applyPoiTemplate(key);
      else this._poiActiveTemplate = "";
    });
    panel.querySelector("#poi-template-save")?.addEventListener("click", async () => {
      const current = this._poiActiveTemplate?.startsWith("custom:") ? customTemplates[this._poiActiveTemplate]?.name : "";
      const name = window.prompt(this._t("Name der globalen POI-Vorlage:"), current || "");
      if (!name || !name.trim()) return;
      const clean = name.trim().slice(0, 60);
      let key = this._poiActiveTemplate?.startsWith("custom:") ? this._poiActiveTemplate : "";
      if (!key) key = `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        await this._saveGlobalPoiTemplate(key, this._snapshotPoiFilter(clean));
        this._poiActiveTemplate = key;
        this._renderPoiPanel();
      } catch (err) {
        window.alert(this._t("POI-Vorlage konnte nicht global gespeichert werden: {error}", { error: err?.message || err }));
      }
    });
    panel.querySelector("#poi-template-delete")?.addEventListener("click", async () => {
      const key = this._poiActiveTemplate;
      if (!key?.startsWith("custom:")) return;
      const name = customTemplates[key]?.name || this._t("diese Vorlage");
      if (!window.confirm(this._t("Globale POI-Vorlage „{name}“ löschen?", { name }))) return;
      try {
        await this._deleteGlobalPoiTemplate(key);
        this._poiActiveTemplate = "";
        this._renderPoiPanel();
      } catch (err) {
        window.alert(this._t("POI-Vorlage konnte nicht gelöscht werden: {error}", { error: err?.message || err }));
      }
    });

    panel.querySelectorAll(".poi-category-group").forEach((group) => {
      group.addEventListener("toggle", () => {
        const key = String(group.dataset.poiGroup || "");
        if (!key) return;
        if (group.open) {
          // On narrow screens keep the accordion compact: one open group at a time.
          if (window.matchMedia?.("(max-width: 600px)")?.matches) {
            panel.querySelectorAll(".poi-category-group[open]").forEach((other) => {
              if (other !== group) other.open = false;
            });
            this._poiOpenGroups.clear();
          }
          this._poiOpenGroups.add(key);
        } else {
          this._poiOpenGroups.delete(key);
        }
      });
    });

    const categorySearch = panel.querySelector("#poi-category-search");
    categorySearch?.addEventListener("input", () => {
      const needle = this._normalizePoiSearchText(categorySearch.value);
      panel.querySelectorAll(".poi-category-group").forEach((group) => {
        let visibleCount = 0;
        group.querySelectorAll(".poi-category").forEach((label) => {
          const haystack = String(label.dataset.poiCategoryLabel || "");
          const visible = !needle || haystack.includes(needle) || haystack.replace(/\s+/g, "").includes(needle.replace(/\s+/g, ""));
          label.classList.toggle("poi-category-filtered", !visible);
          if (visible) visibleCount += 1;
        });
        group.classList.toggle("poi-category-group-filtered", visibleCount === 0);
        if (needle && visibleCount > 0) group.open = true;
      });
    });

    const setCategory = (key, enabled) => {
      const chargingWasSelected = this._poiCategories.has("charging");
      if (enabled) this._poiCategories.add(key);
      else this._poiCategories.delete(key);
      if (key === "charging" && chargingWasSelected && !enabled) this._clearChargingSpecificFilters(true);
      this._poiActiveTemplate = "";
      this._savePreferences();
      this._selectedPoiId = null;
      this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
      if (!this._poiCategories.size) {
        this._resetPoiRequestState(true);
        this._poiRawResults = [];
        this._poiResults = [];
        this._poiSourceVehicleId = null;
        this._poiSourceLat = null;
        this._poiSourceLon = null;
        this._poiSourceCenterKey = "";
        this._poiSourceCenterLabel = "";
        this._poiError = "";
        this._poiLoading = false;
        this._renderMap(false);
        this._renderPoiPanel();
        this._updateControls();
        return;
      }
      this._poiLoading = true;
      this._poiError = "";
      this._renderPoiPanel();
      this._updateControls();
      this._schedulePoiLoad(600, false);
    };

    panel.querySelectorAll("[data-poi-category]").forEach((input) => {
      input.addEventListener("change", () => setCategory(input.dataset.poiCategory, Boolean(input.checked)));
    });
    panel.querySelectorAll("[data-remove-poi-category]").forEach((button) => {
      button.addEventListener("click", () => setCategory(button.dataset.removePoiCategory, false));
    });

    const localFilterChanged = () => {
      this._poiActiveTemplate = "";
      const templateSelect = panel.querySelector("#poi-template");
      if (templateSelect) templateSelect.value = "";
      this._applyPoiClientFilters();
      this._savePreferences();
      this._renderMap(false);
      this._updatePoiStatusDom();
    };
    panel.querySelector("#poi-search")?.addEventListener("input", (ev) => {
      this._poiSearchText = String(ev.target.value || "");
      localFilterChanged();
    });
    panel.querySelector("#poi-search")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this._poiSearchText = String(ev.target.value || "").trim();
        localFilterChanged();
      }
    });
    panel.querySelector("#poi-min-power")?.addEventListener("change", (ev) => {
      this._poiMinPowerKw = Number(ev.target.value) || 0;
      localFilterChanged();
    });
    panel.querySelector("#poi-include-unknown")?.addEventListener("change", (ev) => {
      this._poiIncludeUnknownPower = Boolean(ev.target.checked);
      localFilterChanged();
    });

    const serverFilterChanged = () => {
      this._poiActiveTemplate = "";
      this._savePreferences();
      if (this._poiCategories.size) {
        this._poiLoading = true;
        this._poiError = "";
        this._renderPoiPanel();
        this._schedulePoiLoad(350, false);
      }
    };
    const commitOperator = (value) => {
      if (!this._addPoiOperator(value)) {
        this._poiOperatorText = "";
        this._renderPoiPanel();
        return;
      }
      serverFilterChanged();
    };
    panel.querySelector("#poi-operator")?.addEventListener("input", (ev) => {
      this._poiOperatorText = String(ev.target.value || "");
    });
    panel.querySelector("#poi-operator")?.addEventListener("change", (ev) => {
      const value = String(ev.target.value || "").trim();
      if (value) commitOperator(value);
    });
    panel.querySelector("#poi-operator")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === ",") {
        ev.preventDefault();
        const value = String(ev.target.value || "").replace(/,$/, "").trim();
        if (value) commitOperator(value);
      }
    });
    panel.querySelector("#poi-operator-add")?.addEventListener("click", () => {
      const value = String(panel.querySelector("#poi-operator")?.value || "").trim();
      if (value) commitOperator(value);
    });
    panel.querySelectorAll("[data-remove-poi-operator]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.removePoiOperator);
        if (!Number.isInteger(index) || index < 0 || index >= this._poiOperators.length) return;
        this._poiOperators = this._poiOperators.filter((_item, itemIndex) => itemIndex !== index);
        serverFilterChanged();
      });
    });
    panel.querySelector("#poi-connector")?.addEventListener("change", (ev) => {
      this._poiConnector = String(ev.target.value || "any");
      serverFilterChanged();
    });
    panel.querySelector("#poi-radius")?.addEventListener("change", (ev) => {
      this._poiRadiusKm = Number(ev.target.value) || 5;
      this._poiActiveTemplate = "";
      this._savePreferences();
      if (this._poiCategories.size) {
        this._poiLoading = true;
        this._poiError = "";
        this._renderPoiPanel();
        const targetedRadiusRefresh = Boolean(
          this._poiSearchText.trim()
          && [...this._poiCategories].some((category) => category !== "charging")
        );
        this._schedulePoiLoad(350, targetedRadiusRefresh);
      }
    });
    panel.querySelector("#poi-refresh")?.addEventListener("click", () => this._schedulePoiLoad(0, true));
    panel.querySelector("#poi-clear")?.addEventListener("click", () => {
      this._resetPoiRequestState(true);
      this._poiCategories.clear();
      this._poiRawResults = [];
      this._poiResults = [];
      this._poiMatchedCount = 0;
      this._poiCandidateLimitHit = false;
      this._poiCandidateLimit = 0;
      this._poiSourceVehicleId = null;
      this._poiSourceLat = null;
      this._poiSourceLon = null;
      this._poiSourceCenterKey = "";
      this._poiSourceCenterLabel = "";
      this._poiError = "";
      this._poiLoading = false;
      this._selectedPoiId = null;
      this._poiActiveTemplate = "";
      this._savePreferences();
      this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
      this._renderPoiPanel();
      this._renderMap(false);
      this._updateControls();
    });
  }

  _renderPoiMarkers(topLeft, width, height, n) {
    // Kept as a compatibility shim for older call sites. POIs are GeoJSON
    // features rendered and clustered directly by MapLibre in 0.1.35+.
    void topLeft; void width; void height; void n;
    this._syncPoiMapSource();
  }

  _showPoiPopup(poiId, reposition = true) {
    const popup = this.shadowRoot?.getElementById("poi-popup");
    const poi = this._poiResults.find((item) => item.id === poiId);
    if (!popup || !poi) return;
    this._selectedPoiId = poi.id;
    const defs = this._poiDefinitions();
    const def = defs[poi.category] || { label: "POI", icon: "mdi:map-marker" };
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    const distance = vehicle ? this._distanceKm(vehicle.lat, vehicle.lon, poi.lat, poi.lon) : null;
    const vehicleRange = Number(vehicle?.range);
    const rangeHint = distance != null && Number.isFinite(vehicleRange) && vehicleRange > 0
      ? this._t(distance <= vehicleRange ? "im Luftlinien-Reichweitenbereich" : "außerhalb Luftlinien-Reichweitenbereich")
      : "";
    const detailParts = [
      poi.operator ? `${this._t("Betreiber")}: ${poi.operator}` : null,
      poi.brand && poi.brand !== poi.operator ? `${this._t("Marke")}: ${poi.brand}` : null,
      poi.network && poi.network !== poi.operator && poi.network !== poi.brand ? `${this._t("Netz")}: ${poi.network}` : null,
      poi.category === "charging" && poi.maxPowerKw != null && Number.isFinite(Number(poi.maxPowerKw)) ? `${this._t("Max. Leistung")}: ${this._formatNumber(poi.maxPowerKw, 0)} kW` : null,
      poi.openingHours ? `${this._t("Öffnung")}: ${poi.openingHours}` : null,
      poi.capacity ? `${this._t("Kapazität")}: ${poi.capacity}` : null,
      poi.access ? `${this._t("Zugang")}: ${poi.access}` : null,
      poi.fee ? `${this._t("Gebühr")}: ${poi.fee}` : null,
      poi.sourceLabel ? `${this._t("Quelle")}: ${poi.sourceLabel}` : null,
      poi.sourceLicense ? `${this._t("Lizenz")}: ${poi.sourceLicense}` : null,
      ...(Array.isArray(poi.connectors) ? poi.connectors : []),
    ].filter(Boolean);
    const osmUrl = poi.osmType && poi.osmId
      ? `https://www.openstreetmap.org/${encodeURIComponent(poi.osmType)}/${encodeURIComponent(poi.osmId)}`
      : null;
    popup.innerHTML = `
      <div class="popup-head"><div><strong><ha-icon icon="${this._esc(def.icon)}"></ha-icon>${this._esc(this._poiDisplayName(poi))}</strong><div>${this._esc(poi.address || `${poi.lat.toFixed(6)}, ${poi.lon.toFixed(6)}`)}</div></div><button id="poi-popup-close" aria-label="${this._esc(this._t("Schließen"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="poi-popup-meta"><span>${this._esc(def.label)}</span>${distance != null ? `<span>${this._formatNumber(distance, 1)} ${this._esc(this._t("km Luftlinie"))}</span>` : ""}${rangeHint ? `<span>${this._esc(rangeHint)}</span>` : ""}</div>
      ${detailParts.length ? `<div class="poi-details">${this._esc(detailParts.join(" · "))}</div>` : ""}
      ${(poi.phone || poi.website) ? `<div class="poi-contact">
        ${poi.phone ? `<span><ha-icon icon="mdi:phone"></ha-icon>${this._esc(poi.phone)}</span>` : ""}
        ${poi.website ? `<a href="${this._esc(poi.website)}" target="_blank" rel="noopener"><ha-icon icon="mdi:web"></ha-icon>${this._esc(this._t("Website"))}</a>` : ""}
      </div>` : ""}
      <div class="popup-actions poi-popup-actions">
        <button id="poi-route-waypoint" ${this._routeWaypoints.length >= ROUTE_MAX_WAYPOINTS ? "disabled" : ""}><ha-icon icon="mdi:map-marker-plus-outline"></ha-icon> ${this._esc(this._t("Zwischenziel"))}</button>
        <button id="poi-route-destination"><ha-icon icon="mdi:flag-checkered"></ha-icon> ${this._esc(this._t("Als Ziel"))}</button>
        <a href="${this._esc(this._poiNavigationUrl(poi))}" target="_blank" rel="noopener"><ha-icon icon="mdi:navigation-variant"></ha-icon> ${this._esc(this._t("Navigation"))}</a>
        <a href="${this._esc(this._poiSearchUrl(poi))}" target="_blank" rel="noopener"><ha-icon icon="mdi:google-maps"></ha-icon> Google Maps</a>
        ${osmUrl ? `<a href="${this._esc(osmUrl)}" target="_blank" rel="noopener"><ha-icon icon="mdi:openstreetmap"></ha-icon> OSM</a>` : ""}
      </div>`;
    popup.classList.remove("hidden");
    this.shadowRoot?.getElementById("popup")?.classList.add("hidden");
    popup.querySelector("#poi-popup-close")?.addEventListener("click", () => popup.classList.add("hidden"));
    popup.querySelector("#poi-route-waypoint")?.addEventListener("click", () => this._addPoiToRoute(poi, "waypoint"));
    popup.querySelector("#poi-route-destination")?.addEventListener("click", () => this._addPoiToRoute(poi, "destination"));
    if (reposition) this._positionPoiPopup();
  }

  _positionPoiPopup() {
    const popup = this.shadowRoot?.getElementById("poi-popup");
    const mapHost = this.shadowRoot?.getElementById("map");
    const map = this._vectorMap;
    if (!popup || !mapHost || !map || popup.classList.contains("hidden")) return;
    const poi = this._poiResults.find((item) => item.id === this._selectedPoiId);
    if (!poi) {
      popup.classList.add("hidden");
      return;
    }
    let point;
    try { point = map.project([poi.lon, poi.lat]); } catch (_) { return; }
    const rect = mapHost.getBoundingClientRect();
    const popupWidth = Math.min(350, Math.max(270, rect.width - 24));
    popup.style.width = `${popupWidth}px`;
    const left = Math.max(12, Math.min(rect.width - popupWidth - 12, point.x - popupWidth / 2));
    const top = point.y > rect.height * 0.58 ? Math.max(12, point.y - 215) : Math.min(rect.height - 205, point.y + 28);
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(Math.max(12, top))}px`;
  }

  _showPopup(vehicleId, reposition = true) {
    const popup = this.shadowRoot.getElementById("popup");
    const v = this._vehicles().find((item) => item.deviceId === vehicleId && item.valid);
    if (!popup || !v) return;
    this._selectedVehicleId = v.deviceId;
    const address = v.address || `${v.lat.toFixed(6)}, ${v.lon.toFixed(6)}`;
    const vehicleColor = this._vehicleColor(v.deviceId);
    const rangeVisible = this._rangeVehicles.has(v.deviceId);
    const motion = this._gpsMotionInfo(v.deviceId);
    const motionSpeed = motion.speedKmh == null ? "—" : `${this._formatNumber(motion.speedKmh, 1)} km/h`;
    popup.style.setProperty("--vehicle-color", vehicleColor);
    popup.innerHTML = `
      <div class="popup-head"><div><strong><span class="popup-vehicle-dot" aria-hidden="true"></span>${this._esc(v.name)}</strong><div>${this._esc(address)}</div></div><button id="popup-close" aria-label="${this._esc(this._t("Schließen"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="popup-grid">
        <div><span>SoC</span><strong>${this._formatNumber(v.soc, 1)}${v.soc == null ? "" : " %"}</strong></div>
        <div><span>${this._esc(this._t("Reichweite"))}</span><strong>${this._formatNumber(v.range, 0)}${v.range == null ? "" : " km"}</strong></div>
        <div><span>${this._esc(this._t("Kilometer"))}</span><strong>${this._formatNumber(v.mileage, 1)}${v.mileage == null ? "" : " km"}</strong></div>
        <div><span>${this._esc(this._t("GPS Ø"))}</span><strong>${this._esc(motionSpeed)}</strong></div>
        <div><span>${this._esc(this._t("Bewegung"))}</span><strong>${this._esc(motion.status)}</strong></div>
        <div><span>${this._esc(this._t("GPS-Update"))}</span><strong>${this._esc(this._formatAge(v.lastChanged))}</strong></div>
      </div>
      <div class="popup-actions">
        <button id="popup-follow"><ha-icon icon="mdi:crosshairs-gps"></ha-icon> ${this._esc(this._t("Folgen"))}</button>
        <button id="popup-route"><ha-icon icon="mdi:map-marker-path"></ha-icon> ${this._esc(this._t("Route"))}</button>
        ${Number.isFinite(Number(v.range)) && Number(v.range) > 0 ? `<button id="popup-range"><ha-icon icon="mdi:map-marker-radius-outline"></ha-icon> ${this._esc(this._t(rangeVisible ? "Ring aus" : "Ring an"))}</button>` : ""}
        ${v.googleMapsUrl ? `<a href="${this._esc(v.googleMapsUrl)}" target="_blank" rel="noopener"><ha-icon icon="mdi:google-maps"></ha-icon> Google Maps</a>` : ""}
      </div>`;
    popup.classList.remove("hidden");
    this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
    popup.querySelector("#popup-close")?.addEventListener("click", () => popup.classList.add("hidden"));
    popup.querySelector("#popup-follow")?.addEventListener("click", () => {
      this._focusVehicle(v.deviceId, { follow: true, showPopup: true, animate: true });
    });
    popup.querySelector("#popup-route")?.addEventListener("click", () => {
      this._routeVehicleId = v.deviceId;
      this._routeStartMode = "vehicle";
      this._routeStartPoint = null;
      this._routeStartUpdatedAt = 0;
      this._savePreferences();
      this._syncRouteMapSource();
      this._openRoutePanel();
    });
    popup.querySelector("#popup-range")?.addEventListener("click", () => {
      if (this._rangeVehicles.has(v.deviceId)) this._rangeVehicles.delete(v.deviceId);
      else this._rangeVehicles.add(v.deviceId);
      this._savePreferences();
      this._syncRangeMapSource();
      this._renderVehiclePanel();
      this._updateControls();
      this._showPopup(v.deviceId, false);
    });
    if (reposition) this._positionPopup();
  }

  _positionPopup() {
    const popup = this.shadowRoot?.getElementById("popup");
    const mapHost = this.shadowRoot?.getElementById("map");
    const map = this._vectorMap;
    if (!popup || !mapHost || !map || popup.classList.contains("hidden")) return;
    const vehicle = this._selectedVehicle();
    if (!vehicle) {
      popup.classList.add("hidden");
      return;
    }
    let point;
    try { point = map.project([vehicle.lon, vehicle.lat]); } catch (_) { return; }
    const rect = mapHost.getBoundingClientRect();
    const popupWidth = Math.min(330, Math.max(260, rect.width - 24));
    popup.style.width = `${popupWidth}px`;
    const left = Math.max(12, Math.min(rect.width - popupWidth - 12, point.x - popupWidth / 2));
    const top = point.y > rect.height * 0.56 ? Math.max(12, point.y - 205) : Math.min(rect.height - 190, point.y + 34);
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(Math.max(12, top))}px`;
  }

  _fullscreenSessionKey() {
    return `${this._storageKey}:pseudo_fullscreen`;
  }

  _resizeMapAfterFullscreenChange() {
    try { this._vectorMap?.resize(); } catch (_) {}
    this._renderMap(true);
    this._positionPopup();
    this._positionPoiPopup();
  }

  _setPseudoFullscreen(active, persist = true) {
    this._pseudoFullscreen = Boolean(active);
    this.classList.toggle("pseudo-fullscreen", this._pseudoFullscreen);
    if (persist) {
      try {
        if (this._pseudoFullscreen) sessionStorage.setItem(this._fullscreenSessionKey(), "1");
        else sessionStorage.removeItem(this._fullscreenSessionKey());
      } catch (_) {}
    }
    this._updateFullscreenIcon();
    setTimeout(() => this._resizeMapAfterFullscreenChange(), 60);
  }

  _restorePseudoFullscreen() {
    let active = false;
    try { active = sessionStorage.getItem(this._fullscreenSessionKey()) === "1"; } catch (_) {}
    if (active) this._setPseudoFullscreen(true, false);
  }

  async _toggleFullscreen() {
    // Browser-native fullscreen is automatically terminated when a navigation
    // link opens another tab/window. A CSS fullscreen card stays intact when the
    // user returns from Google Maps, which is the expected dashboard behaviour.
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (_) {}
    }
    this._setPseudoFullscreen(!this._pseudoFullscreen);
  }

  _updateFullscreenIcon() {
    const btn = this.shadowRoot.getElementById("fullscreen");
    const icon = btn?.querySelector("ha-icon");
    const active = Boolean(document.fullscreenElement) || this._pseudoFullscreen;
    if (icon) icon.setAttribute("icon", active ? "mdi:fullscreen-exit" : "mdi:fullscreen");
    if (btn) btn.title = active ? "Vollbild beenden" : "Vollbild";
  }

  _styles() {
    return `
      :host { display:block; container-type:inline-size; }
      ha-card { overflow:hidden; }
      button, a { font:inherit; }
      .map-card-shell { position:relative; background:var(--card-background-color); color:var(--primary-text-color); }
      .map-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px 9px; }
      .title-wrap { display:flex; gap:10px; align-items:center; min-width:0; }
      .title-wrap > ha-icon { color:var(--primary-color); --mdc-icon-size:24px; }
      .title { font-weight:700; font-size:17px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .subtitle { color:var(--secondary-text-color); font-size:11px; margin-top:2px; }
      .icon-btn, .tool-btn, .mode-btn, .zoom-controls button, .panel-title button, .focus-btn, .popup-head button, .popup-actions button, .popup-actions a, .panel-actions button {
        border:1px solid var(--divider-color); background:color-mix(in srgb, var(--card-background-color) 92%, var(--primary-color) 8%); color:var(--primary-text-color); border-radius:10px; min-height:36px; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; text-decoration:none;
      }
      .icon-btn { width:38px; padding:0; }
      .toolbar { display:flex; gap:8px; align-items:center; padding:0 12px 10px; overflow:visible; }
      .mode-group { display:flex; gap:4px; padding:3px; border-radius:12px; background:var(--secondary-background-color); flex:0 0 auto; }
      .tool-group { display:flex; gap:8px; align-items:center; flex:0 0 auto; }
      .mode-btn { border:none; min-height:34px; padding:0 11px; background:transparent; }
      .mode-btn.active, .tool-btn.active { background:var(--primary-color); color:var(--text-primary-color, white); box-shadow:0 1px 4px rgba(0,0,0,.18); }
      .mode-btn ha-icon, .tool-btn ha-icon { --mdc-icon-size:18px; }
      .tool-btn { padding:0 10px; white-space:nowrap; }
      .tool-btn:disabled, .panel-actions button:disabled { opacity:.42; cursor:default; }
      .map-wrap { padding:0; }
      .map { height:var(--cardata-map-height, 520px); min-height:330px; position:relative; overflow:hidden; background:#d8dde3; touch-action:none; cursor:grab; user-select:none; outline:none; }
      .map.dragging { cursor:grabbing; }
      .vector-map, .tiles, .poi-markers, .markers { position:absolute; inset:0; overflow:hidden; }
      .vector-map { pointer-events:auto; }
      .tiles, .poi-markers, .markers { pointer-events:none; }
      .vector-map.hidden, .tiles.hidden, .poi-markers.hidden, .markers.hidden { display:none; }
      .vector-map .maplibregl-map, .vector-map .maplibregl-canvas-container { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; }
      .vector-map .maplibregl-canvas { position:absolute; left:0; top:0; display:block; }
      .vector-map .maplibregl-ctrl-bottom-left { position:absolute; left:10px; bottom:22px; z-index:42; pointer-events:none; }
      .vector-map .maplibregl-ctrl-scale { box-sizing:border-box; padding:2px 5px; border:2px solid #333; border-top:0; background:rgba(255,255,255,.88); color:#222; font-size:11px; line-height:16px; text-align:center; }
      .tile { position:absolute; width:256px; height:256px; max-width:none; pointer-events:none; -webkit-user-drag:none; }
      .vector-map .maplibregl-marker { position:absolute; left:0; top:0; will-change:transform; z-index:20; }
      .poi-charging-grid { margin-top:6px; }
      .poi-markers { z-index:18; overflow:visible; }
      .markers { z-index:20; overflow:visible; }
      .poi-marker, .poi-cluster { position:absolute; left:0; top:0; border:0; padding:0; pointer-events:auto; cursor:pointer; z-index:1; }
      .poi-marker { background:transparent; }
      .poi-marker-core { width:29px; height:29px; border-radius:50%; display:grid; place-items:center; background:var(--accent-color, var(--primary-color)); color:white; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,.35); }
      .poi-marker-core ha-icon { --mdc-icon-size:16px; }
      .poi-marker.selected .poi-marker-core { outline:3px solid color-mix(in srgb, var(--primary-color) 30%, transparent); transform:scale(1.08); }
      .poi-cluster { min-width:34px; height:34px; border-radius:18px; padding:0 8px; background:var(--primary-color); color:var(--text-primary-color, white); border:2px solid white; box-shadow:0 2px 7px rgba(0,0,0,.35); font-weight:800; }
      .vehicle-marker { position:absolute; left:0; top:0; border:0; background:transparent; padding:0; pointer-events:auto; cursor:pointer; color:var(--primary-text-color); z-index:2; }
      .marker-core { position:relative; display:grid; place-items:center; width:34px; height:34px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); background:var(--vehicle-color, var(--primary-color)); color:white; border:2px solid white; box-shadow:0 2px 7px rgba(0,0,0,.35); }
      .marker-core ha-icon { transform:rotate(45deg); --mdc-icon-size:19px; }
      .marker-label { position:absolute; left:50%; top:39px; transform:translateX(-50%); padding:3px 7px; border-radius:8px; background:color-mix(in srgb, var(--card-background-color) 92%, transparent); box-shadow:0 1px 4px rgba(0,0,0,.2); font-size:11px; font-weight:700; white-space:nowrap; }
      .vehicle-marker.selected .marker-core { outline:3px solid color-mix(in srgb, var(--vehicle-color, var(--primary-color)) 35%, transparent); }
      .marker-pulse { display:none; position:absolute; width:44px; height:44px; left:50%; top:50%; transform:translate(-50%,-50%); border-radius:50%; background:color-mix(in srgb, var(--vehicle-color, var(--primary-color)) 28%, transparent); }
      .vehicle-marker.following .marker-pulse { display:block; animation:mapPulse 1.8s ease-out infinite; }
      @keyframes mapPulse { 0% { transform:translate(-50%,-50%) scale(.65); opacity:.8; } 100% { transform:translate(-50%,-50%) scale(1.8); opacity:0; } }
      .zoom-controls { position:absolute; z-index:40; left:10px; top:10px; display:flex; flex-direction:column; gap:5px; }
      .zoom-controls button { width:38px; height:38px; min-height:38px; padding:0; background:color-mix(in srgb, var(--card-background-color) 94%, transparent); box-shadow:0 1px 5px rgba(0,0,0,.22); }
      .zoom-controls ha-icon { --mdc-icon-size:20px; }
      .terrain-controls { position:absolute; z-index:46; left:58px; top:10px; width:min(230px,calc(100% - 78px)); box-sizing:border-box; padding:8px 9px; border-radius:11px; background:color-mix(in srgb, var(--card-background-color) 94%, transparent); border:1px solid color-mix(in srgb, var(--divider-color) 80%, transparent); box-shadow:0 2px 10px rgba(0,0,0,.2); backdrop-filter:blur(6px); }
      .terrain-controls.hidden { display:none; }
      .terrain-panel-toggle { position:absolute; z-index:46; left:58px; top:10px; min-width:50px; height:38px; min-height:38px; padding:0 10px; border:1px solid color-mix(in srgb, var(--divider-color) 80%, transparent); border-radius:999px; background:color-mix(in srgb, var(--card-background-color) 94%, transparent); color:var(--primary-text-color); box-shadow:0 2px 10px rgba(0,0,0,.2); backdrop-filter:blur(6px); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12px; font-weight:700; }
      .terrain-panel-toggle.hidden { display:none; }
      .terrain-panel-toggle ha-icon { --mdc-icon-size:18px; color:var(--primary-color); }
      .terrain-controls-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:5px; font-size:11px; font-weight:700; }
      .terrain-controls-head > span { display:inline-flex; align-items:center; gap:5px; min-width:0; }
      .terrain-controls-head ha-icon { --mdc-icon-size:16px; color:var(--primary-color); }
      .terrain-controls-actions { display:flex; align-items:center; gap:4px; }
      .terrain-controls-head button { width:30px; height:30px; min-height:30px; padding:0; border:0; border-radius:8px; background:var(--secondary-background-color); color:var(--primary-text-color); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
      .terrain-controls-head button ha-icon { --mdc-icon-size:16px; color:inherit; }
      .terrain-control-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:2px 8px; margin-top:5px; font-size:10px; color:var(--secondary-text-color); }
      .terrain-control-row output { font-variant-numeric:tabular-nums; color:var(--primary-text-color); font-weight:700; }
      .terrain-control-row input[type="range"] { grid-column:1 / -1; width:100%; margin:1px 0 0; accent-color:var(--primary-color); }
      .terrain-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:7px; font-size:10px; color:var(--secondary-text-color); }
      .terrain-toggle-row button { min-width:48px; height:28px; min-height:28px; padding:0 9px; border:0; border-radius:999px; background:var(--secondary-background-color); color:var(--primary-text-color); font-size:10px; font-weight:700; cursor:pointer; }
      .terrain-toggle-row button.active { background:var(--primary-color); color:var(--text-primary-color, #fff); }
      .terrain-compass { position:absolute; z-index:47; right:10px; top:10px; width:44px; height:44px; padding:0; border:1px solid color-mix(in srgb, var(--divider-color) 80%, transparent); border-radius:50%; background:color-mix(in srgb, var(--card-background-color) 94%, transparent); color:var(--primary-text-color); box-shadow:0 2px 10px rgba(0,0,0,.22); backdrop-filter:blur(6px); cursor:pointer; display:flex; align-items:center; justify-content:center; }
      .terrain-compass.hidden { display:none; }
      .terrain-compass-letter { position:absolute; top:3px; left:0; right:0; text-align:center; font-size:9px; font-weight:800; color:var(--primary-color); }
      .terrain-compass-needle { display:inline-flex; transform-origin:center; transition:transform .12s linear; font-size:21px; line-height:1; color:var(--primary-color); }
      .terrain-dem-status { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:7px; padding-top:6px; border-top:1px solid var(--divider-color); font-size:10px; color:var(--secondary-text-color); }
      .terrain-dem-status output { font-variant-numeric:tabular-nums; color:var(--primary-text-color); font-weight:700; white-space:nowrap; }
      .attribution { position:absolute; z-index:30; right:4px; bottom:3px; max-width:80%; padding:2px 5px; background:rgba(255,255,255,.78); color:#333; border-radius:4px; font-size:9px; line-height:1.25; }
      .attribution a { color:#245; text-decoration:none; }
      .vehicle-panel { position:absolute; z-index:60; right:10px; top:10px; width:min(340px,calc(100% - 20px)); max-height:calc(100% - 20px); overflow:auto; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 96%, transparent); box-shadow:0 5px 22px rgba(0,0,0,.27); border:1px solid var(--divider-color); padding:10px; user-select:text; }
      .poi-panel { position:absolute; z-index:60; right:10px; top:10px; width:min(310px,calc(100% - 20px)); max-height:calc(100% - 20px); overflow:hidden; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 97%, transparent); box-shadow:0 5px 22px rgba(0,0,0,.27); border:1px solid var(--divider-color); padding:0; user-select:text; display:flex; flex-direction:column; }
      .route-panel { position:absolute; z-index:65; right:10px; top:10px; width:min(360px,calc(100% - 20px)); max-height:calc(100% - 20px); overflow:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 97%, transparent); box-shadow:0 5px 22px rgba(0,0,0,.27); border:1px solid var(--divider-color); padding:10px; user-select:text; }
      .tracking-legend { position:absolute; z-index:48; left:10px; bottom:55px; max-width:220px; border:1px solid var(--divider-color); border-radius:9px; background:var(--card-background-color); color:var(--primary-text-color); padding:7px; box-shadow:0 2px 8px #0003; font-size:11px; }
      .tracking-legend.hidden { display:none; }
      .tracking-legend button { border:0; background:transparent; color:inherit; padding:3px; cursor:pointer; font:inherit; font-weight:600; text-align:left; }
      .tracking-legend-bands { display:grid; gap:4px; padding-top:5px; max-height:180px; overflow:auto; }
      .tracking-legend-bands > div { display:flex; align-items:center; gap:7px; }
      .tracking-swatch { display:inline-block; flex:0 0 22px; height:6px; border-radius:3px; }
      .tracking-map-options { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0; font-size:11px; }
      .tracking-trip-heading { display:flex; gap:8px; align-items:center; justify-content:space-between; }
      .tracking-trip-heading select { max-width:55%; min-height:30px; background:var(--card-background-color); color:var(--primary-text-color); border:1px solid var(--divider-color); border-radius:7px; }
      .tracking-summary.tracking-energy { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .tracking-grid select { width:100%; min-width:0; }
      .tracking-field { min-width:0; }
      .tracking-panel { position:absolute; z-index:68; right:10px; top:10px; width:min(390px,calc(100% - 20px)); max-height:calc(100% - 20px); overflow:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 97%, transparent); box-shadow:0 5px 22px rgba(0,0,0,.27); border:1px solid var(--divider-color); padding:10px; user-select:text; }
      .tracking-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
      .tracking-grid .wide { grid-column:1/-1; }
      .tracking-field { display:flex; flex-direction:column; gap:3px; font-size:9px; color:var(--secondary-text-color); }
      .tracking-field input,.tracking-field select { min-height:34px; padding:5px 7px; border:1px solid var(--divider-color); border-radius:8px; background:var(--card-background-color); color:var(--primary-text-color); font:inherit; font-size:10px; }
      .tracking-quick { display:flex; gap:4px; flex-wrap:wrap; margin:7px 0; }
      .tracking-quick button,.tracking-actions button,.tracking-playback button { min-height:32px; padding:0 8px; border:1px solid var(--divider-color); border-radius:8px; background:var(--secondary-background-color); color:var(--primary-text-color); font:inherit; font-size:10px; cursor:pointer; }
      .tracking-actions { display:flex; gap:5px; flex-wrap:wrap; margin:7px 0; }
      .tracking-vehicles { display:flex; flex-direction:column; gap:5px; margin:7px 0; }
      .tracking-vehicle { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:7px; align-items:center; padding:7px; border-radius:9px; background:var(--secondary-background-color); font-size:10px; }
      .tracking-vehicle small { display:block; color:var(--secondary-text-color); margin-top:2px; }
      .tracking-vehicle select { min-height:30px; max-width:95px; font-size:9px; }
      .tracking-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; margin:8px 0; }
      .tracking-summary > div { padding:7px; border-radius:8px; background:var(--secondary-background-color); font-size:9px; color:var(--secondary-text-color); }
      .tracking-summary b { display:block; margin-top:2px; color:var(--primary-text-color); font-size:12px; }
      .tracking-trip-list { display:flex; flex-direction:column; gap:4px; max-height:180px; overflow:auto; margin-top:7px; }
      .tracking-trip { width:100%; text-align:left; padding:6px 8px; border:1px solid var(--divider-color); border-radius:8px; background:var(--secondary-background-color); color:var(--primary-text-color); font:inherit; font-size:9px; cursor:pointer; }
      .tracking-trip[aria-pressed="true"] { border-color:var(--primary-color); background:color-mix(in srgb,var(--primary-color) 15%,var(--card-background-color)); box-shadow:inset 3px 0 0 var(--primary-color); font-weight:700; }
      .tracking-live { display:flex; align-items:center; gap:5px; margin-top:7px; font-size:10px; }
      .tracking-refresh { min-height:30px; padding:4px 8px; border:1px solid var(--divider-color); border-radius:8px; background:var(--secondary-background-color); color:var(--primary-text-color); font:inherit; font-size:10px; cursor:pointer; }
      .tracking-hint,.tracking-scope small { display:block; margin:6px 0; color:var(--secondary-text-color); font-size:10px; line-height:1.4; }
      .tracking-scope { margin-top:10px; font-size:11px; }
      .tracking-trip-row { display:grid; grid-template-columns:minmax(0,1fr) 46px; gap:4px; }
      .tracking-trip-gpx { min-height:32px; border:1px solid var(--divider-color); border-radius:8px; background:var(--secondary-background-color); color:var(--primary-text-color); font:inherit; font-size:9px; font-weight:700; cursor:pointer; }
      .tracking-message { margin:6px 0; padding:6px 8px; border-radius:8px; background:var(--secondary-background-color); color:var(--secondary-text-color); font-size:9px; line-height:1.35; white-space:pre-line; overflow-wrap:anywhere; }
      .tracking-playback { margin-top:8px; padding-top:8px; border-top:1px solid var(--divider-color); }
      .tracking-playback-row { display:flex; align-items:center; gap:5px; }
      .tracking-playback input[type=range] { flex:1; min-width:0; }
      .tracking-playback select { min-height:30px; font-size:9px; }
      .vehicle-panel.hidden, .poi-panel.hidden, .route-panel.hidden, .tracking-panel.hidden, .popup.hidden, .poi-popup.hidden { display:none; }
      .panel-title { display:flex; justify-content:space-between; align-items:center; font-weight:700; margin-bottom:7px; }
      .panel-title button, .popup-head button { width:32px; min-height:32px; padding:0; border:none; background:transparent; }
      .poi-mobile-handle { display:none; height:12px; place-items:center; flex:0 0 auto; }
      .poi-mobile-handle span { width:42px; height:4px; border-radius:4px; background:var(--divider-color); }
      .poi-sticky-top, .poi-sticky-bottom { flex:0 0 auto; padding:8px 9px; background:color-mix(in srgb, var(--card-background-color) 98%, transparent); }
      .poi-sticky-top { border-bottom:1px solid var(--divider-color); }
      .poi-sticky-bottom { border-top:1px solid var(--divider-color); }
      .poi-category-scroll { flex:1 1 auto; min-height:54px; overflow:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding:7px 9px; scrollbar-width:thin; }
      .poi-center-row { display:grid; grid-template-columns:minmax(0,1fr); gap:4px; margin-bottom:5px; }
      .poi-center-hint { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--secondary-text-color); font-size:8px; padding:0 2px; }
      .poi-vehicle-row { display:grid; grid-template-columns:minmax(0,1fr) 36px; gap:5px; align-items:end; }
      .poi-focus-button { width:36px; min-height:34px; padding:0; border:1px solid var(--divider-color); border-radius:9px; background:color-mix(in srgb, var(--card-background-color) 92%, var(--primary-color) 8%); color:var(--primary-text-color); display:grid; place-items:center; cursor:pointer; }
      .poi-focus-button:disabled { opacity:.45; cursor:default; }
      .poi-focus-button ha-icon { --mdc-icon-size:17px; }
      .poi-filter-section { margin-top:7px; padding-top:7px; border-top:1px solid var(--divider-color); }
      .poi-template-section { margin-top:6px; }
      .poi-category-search-section { margin-top:6px; padding-top:6px; }
      .poi-general-search-section { margin-top:0; padding-top:0; border-top:0; }
      .poi-section-title { margin-bottom:5px; color:var(--secondary-text-color); font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
      .poi-template-row { display:grid; grid-template-columns:minmax(0,1fr) 34px 34px; gap:4px; }
      .poi-template-row select, .poi-template-row button, .poi-field input, .poi-field select { min-height:32px; box-sizing:border-box; border:1px solid var(--divider-color); border-radius:8px; background:var(--card-background-color); color:var(--primary-text-color); padding:4px 7px; }
      .poi-template-row button { padding:0; display:grid; place-items:center; cursor:pointer; }
      .poi-template-row button:disabled { opacity:.4; cursor:default; }
      .poi-template-row ha-icon { --mdc-icon-size:16px; }
      .poi-filter-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
      .poi-field { display:flex; flex-direction:column; gap:3px; min-width:0; color:var(--secondary-text-color); font-size:9px; font-weight:700; }
      .poi-field input, .poi-field select { width:100%; min-width:0; font-size:11px; }
      .poi-check-row { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:10px; cursor:pointer; }
      .poi-check-row input { width:16px; height:16px; margin:0; }
      .poi-disabled-section { opacity:.58; }
      .poi-category-search { margin-bottom:5px; }
      .poi-selected-chips { display:flex; gap:4px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
      .poi-selected-chips::-webkit-scrollbar { display:none; }
      .poi-selected-chips button { flex:0 0 auto; max-width:180px; min-height:27px; border:1px solid var(--divider-color); border-radius:14px; padding:2px 6px; background:var(--secondary-background-color); color:var(--primary-text-color); display:inline-flex; align-items:center; gap:3px; font-size:9px; cursor:pointer; }
      .poi-selected-chips button span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .poi-selected-chips ha-icon { --mdc-icon-size:13px; color:var(--primary-color); }
      .poi-selected-chips ha-icon:last-child { --mdc-icon-size:12px; color:var(--secondary-text-color); }
      .poi-selected-empty { color:var(--secondary-text-color); font-size:9px; padding:2px 1px; }
      .poi-operator-chips { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:5px; }
      .poi-operator-chips button { min-height:26px; max-width:100%; border:1px solid var(--divider-color); border-radius:13px; background:var(--secondary-background-color); color:var(--primary-text-color); display:inline-flex; align-items:center; gap:4px; padding:2px 6px; font-size:9px; cursor:pointer; }
      .poi-operator-chips button > span { width:20px; height:20px; border-radius:50%; display:grid; place-items:center; flex:0 0 auto; background:var(--poi-operator-color); color:white; font-size:7px; font-weight:900; }
      .poi-operator-chips ha-icon { --mdc-icon-size:12px; color:var(--secondary-text-color); }
      .poi-operator-entry { display:grid; grid-template-columns:minmax(0,1fr) 34px; gap:4px; align-items:end; margin-bottom:5px; }
      .poi-operator-entry > button { min-height:32px; border:1px solid var(--divider-color); border-radius:8px; background:color-mix(in srgb, var(--card-background-color) 92%, var(--primary-color) 8%); color:var(--primary-text-color); display:grid; place-items:center; cursor:pointer; }
      .poi-operator-entry > button:disabled { opacity:.45; cursor:default; }
      .poi-operator-entry ha-icon { --mdc-icon-size:16px; }
      .poi-category-groups { display:flex; flex-direction:column; gap:5px; }
      .poi-category-group { border:1px solid var(--divider-color); border-radius:8px; background:color-mix(in srgb, var(--secondary-background-color) 65%, transparent); overflow:hidden; }
      .poi-category-group > summary { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 8px; cursor:pointer; font-size:10px; font-weight:750; user-select:none; min-height:30px; box-sizing:border-box; }
      .poi-group-label { color:var(--primary-text-color); font-size:10px; font-weight:750; }
      .poi-group-count { color:var(--secondary-text-color); font-size:9px; font-weight:650; }
      .poi-category-group[open] > summary { border-bottom:1px solid var(--divider-color); }
      .poi-category-group-filtered { display:none; }
      .poi-categories { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:5px; }
      .poi-category-filtered { display:none !important; }
      .poi-category { display:flex; flex-direction:row; align-items:center; gap:5px; padding:6px; border-radius:8px; background:var(--secondary-background-color); color:var(--primary-text-color); font-size:10px; font-weight:600; cursor:pointer; min-width:0; }
      .poi-category span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
      .poi-category input { width:16px; height:16px; margin:0; flex:0 0 auto; }
      .poi-category ha-icon { --mdc-icon-size:15px; color:var(--primary-color); flex:0 0 auto; }
      .poi-radius-label { margin-top:7px; display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:8px; color:var(--secondary-text-color); font-size:10px; font-weight:700; }
      .poi-radius-label select { width:100px; min-height:31px; border:1px solid var(--divider-color); border-radius:8px; background:var(--card-background-color); color:var(--primary-text-color); padding:3px 7px; }
      .poi-actions { display:flex; gap:5px; margin-top:7px; }
      .poi-actions button { flex:1; min-height:32px; border:1px solid var(--divider-color); border-radius:8px; background:color-mix(in srgb, var(--card-background-color) 92%, var(--primary-color) 8%); color:var(--primary-text-color); display:inline-flex; align-items:center; justify-content:center; gap:4px; cursor:pointer; font-size:10px; }
      .poi-actions button:disabled { opacity:.45; cursor:default; }
      .poi-actions ha-icon { --mdc-icon-size:15px; }
      .poi-status { margin-top:6px; padding:6px 7px; border-radius:7px; background:var(--secondary-background-color); font-size:9px; line-height:1.3; }
      .poi-status.warning { background:color-mix(in srgb, var(--warning-color, #f9a825) 14%, transparent); }
      .poi-note { margin-top:5px; color:var(--secondary-text-color); font-size:8px; line-height:1.25; }
      .route-mobile-handle { display:none; height:12px; place-items:center; margin:-6px 0 2px; }
      .route-mobile-handle span { width:42px; height:4px; border-radius:4px; background:var(--divider-color); }
      .route-pick-compact { display:grid; grid-template-columns:24px minmax(0,1fr) 34px; gap:7px; align-items:center; }
      .route-pick-compact > ha-icon { color:var(--primary-color); --mdc-icon-size:21px; }
      .route-pick-compact > div { min-width:0; display:flex; flex-direction:column; gap:2px; }
      .route-pick-compact strong { font-size:11px; }
      .route-pick-compact small { color:var(--secondary-text-color); font-size:9px; line-height:1.25; }
      .route-pick-compact button { width:34px; min-height:34px; padding:0; border:1px solid var(--divider-color); border-radius:9px; background:var(--card-background-color); color:var(--primary-text-color); cursor:pointer; }
      .route-panel.route-picking { width:min(390px,calc(100% - 20px)); overflow:hidden; }
      .route-field { display:flex; flex-direction:column; gap:3px; color:var(--secondary-text-color); font-size:9px; font-weight:700; }
      .route-field select { min-height:34px; box-sizing:border-box; border:1px solid var(--divider-color); border-radius:9px; background:var(--card-background-color); color:var(--primary-text-color); padding:4px 7px; }
      .route-template-section { margin-top:0; padding-top:0; border-top:0; }
      .route-template-row, .route-destination-row { display:grid; grid-template-columns:minmax(0,1fr) 34px 34px; gap:4px; margin-top:5px; }
      .route-destination-row { grid-template-columns:minmax(0,1fr) 34px 34px; }
      .route-template-row select, .route-destination-row select, .route-template-row button, .route-destination-row button, .route-address-row input, .route-address-row button { min-height:34px; box-sizing:border-box; border:1px solid var(--divider-color); border-radius:9px; background:var(--card-background-color); color:var(--primary-text-color); }
      .route-template-row select, .route-destination-row select, .route-address-row input { min-width:0; width:100%; padding:4px 7px; }
      .route-template-row button, .route-destination-row button, .route-address-row button { padding:0; display:grid; place-items:center; cursor:pointer; }
      .route-template-row button:disabled, .route-destination-row button:disabled, .route-mini-actions button:disabled, .route-address-row button:disabled { opacity:.4; cursor:default; }
      .route-template-row ha-icon, .route-destination-row ha-icon, .route-address-row ha-icon { --mdc-icon-size:16px; }
      .route-mini-actions { display:grid; grid-template-columns:1.3fr 1fr .85fr; gap:4px; margin-top:5px; }
      .route-mini-actions button { min-height:31px; border:1px solid var(--divider-color); border-radius:8px; background:var(--secondary-background-color); color:var(--primary-text-color); display:flex; align-items:center; justify-content:center; gap:3px; padding:3px 5px; font-size:8px; cursor:pointer; }
      .route-mini-actions ha-icon { --mdc-icon-size:14px; }
      .route-address-row { display:grid; grid-template-columns:minmax(0,1fr) 38px; gap:4px; margin-top:5px; }
      .route-search-status { display:flex; align-items:center; gap:5px; margin-top:5px; padding:6px; border-radius:7px; background:var(--secondary-background-color); color:var(--secondary-text-color); font-size:9px; }
      .route-search-status.warning { color:var(--error-color, #c62828); }
      .route-search-status ha-icon { --mdc-icon-size:14px; }
      .route-search-results { display:flex; flex-direction:column; gap:4px; margin-top:5px; }
      .route-search-result { display:grid; grid-template-columns:minmax(0,1fr) 32px 32px 32px 32px; gap:4px; align-items:center; padding:6px; border-radius:8px; background:var(--secondary-background-color); }
      .route-search-result > div { min-width:0; display:flex; flex-direction:column; gap:2px; }
      .route-search-result strong, .route-search-result small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .route-search-result strong { font-size:9px; }
      .route-search-result small { font-size:8px; color:var(--secondary-text-color); }
      .route-search-result button { width:32px; min-height:32px; padding:0; border:1px solid var(--divider-color); border-radius:8px; background:var(--card-background-color); color:var(--primary-text-color); display:grid; place-items:center; cursor:pointer; }
      .route-search-result button:disabled { opacity:.4; cursor:default; }
      .route-search-result ha-icon { --mdc-icon-size:15px; }
      .route-start-card { display:grid; grid-template-columns:24px minmax(0,1fr) 34px; align-items:center; gap:7px; margin-top:7px; padding:7px; border-radius:9px; background:var(--secondary-background-color); }
      .route-start-card > ha-icon { --mdc-icon-size:20px; color:var(--primary-color); }
      .route-start-card > div { min-width:0; display:flex; flex-direction:column; gap:2px; }
      .route-start-card strong { font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .route-start-card small { color:var(--secondary-text-color); font-size:9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .route-start-card button { width:34px; min-height:34px; padding:0; border:1px solid var(--divider-color); border-radius:9px; background:var(--card-background-color); color:var(--primary-text-color); cursor:pointer; }
      .route-start-card button ha-icon { --mdc-icon-size:17px; }
      .route-section { margin-top:9px; padding-top:8px; border-top:1px solid var(--divider-color); }
      .route-section-head { display:flex; align-items:center; justify-content:space-between; gap:8px; color:var(--secondary-text-color); font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
      .route-section-head strong { font-size:9px; }
      .route-link-button { border:0; background:transparent; color:var(--primary-color); padding:0; cursor:pointer; font-size:9px; text-transform:none; }
      .route-stop-list { display:flex; flex-direction:column; gap:5px; margin-top:6px; }
      .route-stop { display:grid; grid-template-columns:28px minmax(0,1fr) auto; gap:6px; align-items:center; padding:7px; border-radius:9px; background:var(--secondary-background-color); }
      .route-destination { grid-template-columns:28px minmax(0,1fr); margin-top:6px; }
      .route-badge { width:26px; height:26px; border-radius:50%; display:grid; place-items:center; background:var(--primary-color); color:var(--text-primary-color, white); font-size:11px; font-weight:800; }
      .route-destination .route-badge { background:var(--error-color, #c62828); }
      .route-stop-main { min-width:0; display:flex; flex-direction:column; gap:2px; }
      .route-stop-main strong { font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .route-stop-main small { font-size:8px; color:var(--secondary-text-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .route-stop-actions { display:flex; gap:3px; }
      .route-stop-actions button { width:28px; min-height:28px; padding:0; border:1px solid var(--divider-color); border-radius:8px; background:var(--card-background-color); color:var(--primary-text-color); cursor:pointer; }
      .route-stop-actions button:disabled { opacity:.35; cursor:default; }
      .route-stop-actions ha-icon { --mdc-icon-size:14px; }
      .route-empty { margin-top:6px; padding:8px; border-radius:8px; background:var(--secondary-background-color); color:var(--secondary-text-color); font-size:9px; line-height:1.35; }
      .route-actions { display:flex; gap:5px; margin-top:8px; }
      .route-actions button, .route-actions a { flex:1; min-height:34px; box-sizing:border-box; border:1px solid var(--divider-color); border-radius:9px; background:color-mix(in srgb, var(--card-background-color) 92%, var(--primary-color) 8%); color:var(--primary-text-color); display:inline-flex; align-items:center; justify-content:center; gap:4px; padding:0 8px; cursor:pointer; text-decoration:none; font-size:10px; text-align:center; }
      .route-actions button.active { background:var(--primary-color); color:var(--text-primary-color, white); }
      .route-actions button:disabled, .route-actions a.disabled { opacity:.42; cursor:default; pointer-events:none; }
      .route-actions ha-icon { --mdc-icon-size:16px; }
      .route-google-actions a { min-width:0; }
      .route-status { margin-top:8px; padding:7px; border-radius:8px; background:var(--secondary-background-color); font-size:9px; line-height:1.35; }
      .route-status.active { background:color-mix(in srgb, var(--primary-color) 12%, var(--secondary-background-color)); }
      .route-export-warning { margin-top:6px; padding:7px; border-radius:8px; background:color-mix(in srgb, var(--warning-color, #f9a825) 15%, var(--secondary-background-color)); display:flex; gap:6px; align-items:flex-start; font-size:9px; line-height:1.35; }
      .route-export-warning ha-icon { flex:0 0 auto; --mdc-icon-size:15px; color:var(--warning-color, #f9a825); }
      .route-note { margin-top:5px; color:var(--secondary-text-color); font-size:8px; line-height:1.3; }
      .panel-actions { display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap; }
      .panel-actions button { min-height:30px; padding:0 8px; font-size:11px; }
      .vehicle-list { display:flex; flex-direction:column; gap:5px; }
      .vehicle-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:6px; border-radius:10px; padding:7px; background:var(--secondary-background-color); }
      .vehicle-row > label { display:flex; align-items:center; gap:8px; flex:1; min-width:0; cursor:pointer; }
      .vehicle-row input { width:18px; height:18px; flex:0 0 auto; }
      .vehicle-color-dot, .popup-vehicle-dot { width:12px; height:12px; border-radius:50%; background:var(--vehicle-color, var(--primary-color)); box-shadow:0 0 0 2px color-mix(in srgb, var(--vehicle-color, var(--primary-color)) 25%, transparent); flex:0 0 auto; }
      .popup-vehicle-dot { display:inline-block; width:11px; height:11px; margin-right:2px; }
      .vehicle-row-main { display:flex; flex-direction:column; min-width:0; }
      .vehicle-row-main strong { font-size:13px; }
      .vehicle-row-main small { color:var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:10px; margin-top:2px; }
      .vehicle-row-main .vehicle-motion { font-size:9px; font-weight:600; color:color-mix(in srgb, var(--secondary-text-color) 86%, var(--primary-color) 14%); }
      .vehicle-range-toggle { grid-column:1 / -1; display:flex; align-items:center; gap:4px; margin-top:1px; padding-left:26px; color:var(--secondary-text-color); font-size:10px; font-weight:600; cursor:pointer; }
      .vehicle-range-toggle input { width:15px; height:15px; }
      .vehicle-range-toggle ha-icon { --mdc-icon-size:14px; color:var(--vehicle-color, var(--primary-color)); }
      .vehicle-row.invalid { opacity:.55; }
      .focus-btn { width:32px; min-height:32px; padding:0; }
      .focus-btn ha-icon { --mdc-icon-size:17px; }
      .panel-empty { padding:12px; color:var(--secondary-text-color); font-size:12px; text-align:center; }
      .popup, .poi-popup { position:absolute; z-index:55; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 97%, transparent); border:1px solid var(--divider-color); box-shadow:0 5px 22px rgba(0,0,0,.28); padding:11px; user-select:text; }
      .popup-head { display:flex; justify-content:space-between; gap:8px; font-size:12px; line-height:1.35; }
      .popup-head strong { font-size:14px; display:flex; align-items:center; gap:5px; margin-bottom:2px; }
      .popup-head strong ha-icon { --mdc-icon-size:17px; color:var(--primary-color); }
      .popup-head > div > div { color:var(--secondary-text-color); }
      .popup-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:9px; }
      .popup-grid > div { display:flex; flex-direction:column; padding:6px 8px; background:var(--secondary-background-color); border-radius:8px; }
      .popup-grid span { font-size:9px; color:var(--secondary-text-color); }
      .popup-grid strong { font-size:12px; margin-top:1px; }
      .popup-actions { display:flex; gap:6px; margin-top:9px; flex-wrap:wrap; }
      .popup-actions button, .popup-actions a { min-height:34px; padding:0 9px; font-size:11px; flex:1; }
      .popup-actions button:disabled { opacity:.42; cursor:default; }
      .popup-actions ha-icon { --mdc-icon-size:17px; }
      .poi-popup-meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
      .poi-popup-meta span { padding:4px 7px; border-radius:8px; background:var(--secondary-background-color); font-size:10px; }
      .poi-details { margin-top:7px; color:var(--secondary-text-color); font-size:10px; line-height:1.4; }
      .poi-contact { display:flex; gap:8px; flex-wrap:wrap; margin-top:7px; font-size:10px; }
      .poi-contact span, .poi-contact a { display:inline-flex; align-items:center; gap:4px; color:var(--secondary-text-color); text-decoration:none; }
      .poi-contact ha-icon { --mdc-icon-size:14px; color:var(--primary-color); }
      .poi-popup-actions { flex-wrap:wrap; }
      .poi-popup-actions a { min-width:90px; }
      .map-empty { display:none; position:absolute; z-index:35; left:50%; top:50%; transform:translate(-50%,-50%); width:min(420px,calc(100% - 36px)); box-sizing:border-box; padding:14px 16px; border-radius:12px; background:color-mix(in srgb, var(--card-background-color) 94%, transparent); box-shadow:0 2px 12px rgba(0,0,0,.2); text-align:center; font-size:12px; color:var(--secondary-text-color); }
      .map-empty.show { display:block; }
      :host(.pseudo-fullscreen) { position:fixed !important; inset:0 !important; z-index:99999 !important; width:100vw !important; height:100dvh !important; background:var(--card-background-color); box-sizing:border-box; padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
      :host(:fullscreen) { box-sizing:border-box; padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
      :host(.pseudo-fullscreen) ha-card, :host(:fullscreen) ha-card { height:100%; border-radius:0; }
      :host(.pseudo-fullscreen) .map-card-shell, :host(:fullscreen) .map-card-shell { height:100%; display:flex; flex-direction:column; }
      :host(.pseudo-fullscreen) .map-wrap, :host(:fullscreen) .map-wrap { flex:1; min-height:0; }
      :host(.pseudo-fullscreen) .map, :host(:fullscreen) .map { height:100% !important; min-height:0; }
      :host(:fullscreen) { background:var(--card-background-color); }
      @media (max-width: 560px) {
      }
      @container (max-width: 1050px) {
        .toolbar { display:grid; grid-template-columns:minmax(0,1fr); gap:6px; align-items:stretch; overflow:visible; }
        .mode-group { max-width:100%; width:max-content; box-sizing:border-box; }
        .tool-group { display:grid; grid-template-columns:repeat(7,minmax(36px,1fr)); gap:5px; width:100%; min-width:0; }
        .tool-btn { width:100%; min-width:0; padding:0 4px; }
        .tool-btn span { display:none; }
      }
      @container (max-width: 380px) {
        .mode-group { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); width:100%; }
        .mode-btn { min-width:0; padding:0 2px; gap:2px; font-size:10px; }
        .mode-btn ha-icon { --mdc-icon-size:15px; }
      }
      @container (max-width: 560px) {
        .map { height:max(620px, calc(100dvh - 120px)); max-height:780px; }
        .subtitle { display:none; }
        .tool-btn span { display:none; }
        .tool-btn { width:38px; padding:0; }
        .mode-btn { padding:0 9px; }
        .terrain-controls { left:56px; top:8px; width:min(225px,calc(100% - 68px)); }
        .terrain-panel-toggle { left:56px; top:8px; min-width:40px; width:auto; padding:0 10px; }
        .terrain-controls-head button { width:36px; height:36px; min-height:36px; }
        .terrain-toggle-row button { min-height:36px; }
        .terrain-panel-toggle span { display:none; }
        .terrain-compass { width:44px; height:44px; right:8px; top:8px; }
        .map-header { padding:10px 10px 7px; }
        .toolbar { padding:0 8px 8px; }
        .popup, .poi-popup { left:8px !important; right:8px; width:auto !important; }
        :host(.pseudo-fullscreen), :host(:fullscreen) { padding-top:max(env(safe-area-inset-top, 0px), 44px); padding-right:max(env(safe-area-inset-right, 0px), 4px); padding-bottom:max(env(safe-area-inset-bottom, 0px), 8px); padding-left:max(env(safe-area-inset-left, 0px), 4px); }
        :host(.pseudo-fullscreen) #fullscreen, :host(:fullscreen) #fullscreen { min-width:44px; min-height:44px; position:relative; z-index:120; }
        .poi-panel { position:absolute; z-index:100; left:0; right:0; bottom:0; top:auto; width:100%; max-height:94%; border-radius:17px 17px 0 0; padding:0 0 max(env(safe-area-inset-bottom, 0px), 8px); overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; touch-action:pan-y; display:block; }
        .route-panel { position:absolute; z-index:105; left:0; right:0; bottom:0; top:auto; width:100%; max-height:90%; border-radius:17px 17px 0 0; padding:10px 10px calc(10px + env(safe-area-inset-bottom, 0px)); }
        .tracking-panel { position:absolute; z-index:108; left:0; right:0; bottom:0; top:auto; width:100%; max-height:92%; border-radius:17px 17px 0 0; padding:10px 10px calc(10px + env(safe-area-inset-bottom, 0px)); }
        .route-panel.route-picking { width:100%; max-height:128px; }
        .route-pick-compact { grid-template-columns:24px minmax(0,1fr) 44px; }
        .route-pick-compact button { width:44px; min-height:44px; }
        .poi-mobile-handle, .route-mobile-handle { display:grid; }
        .poi-sticky-top, .poi-sticky-bottom { padding-left:10px; padding-right:10px; }
        .poi-category-scroll { padding-left:10px; padding-right:10px; min-height:0; max-height:none; overflow:visible; overscroll-behavior:auto; -webkit-overflow-scrolling:auto; touch-action:auto; }
        .poi-template-row select, .poi-template-row button, .poi-field input, .poi-field select, .poi-focus-button, .poi-operator-entry > button, .poi-radius-label select, .poi-actions button { min-height:44px; }
        .panel-title button { width:44px; min-height:44px; }
        .poi-template-row { grid-template-columns:minmax(0,1fr) 44px 44px; }
        .poi-vehicle-row { grid-template-columns:minmax(0,1fr) 44px; }
        .poi-operator-entry { grid-template-columns:minmax(0,1fr) 44px; }
        .poi-center-hint { font-size:9px; }
        .poi-categories { grid-template-columns:1fr; }
        .poi-category { min-height:42px; padding:7px 9px; font-size:11px; }
        .poi-category-group > summary { min-height:42px; font-size:11px; }
        .poi-group-label { font-size:11px; }
        .poi-selected-chips button { min-height:34px; }
        .route-field select, .route-actions button, .route-actions a, .route-start-card button, .route-template-row select, .route-template-row button, .route-destination-row select, .route-destination-row button, .route-address-row input, .route-address-row button { min-height:44px; }
        .route-template-row { grid-template-columns:minmax(0,1fr) 44px 44px; }
        .route-destination-row { grid-template-columns:minmax(0,1fr) 44px 44px; }
        .route-address-row { grid-template-columns:minmax(0,1fr) 44px; }
        .route-mini-actions { grid-template-columns:1fr; }
        .route-mini-actions button { min-height:40px; font-size:9px; }
        .route-search-result { grid-template-columns:minmax(0,1fr) 40px 40px 40px 40px; }
        .route-search-result button { width:40px; min-height:40px; }
        .route-stop-actions button { width:40px; min-height:40px; }
        .route-start-card { grid-template-columns:24px minmax(0,1fr) 44px; }
        .route-stop { grid-template-columns:32px minmax(0,1fr) auto; }
        .route-destination { grid-template-columns:32px minmax(0,1fr); }
        .route-badge { width:30px; height:30px; }
        .poi-filter-grid { grid-template-columns:1fr 1fr; }
        .poi-note { font-size:7.5px; }
      }
    `;
  }
}

if (!customElements.get(MAP_CARD_TAG)) customElements.define(MAP_CARD_TAG, CardataAnalyticsMapCard);
if (!window.customCards.some((c) => c.type === MAP_CARD_TAG)) {
  window.customCards.push({
    type: MAP_CARD_TAG,
    name: cardataT({ language: navigator?.language }, "Cardata Fahrzeugkarte"),
    description: cardataT({ language: navigator?.language }, "Interaktive Karte für alle GPS-fähigen Fahrzeuge in Cardata Analytics."),
    preview: true,
  });
}
