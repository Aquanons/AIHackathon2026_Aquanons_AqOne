import 'package:aqone/core/config.dart';
import 'package:aqone/core/endpoint_guard.dart';
import 'package:aqone/services/backend_client.dart';
import 'package:aqone/services/buoy_client.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('EndpointGuard.validateStaticConfig', () {
    test('accepts the checked-in endpoint set', () {
      expect(AqOneConfig.validateEndpoints, returnsNormally);
    });

    test('rejects a cleartext weather endpoint', () {
      expect(
        () => EndpointGuard.validateStaticConfig(
          buoyBaseUrl: AqOneConfig.buoyBaseUrl,
          backendBaseUrl: AqOneConfig.backendBaseUrl,
          openMeteoBase: 'http://api.open-meteo.com/v1/forecast',
          openMeteoMarineBase: AqOneConfig.openMeteoMarineBase,
          osmTileUrl: AqOneConfig.osmTileUrl,
        ),
        throwsA(isA<EndpointConfigurationError>()),
      );
    });

    test('rejects a cleartext map endpoint', () {
      expect(
        () => EndpointGuard.validateStaticConfig(
          buoyBaseUrl: AqOneConfig.buoyBaseUrl,
          backendBaseUrl: AqOneConfig.backendBaseUrl,
          openMeteoBase: AqOneConfig.openMeteoBase,
          openMeteoMarineBase: AqOneConfig.openMeteoMarineBase,
          osmTileUrl: 'http://tile.openstreetmap.org/{z}/{x}/{y}.png',
        ),
        throwsA(isA<EndpointConfigurationError>()),
      );
    });
  });

  group('EndpointGuard.requireHttpsAbsolute', () {
    test('accepts an absolute https URL', () {
      final uri = EndpointGuard.requireHttpsAbsolute(
        'https://example.com/api',
        label: 'test URL',
      );

      expect(uri.scheme, 'https');
      expect(uri.host, 'example.com');
    });

    test('rejects cleartext HTTP', () {
      expect(
        () => EndpointGuard.requireHttpsAbsolute(
          'http://example.com/api',
          label: 'test URL',
        ),
        throwsA(isA<EndpointConfigurationError>()),
      );
    });
  });

  group('EndpointGuard.requireBuoyBase', () {
    test('accepts the canonical buoy base URL', () {
      final uri = EndpointGuard.requireBuoyBase(
        'http://192.168.4.1',
        label: 'buoy base',
      );

      expect(uri.toString(), 'http://192.168.4.1');
    });

    test('rejects the old stale buoy host', () {
      expect(
        () => EndpointGuard.requireBuoyBase(
          'http://10.0.0.1',
          label: 'buoy base',
        ),
        throwsA(isA<EndpointConfigurationError>()),
      );
    });

    test('rejects a buoy path override', () {
      expect(
        () => EndpointGuard.requireBuoyBase(
          'http://192.168.4.1/portal',
          label: 'buoy base',
        ),
        throwsA(isA<EndpointConfigurationError>()),
      );
    });
  });

  group('EndpointGuard.resolveRelative', () {
    test('keeps backend paths on the configured host', () {
      final uri = EndpointGuard.backend(
        AqOneConfig.backendBaseUrl,
        '/api/sos?status=open',
      );

      expect(uri.scheme, 'https');
      expect(uri.host, Uri.parse(AqOneConfig.backendBaseUrl).host);
      expect(uri.path, '/api/sos');
      expect(uri.queryParameters['status'], 'open');
    });

    test('rejects an absolute override path', () {
      expect(
        () => EndpointGuard.backend(
          AqOneConfig.backendBaseUrl,
          'http://evil.example/api/sos',
        ),
        throwsA(isA<EndpointConfigurationError>()),
      );
    });
  });

  group('EndpointGuard.buoy endpoints', () {
    test('accepts the canonical chat host', () {
      expect(
        EndpointGuard.buoyWs(EndpointGuard.buoyHost).toString(),
        'ws://192.168.4.1:81',
      );
      expect(
        EndpointGuard.buoyHistory(EndpointGuard.buoyHost).toString(),
        'http://192.168.4.1/history',
      );
    });

    test('rejects a non-buoy chat host', () {
      expect(
        () => EndpointGuard.buoyWs('192.168.4.2'),
        throwsA(isA<EndpointConfigurationError>()),
      );
    });
  });

  group('network clients', () {
    test('BackendClient rejects a cleartext backend base URL', () {
      expect(
        () => BackendClient(baseUrl: 'http://example.com'),
        throwsA(isA<EndpointConfigurationError>()),
      );
    });

    test('BuoyClient rejects a non-canonical buoy base URL', () {
      expect(
        () => BuoyClient(baseUrl: 'http://10.0.0.1'),
        throwsA(isA<EndpointConfigurationError>()),
      );
    });
  });
}
