/// A fishing spot reported by any fisherman with the app, as read back from
/// `GET /api/spots`.
///
/// Distinct from [FishingSpot] in fishing_spot.dart: that is this handset's
/// own local queue (pending/synced/rejected, retry bookkeeping). This is the
/// public, read-only view of everyone's spots - including this handset's
/// own, once synced - shown on the Venture map. Mirrors [BuoyMarker] in
/// shape for the same reason: a lightweight, tolerant parser for a feed
/// polled every 30 seconds where a malformed entry should be dropped, not
/// crash the poll.
class CommunitySpot {
  const CommunitySpot({
    required this.id,
    required this.latitude,
    required this.longitude,
    this.postedBy,
    this.speciesName,
    this.notes,
  });

  final String id;
  final double latitude;
  final double longitude;
  final String? postedBy;
  final String? speciesName;
  final String? notes;

  static CommunitySpot? tryParse(Object? value) {
    if (value is! Map) {
      return null;
    }
    final id = value['id'];
    if (id == null) {
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
    final speciesName = value['species_name'];
    final notes = value['notes'];
    return CommunitySpot(
      id: id.toString(),
      latitude: lat,
      longitude: lon,
      postedBy: postedBy is String && postedBy.trim().isNotEmpty
          ? postedBy.trim()
          : null,
      speciesName: speciesName is String && speciesName.trim().isNotEmpty
          ? speciesName.trim()
          : null,
      notes: notes is String && notes.trim().isNotEmpty ? notes.trim() : null,
    );
  }

  static List<CommunitySpot> parseList(Object? decoded, {String key = 'spots'}) {
    final rows = decoded is Map && decoded[key] is List
        ? decoded[key] as List
        : decoded is List
            ? decoded
            : const <Object?>[];
    return rows
        .map(CommunitySpot.tryParse)
        .whereType<CommunitySpot>()
        .toList(growable: false);
  }
}
