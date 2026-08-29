import 'package:aqone/core/config.dart';
import 'package:aqone/data/identity_store.dart';
import 'package:aqone/ui/chathubb.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('ChatService.displayNameFor', () {
    // Every handset announcing the same name is not cosmetic: the hub relays
    // the name verbatim and the app decides whose bubble a message is from by
    // comparing it, so a shared name puts other boats' messages in your own.
    test('announces the boat, which is what other bancas recognise', () {
      expect(
        ChatService.displayNameFor(
          const VesselIdentity(
            vesselId: 'abc',
            boat: 'Maria Gracia',
            skipperName: 'Dado',
          ),
        ),
        'Maria Gracia',
      );
    });

    test('falls back to the skipper when no boat name was given', () {
      expect(
        ChatService.displayNameFor(
          const VesselIdentity(
            vesselId: 'abc',
            boat: '   ',
            skipperName: 'Dado',
          ),
        ),
        'Dado',
      );
    });

    test('never returns an empty name for a bare profile', () {
      expect(
        ChatService.displayNameFor(
          const VesselIdentity(vesselId: 'abc', boat: ''),
        ),
        'Fisher',
      );
    });
  });

  group('ChatService.mergeHistory', () {
    ChatMessage line(String text, {bool isMine = false, int minutesAgo = 0}) {
      return ChatMessage(
        text: text,
        from: isMine ? 'Maria Gracia' : 'Bantay Dagat',
        isMine: isMine,
        time: DateTime.utc(2026, 8, 20, 12)
            .subtract(Duration(minutes: minutesAgo)),
      );
    }

    test('a phone arriving with nothing takes the whole backlog', () {
      final merged = ChatService.mergeHistory(
        <ChatMessage>[],
        <ChatMessage>[line('one', minutesAgo: 5), line('two')],
        everyLineTimed: true,
      );

      expect(merged?.map((m) => m.text), <String>['one', 'two']);
    });

    // The hub no longer echoes to the sender, so a line sent while offline
    // exists only on this handset. A backfill that overwrote the scrollback
    // would take it off the sender's screen while every other boat saw it.
    test('never drops a message this handset is holding', () {
      final current = <ChatMessage>[line('sent while offline', isMine: true)];
      final merged = ChatService.mergeHistory(
        current,
        <ChatMessage>[line('said earlier', minutesAgo: 30)],
        everyLineTimed: true,
      );

      expect(merged, isNull);
      expect(current.single.text, 'sent while offline');
    });

    test('adds only what was said while we were away', () {
      final merged = ChatService.mergeHistory(
        <ChatMessage>[line('mine', isMine: true, minutesAgo: 10)],
        <ChatMessage>[
          line('older', minutesAgo: 30),
          line('missed', minutesAgo: 2),
        ],
        everyLineTimed: true,
      );

      expect(merged?.map((m) => m.text), <String>['mine', 'missed']);
    });

    // Clock skew between the buoy and the phone must never be able to bring
    // our own line back as a second copy.
    test('never re-adopts our own line, however the clocks disagree', () {
      final merged = ChatService.mergeHistory(
        <ChatMessage>[line('help me', isMine: true, minutesAgo: 10)],
        <ChatMessage>[line('help me', isMine: true)],
        everyLineTimed: true,
      );

      expect(merged, isNull);
    });

    // Without a time there is no way to tell a missed line from one already
    // on screen, and showing it twice is worse than not backfilling.
    test('ignores an untimed backlog when there is scrollback to protect', () {
      final merged = ChatService.mergeHistory(
        <ChatMessage>[line('mine', isMine: true, minutesAgo: 10)],
        <ChatMessage>[line('no clock on the buoy')],
        everyLineTimed: false,
      );

      expect(merged, isNull);
    });
  });

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

  group('ChatService cloud relay', () {
    test('posts to the canonical Railway relay URL and marks 201 as stored',
        () async {
      String? requestedUrl;
      final service = ChatService(
        displayName: 'Maria Gracia',
        client: MockClient((request) async {
          requestedUrl = request.url.toString();
          return http.Response('{}', 201);
        }),
      );

      await service.sendMessage('heading back, engine trouble');
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(
        requestedUrl,
        '${AqOneConfig.backendBaseUrl}/api/mesh/chat',
      );
      expect(service.messages.single.cloudStored, isTrue);
    });

    test('a failed cloud relay preserves the queued/local message rather than dropping it',
        () async {
      final service = ChatService(
        displayName: 'Maria Gracia',
        client: MockClient((request) async => http.Response('', 500)),
      );

      await service.sendMessage('help, taking on water');
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(service.messages, hasLength(1));
      expect(service.messages.single.text, 'help, taking on water');
      expect(service.messages.single.cloudStored, isFalse);
    });

    test('while not connected to the hub, a sent line is queued locally, not claimed handed off',
        () async {
      final service = ChatService(
        displayName: 'Maria Gracia',
        client: MockClient((request) async => http.Response('{}', 201)),
      );

      await service.sendMessage('anyone nearby?');

      expect(service.messages.single.hubState, ChatHubState.queuedLocally);
      expect(service.pendingCount, 1);
    });

    test('over-limit text is rejected outright, never sent or truncated', () async {
      bool relayCalled = false;
      final service = ChatService(
        displayName: 'Maria Gracia',
        client: MockClient((request) async {
          relayCalled = true;
          return http.Response('{}', 201);
        }),
      );
      final overLimit = 'x' * (ChatService.maxMessageLength + 1);

      await service.sendMessage(overLimit);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(service.messages, isEmpty);
      expect(service.pendingCount, 0);
      expect(relayCalled, isFalse);
      expect(service.lastError, isNotNull);
    });
  });
}
