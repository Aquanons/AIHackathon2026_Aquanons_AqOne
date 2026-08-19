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

  /// Spread across the municipal waters rather than clustered, so the
  /// demonstration shows the range of the opacity scale rather than one blob.
  static const HotspotSurface surface = HotspotSurface(
    isDemo: true,
    minReporters: 5,
    modelVersion: 'example',
    cells: <HotspotCell>[
      HotspotCell(
        centerLat: 11.7250,
        centerLon: 122.3600,
        cellSizeDegrees: 0.05,
        score: 0.85,
        observations: 34,
      ),
      HotspotCell(
        centerLat: 11.6900,
        centerLon: 122.4250,
        cellSizeDegrees: 0.05,
        score: 0.62,
        observations: 18,
      ),
      HotspotCell(
        centerLat: 11.7700,
        centerLon: 122.3350,
        cellSizeDegrees: 0.05,
        score: 0.44,
        observations: 11,
      ),
      HotspotCell(
        centerLat: 11.6600,
        centerLon: 122.4650,
        cellSizeDegrees: 0.05,
        score: 0.28,
        observations: 6,
      ),
    ],
    // Deliberately null. An "updated 2 minutes ago" stamp on invented data
    // would be the one detail that makes it read as real.
    generatedAt: null,
  );
}
