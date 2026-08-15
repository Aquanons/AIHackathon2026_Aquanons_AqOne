/// A single gear-checklist row.
///
/// Persisted so it survives an app restart. `isDone` is the only field that
/// resets between trips - see [ChecklistStore.resetForNewTrip] - the list of
/// items itself is reused so a fisherman going out two or three times a day
/// never has to retype his gear list.
class ChecklistItem {
  const ChecklistItem({
    required this.id,
    required this.title,
    required this.isDone,
    required this.sortOrder,
    required this.createdAt,
  });

  final int id;
  final String title;
  final bool isDone;
  final int sortOrder;
  final int createdAt;

  ChecklistItem copyWith({bool? isDone}) => ChecklistItem(
        id: id,
        title: title,
        isDone: isDone ?? this.isDone,
        sortOrder: sortOrder,
        createdAt: createdAt,
      );

  Map<String, Object?> toRow() => <String, Object?>{
        'id': id,
        'title': title,
        'is_done': isDone ? 1 : 0,
        'sort_order': sortOrder,
        'created_at': createdAt,
      };

  static ChecklistItem fromRow(Map<String, Object?> row) => ChecklistItem(
        id: row['id']! as int,
        title: row['title']! as String,
        isDone: (row['is_done'] as int? ?? 0) != 0,
        sortOrder: row['sort_order'] as int? ?? 0,
        createdAt: row['created_at'] as int? ?? 0,
      );
}
