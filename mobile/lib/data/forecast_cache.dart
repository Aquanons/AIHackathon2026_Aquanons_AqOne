import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/daily_outlook.dart';
import '../models/forecast_outlook.dart';

/// Last good forecast, kept across restarts.
///
/// A fisherman four hours offshore has no signal and may well have closed the
/// app since leaving. Without this the strip is empty exactly when the weather
/// matters most. The fetch timestamp is stored with it so a stale strip can be
/// labelled rather than passed off as live.
class ForecastCache {
  const ForecastCache();

  static const String _keyRecordV2 = 'forecast_record_v2';
  static const String _keyDays = 'forecast_days_v1';
  static const String _keyFetchedAt = 'forecast_fetched_at_v1';

  /// Cached days older than this are dropped rather than shown. A week-old
  /// outlook is worse than no outlook - its "today" is not today.
  static const Duration maxAge = Duration(hours: 12);

  /// Future timestamps beyond this margin are rejected as clock corruption.
  static const Duration maxFutureSkew = Duration(minutes: 1);

  Future<void> saveOutlook(ForecastOutlook outlook) async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.setString(_keyRecordV2, jsonEncode(outlook.toCacheJson()));
      await prefs.setString(
        _keyDays,
        jsonEncode(
          outlook.days
              .map((DailyOutlook d) => d.toCacheJson())
              .toList(growable: false),
        ),
      );
      await prefs.setString(_keyFetchedAt, outlook.fetchedAt.toIso8601String());
    } catch (_) {
      // Cache write failure is non-fatal.
    }
  }

  Future<void> save(List<DailyOutlook> days, DateTime fetchedAt) async {
    await saveOutlook(
      ForecastOutlook(
        days: days,
        hours: const <HourlyInterval>[],
        fetchedAt: fetchedAt,
        source: 'cache_v1',
      ),
    );
  }

  /// Loads the stored outlook, or null if missing, stale, or corrupt.
  Future<ForecastOutlook?> loadOutlook() async => (await load())?.outlook;

  /// Returns null when there is nothing usable stored.
  Future<CachedForecast?> load() async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      final DateTime now = DateTime.now();
      final DateTime midnight = DateTime(now.year, now.month, now.day);

      // Try v2 record first
      final String? rawV2 = prefs.getString(_keyRecordV2);
      if (rawV2 != null) {
        try {
          final Object? decoded = jsonDecode(rawV2);
          final ForecastOutlook? outlook = ForecastOutlook.fromCacheJson(decoded);
          if (outlook != null && _isFresh(outlook.fetchedAt, now)) {
            final List<DailyOutlook> currentDays = outlook.days
                .where((DailyOutlook d) => !d.date.isBefore(midnight))
                .toList(growable: false);
            if (currentDays.isNotEmpty) {
              return CachedForecast(
                days: currentDays,
                fetchedAt: outlook.fetchedAt,
                outlook: outlook.copyWith(days: currentDays),
              );
            }
          }
        } catch (_) {
          // Corrupted v2 payload, fall through to legacy fallback
        }
      }

      // Fall back to legacy v1 keys
      final String? rawDays = prefs.getString(_keyDays);
      final String? at = prefs.getString(_keyFetchedAt);
      if (rawDays == null || at == null) {
        return null;
      }
      final DateTime? fetchedAt = DateTime.tryParse(at);
      if (fetchedAt == null || !_isFresh(fetchedAt, now)) {
        return null;
      }
      final Object? decoded = jsonDecode(rawDays);
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
      final List<DailyOutlook> current = days
          .where((DailyOutlook d) => !d.date.isBefore(midnight))
          .toList(growable: false);
      if (current.isEmpty) {
        return null;
      }
      final legacyOutlook = ForecastOutlook(
        days: current,
        hours: const <HourlyInterval>[],
        fetchedAt: fetchedAt,
        source: 'cache_v1',
      );
      return CachedForecast(
        days: current,
        fetchedAt: fetchedAt,
        outlook: legacyOutlook,
      );
    } catch (_) {
      return null;
    }
  }

  static bool _isFresh(DateTime fetchedAt, DateTime now) {
    if (fetchedAt.isAfter(now.add(maxFutureSkew))) {
      return false;
    }
    if (now.difference(fetchedAt) > maxAge) {
      return false;
    }
    return true;
  }
}

class CachedForecast {
  const CachedForecast({
    required this.days,
    required this.fetchedAt,
    this.outlook,
  });

  final List<DailyOutlook> days;
  final DateTime fetchedAt;
  final ForecastOutlook? outlook;
}
