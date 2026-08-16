import 'package:flutter/material.dart';

import '../../core/config.dart';
import '../../models/daily_outlook.dart';
import '../../models/weather_snapshot.dart';

/// Current conditions and a seven-day outlook from Open-Meteo.
///
/// Weather is a third-party reading, not an AqOne judgement, and this sits
/// below the sea-condition banner so the official MDRRMO call always reads
/// first. Nothing in this card is permission to go out - the colours are
/// forecast guidance, deliberately styled quieter than the banner above.
class WeatherCard extends StatelessWidget {
  const WeatherCard({
    super.key,
    required this.snapshot,
    required this.isLoading,
    required this.onRetry,
    this.forecast = const <DailyOutlook>[],
    this.forecastAge,
    this.locationLabel = 'Aklan',
  });

  final WeatherSnapshot? snapshot;
  final bool isLoading;
  final VoidCallback onRetry;

  /// Up to [AqOneConfig.forecastDays] days, today first. Empty while loading
  /// or when every source failed.
  final List<DailyOutlook> forecast;

  /// When the shown forecast was fetched. Non-null only when it came from the
  /// offline cache, so a stale strip can say so instead of passing itself off
  /// as live.
  final DateTime? forecastAge;

  /// Home reads a fixed municipal position rather than device GPS, so the
  /// card says where the reading is actually from.
  final String locationLabel;

