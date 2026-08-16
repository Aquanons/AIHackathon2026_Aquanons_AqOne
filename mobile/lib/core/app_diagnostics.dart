import 'package:flutter/foundation.dart';

class AppDiagnostics {
  const AppDiagnostics._();

  static String format(
    String category, {
    Object? error,
    StackTrace? stackTrace,
    int? statusCode,
    bool verbose = kDebugMode,
  }) {
    final buffer = StringBuffer('AqOne [$category]');
    if (statusCode != null) {
      buffer.write(' status=$statusCode');
    }
    if (verbose && error != null) {
      buffer.write(' $error');
    }
    if (verbose && stackTrace != null) {
      buffer.write('\n$stackTrace');
    }
    return buffer.toString();
  }

  static void log(
    String category,
    Object error, {
    StackTrace? stackTrace,
    int? statusCode,
  }) {
    debugPrint(
      format(
        category,
        error: error,
        stackTrace: stackTrace,
        statusCode: statusCode,
      ),
    );
  }
}
