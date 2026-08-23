import '../models/hotspot_cell.dart';

/// Illustrative hotspot cells, shipped so the layer can be seen and explained
/// before the model exists.
///
/// These are invented. No catch log, no environmental data and no model
/// produced them - the coordinates were chosen to sit plausibly in New
/// Washington's municipal waters and nothing more. They exist to answer
/// "what will this look like?" for a fisherman being shown the app, and to
/// give the rendering path something to draw.
///
/// [HotspotSurface.isDemo] is what keeps that honest: the legend says
/// EXAMPLE, states plainly that these are not real predictions, and the cells
/// are drawn in a different colour from the real thing. A fisherman burning
/// fuel to reach an invented coordinate is the specific harm this guards
/// against, and it is a cheap harm to prevent.
///
/// Served only when the endpoint is absent. The moment
/// /api/public/hotspots answers, real cells replace these entirely - see
/// VentureFeeds.hotspots.
///
/// Deleting this is one constant and one branch.
class DemoHotspots {
  const DemoHotspots._();

  /// Clustered around New Washington's municipal waters so the demo surface
  /// reads as a local example rather than a generic map overlay.
  static const HotspotSurface surface = HotspotSurface(
    isDemo: true,
    minReporters: 5,
    modelVersion: 'example',
    cells: <HotspotCell>[
      HotspotCell(centerLat: 11.7000, centerLon: 122.4500, cellSizeDegrees: 0.012, score: 0.62, observations: 18),
      HotspotCell(centerLat: 11.6900, centerLon: 122.4800, cellSizeDegrees: 0.012, score: 0.72, observations: 22),
      HotspotCell(centerLat: 11.6800, centerLon: 122.5100, cellSizeDegrees: 0.012, score: 0.58, observations: 16),
      HotspotCell(centerLat: 11.6600, centerLon: 122.4900, cellSizeDegrees: 0.012, score: 0.84, observations: 34),
      HotspotCell(centerLat: 11.6500, centerLon: 122.4600, cellSizeDegrees: 0.012, score: 0.68, observations: 24),
      HotspotCell(centerLat: 11.6600, centerLon: 122.4300, cellSizeDegrees: 0.012, score: 0.42, observations: 11),
    ],
    // Deliberately null. An "updated 2 minutes ago" stamp on invented data
    // would be the one detail that makes it read as real.
    generatedAt: null,
  );
}
