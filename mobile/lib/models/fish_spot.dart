/// A community-reported fishing spot.
///
/// These are discrete points posted by other fishermen. They are NOT an AI
/// probability heatmap, and must never be presented as validated predictions -
/// the hotspot model is exploratory and is not served.
class FishSpot {
  const FishSpot({
    required this.latitude,
    required this.longitude,
    required this.postedBy,
    this.createdAt,
    this.proofImageUrl,
  });

  final double latitude;
  final double longitude;
  final String postedBy;
  final DateTime? createdAt;
  final String? proofImageUrl;

  static FishSpot? tryParse(Object? value) {
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

    final postedBy = value['posted_by'];
    final createdAt = value['created_at'];
    final proofImageUrl = value['proof_image_url'];
    return FishSpot(
      latitude: lat,
      longitude: lon,
      // Public spot responses omit the poster on purpose, so guests see
      // Anonymous rather than a missing field.
      postedBy: postedBy is String && postedBy.trim().isNotEmpty
          ? postedBy.trim()
          : 'Anonymous',
      createdAt:
          createdAt is String ? DateTime.tryParse(createdAt)?.toUtc() : null,
      proofImageUrl: proofImageUrl is String && proofImageUrl.trim().isNotEmpty
          ? proofImageUrl.trim()
          : null,
    );
  }

  static List<FishSpot> parseList(Object? decoded, {String key = 'spots'}) {
    final rows = decoded is Map && decoded[key] is List
        ? decoded[key] as List
        : decoded is List
            ? decoded
            : const <Object?>[];
    return rows
        .map(FishSpot.tryParse)
        .whereType<FishSpot>()
        .toList(growable: false);
  }
}

/// Turns a UTC timestamp into a short relative label.
String formatTimeAgo(DateTime createdUtc) {
  final diff = DateTime.now().toUtc().difference(createdUtc);
  if (diff.inMinutes < 1) {
    return 'Just now';
  }
  if (diff.inMinutes < 60) {
    return '${diff.inMinutes}m ago';
  }
  if (diff.inHours < 24) {
    return '${diff.inHours}h ago';
  }
  return '${diff.inDays}d ago';
}
