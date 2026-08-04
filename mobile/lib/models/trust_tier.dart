/// How much confidence anyone downstream should place in a vessel's claimed
/// identity.
///
/// Nothing the app collects is verified by the app. A tier only records *who
/// last corroborated the claim*, so a dispatcher can triage rather than guess.
/// The app never withholds an SOS on the basis of a tier.
enum TrustTier {
  /// The skipper typed their own details. Format-checked, nothing more.
  selfDeclared('self_declared', 'Self-declared'),

  /// A one-time code reached the phone number on the record. Reserved: the
  /// app does not send codes yet, so nothing sets this today.
  phoneVerified('phone_verified', 'Phone verified'),

  /// A responder physically met this vessel and confirmed it. Only the
  /// MDRRMO side can grant this; the handset never sets it locally.
  confirmedByResponder('confirmed_by_responder', 'Confirmed by responder');

  const TrustTier(this.wire, this.label);

  /// Stable string used in sqlite and on the wire.
  final String wire;

  /// Short human label for the UI.
  final String label;

  String get description {
    switch (this) {
      case TrustTier.selfDeclared:
        return 'These details were entered on this phone and have not been '
            'checked against any registry.';
      case TrustTier.phoneVerified:
        return 'The phone number on this record has been reached with a '
            'one-time code.';
      case TrustTier.confirmedByResponder:
        return 'A responder has met this vessel and confirmed these details.';
    }
  }

  /// Higher means more corroborated. Useful for sorting a dispatcher queue.
  int get rank => index;

  static TrustTier fromWire(String? value) {
    for (final tier in TrustTier.values) {
      if (tier.wire == value) {
        return tier;
      }
    }
    return TrustTier.selfDeclared;
  }
}
