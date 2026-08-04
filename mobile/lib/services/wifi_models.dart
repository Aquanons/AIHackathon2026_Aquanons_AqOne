/// Security scheme of a scanned network, reduced to what matters for joining.
enum WifiSecurity {
  none,
  wep,
  wpa,
}

/// A sanitised snapshot of a nearby network.
///
/// UI code never touches the plugin's deprecated `WifiNetwork` type directly;
/// the scanner translates results into this model.
class WifiAccessPoint {
  const WifiAccessPoint({
    required this.ssid,
    required this.level,
    required this.security,
  });

  final String ssid;

  /// Signal strength in dBm (negative; closer to 0 is stronger).
  final int level;

  final WifiSecurity security;

  bool get requiresPassword => security != WifiSecurity.none;

  String get signalLabel {
    if (level >= -55) return 'Excellent';
    if (level >= -67) return 'Good';
    if (level >= -75) return 'Fair';
    return 'Weak';
  }
}
