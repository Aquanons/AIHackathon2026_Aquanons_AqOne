import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/daily_outlook.dart';

/// Last good forecast, kept across restarts.
///
/// A fisherman four hours offshore has no signal and may well have closed the
/// app since leaving. Without this the strip is empty exactly when the weather
/// matters most. The fetch timestamp is stored with it so a stale strip can be
/// labelled rather than passed off as live.
class ForecastCache {
  const ForecastCache();

  static const String _keyDays = 'forecast_days_v1';
  static const String _keyFetchedAt = 'forecast_fetched_at_v1';

  /// Cached days older than this are dropped rather than shown. A week-old
  /// outlook is worse than no outlook - its "today" is not today.
  static const Duration maxAge = Duration(hours: 12);

  Future<void> save(List<DailyOutlook> days, DateTime fetchedAt) async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _keyDays,
        jsonEncode(
          days.map((DailyOutlook d) => d.toCacheJson()).toList(growable: false),
        ),
      );
      await prefs.setString(_keyFetchedAt, fetchedAt.toIso8601String());
    } catch (_) {
      // A cache write failing is not worth surfacing; the live fetch already
      // succeeded or this would not have been called.
    }
  }

  /// Returns null when there is nothing usable stored.
  Future<CachedForecast?> load() async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      final String? raw = prefs.getString(_keyDays);
      final String? at = prefs.getString(_keyFetchedAt);
      if (raw == null || at == null) {
        return null;
      }
      final DateTime? fetchedAt = DateTime.tryParse(at);
      if (fetchedAt == null ||
          DateTime.now().difference(fetchedAt) > maxAge) {
        return null;
      }
      final Object? decoded = jsonDecode(raw);
      if (decoded is! List) {
        return null;
      }
      final List<DailyOutlook> days = <DailyOutlook>[];
      for (final Object? entry in decoded) {
        final DailyOutlook? day = DailyOutlook.fromCacheJson(entry);
        if (day != null) {
          days.add(day);
        }
      }
      if (days.isEmpty) {
        return null;
      }
      // Days that have already passed are dropped, so the first chip is
      // genuinely today rather than yesterday wearing the label.
      final DateTime today = DateTime.now();
      final DateTime midnight = DateTime(today.year, today.month, today.day);
      final List<DailyOutlook> current = days
          .where((DailyOutlook d) => !d.date.isBefore(midnight))
          .toList(growable: false);
      if (current.isEmpty) {
        return null;
      }
      return CachedForecast(days: current, fetchedAt: fetchedAt);
    } catch (_) {
      return null;
    }
  }
}

class CachedForecast {
  const CachedForecast({required this.days, required this.fetchedAt});

  final List<DailyOutlook> days;
  final DateTime fetchedAt;
}
