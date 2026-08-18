import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:network_info_plus/network_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

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
// exposes a WebSocket server at ws://<ap_ip>/ws.  Connected clients are
// shown on a "client wheel" in the UI.  An HTTP GET /history endpoint
// provides backfill on connect.  Messages sent while offline are queued
// in SharedPreferences and flushed when the connection is restored.
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

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _reconnectTimer;

  final List<ChatMessage> _messages = [];
  final List<String> _clients = [];
  final List<String> _pendingQueue = [];

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

  String get _wsUrl => 'ws://$host/ws';
  String get _historyUrl => 'http://$host/history';

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
    notifyListeners();

    try {
      await _subscription?.cancel();
      _subscription = null;

      final channel = WebSocketChannel.connect(Uri.parse(_wsUrl));
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
          _lastError = e.toString();
          notifyListeners();
        },
        onDone: () {
          _connected = false;
          _connecting = false;
          notifyListeners();
        },
        cancelOnError: true,
      );

      // Announce display name so the wheel updates.
      _safeSend(jsonEncode({'type': 'hello', 'name': displayName}));

      _connected = true;
      _connecting = false;
      notifyListeners();

      await _backfillHistory();
      await _flushQueue();
    } catch (e) {
      _connected = false;
      _connecting = false;
      _lastError = e.toString();
      notifyListeners();
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
        notifyListeners();

      case 'msg':
        final name = json['from'] as String? ?? '?';
        final text = json['text'] as String? ?? '';
        if (text.isEmpty) return;
        _messages.add(ChatMessage(
          text: text,
          from: name,
          isMine: name == displayName || name == 'You',
          time: DateTime.now(),
        ));
        _trimMessages();
        notifyListeners();

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
        notifyListeners();
    }
  }

  void _trimMessages() {
    while (_messages.length > _maxMessages) {
      _messages.removeAt(0);
    }
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
    notifyListeners();

    if (_connected) {
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

  /// Fire-and-forget POST to the backend mesh chat endpoint.
  /// Errors are silently ignored — the local Heltec relay is the primary path.
  void _relayToBackend(String sender, String text) {
    http.post(
      Uri.parse('$backendUrl/api/mesh/chat'),
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({'sender': sender, 'text': text}),
    ).timeout(const Duration(seconds: 5)).catchError((_) {});
  }

  // ----- History backfill -------------------------------------------------

  Future<void> _backfillHistory() async {
    try {
      final res = await http
          .get(Uri.parse(_historyUrl))
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
      notifyListeners();
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
      notifyListeners();
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
  final ChatService _service = ChatService();
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scroll = ScrollController();
  bool _onAquan = false;

  @override
  void initState() {
    super.initState();
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
            .get(Uri.parse('http://192.168.4.1/history'))
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
            title: Text(
              'Chat (istoryahanai)',
              style: TextStyle(
                color: isDark ? Colors.white : Colors.black87,
                fontWeight: FontWeight.w700,
              ),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Tooltip(
                  message: _onAquan ? 'Connected to Aquan' : 'Not on Aquan',
                  child: Icon(
                    Icons.wifi,
                    color: _onAquan
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
              if (_service.clients.isNotEmpty) _buildClientWheel(isDark),
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

  // ---- Client wheel ------------------------------------------------------

  Widget _buildClientWheel(bool isDark) {
    final users = ['You', ..._service.clients];
    return Container(
      height: 92,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: users.length == 1
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
                final isSelf = name == _service.displayName || name == 'You';
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: isSelf
                          ? const Color(0xFF0F69C9)
                          : const Color(0xFF38BDF8),
                      child: Text(
                        name.isNotEmpty ? name[0].toUpperCase() : '?',
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

    final initial =
        msg.from.isNotEmpty ? msg.from[0].toUpperCase() : '?';

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
                backgroundColor: const Color(0xFF38BDF8),
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
