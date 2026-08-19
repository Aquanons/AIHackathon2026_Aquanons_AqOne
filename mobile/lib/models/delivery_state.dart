import 'package:aqone/l10n/app_localizations.dart';

/// The four delivery states. See `docs/06_DELIVERY_STATES.md` - these are the
/// product language and the wire values are a contract with the backend.
///
/// Display text deliberately does NOT live on the enum. Enum fields are const
/// and cannot depend on a BuildContext, so a `title` field here could never be
/// translated. Use the [DeliveryStateL10n] extension below instead. This is
/// the pattern to follow for every other enum in `lib/models/`; see §4.1 of
/// `docs/22_LOCALIZATION_PLAN.md`.
enum DeliveryState {
  saved(wire: 'saved', rank: 0),
  relayed(wire: 'relayed', rank: 1),
  delivered(wire: 'delivered', rank: 2),
  acknowledged(wire: 'acknowledged', rank: 3);

  const DeliveryState({required this.wire, required this.rank});

  final String wire;
  final int rank;

  static DeliveryState fromWire(String? value) {
    for (final state in DeliveryState.values) {
      if (state.wire == value) {
        return state;
      }
    }
    return DeliveryState.saved;
  }

  bool isAfter(DeliveryState other) => rank > other.rank;

  DeliveryState merge(DeliveryState candidate) =>
      candidate.rank > rank ? candidate : this;
}

extension DeliveryStateL10n on DeliveryState {
  /// Short label, e.g. the heading on a delivery-state tile.
  String title(AppLocalizations t) => switch (this) {
        DeliveryState.saved => t.deliveryStateSavedTitle,
        DeliveryState.relayed => t.deliveryStateRelayedTitle,
        DeliveryState.delivered => t.deliveryStateDeliveredTitle,
        DeliveryState.acknowledged => t.deliveryStateAcknowledgedTitle,
      };

  /// One-line explanation of what this state actually means for the user.
  ///
  /// The app never shows a later state than it has observed, so these have to
  /// stay honest in translation: "Relayed" must not read as though anyone has
  /// received the SOS yet.
  String description(AppLocalizations t) => switch (this) {
        DeliveryState.saved => t.deliveryStateSavedDescription,
        DeliveryState.relayed => t.deliveryStateRelayedDescription,
        DeliveryState.delivered => t.deliveryStateDeliveredDescription,
        DeliveryState.acknowledged => t.deliveryStateAcknowledgedDescription,
      };
}
