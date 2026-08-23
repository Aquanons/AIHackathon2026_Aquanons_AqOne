import 'package:aqone/l10n/app_localizations.dart';

/// How much confidence anyone downstream should place in a vessel's claimed
/// identity.
///
/// Nothing the app collects is verified by the app. A tier only records *who
/// last corroborated the claim*, so a dispatcher can triage rather than guess.
/// The app never withholds an SOS on the basis of a tier.
enum TrustTier {
  /// The skipper typed their own details. Format-checked, nothing more.
  selfDeclared('self_declared'),

  /// A one-time code reached the phone number on the record. Reserved: the
  /// app does not send codes yet, so nothing sets this today.
  phoneVerified('phone_verified'),

  /// A responder physically met this vessel and confirmed it. Only the
  /// MDRRMO side can grant this; the handset never sets it locally.
  confirmedByResponder('confirmed_by_responder');

  const TrustTier(this.wire);

  /// Stable string used in sqlite and on the wire.
  final String wire;

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

extension TrustTierL10n on TrustTier {
  String label(AppLocalizations t) => switch (this) {
        TrustTier.selfDeclared => t.trustSelfDeclared,
        TrustTier.phoneVerified => t.trustPhoneVerified,
        TrustTier.confirmedByResponder => t.trustResponderConfirmed,
      };
}