  @override
  Widget build(BuildContext context) {
    final bool isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (forecast.isNotEmpty) ...<Widget>[
            _ForecastStrip(
              days: forecast,
              isDark: isDark,
              age: forecastAge,
            ),
            const SizedBox(height: 14),
            Divider(
              height: 1,
              color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
            ),
            const SizedBox(height: 14),
          ],
          _buildContent(isDark),
        ],
      ),
    );
  }

  Widget _buildContent(bool isDark) {
    if (isLoading && snapshot == null) {
      return const Row(
        children: <Widget>[
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: 12),
          Text('Loading weather…', style: TextStyle(fontSize: 13)),
        ],
      );
    }

    final WeatherSnapshot? value = snapshot;
    if (value == null) {
      return Row(
        children: <Widget>[
          Icon(
            Icons.cloud_off_rounded,
            size: 22,
            color: isDark ? Colors.white54 : const Color(0xFF94A3B8),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Weather unavailable',
              style: TextStyle(
                fontSize: 13,
                color: isDark ? Colors.white70 : const Color(0xFF475569),
              ),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      );
    }

    final WeatherCondition condition = value.condition;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Icon(
              condition.icon,
              size: 34,
              color: isDark ? Colors.amber.shade300 : Colors.amber.shade700,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    condition.label,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Wind ${value.windSpeed.toStringAsFixed(0)} km/h '
                    '· $locationLabel',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? Colors.white54 : const Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ),
            Text(
              '${value.temperature.toStringAsFixed(1)}°C',
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w900,
                color: isDark ? Colors.white : const Color(0xFF0B4C8C),
              ),
            ),
          ],
        ),
        if (value.looksUnsafe) ...<Widget>[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFD97706).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: <Widget>[
                const Icon(
                  Icons.info_outline_rounded,
                  size: 15,
                  color: Color(0xFF8A5A12),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Wind ${value.windSpeed.toStringAsFixed(0)} km/h — '
                    'above the ${AqOneConfig.unsafeWindKph.toStringAsFixed(0)} km/h '
                    'threshold. Source: Open-Meteo. '
                    'This is not a PAGASA warning. '
                    'Always check the official sea condition and advisories.',
                    style: const TextStyle(
                      fontSize: 11.5,
                      height: 1.35,
                      color: Color(0xFF8A5A12),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// The seven-day strip.
class _ForecastStrip extends StatelessWidget {
  const _ForecastStrip({
    required this.days,
    required this.isDark,
    this.age,
  });

  final List<DailyOutlook> days;
  final bool isDark;
  final DateTime? age;

  @override
  Widget build(BuildContext context) {
    final List<DailyOutlook> shown =
        days.take(AqOneConfig.forecastDays).toList(growable: false);

    // If no day in the strip had sea state to work with, say it once at the
    // bottom rather than on every chip.
    final bool anyMissingSeaState =
        shown.any((DailyOutlook d) => d.risk.missingSeaState);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Text(
              '7-day outlook',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
            ),
            const Spacer(),
            if (age != null)
              Text(
                'as of ${_clock(age!)}',
                style: TextStyle(
                  fontSize: 10.5,
                  color: isDark ? Colors.white38 : const Color(0xFF94A3B8),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            for (int i = 0; i < shown.length; i++) ...<Widget>[
              if (i > 0) const SizedBox(width: 4),
              Expanded(
                child: _DayChip(
                  day: shown[i],
                  isDark: isDark,
                  isFirst: i == 0,
                  // Beyond day 3 the WMO codes get weak. Fading them stops a
                  // red Friday that turns out sunny from teaching people to
                  // ignore the colours entirely.
                  isOutlook: i >= AqOneConfig.forecastConfidentDays,
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 10),
        Text(
          anyMissingSeaState
              ? 'Forecast guidance from wind and rain only — sea state not '
                  'available. Not an official PAGASA or MDRRMO call.'
              : 'Forecast guidance, not an official PAGASA or MDRRMO call. '
                  'Always check the sea condition above.',
          style: TextStyle(
            fontSize: 10.5,
            height: 1.35,
            color: isDark ? Colors.white38 : const Color(0xFF94A3B8),
          ),
        ),
      ],
    );
  }

  static String _clock(DateTime at) {
    final int hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
    final String minute = at.minute.toString().padLeft(2, '0');
    return '$hour:$minute ${at.hour < 12 ? 'AM' : 'PM'}';
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({
    required this.day,
    required this.isDark,
    required this.isFirst,
    required this.isOutlook,
  });

  final DailyOutlook day;
  final bool isDark;
  final bool isFirst;
  final bool isOutlook;

  @override
  Widget build(BuildContext context) {
    final RiskLevel level = day.risk.level;
    final Color risk = level.color;
    final double alpha = isOutlook ? 0.55 : 1.0;

    final String label = isFirst ? 'Today' : day.shortWeekday;
    final String high =
        day.tempMax == null ? '–' : '${day.tempMax!.round()}°';
    final String low = day.tempMin == null ? '' : '${day.tempMin!.round()}°';

    return Semantics(
      label: '$label, ${day.condition.label}, ${level.label}.'
          '${day.risk.reason == null ? '' : ' ${day.risk.reason}.'}'
          '${isOutlook ? ' Longer-range outlook, lower confidence.' : ''}',
      child: Tooltip(
        message: day.risk.reason ?? level.label,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
          decoration: BoxDecoration(
            color: risk.withValues(alpha: isDark ? 0.16 : 0.09),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: risk.withValues(alpha: isFirst ? 0.75 : 0.28),
              width: isFirst ? 1.4 : 1,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.clip,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: isFirst ? FontWeight.w900 : FontWeight.w700,
                  color: (isDark ? Colors.white : const Color(0xFF0F172A))
                      .withValues(alpha: alpha),
                ),
              ),
              const SizedBox(height: 5),
              Icon(
                day.condition.icon,
                size: 19,
                color: (isDark ? Colors.white : const Color(0xFF334155))
                    .withValues(alpha: alpha),
              ),
              const SizedBox(height: 5),
              Text(
                high,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: (isDark ? Colors.white : const Color(0xFF0F172A))
                      .withValues(alpha: alpha),
                ),
              ),
              if (low.isNotEmpty)
                Text(
                  low,
                  style: TextStyle(
                    fontSize: 9.5,
                    color: (isDark ? Colors.white54 : const Color(0xFF64748B))
                        .withValues(alpha: alpha),
                  ),
                ),
              const SizedBox(height: 5),
              // Risk is carried by an icon as well as the colour - this gets
              // read in glare, by people who may not distinguish red from
              // green.
              Icon(
                level.icon,
                size: 12,
                color: risk.withValues(alpha: alpha),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
