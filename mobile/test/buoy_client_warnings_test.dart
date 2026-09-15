import 'dart:convert';
import 'dart:io';

import 'package:aqone/models/advisory.dart';
import 'package:aqone/services/buoy_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('BuoyClient.warnings', () {
    test('fetches and parses active advisories from buoy /v1/warnings', () async {
      final futureDate = DateTime.now().add(const Duration(days: 2)).toIso8601String();
      final body = {
        'advisories': [
          {
            'id': 1,
            'title': 'Gale Warning',
            'priority': 'Warning',
            'municipality': 'New Washington',
            'description': 'Rough seas expected over eastern seaboard.',
            'publish_date': '2026-09-15',
            'expiration_date': futureDate,
          },
          {
            'id': 2,
            'title': 'Squall Alert',
            'priority': 'Emergency',
            'municipality': 'All',
            'description': 'Rapidly descending front detected by microbarometer array.',
            'publish_date': '2026-09-15',
            'expiration_date': futureDate,
          }
        ]
      };

      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient((request) async {
          expect(request.url.toString(), 'http://192.168.4.1/v1/warnings');
          expect(request.method, 'GET');
          return http.Response(jsonEncode(body), 200);
        }),
      );

      final advisories = await client.warnings();
      expect(advisories.length, 2);
      // Emergency sorts before Warning
      expect(advisories.first.priority, AdvisoryPriority.emergency);
      expect(advisories.first.title, 'Squall Alert');
      expect(advisories.last.priority, AdvisoryPriority.warning);
    });

    test('filters out expired advisories', () async {
      final pastDate = DateTime.now().subtract(const Duration(days: 3)).toIso8601String();
      final body = {
        'advisories': [
          {
            'id': 99,
            'title': 'Expired Notice',
            'priority': 'Warning',
            'municipality': 'All',
            'description': 'Old weather system',
            'publish_date': '2026-09-01',
            'expiration_date': pastDate,
          }
        ]
      };

      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient((request) async {
          return http.Response(jsonEncode(body), 200);
        }),
      );

      final advisories = await client.warnings();
      expect(advisories, isEmpty);
    });

    test('throws BuoyRejected on non-200 status', () async {
      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient((request) async {
          return http.Response('Server error', 500);
        }),
      );

      expect(() => client.warnings(), throwsA(isA<BuoyRejected>()));
    });

    test('throws BuoyInvalidResponse on invalid json', () async {
      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient((request) async {
          return http.Response('not json at all', 200);
        }),
      );

      expect(() => client.warnings(), throwsA(isA<BuoyInvalidResponse>()));
    });

    test('throws BuoyUnreachable on network failure', () async {
      final client = BuoyClient(
        baseUrl: 'http://192.168.4.1',
        client: MockClient((request) async {
          throw const SocketException('Connection refused');
        }),
      );

      expect(() => client.warnings(), throwsA(isA<BuoyUnreachable>()));
    });
  });
}
