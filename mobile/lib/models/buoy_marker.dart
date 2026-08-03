/// A buoy's position and advertised coverage, as reported by the backend.
///
/// Distinct from [BuoyStatus] in buoy_contact.dart: that describes the single
/// buoy this handset is currently talking to over WiFi/LoRa. This describes
/// any buoy in the mesh, for drawing coverage on the map.
class BuoyMarker {
  const BuoyMarker({
    required this.latitude,
    required this.longitude,
    required this.coverageRadiusMeters,
    required this.isActive,
    this.id,
    this.name,
  });

  final double latitude;
  final double longitude;

  /// Nominal configured radius, not a measured range. Real LoRa reach varies
  /// with weather, sea state and antenna height, so this circle is guidance
  /// rather than a guarantee of coverage.
  final double coverageRadiusMeters;

  final bool isActive;
  final String? id;
  final String? name;

  static const double _fallbackRadiusMeters = 500;

  static BuoyMarker? tryParse(Object? value) {
    if (value is! Map) {
      return null;
    }
    final latitude = value['latitude'];
    final longitude = value['longitude'];
    if (latitude is! num || longitude is! num) {
      return null;
    }
    final lat = latitude.toDouble();
    final lon = longitude.toDouble();
    if (!lat.isFinite || !lon.isFinite) {
      return null;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return null;
    }

    final radius = value['coverage_radius_meters'];
    final parsedRadius =
        radius is num && radius.toDouble().isFinite && radius > 0
            ? radius.toDouble()
            : _fallbackRadiusMeters;

    final id = value['id'];
    final name = value['name'];
    return BuoyMarker(
      latitude: lat,
      longitude: lon,
      coverageRadiusMeters: parsedRadius,
      isActive: value['status'] == 'active',
      id: id?.toString(),
      name: name is String && name.trim().isNotEmpty ? name.trim() : null,
    );
  }

  static List<BuoyMarker> parseList(Object? decoded, {String key = 'buoys'}) {
    final rows = decoded is Map && decoded[key] is List
        ? decoded[key] as List
        : decoded is List
            ? decoded
            : const <Object?>[];
    return rows
        .map(BuoyMarker.tryParse)
        .whereType<BuoyMarker>()
        .toList(growable: false);
  }
}
