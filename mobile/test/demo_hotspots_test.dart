import 'package:aqone/data/demo_hotspots.dart';
import 'package:aqone/models/hotspot_cell.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DemoHotspots', () {
    test('is always flagged as a demo', () {
      // The single assertion that keeps the rest honest. Everything that
      // distinguishes these from real predictions - the EXAMPLE chip, the
      // different colour, the "nobody reported these" line - hangs off this
      // flag.
      expect(DemoHotspots.surface.isDemo, isTrue);
    });

    test('carries no timestamp', () {
      // An "updated 2 minutes ago" stamp is the one detail that would make
      // invented data read as measured.
      expect(DemoHotspots.surface.generatedAt, isNull);
      expect(DemoHotspots.surface.ageLabel, isNull);
    });

    test('sits in New Washington municipal waters', () {
      for (final HotspotCell cell in DemoHotspots.surface.cells) {
        expect(cell.centerLat, inInclusiveRange(11.55, 11.90));
        expect(cell.centerLon, inInclusiveRange(122.20, 122.55));
      }
    });

    test('spans the opacity scale rather than clustering', () {
      final List<double> scores = DemoHotspots.surface.cells
          .map((HotspotCell c) => c.score)
          .toList()
        ..sort();

      expect(scores.length, greaterThanOrEqualTo(3));
      // A demonstration of a probability surface that is all one shade
      // teaches nothing about what the shading means.
      expect(scores.last - scores.first, greaterThan(0.4));
      for (final double score in scores) {
        expect(score, inInclusiveRange(0.0, 1.0));
      }
    });
  });

  group('parsed surfaces', () {
    test('are never marked as demo', () {
      // A backend cannot label its own output an example, so nothing off the
      // wire may ever set this flag.
      final HotspotSurface? parsed = HotspotCell.parse(<String, Object?>{
        'is_demo': true,
        'cells': <Object?>[
          <String, Object?>{
            'center_lat': 11.72,
            'center_lon': 122.36,
            'score': 0.8,
          },
        ],
      });

      expect(parsed, isNotNull);
      expect(parsed!.isDemo, isFalse);
    });
  });
}
