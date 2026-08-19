import '../models/advisory.dart';

/// The one piece of content AqOne publishes about itself.
///
/// Carried by the app rather than fetched, for two reasons. It has to appear
/// on a fresh install with no backend and no signal - which is when someone
/// is most likely to be looking at the app for the first time, at a barangay
/// hall with bad reception. And it must never depend on the advisories table,
/// because a developer note has no business occupying a row meant for
/// MDRRMO instructions.
///
/// [Advisory.isOfficial] is false, which is the whole point: it renders
/// visibly differently from a real advisory and says outright that it is not
/// one. The Advisories screen is where a fisherman reads instructions that
/// may keep him ashore, and nothing we write may borrow that authority.
///
/// Deleting this is one constant and one call site.
class WelcomeAdvisory {
  const WelcomeAdvisory._();

  static const String teamPhotoAsset = 'assets/images/team_aquanons.jpg';

  static final Advisory instance = Advisory(
    title: 'Welcome to AqOne',
    description:
        'We are the Aquanons - five Information Technology students from '
        'Aklan State University. We built AqOne for the fishermen of New '
        'Washington, so that a boat in trouble can reach help even where '
        'there is no cellular signal.\n\n'
        'Your SOS goes out over the buoy network when there is no signal. '
        'Weather and sea conditions are here before you leave. Everything you '
        'record stays on your phone unless you choose to share it.\n\n'
        'This app is new and we are still learning what you need from it. If '
        'something is wrong, confusing, or missing, please tell us - you know '
        'these waters and we do not. Salamat gid, and safe trips.',
    // Lowest severity, so a real warning always sorts above this and Home's
    // single-advisory preview shows an MDRRMO notice rather than us whenever
    // one exists.
    priority: AdvisoryPriority.community,
    municipality: 'New Washington, Aklan',
    category: 'Welcome',
    isOfficial: false,
    byline: 'From the AqOne team',
    imageAsset: teamPhotoAsset,
    publishDate: DateTime(2026, 8, 16),
  );
}
