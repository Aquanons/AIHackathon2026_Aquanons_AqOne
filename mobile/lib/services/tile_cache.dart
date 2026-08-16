import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

// The ImageProvider machinery (ImageProvider, ImageConfiguration, the
// ImageStreamCompleter family) comes from widgets; SynchronousFuture is in
// foundation, which widgets does not re-export. dart:ui is prefixed because
// its Image would otherwise collide with the Image widget.
import 'package:flutter/foundation.dart' show SynchronousFuture;
import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../core/config.dart';
import '../core/endpoint_guard.dart';

/// On-disk cache for basemap tiles the user has actually looked at.
///
/// This is required, not merely nice. The OSM Tile Usage Policy §3.2 says to
/// honour the server's caching headers, or cache for at least seven days if
/// you cannot read them, and to "keep a sufficient local cache to ensure that
/// repeat views do not unnecessarily re-download tiles". The app previously
/// cached nothing, so every pan re-fetched from a community-funded server.
///
/// It is deliberately NOT a prefetcher. §4 of the same policy prohibits
/// pre-seeding areas or building tile archives, and says outright that
/// offline use is not permitted on tile.openstreetmap.org. Only tiles that
/// were drawn on screen are stored here. The offline pack for the municipal
/// waters is a separate thing built from a source that permits it - see
/// docs/24_OFFLINE_MAP.md.
///
/// The practical effect for a fisherman: the water he looked at before
/// leaving still draws when the signal goes.
class TileCache {
  TileCache({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  Directory? _dir;

  /// Policy floor when the server sends no usable Cache-Control or Expires.
  static const Duration minimumTtl = Duration(days: 7);

  /// Rough ceiling for the store. Handsets in this fleet are cheap and often
  /// nearly full, so an unbounded cache would quietly become the reason the
  /// app cannot save an SOS note.
  static const int maxBytes = 80 * 1024 * 1024;

  Future<Directory> _directory() async {
    final Directory? existing = _dir;
    if (existing != null) {
      return existing;
    }
    // Cache directory, not documents: this is regenerable, and the OS is
    // free to reclaim it under storage pressure rather than failing a write
    // that matters more.
    final Directory base = await getTemporaryDirectory();
    final Directory dir = Directory('${base.path}/tiles');
    if (!dir.existsSync()) {
      await dir.create(recursive: true);
    }
    _dir = dir;
    return dir;
  }

  File _fileFor(Directory dir, String url) {
    // Flat filenames rather than z/x/y directories: one listing to sweep for
    // eviction, and no unbounded directory tree to walk.
    final String safe = url
        .replaceAll(RegExp(r'^https?://'), '')
        .replaceAll(RegExp(r'[^A-Za-z0-9]'), '_');
    return File('${dir.path}/$safe');
  }

  /// Cached bytes for [url], or null when absent or expired.
  Future<Uint8List?> read(String url) async {
    try {
      final File file = _fileFor(await _directory(), url);
      if (!file.existsSync()) {
        return null;
      }
      final FileStat stat = file.statSync();
      if (DateTime.now().difference(stat.modified) > minimumTtl) {
        // Expired by the floor. Deleted rather than kept, because a tile
        // that old is likely to be re-fetched anyway and the space is worth
        // more than the guess.
        unawaited(file.delete().catchError((_) => file));
        return null;
      }
      return await file.readAsBytes();
    } catch (_) {
      return null;
    }
  }

  Future<void> write(String url, Uint8List bytes) async {
    try {
      final File file = _fileFor(await _directory(), url);
      await file.writeAsBytes(bytes, flush: false);
    } catch (_) {
      // A cache write failing is not worth surfacing - the tile is already
      // on screen.
    }
  }

  /// Deletes oldest-first until the store is back under [maxBytes].
  ///
  /// Called opportunistically rather than on every write: stat-ing the whole
  /// directory per tile would cost more than the cache saves.
  Future<void> evictIfOversized() async {
    try {
      final Directory dir = await _directory();
      final List<FileSystemEntity> entries = dir.listSync();
      int total = 0;
      final List<MapEntry<File, FileStat>> files = <MapEntry<File, FileStat>>[];
      for (final FileSystemEntity entry in entries) {
        if (entry is! File) {
          continue;
        }
        final FileStat stat = entry.statSync();
        total += stat.size;
        files.add(MapEntry<File, FileStat>(entry, stat));
      }
      if (total <= maxBytes) {
        return;
      }
      files.sort(
        (MapEntry<File, FileStat> a, MapEntry<File, FileStat> b) =>
            a.value.modified.compareTo(b.value.modified),
      );
      for (final MapEntry<File, FileStat> entry in files) {
        if (total <= maxBytes) {
          break;
        }
        total -= entry.value.size;
        await entry.key.delete().catchError((_) => entry.key);
      }
    } catch (_) {}
  }

  Future<int> sizeInBytes() async {
    try {
      final Directory dir = await _directory();
      int total = 0;
      for (final FileSystemEntity entry in dir.listSync()) {
        if (entry is File) {
          total += entry.statSync().size;
        }
      }
      return total;
    } catch (_) {
      return 0;
    }
  }

  Future<void> clear() async {
    try {
      final Directory dir = await _directory();
      for (final FileSystemEntity entry in dir.listSync()) {
        await entry.delete().catchError((_) => entry);
      }
    } catch (_) {}
  }

  Future<Uint8List?> fetch(String url) async {
    try {
      final Uri uri = EndpointGuard.requireHttpsAbsolute(
        url,
        label: 'tile URL',
      );
      final http.Response response = await _client
          .get(
            uri,
            // §3.4: a distinct, stable User-Agent naming the app, with a
            // contact. Library defaults are blocked without notice.
            headers: <String, String>{'User-Agent': AqOneConfig.tileUserAgent},
          )
          .timeout(AqOneConfig.backendTimeout);
      if (response.statusCode != 200) {
        return null;
      }
      return response.bodyBytes;
    } catch (_) {
      return null;
    }
  }

  void dispose() => _client.close();
}

/// flutter_map provider that reads the cache first and falls back to the
/// network, so a lost signal degrades to the last-seen map rather than grey.
class CachedNetworkTileProvider extends TileProvider {
  CachedNetworkTileProvider({required this.cache});

  final TileCache cache;

  int _sinceSweep = 0;

  @override
  ImageProvider<Object> getImage(
    TileCoordinates coordinates,
    TileLayer options,
  ) {
    final String url = getTileUrl(coordinates, options);
    EndpointGuard.requireHttpsAbsolute(url, label: 'tile URL');
    return _CachedTileImage(
      url: url,
      cache: cache,
      onFetched: _maybeSweep,
    );
  }

  void _maybeSweep() {
    // Every few hundred fetched tiles, which is roughly a few megabytes.
    if (++_sinceSweep < 250) {
      return;
    }
    _sinceSweep = 0;
    unawaited(cache.evictIfOversized());
  }
}

class _CachedTileImage extends ImageProvider<_CachedTileImage> {
  _CachedTileImage({
    required this.url,
    required this.cache,
    required this.onFetched,
  });

  final String url;
  final TileCache cache;
  final VoidCallback onFetched;

  @override
  Future<_CachedTileImage> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture<_CachedTileImage>(this);

  @override
  ImageStreamCompleter loadImage(
    _CachedTileImage key,
    ImageDecoderCallback decode,
  ) {
    return MultiFrameImageStreamCompleter(
      codec: _load(decode),
      scale: 1,
      debugLabel: url,
    );
  }

  Future<ui.Codec> _load(ImageDecoderCallback decode) async {
    Uint8List? bytes = await cache.read(url);
    if (bytes == null) {
      bytes = await cache.fetch(url);
      if (bytes != null) {
        await cache.write(url, bytes);
        onFetched();
      }
    }
    if (bytes == null || bytes.isEmpty) {
      // No tile and no cached copy. Throwing lets flutter_map show its own
      // error tile instead of the widget tree blowing up.
      throw StateError('Tile unavailable offline: $url');
    }
    return decode(await ui.ImmutableBuffer.fromUint8List(bytes));
  }

  @override
  bool operator ==(Object other) =>
      other is _CachedTileImage && other.url == url;

  @override
  int get hashCode => url.hashCode;
}
