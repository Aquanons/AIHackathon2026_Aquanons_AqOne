import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:network_info_plus/network_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../core/endpoint_guard.dart';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

class ChatMessage {
  ChatMessage({
    required this.text,
    required this.from,
    required this.isMine,
    required this.time,
  });

  final String text;
  final String from;
  final bool isMine;
  final DateTime time;
}

// ---------------------------------------------------------------------------
// Service — WebSocket chat client for the Heltec WiFi-relay hub
//
// The Heltec module runs as a WiFi access point (default SSID "Aquan") and
// exposes a WebSocket server on its OWN port (`ws://<ap_ip>:81`, no path -
// see AqOneConfig.buoyWsUrl and docs/21_WEEK1_CONTRACT_FIXTURES.md). It is a
// separate WebSocketsServer instance from the HTTP server on port 80, so it
// has no `/ws` route - a client that connects to port 80 will never reach
// it. Connected clients are shown on a "client wheel" in the UI. An HTTP
// GET /history endpoint provides backfill on connect. Messages sent while
// offline are queued in SharedPreferences and flushed when the connection is
// restored.
// ---------------------------------------------------------------------------

class ChatService extends ChangeNotifier {
  ChatService({
    this.host = '192.168.4.1',
    this.displayName = 'You',
    this.backendUrl = 'https://aqone-backend.up.railway.app',
  });

  final String host;
  final String displayName;
  final String backendUrl;

  static const int maxMessageLength = 50;
  static const int _maxMessages = 50;
  static const Duration _messageRetention = Duration(hours: 24);

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _reconnectTimer;

  final List<ChatMessage> _messages = [];
  final List<String> _clients = [];
  final List<String> _pendingQueue = [];

  // Texts just put on the wire that the hub will echo back.
  //
  // The Heltec relay broadcasts every 'msg' to ALL clients INCLUDING the
  // sender, while sendMessage already shows the line optimistically. Without
  // this the sender sees everything twice. Registered at send time rather than
  // queue time, so a message that sat offline for an hour still matches.
  final List<MapEntry<String, DateTime>> _awaitingEcho = [];

  bool _connected = false;
  bool _connecting = false;
  bool _disposed = false;
  String? _lastError;

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  List<String> get clients => List.unmodifiable(_clients);
  bool get connected => _connected;
  bool get connecting => _connecting;
  String? get lastError => _lastError;
  int get pendingCount => _pendingQueue.length;

  Uri get _wsUri => EndpointGuard.buoyWs(host);
  Uri get _historyUri => EndpointGuard.buoyHistory(host);

