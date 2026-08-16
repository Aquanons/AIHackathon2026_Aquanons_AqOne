import 'package:aqone/ui/chathubb.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ChatService.retainRecentMessages', () {
    test('drops cached messages older than 24 hours', () {
      final now = DateTime.utc(2026, 8, 16, 12);
      final kept = ChatService.retainRecentMessages(
        <ChatMessage>[
          ChatMessage(
            text: 'old',
            from: 'A',
            isMine: false,
            time: now.subtract(const Duration(hours: 25)),
          ),
          ChatMessage(
            text: 'fresh',
            from: 'B',
            isMine: false,
            time: now.subtract(const Duration(hours: 2)),
          ),
        ],
        now: now,
      );

      expect(kept.map((m) => m.text), <String>['fresh']);
    });

    test('keeps only the newest 50 cached messages', () {
      final now = DateTime.utc(2026, 8, 16, 12);
      final kept = ChatService.retainRecentMessages(
        List<ChatMessage>.generate(
          55,
          (index) => ChatMessage(
            text: 'm$index',
            from: 'A',
            isMine: false,
            time: now.subtract(Duration(minutes: 55 - index)),
          ),
        ),
        now: now,
      );

      expect(kept, hasLength(50));
      expect(kept.first.text, 'm5');
      expect(kept.last.text, 'm54');
    });
  });
}
