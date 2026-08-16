class EndpointConfigurationError implements Exception {
  const EndpointConfigurationError(this.message);

  final String message;

  @override
  String toString() => 'EndpointConfigurationError: $message';
}

class EndpointGuard {
  const EndpointGuard._();

  static const String buoyHost = '192.168.4.1';
  static const int buoyWsPort = 81;

  static void validateStaticConfig({
    required String buoyBaseUrl,
    required String backendBaseUrl,
    required String openMeteoBase,
    required String openMeteoMarineBase,
    required String osmTileUrl,
  }) {
    requireBuoyBase(buoyBaseUrl, label: 'AqOneConfig.buoyBaseUrl');
    requireHttpsAbsolute(
      backendBaseUrl,
      label: 'AqOneConfig.backendBaseUrl',
    );
    requireHttpsAbsolute(
      openMeteoBase,
      label: 'AqOneConfig.openMeteoBase',
    );
    requireHttpsAbsolute(
      openMeteoMarineBase,
      label: 'AqOneConfig.openMeteoMarineBase',
    );
    requireHttpsAbsolute(osmTileUrl, label: 'AqOneConfig.osmTileUrl');
  }

  static Uri requireHttpsAbsolute(String raw, {required String label}) {
    final Uri uri = Uri.parse(raw);
    _requireNoUserInfo(uri, label);
    if (!uri.isAbsolute || uri.scheme != 'https' || uri.host.isEmpty) {
      throw EndpointConfigurationError('$label must be an absolute HTTPS URL');
    }
    if (uri.fragment.isNotEmpty) {
      throw EndpointConfigurationError('$label must not include a fragment');
    }
    return uri;
  }

  static Uri requireBuoyBase(String raw, {required String label}) {
    final Uri uri = Uri.parse(raw);
    _requireNoUserInfo(uri, label);
    if (!uri.isAbsolute || uri.scheme != 'http' || uri.host != buoyHost) {
      throw EndpointConfigurationError(
        '$label must be http://$buoyHost',
      );
    }
    if (uri.hasQuery || uri.fragment.isNotEmpty) {
      throw EndpointConfigurationError(
        '$label must not include query parameters or fragments',
      );
    }
    if (uri.port != 0 && uri.port != 80) {
      throw EndpointConfigurationError(
        '$label must use the buoy HTTP port 80',
      );
    }
    final String path = uri.path;
    if (path.isNotEmpty && path != '/') {
      throw EndpointConfigurationError('$label must not include a path');
    }
    return Uri(scheme: 'http', host: buoyHost);
  }

  static Uri backend(String baseUrl, String path, {String? label}) {
    return resolveRelative(
      requireHttpsAbsolute(
        baseUrl,
        label: label ?? 'backend base URL',
      ),
      path,
      label: label ?? 'backend path',
    );
  }

  static Uri buoy(String baseUrl, String path, {String? label}) {
    return resolveRelative(
      requireBuoyBase(
        baseUrl,
        label: label ?? 'buoy base URL',
      ),
      path,
      label: label ?? 'buoy path',
    );
  }

  static Uri resolveRelative(Uri base, String path, {required String label}) {
    final Uri relative = Uri.parse(path);
    if (relative.hasScheme || relative.hasAuthority) {
      throw EndpointConfigurationError('$label must stay on the configured host');
    }
    if (!path.startsWith('/')) {
      throw EndpointConfigurationError('$label must start with /');
    }
    return base.resolveUri(relative);
  }

  static Uri buoyWs(String host) {
    _requireBuoyHost(host, label: 'chat hub host');
    return Uri(scheme: 'ws', host: buoyHost, port: buoyWsPort);
  }

  static Uri buoyHistory(String host) {
    _requireBuoyHost(host, label: 'chat hub host');
    return Uri(scheme: 'http', host: buoyHost, path: '/history');
  }

  static void _requireBuoyHost(String host, {required String label}) {
    final String trimmed = host.trim();
    if (trimmed != buoyHost) {
      throw EndpointConfigurationError('$label must be $buoyHost');
    }
  }

  static void _requireNoUserInfo(Uri uri, String label) {
    if (uri.userInfo.isNotEmpty) {
      throw EndpointConfigurationError(
        '$label must not include embedded credentials',
      );
    }
  }
}
