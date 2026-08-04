import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:permission_handler/permission_handler.dart' as perm;
import 'package:wifi_iot/wifi_iot.dart';

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

/// Native Android access to the phone's WiFi radio, via `wifi_iot`.
///
/// Everything here is best-effort: on platforms without the plugin (web,
/// desktop) every call degrades to an "unsupported" failure instead of
/// crashing, so the rest of the app can render the same screens everywhere.
class WifiScanner {
  const WifiScanner();

  static const WifiScanner instance = WifiScanner();

  /// The buoy radio names itself `AqOne-<id>` (see docs/03_PHONE_BUOY_WIFI.md).
  static bool isBuoySsid(String ssid) =>
      ssid.trim().toUpperCase().startsWith('AQONE-');

  static bool get isSupported => !kIsWeb && Platform.isAndroid;

  /// Requests whatever the OS needs before a scan: location on Android 6-12,
  /// NEARBY_WIFI_DEVICES on Android 13+. Returns true when the radio is
  /// usable, false when the user has blocked the permission.
  Future<bool> ensureScanPermission() async {
    if (!isSupported) {
      return false;
    }
    try {
      if (await perm.Permission.location.isDenied) {
        await perm.Permission.location.request();
      }
      if (await perm.Permission.nearbyWifiDevices.isDenied) {
        await perm.Permission.nearbyWifiDevices.request();
      }
      final locationOk = await perm.Permission.location.isGranted;
      final nearbyOk = await perm.Permission.nearbyWifiDevices.isGranted;
      return locationOk || nearbyOk;
    } catch (_) {
      return false;
    }
  }

  Future<String?> currentSsid() async {
    if (!isSupported) {
      return null;
    }
    try {
      final ssid = await WiFiForIoTPlugin.getSSID();
      if (ssid == null || ssid.isEmpty || ssid == '<unknown ssid>') {
        return null;
      }
      return ssid;
    } catch (_) {
      return null;
    }
  }

  /// Scans for nearby networks. Returns them even if the radio is off; the
  /// caller decides how to surface an empty result.
  Future<WifiResult> scan() async {
    if (!isSupported) {
      return const WifiResult.failed(WifiFailure.unsupported);
    }
    if (!await ensureScanPermission()) {
      return const WifiResult.failed(WifiFailure.permissionDenied);
    }
    if (!await _isWifiEnabled()) {
      return const WifiResult.failed(WifiFailure.wifiDisabled);
    }
    try {
      final results = await WiFiForIoTPlugin.loadWifiList();
      final seen = <String>{};
      final networks = <WifiAccessPoint>[];
      for (final network in results) {
        final ssid = network.ssid;
        if (ssid == null || ssid.isEmpty || !seen.add(ssid)) {
          continue;
        }
        networks.add(
          WifiAccessPoint(
            ssid: ssid,
            level: network.level ?? -100,
            security: _securityFor(network.capabilities),
          ),
        );
      }
      networks.sort((a, b) => b.level.compareTo(a.level));
      return WifiResult.success(networks);
    } catch (_) {
      return const WifiResult.failed(WifiFailure.scanFailed);
    }
  }

  /// Joins a network. Open networks take no password; the buoy uses WPA.
  Future<bool> connect(String ssid, {String? password}) async {
    if (!isSupported) {
      return false;
    }
    try {
      final security = (password == null || password.isEmpty)
          ? NetworkSecurity.NONE
          : NetworkSecurity.WPA;
      final ok = await WiFiForIoTPlugin.connect(
        ssid,
        password: password,
        security: security,
        joinOnce: true,
        withInternet: false,
        timeoutInSeconds: 30,
      );
      if (ok) {
        // Route the app's traffic over the buoy, not cellular.
        try {
          await WiFiForIoTPlugin.forceWifiUsage(true);
        } catch (_) {}
      }
      return ok;
    } catch (_) {
      return false;
    }
  }

  Future<bool> disconnect() async {
    if (!isSupported) {
      return false;
    }
    try {
      await WiFiForIoTPlugin.forceWifiUsage(false);
    } catch (_) {}
    try {
      return await WiFiForIoTPlugin.disconnect();
    } catch (_) {
      return false;
    }
  }

  /// Opens the OS app-settings screen, for when a permission was denied
  /// permanently and only a settings visit can undo it.
  Future<bool> openAppSettings() {
    return perm.openAppSettings();
  }

  Future<bool> _isWifiEnabled() async {
    try {
      return await WiFiForIoTPlugin.isEnabled();
    } catch (_) {
      return false;
    }
  }

  static WifiSecurity _securityFor(String? capabilities) {
    final caps = (capabilities ?? '').toUpperCase();
    if (caps.contains('WPA') || caps.contains('WEP')) {
      return caps.contains('WEP') && !caps.contains('WPA')
          ? WifiSecurity.wep
          : WifiSecurity.wpa;
    }
    return WifiSecurity.none;
  }
}
