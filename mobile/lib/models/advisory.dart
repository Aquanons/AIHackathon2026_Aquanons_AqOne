import 'package:flutter/material.dart';

/// How urgent an advisory is. Order matters: [severity] drives list sorting.
enum AdvisoryPriority {
  emergency('Emergency', 4, Color(0xFFDC2626)),
  warning('Warning', 3, Color(0xFFF59E0B)),
  information('Information', 2, Color(0xFF0F69C9)),
  community('Community', 1, Color(0xFF10B981)),
  unknown('Notice', 0, Color(0xFF6B7280));

  const AdvisoryPriority(this.label, this.severity, this.color);

  final String label;
  final int severity;
  final Color color;

  static AdvisoryPriority fromWire(String? value) {
    switch (value?.toLowerCase().trim()) {
      case 'emergency':
        return AdvisoryPriority.emergency;
      case 'warning':
        return AdvisoryPriority.warning;
      case 'information':
        return AdvisoryPriority.information;
      case 'community':
        return AdvisoryPriority.community;
      default:
        return AdvisoryPriority.unknown;
    }
  }
}

/// A published notice from the MDRRMO or LGU.
class Advisory {
  const Advisory({
    required this.title,
    required this.description,
    required this.priority,
    required this.municipality,
    this.category,
    this.publishDate,
    this.expirationDate,
    this.imageUrl,
    this.imageAsset,
    this.isOfficial = true,
    this.byline,
  });

  final String title;
  final String description;
  final AdvisoryPriority priority;
  final String municipality;
  final String? category;
  final DateTime? publishDate;
  final DateTime? expirationDate;

  /// Photo attached by whoever published the advisory - a damaged pier, a
  /// posted bulletin. Network URL, so it needs a graceful failure: the reader
  /// is frequently offshore with no signal and the text must survive without
  /// it.
  final String? imageUrl;

  /// Bundled asset instead of a URL. Only for advisories the app itself
  /// carries, which is why the wire format has no equivalent - a backend
  /// cannot reference an image inside the APK.
  final String? imageAsset;

  /// False for anything AqOne generated rather than the MDRRMO or LGU.
  ///
  /// This screen is where a fisherman reads official instructions, so
  /// anything that is not one must not be able to pass as one. §3.3 of the
  /// system design keeps human authority explicit; an app that quietly speaks
  /// in the LGU's voice erodes exactly the trust the safety features depend
  /// on. Drives a visibly different card, not a footnote.
  final bool isOfficial;

  /// Who published it, when that is not a municipality. Shown in place of
  /// [municipality] for unofficial notices.
  final String? byline;

  /// Whether this advisory is still in force.
  ///
  /// Expiration is treated as inclusive - an advisory expiring today is live
  /// all day. The source compared against the raw parsed date, and because
  /// date-only strings parse to midnight, an advisory would vanish at 00:00
  /// on the very day it was still meant to apply. For a safety notice that
  /// is the wrong way to be wrong.
  bool get isActive {
    final expiry = expirationDate;
    if (expiry == null) {
      return true;
    }
    final endOfDay = DateTime(expiry.year, expiry.month, expiry.day, 23, 59, 59);
    return endOfDay.isAfter(DateTime.now());
  }

  static Advisory? tryParse(Object? value) {
    if (value is! Map) {
      return null;
    }
    final title = value['title'];
    if (title is! String || title.trim().isEmpty) {
      return null;
    }
    final description = value['description'];
    final municipality = value['municipality'];
    final category = value['category'];
    return Advisory(
      title: title.trim(),
      description: description is String ? description.trim() : '',
      priority: AdvisoryPriority.fromWire(value['priority'] as String?),
      municipality: municipality is String && municipality.trim().isNotEmpty
          ? municipality.trim()
          : 'All',
      category: category is String && category.trim().isNotEmpty
          ? category.trim()
          : null,
      publishDate: _date(value['publish_date']),
      expirationDate: _date(value['expiration_date']),
      imageUrl: _text(value['image_url']),
    );
  }

  static String? _text(Object? value) {
    if (value is! String) {
      return null;
    }
    final String trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static DateTime? _date(Object? value) {
    if (value is! String || value.trim().isEmpty) {
      return null;
    }
    return DateTime.tryParse(value.trim());
  }

  /// Parses, drops expired entries, and sorts by urgency then recency.
  static List<Advisory> parseList(Object? decoded) {
    final rows = decoded is Map && decoded['advisories'] is List
        ? decoded['advisories'] as List
        : decoded is List
            ? decoded
            : const <Object?>[];

    final advisories = rows
        .map(Advisory.tryParse)
        .whereType<Advisory>()
        .where((advisory) => advisory.isActive)
        .toList();

    advisories.sort((a, b) {
      if (a.priority.severity != b.priority.severity) {
        return b.priority.severity.compareTo(a.priority.severity);
      }
      final dateA = a.publishDate ?? DateTime(1970);
      final dateB = b.publishDate ?? DateTime(1970);
      return dateB.compareTo(dateA);
    });
    return advisories;
  }
}