  /// Starts the connection loop and loads persisted messages / queue.
  Future<void> start() async {
    await _loadQueue();
    await _loadMessages();
    _connect();
    _reconnectTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (!_connected && !_connecting && !_disposed) _connect();
    });
  }

  Future<void> _connect() async {
    if (_connecting || _disposed) return;
    _connecting = true;
    _lastError = null;
    _notify();

    try {
      await _subscription?.cancel();
      _subscription = null;

      final channel = WebSocketChannel.connect(_wsUri);
      _channel = channel;

      // Awaiting [ready] surfaces connection errors inside our try/catch
      // instead of letting them escape as unhandled async exceptions
      // (web_socket_channel 3.x reports failures on both the stream and
      // the ready future).
      await channel.ready;

      _subscription = channel.stream.listen(
        _onMessage,
        onError: (Object e) {
          _connected = false;
          _connecting = false;
          _lastError = _describeChatError(e);
          _notify();
        },
        onDone: () {
          _connected = false;
          _connecting = false;
          _notify();
        },
        cancelOnError: true,
      );

      // Announce display name so the wheel updates.
      _safeSend(jsonEncode({'type': 'hello', 'name': displayName}));

      _connected = true;
      _connecting = false;
      _notify();

      await _backfillHistory();
      await _flushQueue();
    } catch (e) {
      _connected = false;
      _connecting = false;
      _lastError = _describeChatError(e);
      _notify();
    }
  }

  // ----- Incoming messages ------------------------------------------------

  void _onMessage(dynamic data) {
    final String raw;
    if (data is String) {
      raw = data;
    } else if (data is List<int>) {
      raw = utf8.decode(data, allowMalformed: true);
    } else {
      raw = data.toString();
    }

    final dynamic json;
    try {
      json = jsonDecode(raw);
    } catch (_) {
      return;
    }

    if (json is! Map<String, dynamic>) return;

    switch (json['type'] as String?) {
      case 'clients':
        _clients
          ..clear()
          ..addAll((json['list'] as List<dynamic>?)
                  ?.map((e) => e.toString()) ??
              []);
        _notify();

      case 'msg':
        final name = json['from'] as String? ?? '?';
        final text = json['text'] as String? ?? '';
        if (text.isEmpty) return;
        // Our own line bouncing off the hub broadcast - already on screen.
        if (name == displayName && _consumeEcho(text)) return;
        _messages.add(ChatMessage(
          text: text,
          from: name,
          isMine: name == displayName,
          time: DateTime.now(),
        ));
        _trimMessages();
        _notify();

      case 'history':
        final list = json['messages'] as List<dynamic>?;
        if (list == null) break;
        _messages.clear();
        for (final entry in list) {
          if (entry is! Map<String, dynamic>) continue;
          _messages.add(ChatMessage(
            text: entry['text'] as String? ?? '',
            from: entry['from'] as String? ?? '?',
            isMine: (entry['from'] as String?) == displayName,
            time: DateTime.tryParse(entry['time'] as String? ?? '') ??
                DateTime.now(),
          ));
        }
        _trimMessages();
        _persistMessages();
        _notify();
    }
  }

  void _expectEcho(String text) {
    _awaitingEcho.add(MapEntry(text, DateTime.now()));
    // Bounded: a hub that never echoes must not grow this without limit.
    if (_awaitingEcho.length > 50) _awaitingEcho.removeAt(0);
  }

  /// True if [text] is our own message coming back, which the caller drops.
  bool _consumeEcho(String text) {
    final now = DateTime.now();
    _awaitingEcho.removeWhere(
        (e) => now.difference(e.value) > const Duration(minutes: 2));
    final i = _awaitingEcho.indexWhere((e) => e.key == text);
    if (i == -1) return false;
    _awaitingEcho.removeAt(i);
    return true;
  }

  void _trimMessages() {
    final retained = retainRecentMessages(_messages);
    _messages
      ..clear()
      ..addAll(retained);
  }

  static List<ChatMessage> retainRecentMessages(
    Iterable<ChatMessage> messages, {
    DateTime? now,
  }) {
    final DateTime cutoff =
        (now ?? DateTime.now()).subtract(_messageRetention);
    final List<ChatMessage> retained = messages
        .where((ChatMessage message) => !message.time.isBefore(cutoff))
        .toList(growable: true);
    if (retained.length > _maxMessages) {
      retained.removeRange(0, retained.length - _maxMessages);
    }
    return retained;
  }

  /// Fire-and-forget POST to the backend mesh chat endpoint.
  /// Errors are silently ignored — the local Heltec relay is the primary path.
  void _relayToBackend(String sender, String text) {
    // .then<void> before .catchError is deliberate: catchError must return the
    // future's own type, so attaching it straight to a Future<Response> throws
    // at runtime on the exact failure this is meant to swallow.
    http
        .post(
          Uri.parse('$backendUrl/api/mesh/chat'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode({'sender': sender, 'text': text}),
        )
        .timeout(const Duration(seconds: 5))
        .then<void>((_) {})
        .catchError((Object _) {});
  }

  // ----- Outgoing messages ------------------------------------------------

  Future<void> sendMessage(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;

    final msg = ChatMessage(
      text: trimmed,
      from: displayName,
      isMine: true,
      time: DateTime.now(),
    );
    _messages.add(msg);
    _trimMessages();
    _persistMessages();
    _notify();

    if (_connected) {
      _expectEcho(trimmed);
      _safeSend(jsonEncode({
        'type': 'msg',
        'from': displayName,
        'text': trimmed,
      }));
    } else {
      _pendingQueue.add(trimmed);
      _persistQueue();
    }

    // Also relay to the cloud backend so the dashboard can display it.
    _relayToBackend(displayName, trimmed);
  }

  // ----- History backfill -------------------------------------------------

  Future<void> _backfillHistory() async {
    try {
      final res = await http
          .get(_historyUri)
          .timeout(const Duration(seconds: 4));
      if (res.statusCode != 200) return;
      final dynamic json = jsonDecode(res.body);
      if (json is! Map<String, dynamic>) return;
      final list = json['messages'] as List<dynamic>?;
      if (list == null) return;
      _messages.clear();
      for (final entry in list) {
        if (entry is! Map<String, dynamic>) continue;
        _messages.add(ChatMessage(
          text: entry['text'] as String? ?? '',
          from: entry['from'] as String? ?? '?',
          isMine: (entry['from'] as String?) == displayName,
          time: DateTime.tryParse(entry['time'] as String? ?? '') ??
              DateTime.now(),
        ));
      }
      _trimMessages();
      _persistMessages();
      _notify();
    } catch (_) {
      // Hub offline — not an error on mobile.
    }
  }

  // ----- Offline queue (SharedPreferences) --------------------------------

  Future<void> _flushQueue() async {
    if (_pendingQueue.isEmpty || !_connected) return;
    final batch = List<String>.from(_pendingQueue);
    _pendingQueue.clear();
    for (final text in batch) {
      _expectEcho(text);
      _safeSend(jsonEncode({
        'type': 'msg',
        'from': displayName,
        'text': text,
      }));
      // Small delay so the Heltec relay can keep up.
      await Future<void>.delayed(const Duration(milliseconds: 80));
    }
    _persistQueue();
  }

  Future<void> _loadQueue() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _pendingQueue
        ..clear()
        ..addAll(prefs.getStringList('chat_pending_queue') ?? []);
    } catch (_) {}
  }

  Future<void> _persistQueue() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList('chat_pending_queue', _pendingQueue);
    } catch (_) {}
  }

  Future<void> _loadMessages() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('chat_cached_messages');
      if (raw == null) return;
      final list = jsonDecode(raw) as List<dynamic>;
      _messages.clear();
      for (final entry in list) {
        if (entry is! Map<String, dynamic>) continue;
        _messages.add(ChatMessage(
          text: entry['text'] as String? ?? '',
          from: entry['from'] as String? ?? '?',
          isMine: (entry['from'] as String?) == displayName,
          time: DateTime.tryParse(entry['time'] as String? ?? '') ??
              DateTime.now(),
        ));
      }
      _trimMessages();
      _notify();
    } catch (_) {}
  }

  Future<void> _persistMessages() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final data = _messages
          .map((m) => {
                'text': m.text,
                'from': m.from,
                'time': m.time.toIso8601String(),
              })
          .toList();
      await prefs.setString('chat_cached_messages', jsonEncode(data));
    } catch (_) {}
  }

  // ----- Helpers ----------------------------------------------------------

  void _safeSend(String data) {
    try {
      _channel?.sink.add(data);
    } catch (_) {}
  }

  /// Turns a raw WebSocket/HTTP exception into text a fisher standing near
  /// the buoy can read. [lastError] is not shown anywhere in the UI yet, but
  /// it is public API on a service other screens may reasonably read from
  /// later, so it should never carry Dart's own exception text.
  static String _describeChatError(Object error) {
    final text = error.toString();
    if (text.contains('TimeoutException')) {
      return 'no reply from the chat hub';
    }
    if (text.contains('SocketException') ||
        text.contains('Connection refused') ||
        text.contains('Failed host lookup')) {
      return 'not connected to the Aquan WiFi hub';
    }
    if (text.contains('WebSocketChannelException') ||
        text.contains('WebSocketException')) {
      return 'chat connection dropped';
    }
    return 'could not connect to the chat hub';
  }

  /// Guards every `notifyListeners()` call in this class.
  ///
  /// Most call sites here run after an `await` (WebSocket connect, HTTP
  /// backfill, SharedPreferences I/O) or inside a stream callback - both can
  /// resume/fire after [dispose] has already run, e.g. when the fisherman
  /// backs out of chat while a connection attempt is still in flight.
  /// `ChangeNotifier.notifyListeners()` throws once disposed, so every call
  /// goes through this check instead of calling it directly.
  void _notify() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    super.dispose();
  }
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

