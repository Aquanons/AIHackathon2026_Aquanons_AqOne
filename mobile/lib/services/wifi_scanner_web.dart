import 'wifi_models.dart';

/// Why a scan or connect attempt failed, in terms a fisherman can act on.
enum WifiFailure {
  unsupported,
  permissionDenied,
  wifiDisabled,
  scanFailed,
  connectFailed,
}

class WifiResult {
  const WifiResult.success(this.networks) : failure = null;
  const WifiResult.failed(this.failure) : networks = const [];

  final List<WifiAccessPoint> networks;
  final WifiFailure? failure;

  bool get isSuccess => failure == null;
}

/// Web build has no WiFi radio access; every call reports unsupported.
class WifiScanner {
  const WifiScanner();

  static const WifiScanner instance = WifiScanner();

  static bool isBuoySsid(String ssid) =>
      ssid.trim().toUpperCase().startsWith('AQONE-');

  static bool get isSupported => false;

  Future<bool> ensureScanPermission() async => false;

  Future<String?> currentSsid() async => null;

  Future<WifiResult> scan() async =>
      const WifiResult.failed(WifiFailure.unsupported);

  Future<bool> connect(String ssid, {String? password}) async => false;

  Future<bool> disconnect() async => false;

  Future<bool> openAppSettings() async => false;
}
