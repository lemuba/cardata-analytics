"""Constants for Cardata Analytics."""

DOMAIN = "cardata_analytics"

CONF_ENTRY_KIND = "entry_kind"
ENTRY_KIND_VEHICLE = "vehicle"
ENTRY_KIND_GLOBAL = "global"
GLOBAL_ENTRY_UNIQUE_ID = "global_comparison_period"

CONF_VEHICLE_NAME = "vehicle_name"
CONF_VEHICLE_TYPE = "vehicle_type"
CONF_SOC_ENTITY = "soc_entity"
CONF_SOH_ENTITY = "soh_entity"
CONF_MILEAGE_ENTITY = "mileage_entity"
CONF_ENERGY_ENTITY = "energy_entity"
CONF_RANGE_ENTITY = "range_entity"
CONF_LATITUDE_ENTITY = "latitude_entity"
CONF_LONGITUDE_ENTITY = "longitude_entity"
CONF_BATTERY_CAPACITY = "battery_capacity_kwh"

VEHICLE_I3_120 = "i3_120"
VEHICLE_IX1 = "ix1"
VEHICLE_GENERIC_BEV = "bev"

SIGNAL_UPDATE = f"{DOMAIN}_update_{{}}"
SIGNAL_GLOBAL_RANGE_UPDATE = f"{DOMAIN}_global_range_update"
DATA_CONTROLLER = "controller"
DATA_CONTROLLER_SETUP_TASK = "controller_setup_task"
DATA_RUNTIMES = "runtimes"
DATA_GLOBAL_ENTRY_PENDING = "global_entry_pending"
DATA_NOMINATIM_LOCK = "nominatim_lock"
DATA_NOMINATIM_LAST_REQUEST = "nominatim_last_request"

NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_MIN_REQUEST_INTERVAL = 1.1
NOMINATIM_MIN_VEHICLE_INTERVAL = 300.0
NOMINATIM_MIN_DISTANCE_METERS = 100.0

RANGE_PRESET_CUSTOM = "Benutzerdefiniert"
RANGE_PRESET_TODAY = "Heute"
RANGE_PRESET_LAST_DAY = "Letzter Tag"
RANGE_PRESET_LAST_7_DAYS = "Letzte 7 Tage"
RANGE_PRESET_LAST_MONTH = "Letzter Monat"
RANGE_PRESET_LAST_YEAR = "Letztes Jahr"
RANGE_PRESET_OPTIONS = [
    RANGE_PRESET_CUSTOM,
    RANGE_PRESET_TODAY,
    RANGE_PRESET_LAST_DAY,
    RANGE_PRESET_LAST_7_DAYS,
    RANGE_PRESET_LAST_MONTH,
    RANGE_PRESET_LAST_YEAR,
]

# BMW i3 120 Ah only: support points for SoH interpolation from usable HV energy.
SOH_POINTS = [
    (24.0, 66.7),
    (24.5, 67.7),
    (25.0, 68.8),
    (25.5, 69.4),
    (26.0, 70.9),
    (26.5, 72.0),
    (27.0, 73.0),
    (27.5, 74.1),
    (28.0, 75.1),
    (28.5, 76.1),
    (29.0, 77.2),
    (29.5, 78.2),
    (30.0, 79.3),
    (30.5, 80.3),
    (31.0, 81.3),
    (31.5, 82.3),
    (32.0, 83.4),
    (32.5, 84.4),
    (33.0, 85.4),
    (33.5, 86.4),
    (34.0, 87.4),
    (34.5, 88.4),
    (35.0, 89.4),
    (35.5, 90.4),
    (36.0, 91.4),
    (36.5, 92.4),
    (37.0, 93.4),
    (37.5, 94.6),
    (38.0, 95.5),
    (38.5, 96.8),
    (39.0, 98.0),
    (39.5, 99.3),
    (40.0, 100.0),
]