/// First letter of [name], upper-cased. That letter is the entire avatar:
/// there are no profile pictures to fetch once this runs over LoRa.
String initialOf(String name) {
  final trimmed = name.trim();
  return trimmed.isEmpty ? '?' : trimmed[0].toUpperCase();
}

/// A stable colour per participant - the same name always lands on the same
/// hue, so a neighbour is recognisable before you read the letter. Matters
/// once LoRa makes the roster longer than a couple of boats, and two of them
/// share an initial.
Color avatarColorOf(String name) {
  const palette = <Color>[
    Color(0xFF38BDF8),
    Color(0xFF34D399),
    Color(0xFFF59E0B),
    Color(0xFFF472B6),
    Color(0xFFA78BFA),
    Color(0xFF22D3EE),
  ];
  var hash = 0;
  for (final unit in name.trim().codeUnits) {
    hash = (hash * 31 + unit) & 0x7FFFFFFF;
  }
  return palette[hash % palette.length];
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

class Chathubb extends StatefulWidget {
  const Chathubb({super.key, this.displayName = 'You'});

  /// Who this handset appears as to the rest of the mesh. Venture passes the
  /// skipper or boat name so the wheel shows something a neighbour recognises
  /// rather than "You" on every phone.
  final String displayName;

  @override
  State<Chathubb> createState() => _ChathubbState();
}

class _ChathubbState extends State<Chathubb> {
  // Built in initState, not as a field initialiser: the name comes from
  // `widget`, which is not available while fields are being initialised.
  late final ChatService _service;
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scroll = ScrollController();
  bool _onAquan = false;

  @override
  void initState() {
    super.initState();
    _service = ChatService(displayName: widget.displayName);
    _service.start();
    _checkWifi();
    // Poll WiFi status every 5 s.
    Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) _checkWifi();
    });
  }

  @override
  void dispose() {
    _service.dispose();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _checkWifi() async {
    // A live socket is the only proof that matters: if chat is connected we
    // are on the hub's network, whatever the platform says the SSID is.
    // getWifiName() cannot be the primary signal - it needs location
    // permission (and location switched ON) from Android 10, returns the SSID
    // wrapped in quotes on some builds, and is unsupported on web.
    if (_service.connected) {
      if (mounted && !_onAquan) setState(() => _onAquan = true);
      return;
    }

    bool onAq = false;
    try {
      final info = NetworkInfo();
      final name = await info.getWifiName();
      onAq = name?.contains('Aquan') == true;
    } catch (_) {}

    // Fallback: if the hub is reachable over HTTP we consider WiFi OK.
    if (!onAq) {
      try {
        final res = await http
            .get(EndpointGuard.buoyHistory(_service.host))
            .timeout(const Duration(seconds: 2));
        onAq = res.statusCode == 200;
      } catch (_) {}
    }

    if (mounted) setState(() => _onAquan = onAq);
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _controller.clear();
    await _service.sendMessage(text);
    await Future<void>.delayed(const Duration(milliseconds: 100));
    if (_scroll.hasClients) {
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    }
  }

  // ---- Build -------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return ListenableBuilder(
      listenable: _service,
      builder: (context, _) {
        return Scaffold(
          backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
          appBar: AppBar(
            backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
            elevation: 0,
            leading: IconButton(
              icon: Icon(Icons.arrow_back_rounded,
                  color: isDark ? Colors.white : Colors.black87),
              onPressed: () => Navigator.of(context).pop(),
            ),
            titleSpacing: 0,
            title: _buildHeaderTitle(isDark),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Tooltip(
                  message: _service.connected
                      ? 'Connected to Aquan'
                      : (_onAquan ? 'On Aquan - connecting…' : 'Not on Aquan'),
                  child: Icon(
                    Icons.wifi,
                    color: (_service.connected || _onAquan)
                        ? const Color(0xFF16A34A)
                        : const Color(0xFF94A3B8),
                    size: 22,
                  ),
                ),
              ),
            ],
          ),
          body: Column(
            children: [
              // Clients wheel
              _buildClientWheel(isDark),
              // Messages
              Expanded(child: _buildMessageList(isDark)),
              // Input
              _buildInputBar(isDark),
            ],
          ),
        );
      },
    );
  }

  // ---- Header ------------------------------------------------------------

  /// Everyone on the hub roster except this handset.
  List<String> get _peers => _service.clients
      .where((String name) => name != _service.displayName)
      .toList(growable: false);

  /// Who you are talking to. One peer shows their name; a fuller roster shows
  /// the first two and a count, the way a group thread does, so the title
  /// never overflows the app bar on a phone.
  String get _headerName {
    final peers = _peers;
    if (peers.isEmpty) return 'Chat';
    if (peers.length == 1) return peers.first;
    if (peers.length == 2) return '${peers[0]}, ${peers[1]}';
    return '${peers[0]}, ${peers[1]} +${peers.length - 2}';
  }

  Widget _buildHeaderTitle(bool isDark) {
    final peers = _peers;
    final String status;
    if (!_service.connected) {
      status = _onAquan ? 'Connecting…' : 'Offline';
    } else if (peers.isEmpty) {
      status = 'Waiting for others…';
    } else if (peers.length == 1) {
      status = 'On the mesh';
    } else {
      status = '${peers.length} on the mesh';
    }

    return Row(
      children: [
        if (peers.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: CircleAvatar(
              radius: 18,
              backgroundColor: avatarColorOf(peers.first),
              child: Text(
                initialOf(peers.first),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ),
          ),
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _headerName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: isDark ? Colors.white : Colors.black87,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
              Text(
                status,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: _service.connected
                      ? const Color(0xFF16A34A)
                      : (isDark ? Colors.white54 : Colors.black45),
                  fontWeight: FontWeight.w500,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ---- Client wheel ------------------------------------------------------

  Widget _buildClientWheel(bool isDark) {
    // The hub's roster already contains this handset under its own name -
    // it is added when we send 'hello'. Prepending a literal "You" gave the
    // local user two bubbles: one "You" and one under their real name.
    final users = _service.clients;
    return Container(
      height: 92,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: users.isEmpty
          ? Center(
              child: Text(
                'Waiting for others to join…',
                style: TextStyle(
                  color: isDark ? Colors.white54 : Colors.black38,
                  fontSize: 13,
                ),
              ),
            )
          : ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: users.length,
              separatorBuilder: (context, index) =>
                  const SizedBox(width: 16),
              itemBuilder: (context, index) {
                final name = users[index];
                final isSelf = name == _service.displayName;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: isSelf
                          ? const Color(0xFF0F69C9)
                          : avatarColorOf(name),
                      child: Text(
                        initialOf(name),
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      name,
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? Colors.white70 : Colors.black54,
                      ),
                    ),
                  ],
                );
              },
            ),
    );
  }

  // ---- Messages ----------------------------------------------------------

  Widget _buildMessageList(bool isDark) {
    if (_service.messages.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.waves_rounded,
              size: 48,
              color: isDark ? Colors.white24 : Colors.black12,
            ),
            const SizedBox(height: 12),
            Text(
              'AqOne',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: isDark ? Colors.white38 : Colors.black26,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'No messages yet. Say hi!',
              style: TextStyle(
                fontSize: 13,
                color: isDark ? Colors.white38 : Colors.black26,
              ),
            ),
          ],
        ),
      );
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      itemCount: _service.messages.length,
      itemBuilder: (context, index) {
        final msg = _service.messages[index];
        return _buildBubble(msg, isDark);
      },
    );
  }

  Widget _buildBubble(ChatMessage msg, bool isDark) {
    final isMine = msg.isMine;
    final bg = isMine
        ? const Color(0xFF0F69C9)
        : (isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9));
    final fg = isMine
        ? Colors.white
        : (isDark ? Colors.white : Colors.black87);
    final align = isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start;
    final radius = BorderRadius.only(
      topLeft: const Radius.circular(16),
      topRight: const Radius.circular(16),
      bottomLeft: Radius.circular(isMine ? 16 : 4),
      bottomRight: Radius.circular(isMine ? 4 : 16),
    );

    final initial = initialOf(msg.from);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment:
            isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isMine)
            Padding(
              padding: const EdgeInsets.only(right: 8, top: 4),
              child: CircleAvatar(
                radius: 14,
                backgroundColor: avatarColorOf(msg.from),
                child: Text(
                  initial,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          Flexible(
            child: Column(
              crossAxisAlignment: align,
              children: [
                if (!isMine)
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 2),
                    child: Text(
                      msg.from,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white54 : Colors.black45,
                      ),
                    ),
                  ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: radius,
                  ),
                  child: Text(
                    msg.text,
                    style: TextStyle(color: fg, fontSize: 15, height: 1.3),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.only(
                    top: 2,
                    left: isMine ? 0 : 4,
                    right: isMine ? 4 : 0,
                  ),
                  child: Text(
                    '${msg.time.hour.toString().padLeft(2, '0')}:${msg.time.minute.toString().padLeft(2, '0')}',
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark ? Colors.white30 : Colors.black26,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (isMine) const SizedBox(width: 8),
        ],
      ),
    );
  }

  // ---- Input bar ---------------------------------------------------------

  Widget _buildInputBar(bool isDark) {
    return Container(
      padding: EdgeInsets.only(
        left: 12,
        right: 8,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Container(
              constraints: const BoxConstraints(maxHeight: 100),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(24),
              ),
              child: TextField(
                controller: _controller,
                textCapitalization: TextCapitalization.sentences,
                maxLines: null,
                maxLength: ChatService.maxMessageLength,
                style: TextStyle(
                  color: isDark ? Colors.white : Colors.black87,
                  fontSize: 15,
                ),
                decoration: InputDecoration(
                  counterText: '',
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 18, vertical: 10),
                  hintText: 'Type a message…',
                  hintStyle: TextStyle(
                    color: isDark ? Colors.white38 : Colors.black26,
                  ),
                ),
                onSubmitted: (_) => _send(),
              ),
            ),
          ),
          const SizedBox(width: 6),
          IconButton(
            onPressed: _send,
            icon: const Icon(Icons.send_rounded),
            color: const Color(0xFF0F69C9),
            splashRadius: 24,
          ),
        ],
      ),
    );
  }
}
