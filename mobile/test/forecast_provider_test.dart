// AqOneForecastProvider is the seam documented on the class itself: try the
// backend's fused endpoint, fall back to Open-Meteo with no handset release
// required. DailyOutlook.parseAqOneList's parsing rules are already pinned
// in daily_outlook_test.dart; this file pins the provider's precedence and
// fallback decision, which parser tests alone cannot cover.
import 'dart:convert';

import 'package:aqone/models/daily_outlook.dart';
import 'package:aqone/services/backend_client.dart';
import 'package:aqone/services/forecast_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _FakeProvider implements ForecastProvider {
  _FakeProvider(this.result);

  final List<DailyOutlook>? result;
  bool called = false;

  @override
  Future<List<DailyOutlook>?> daily({
    required double lat,
    required double lon,
    String? municipality,
    int days = 7,
  }) async {
    called = true;
    return result;
  }
}

void main() {
  group('AqOneForecastProvider', () {
    test('prefers the backend fused forecast when it answers with days', () async {
      final fallback = _FakeProvider(null);
      final backend = BackendClient(
        client: MockClient((request) async => http.Response(
              jsonEncode(<String, Object?>{
                'source': 'open-meteo',
                'generated_at': '2026-08-16T04:00:00Z',
                'days': <Object?>[
                  <String, Object?>{'date': '2026-08-16', 'weather_code': 95},
                ],
              }),
              200,
            )),
      );
      final provider = AqOneForecastProvider(backend: backend, fallback: fallback);

      final result = await provider.daily(lat: 11.68, lon: 122.41, days: 7);

      expect(result, isNotNull);
      expect(result!.single.weatherCode, 95);
      expect(fallback.called, isFalse);
    });

    test('falls back to Open-Meteo when the backend forecast is unavailable', () async {
      final fallback = _FakeProvider(<DailyOutlook>[
        DailyOutlook(
          date: DateTime(2026, 8, 16),
          weatherCode: 3,
          risk: RiskAssessment.unknown,
        ),
      ]);
      final backend = BackendClient(
        client: MockClient((request) async => http.Response('', 502)),
      );
      final provider = AqOneForecastProvider(backend: backend, fallback: fallback);

      final result = await provider.daily(lat: 11.68, lon: 122.41, days: 7);

      expect(fallback.called, isTrue);
      expect(result, isNotNull);
      expect(result!.single.weatherCode, 3);
    });

    test('falls back when the backend returns an empty days list', () async {
      final fallback = _FakeProvider(<DailyOutlook>[]);
      final backend = BackendClient(
        client: MockClient((request) async => http.Response(
              jsonEncode(<String, Object?>{
                'source': 'open-meteo',
                'generated_at': '2026-08-16T04:00:00Z',
                'days': <Object?>[],
              }),
              200,
            )),
      );
      final provider = AqOneForecastProvider(backend: backend, fallback: fallback);

      await provider.daily(lat: 11.68, lon: 122.41, days: 7);

      expect(fallback.called, isTrue);
    });

    test('falls back on a malformed backend body rather than throwing', () async {
      final fallback = _FakeProvider(<DailyOutlook>[]);
      final backend = BackendClient(
        client: MockClient((request) async => http.Response('not json', 200)),
      );
      final provider = AqOneForecastProvider(backend: backend, fallback: fallback);

      await provider.daily(lat: 11.68, lon: 122.41, days: 7);

      expect(fallback.called, isTrue);
    });
  });
}
