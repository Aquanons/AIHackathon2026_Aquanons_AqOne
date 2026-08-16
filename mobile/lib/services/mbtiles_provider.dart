import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_map/flutter_map.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import 'tile_cache.dart';

/// Reads the bundled offline basemap pack for the municipal waters.
///
/// MBTiles is a SQLite file with a `tiles(zoom_level, tile_column, tile_row,
/// tile_data)` table, and sqflite is already a dependency, so this needs no
/// new package and no native configuration - which matters on a project that
/// has already lost time to a plugin's Gradle requirements.
///
/// The pack must be generated from a source that permits offline use. OSM's
/// tile servers explicitly do not: see docs/24_OFFLINE_MAP.md for the
/// self-hosted render that produces the file legally.
///
/// Falls back to [fallback] for anything outside the pack, so panning beyond
/// the municipal waters still works when there is signal.
class MbtilesTileProvider extends TileProvider {
  MbtilesTileProvider({required this.pack, required this.fallback});

  final MbtilesPack pack;
  final TileProvider fallback;

  @override
  ImageProvider<Object> getImage(
    TileCoordinates coordinates,
    TileLayer options,
  ) {
    if (!pack.covers(coordinates)) {
      return fallback.getImage(coordinates, options);
    }
    return _MbtilesImage(
      pack: pack,
      coordinates: coordinates,
      fallback: fallback.getImage(coordinates, options),
    );
  }
}

/// An opened MBTiles archive.
class MbtilesPack {
  MbtilesPack._(this._db, this.minZoom, this.maxZoom);

  final Database _db;

  /// Zoom range the pack actually contains. Outside it there is nothing to
  /// read, so the request goes straight to the network rather than doing a
  /// query that can only miss.
  final int minZoom;
  final int maxZoom;

  /// Copies the asset out of the bundle and opens it.
  ///
  /// Returns null when the asset is absent, which is the state until someone
  /// generates the pack. Everything downstream then behaves as though this
  /// feature does not exist - a missing pack must never stop the map loading.
  static Future<MbtilesPack?> openAsset(String assetPath) async {
    try {
      final Directory dir = await getApplicationSupportDirectory();
      final File file = File('${dir.path}/${assetPath.split('/').last}');

      // sqflite cannot read from the asset bundle, so the pack is copied out
      // once. Size is checked rather than existence: a copy interrupted by a
      // crash would otherwise leave a truncated file that opens and then
      // fails on every query.
      final ByteData data = await rootBundle.load(assetPath);
      final int expected = data.lengthInBytes;
      if (!file.existsSync() || file.statSync().size != expected) {
        await file.writeAsBytes(
          data.buffer.asUint8List(data.offsetInBytes, expected),
          flush: true,
        );
      }

      final Database db = await openReadOnlyDatabase(file.path);
      final List<Map<String, Object?>> rows = await db.rawQuery(
        'SELECT MIN(zoom_level) AS lo, MAX(zoom_level) AS hi FROM tiles',
      );
      final Object? lo = rows.isEmpty ? null : rows.first['lo'];
      final Object? hi = rows.isEmpty ? null : rows.first['hi'];
      if (lo is! int || hi is! int) {
        await db.close();
        return null;
      }
      return MbtilesPack._(db, lo, hi);
    } catch (_) {
      // Absent, unreadable, or not an MBTiles file. The network provider
      // carries on alone.
      return null;
    }
  }

  bool covers(TileCoordinates coordinates) =>
      coordinates.z >= minZoom && coordinates.z <= maxZoom;

  /// Tile bytes, or null if this pack has no tile there.
  Future<Uint8List?> read(TileCoordinates coordinates) async {
    try {
      // MBTiles rows are TMS: y counts from the bottom, while flutter_map and
      // every XYZ URL count from the top. Miss this and the map renders
      // mirrored north-to-south, which looks plausible enough at sea to be
      // genuinely dangerous.
      final int flippedY =
          (math.pow(2, coordinates.z).toInt() - 1) - coordinates.y;
      final List<Map<String, Object?>> rows = await _db.query(
        'tiles',
        columns: <String>['tile_data'],
        where: 'zoom_level = ? AND tile_column = ? AND tile_row = ?',
        whereArgs: <Object?>[coordinates.z, coordinates.x, flippedY],
        limit: 1,
      );
      if (rows.isEmpty) {
        return null;
      }
      final Object? blob = rows.first['tile_data'];
      return blob is Uint8List ? blob : null;
    } catch (_) {
      return null;
    }
  }

  Future<void> close() async {
    try {
      await _db.close();
    } catch (_) {}
  }
}

class _MbtilesImage extends ImageProvider<_MbtilesImage> {
  _MbtilesImage({
    required this.pack,
    required this.coordinates,
    required this.fallback,
  });

  final MbtilesPack pack;
  final TileCoordinates coordinates;

  /// Used when the pack has no tile at this coordinate - the pack covers the
  /// municipal waters, not the whole province.
  final ImageProvider<Object> fallback;

  @override
  Future<_MbtilesImage> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture<_MbtilesImage>(this);

  @override
  ImageStreamCompleter loadImage(
    _MbtilesImage key,
    ImageDecoderCallback decode,
  ) {
    return MultiFrameImageStreamCompleter(
      codec: _load(decode),
      scale: 1,
      debugLabel: 'mbtiles ${coordinates.z}/${coordinates.x}/${coordinates.y}',
    );
  }

  Future<Codec> _load(ImageDecoderCallback decode) async {
    final Uint8List? bytes = await pack.read(coordinates);
    if (bytes != null && bytes.isNotEmpty) {
      return decode(await ImmutableBuffer.fromUint8List(bytes));
    }
    // Outside the packed area. Hand off to the network provider, which has
    // its own cache; offline this throws and flutter_map draws its error
    // tile, same as before.
    final Completer<Codec> completer = Completer<Codec>();
    final ImageStream stream = fallback.resolve(ImageConfiguration.empty);
    late ImageStreamListener listener;
    listener = ImageStreamListener(
      (ImageInfo info, bool _) async {
        stream.removeListener(listener);
        final ByteData? data = await info.image.toByteData(
          format: ImageByteFormat.png,
        );
        if (data == null) {
          completer.completeError(
            StateError('Tile unavailable: ${coordinates.z}'),
          );
          return;
        }
        completer.complete(
          decode(
            await ImmutableBuffer.fromUint8List(data.buffer.asUint8List()),
          ),
        );
      },
      onError: (Object error, StackTrace? stack) {
        stream.removeListener(listener);
        completer.completeError(error, stack);
      },
    );
    stream.addListener(listener);
    return completer.future;
  }

  @override
  bool operator ==(Object other) =>
      other is _MbtilesImage &&
      other.coordinates == coordinates &&
      other.pack == pack;

  @override
  int get hashCode => Object.hash(pack, coordinates);
}

/// Builds the provider chain: bundled pack first, then the disk cache, then
/// the network. Callers get a single TileProvider and need not know which
/// layer answered.
Future<TileProvider> buildTileProvider({
  required TileCache cache,
  required String assetPath,
}) async {
  final TileProvider network = CachedNetworkTileProvider(cache: cache);
  final MbtilesPack? pack = await MbtilesPack.openAsset(assetPath);
  if (pack == null) {
    return network;
  }
  return MbtilesTileProvider(pack: pack, fallback: network);
}
