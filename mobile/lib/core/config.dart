class AqOneConfig {
  const AqOneConfig._();

  static const String buoyBaseUrl = String.fromEnvironment(
    'BUOY_BASE_URL',
    defaultValue: 'http://10.0.0.1',
  );

  static const String backendBaseUrl = String.fromEnvironment(
    'BACKEND_BASE_URL',
    defaultValue: 'https://aqone-backend.up.railway.app',
  );

  static const int protocolVersion = 1;

  static const Duration buoyTimeout = Duration(seconds: 6);
  static const Duration backendTimeout = Duration(seconds: 12);
  static const Duration buoyPollInterval = Duration(seconds: 10);
  static const Duration outboxRetryInterval = Duration(seconds: 20);
  static const Duration reconcileInterval = Duration(minutes: 2);
  static const Duration locationTimeout = Duration(seconds: 8);

  /// How often Venture refreshes buoys and hazard feeds while it is visible.
  static const Duration hazardPollInterval = Duration(seconds: 30);

  /// How often Home refreshes the MDRRMO-set sea condition.
  static const Duration seaConditionInterval = Duration(seconds: 18);

  // --- Venture map ---------------------------------------------------------

  /// Map-only starting point near Aklan.
  ///
  /// This is where the camera sits before a GPS fix exists. It must never be
  /// submitted as the user's position - an SOS carrying a default coordinate
  /// would send responders to the wrong place.
  static const double defaultMapLat = 11.7580;
  static const double defaultMapLon = 122.3900;
  static const double defaultMapZoom = 11.5;
  static const double locatedMapZoom = 14.5;

  /// Fixed coordinates used for the ashore weather reading.
  static const double aklanLat = 11.6892;
  static const double aklanLon = 122.3667;

  static const String osmTileUrl =
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  /// Required by the OSM tile usage policy, and currently missing from the
  /// source project. Rendered as a visible attribution on the map.
  static const String osmAttribution = '© OpenStreetMap contributors';

  static const String openMeteoBase = 'https://api.open-meteo.com/v1/forecast';

  /// Wind above this is treated as unsafe by the client-side heuristic.
  static const double unsafeWindKph = 30;

  // --- Backend paths -------------------------------------------------------

  static const String spotsPath = '/api/spots';
  static const String publicSpotsPath = '/api/public/spots';
  static const String buoysPath = '/api/buoys';
  static const String waveAlertsPath = '/api/alerts/waves';
  static const String capsizingAlertsPath = '/api/alerts/capsizing';
  static const String catchLogsPath = '/api/catch-logs';
  static const String seaConditionPath = '/api/sea-condition';
  static const String publicSeaConditionPath = '/api/public/sea-condition';
  static const String advisoriesPath = '/api/advisories?status=Published';
  static const String publicAdvisoriesPath = '/api/public/advisories';

  static const int maxVesselIdLength = 32;
  static const int maxBoatLength = 32;
  static const int maxNoteLength = 64;

  /// Catch notes are stored locally and uploaded over HTTP, never squeezed
  /// into a LoRa frame, so they can be far more generous than SOS notes.
  static const int maxCatchNoteLength = 240;
  static const int maxNameLength = 64;
  static const int maxPhoneLength = 20;
  static const int minLicenseLength = 5;
  static const int maxLicenseLength = 24;
}
