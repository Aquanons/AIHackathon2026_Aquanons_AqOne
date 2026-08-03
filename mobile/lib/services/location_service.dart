import 'package:geolocator/geolocator.dart';

import '../core/config.dart';

class Fix {
  const Fix({required this.lat, required this.lon});
  final double lat;
  final double lon;
}

class LocationService {
  Future<Fix?> currentFix() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        return null;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: AqOneConfig.locationTimeout,
        ),
      ).timeout(AqOneConfig.locationTimeout);
      return Fix(lat: position.latitude, lon: position.longitude);
    } catch (_) {
      return null;
    }
  }
}
