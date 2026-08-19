import 'package:aqone/core/app_diagnostics.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AppDiagnostics.format', () {
    test('redacts error details in non-verbose mode', () {
      const rawError =
          'token=abc123 lat=11.605 lon=122.3125 Authorization: Bearer xyz';
      final output = AppDiagnostics.format(
        'sync',
        error: rawError,
        stackTrace: StackTrace.fromString('line one\nline two'),
        statusCode: 503,
        verbose: false,
      );

      expect(output, 'AqOne [sync] status=503');
      expect(output.contains('abc123'), isFalse);
      expect(output.contains('11.605'), isFalse);
      expect(output.contains('Authorization'), isFalse);
      expect(output.contains('line one'), isFalse);
    });

    test('keeps details in verbose mode for local debugging', () {
      final output = AppDiagnostics.format(
        'sync',
        error: 'boom',
        stackTrace: StackTrace.fromString('line one'),
        statusCode: 500,
        verbose: true,
      );

      expect(output, contains('AqOne [sync] status=500 boom'));
      expect(output, contains('line one'));
    });
  });
}
