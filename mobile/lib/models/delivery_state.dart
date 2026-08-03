enum DeliveryState {
  saved(
    wire: 'saved',
    rank: 0,
    title: 'Saved',
    description: 'Not sent — no buoy nearby. Will send automatically.',
  ),
  relayed(
    wire: 'relayed',
    rank: 1,
    title: 'Relayed',
    description: 'Handed to the buoy. Waiting for the mesh.',
  ),
  delivered(
    wire: 'delivered',
    rank: 2,
    title: 'Delivered',
    description: 'Received by the MDRRMO dashboard.',
  ),
  acknowledged(
    wire: 'acknowledged',
    rank: 3,
    title: 'Acknowledged',
    description: 'Responder acknowledged this SOS.',
  );

  const DeliveryState({
    required this.wire,
    required this.rank,
    required this.title,
    required this.description,
  });

  final String wire;
  final int rank;
  final String title;
  final String description;

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
