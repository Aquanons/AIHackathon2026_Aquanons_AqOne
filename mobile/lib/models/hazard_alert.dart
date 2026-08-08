import 'package:flutter/material.dart';

/// The two buoy-derived hazard feeds Venture polls.
///
/// These are area advisories inferred from buoy sensor conditions. They are
/// NOT confirmed distress for any particular boat, and the wording shown to
/// the user must not imply that someone has been reported in trouble.
enum HazardKind {
  wave(
    'wave',
    'wave_warnings',
    'Dangerous Wave Warning',
    Icons.waves_rounded,
    Color(0xFFF59E0B),
  ),
  capsizing(
    'capsizing',
    'capsizing_advisories',
    'Capsizing Risk Advisory',
    Icons.dangerous_rounded,
    Color(0xFFDC2626),
  );

  const HazardKind(this.wire, this.responseKey, this.title, this.icon, this.color);

  final String wire;

  /// The array key the backend wraps these records in.
  final String responseKey;

  final String title;
  final IconData icon;
  final Color color;

  /// Message shown when [count] buoy locations are reporting this hazard.
  String message(int count) {
    final places = '$count buoy location${count == 1 ? '' : 's'}';
    switch (this) {
      case HazardKind.wave:
        return 'Dangerous wave conditions detected at $places. Exercise '
            'extreme caution.';
      case HazardKind.capsizing:
        return 'High tilt or motion detected at $places. Vessels in these '
            'areas may be at risk of capsizing.';
    }
  }
}

/// A single hazard record. Identity matters more than payload here: the UI
/// only alerts on IDs it has not shown before, so repeated polls of an
/// ongoing hazard do not re-interrupt the user.
class HazardAlert {
  const HazardAlert({
    required this.id,
    required this.kind,
    this.latitude,
    this.longitude,
    this.reportedAt,
  });

  final String id;
  final HazardKind kind;
  final double? latitude;
  final double? longitude;
  final DateTime? reportedAt;

  static HazardAlert? tryParse(Object? value, HazardKind kind) {
    if (value is! Map) {
      return null;
    }
    final id = value['id'];
    if (id == null) {
      return null;
    }
    final latitude = value['latitude'];
    final longitude = value['longitude'];
    final reportedAt = value['created_at'] ?? value['reported_at'];
    return HazardAlert(
      id: id.toString(),
      kind: kind,
      latitude: latitude is num && latitude.toDouble().isFinite
          ? latitude.toDouble()
          : null,
      longitude: longitude is num && longitude.toDouble().isFinite
          ? longitude.toDouble()
          : null,
      reportedAt:
          reportedAt is String ? DateTime.tryParse(reportedAt)?.toUtc() : null,
    );
  }

  static List<HazardAlert> parseList(Object? decoded, HazardKind kind) {
    final rows = decoded is Map && decoded[kind.responseKey] is List
        ? decoded[kind.responseKey] as List
        : decoded is List
            ? decoded
            : const <Object?>[];
    return rows
        .map((row) => HazardAlert.tryParse(row, kind))
        .whereType<HazardAlert>()
        .toList(growable: false);
  }
}
