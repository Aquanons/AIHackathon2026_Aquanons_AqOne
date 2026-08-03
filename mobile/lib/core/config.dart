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

  static const int maxVesselIdLength = 32;
  static const int maxBoatLength = 32;
  static const int maxNoteLength = 64;
}
