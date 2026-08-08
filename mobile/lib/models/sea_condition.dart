import 'package:flutter/material.dart';

/// The official go/no-go call, set by the MDRRMO.
///
/// This is the authoritative signal in the app. The weather heuristic in
/// Venture is a rough client-side check; this is a human decision by the
/// people responsible for the response, and it outranks anything the handset
/// works out for itself.
enum SeaStatus {
  safe(
    'safe',
    'Safe to Go Out',
    'Sea conditions are favorable.',
    Color(0xFF16A34A),
    Icons.check_circle_rounded,
  ),
  caution(
    'caution',
    'Caution - Check Advisories',
    'Exercise caution before heading out.',
    Color(0xFFD97706),
    Icons.warning_amber_rounded,
  ),
  notAdvised(
    'not_advised',
    'Not Advised to Go Out',
    'Stay ashore - conditions are dangerous.',
    Color(0xFFDC2626),
    Icons.dangerous_rounded,
  ),
  unknown(
    'unknown',
    'Status Not Yet Set',
    'Check advisories before heading out.',
    Color(0xFF6B7280),
    Icons.help_outline_rounded,
  );

  const SeaStatus(
    this.wire,
    this.headline,
    this.defaultSubtitle,
    this.color,
    this.icon,
  );

  final String wire;
  final String headline;
  final String defaultSubtitle;
  final Color color;

  /// Paired with [color] so the state is never conveyed by colour alone -
  /// important both for accessibility and for reading a phone in glare on
  /// the water.
  final IconData icon;

  static SeaStatus fromWire(String? value) {
    for (final status in SeaStatus.values) {
      if (status.wire == value) {
        return status;
      }
    }
    return SeaStatus.unknown;
  }
}

class SeaCondition {
  const SeaCondition({
    required this.status,
    this.reason,
    this.setByName,
    this.createdAt,
    this.fetchedAt,
  });

  final SeaStatus status;

  /// Free text from the MDRRMO. Replaces the default subtitle when present.
  final String? reason;

  /// Who set it. Only returned on the authenticated endpoint.
  final String? setByName;

  final DateTime? createdAt;

  /// When this handset last successfully read the value.
  final DateTime? fetchedAt;

  String get subtitle {
    final trimmed = reason?.trim();
    return trimmed == null || trimmed.isEmpty
        ? status.defaultSubtitle
        : trimmed;
  }

  static SeaCondition? tryParse(Object? decoded) {
    if (decoded is! Map) {
      return null;
    }
    final current = decoded['current'];
    final source = current is Map ? current : decoded;
    final status = source['status'];
    final reason = source['reason'];
    final setBy = source['set_by_name'];
    final createdAt = source['created_at'];
    return SeaCondition(
      status: SeaStatus.fromWire(status is String ? status : null),
      reason: reason is String && reason.trim().isNotEmpty
          ? reason.trim()
          : null,
      setByName:
          setBy is String && setBy.trim().isNotEmpty ? setBy.trim() : null,
      createdAt:
          createdAt is String ? DateTime.tryParse(createdAt)?.toUtc() : null,
      fetchedAt: DateTime.now(),
    );
  }

  SeaCondition copyWith({DateTime? fetchedAt}) => SeaCondition(
        status: status,
        reason: reason,
        setByName: setByName,
        createdAt: createdAt,
        fetchedAt: fetchedAt ?? this.fetchedAt,
      );

  /// Whether this reading has gone stale.
  ///
  /// The source project only showed a stale marker when `set_by_name` was
  /// present, and the public endpoint omits that field - so guests could sit
  /// looking at hours-old data with nothing to indicate it. Staleness here
  /// depends only on the clock, so it always shows.
  bool isStale({Duration threshold = const Duration(minutes: 2)}) {
    final at = fetchedAt;
    if (at == null) {
      return true;
    }
    return DateTime.now().difference(at) > threshold;
  }
}
