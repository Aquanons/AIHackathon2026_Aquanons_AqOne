import 'package:flutter/material.dart';

import '../../models/weather_snapshot.dart';

/// Current conditions from Open-Meteo.
///
/// Weather is a third-party reading, not an AqOne judgement, and it is shown
/// below the sea-condition banner so the official call always reads first.
/// A calm forecast is not permission to go out.
class WeatherCard extends StatelessWidget {
  const WeatherCard({
    super.key,
    required this.snapshot,
    required this.isLoading,
    required this.onRetry,
    this.locationLabel = 'Aklan',
  });

  final WeatherSnapshot? snapshot;
  final bool isLoading;
  final VoidCallback onRetry;

  /// Home reads a fixed municipal position rather than device GPS, so the
  /// card says where the reading is actually from.
  final String locationLabel;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0),
        ),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.22 : 0.05),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: _buildContent(isDark),
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

    final value = snapshot;
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

    final condition = value.condition;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: Colors.amber.withValues(alpha: isDark ? 0.18 : 0.14),
                shape: BoxShape.circle,
              ),
              child: Icon(
                condition.icon,
                size: 26,
                color: isDark ? Colors.amber.shade300 : Colors.amber.shade700,
              ),
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
            child: const Row(
              children: <Widget>[
                Icon(
                  Icons.info_outline_rounded,
                  size: 15,
                  color: Color(0xFF8A5A12),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    // Explicitly a weather note, not a go/no-go call. The
                    // sea-condition banner above is the decision that counts.
                    'Rough weather for small boats. Check the sea condition '
                    'and advisories.',
                    style: TextStyle(
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
