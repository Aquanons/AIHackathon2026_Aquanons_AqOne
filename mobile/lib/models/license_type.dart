/// The kind of fishing registration a skipper holds.
///
/// Most users of this app are municipal fisherfolk on boats of 3 gross tons
/// and below. They do NOT hold a CFVGL - that is a BFAR licence for
/// commercial vessels of 3.1 GT and above. Municipal fisherfolk are
/// registered by their LGU under BoatR (the boat) and FishR (the person).
/// Offering only CFVGL would lock out the people this app exists for.
enum LicenseType {
  /// Municipal fishing vessel registration, 3 GT and below (LGU / BoatR).
  boatr('boatr', 'BoatR', 'Municipal boat registration (3 GT and below)'),

  /// Municipal fisherfolk registration for the person (LGU / FishR).
  fishr('fishr', 'FishR', 'Municipal fisherfolk registration number'),

  /// Commercial Fishing Vessel and Gear Licence, 3.1 GT and above (BFAR).
  cfvgl('cfvgl', 'CFVGL', 'Commercial vessel licence (3.1 GT and above)'),

  /// Not registered, or registered but the paperwork is not to hand.
  ///
  /// This option exists on purpose. An unregistered fisherman in trouble
  /// still needs the SOS button to work.
  none('none', 'Not registered yet', 'You can add this later in settings');

  const LicenseType(this.wire, this.label, this.hint);

  final String wire;
  final String label;
  final String hint;

  bool get requiresNumber => this != LicenseType.none;

  static LicenseType fromWire(String? value) {
    for (final type in LicenseType.values) {
      if (type.wire == value) {
        return type;
      }
    }
    return LicenseType.none;
  }
}
