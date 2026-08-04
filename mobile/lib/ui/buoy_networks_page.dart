import 'dart:async';

import 'package:flutter/material.dart';

import '../core/tokens.dart';
import '../models/buoy_contact.dart';
import '../services/sos_service.dart';
import '../services/wifi_scanner.dart';

/// Lets the skipper find and join a buoy's SoftAP from inside the app.
///
/// The home page shows a one-line "No buoy connected" card; this page is where
/// the fisherman actually does something about it: scan for the AqOne radio
/// networks, join one (entering the password printed on the buoy hull), and
/// see whether the buoy answers on 10.0.0.1.
class BuoyNetworksPage extends StatefulWidget {
  const BuoyNetworksPage({super.key, required this.service});

  final SosService service;

  @override
  State<BuoyNetworksPage> createState() => _BuoyNetworksPageState();
}

class _BuoyNetworksPageState extends State<BuoyNetworksPage> {
  final WifiScanner _wifi = WifiScanner.instance;

  bool _scanning = false;
  bool _hasScanned = false;
  String? _currentSsid;
  String? _error;
  String? _connectingSsid;
  String? _statusMessage;
  BuoyStatus? _buoy;

  List<WifiAccessPoint> _networks = const [];

  @override
  void initState() {
    super.initState();
    _loadCurrentSsid();
    _scan();
  }

  Future<void> _loadCurrentSsid() async {
    final ssid = await _wifi.currentSsid();
    if (!mounted) {
      return;
    }
    setState(() => _currentSsid = ssid);
  }

  Future<void> _scan() async {
    if (_scanning) {
      return;
    }
    setState(() {
      _scanning = true;
      _error = null;
      _statusMessage = null;
    });
    final result = await _wifi.scan();
    if (!mounted) {
      return;
    }
    setState(() {
      _scanning = false;
      _hasScanned = true;
      _networks = result.isSuccess ? result.networks : const [];
      _error = switch (result.failure) {
        null => null,
        WifiFailure.unsupported =>
          'WiFi scanning is not available on this device.',
        WifiFailure.permissionDenied =>
          'AqOne needs location and "nearby devices" permission to find '
              'buoys. Grant it in phone settings and scan again.',
        WifiFailure.wifiDisabled =>
          'WiFi is off. Turn it on to look for a buoy.',
        WifiFailure.scanFailed =>
          'The scan did not return any networks. Move closer to a buoy and '
              'try again.',
        _ => null,
      };
    });
    await _loadCurrentSsid();
  }

  List<WifiAccessPoint> get _buoys => _networks
      .where((network) => WifiScanner.isBuoySsid(network.ssid))
      .toList();

  List<WifiAccessPoint> get _others => _networks
      .where((network) => !WifiScanner.isBuoySsid(network.ssid))
      .toList();

  Future<void> _connect(WifiAccessPoint network) async {
    if (_connectingSsid != null) {
      return;
    }
    String? password;
    if (network.requiresPassword) {
      password = await _askPassword(network.ssid);
      if (password == null || !mounted) {
        return;
      }
    }

    setState(() {
      _connectingSsid = network.ssid;
      _statusMessage = null;
    });
    final connected = await _wifi.connect(network.ssid, password: password);
    if (!mounted) {
      return;
    }
    if (!connected) {
      setState(() {
        _connectingSsid = null;
        _statusMessage = 'Could not connect to ${network.ssid}. '
            'Check the password and try again.';
      });
      return;
    }

    await Future<void>.delayed(const Duration(milliseconds: 900));
    final buoy = await widget.service.pollBuoy();
    final ssid = await _wifi.currentSsid();
    if (!mounted) {
      return;
    }
    setState(() {
      _connectingSsid = null;
      _currentSsid = ssid ?? network.ssid;
      _buoy = buoy;
      _statusMessage = buoy != null
          ? 'Connected to Buoy ${buoy.buoyId}. '
              '${buoy.mesh.description}.'
          : 'Connected to ${network.ssid}, but the buoy did not answer on '
              '10.0.0.1. It may still be starting up.';
    });
  }

  Future<void> _disconnect() async {
    setState(() => _connectingSsid = '');
    await _wifi.disconnect();
    if (!mounted) {
      return;
    }
    setState(() {
      _connectingSsid = null;
      _currentSsid = null;
      _buoy = null;
      _statusMessage = null;
    });
  }

  Future<String?> _askPassword(String ssid) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Join $ssid'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Text(
              'Enter the WiFi password. It is printed on the buoy hull.',
              style: TextStyle(fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: AqSpace.md),
            TextField(
              controller: controller,
              autofocus: true,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Password',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (value) => Navigator.pop(ctx, value),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Connect'),
          ),
        ],
      ),
    );
  }

  void _openAppSettings() {
    _wifi.openAppSettings();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);

    return Scaffold(
      backgroundColor: palette.canvas,
      appBar: AppBar(
        backgroundColor: palette.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Buoy connection',
          style: TextStyle(
            color: palette.primaryText,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AqSpace.screen,
          AqSpace.lg,
          AqSpace.screen,
          AqSpace.xl,
        ),
        children: <Widget>[
          _StatusHeader(
            currentSsid: _currentSsid,
            buoy: _buoy,
            onDisconnect: _currentSsid == null ? null : _disconnect,
          ),
          const SizedBox(height: AqSpace.base),
          if (_connectingSsid != null)
            _ConnectingCard(ssid: _connectingSsid!)
          else if (_scanning)
            const _ScanningCard()
          else
            _ScanButton(onTap: _scan),
          if (_error != null) ...<Widget>[
            const SizedBox(height: AqSpace.base),
            _ErrorCard(message: _error!, onOpenSettings: _openAppSettings),
          ],
          if (_statusMessage != null) ...<Widget>[
            const SizedBox(height: AqSpace.base),
            _StatusCard(message: _statusMessage!, accent: palette.active),
          ],
          if (_hasScanned && !_scanning) ...<Widget>[
            const SizedBox(height: AqSpace.base),
            _NetworkList(
              buoys: _buoys,
              others: _others,
              connectedSsid: _currentSsid,
              connectingSsid: _connectingSsid,
              onConnect: _connect,
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({
    required this.currentSsid,
    required this.buoy,
    required this.onDisconnect,
  });

  final String? currentSsid;
  final BuoyStatus? buoy;
  final VoidCallback? onDisconnect;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final connected = currentSsid != null;
    final accent = buoy != null ? AqColors.success : AqColors.disabled;

    return Container(
      padding: const EdgeInsets.all(AqSpace.base),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.card),
        border: Border.all(color: palette.border),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(
              connected ? Icons.wifi_rounded : Icons.wifi_off_rounded,
              size: 22,
              color: accent,
            ),
          ),
          const SizedBox(width: AqSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  connected
                      ? (buoy != null
                          ? 'Connected to Buoy ${buoy!.buoyId}'
                          : 'Connected to $currentSsid')
                      : 'No buoy connected',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: palette.primaryText,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  connected
                      ? (buoy != null
                          ? buoy!.mesh.description
                          : 'Joined the network, waiting for the buoy...')
                      : 'Scan below to find an AqOne buoy.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: palette.secondaryText,
                  ),
                ),
              ],
            ),
          ),
          if (connected && onDisconnect != null) ...<Widget>[
            TextButton(
              onPressed: onDisconnect,
              child: const Text('Leave'),
            ),
          ],
        ],
      ),
    );
  }
}

class _ScanButton extends StatelessWidget {
  const _ScanButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: onTap,
        icon: const Icon(Icons.radar_rounded, size: 20),
        label: const Text('Look for buoy'),
        style: ElevatedButton.styleFrom(
          backgroundColor: AqColors.brandPrimary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AqRadius.button),
          ),
        ),
      ),
    );
  }
}

class _ScanningCard extends StatelessWidget {
  const _ScanningCard();

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(AqSpace.base),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.card),
        border: Border.all(color: palette.border),
      ),
      child: const Row(
        children: <Widget>[
          SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: AqSpace.md),
          Expanded(
            child: Text(
              'Looking for buoy...',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectingCard extends StatelessWidget {
  const _ConnectingCard({required this.ssid});

  final String ssid;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(AqSpace.base),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.card),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: <Widget>[
          const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: AqSpace.md),
          Expanded(
            child: Text(
              'Connecting to $ssid...',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: palette.primaryText,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.onOpenSettings});

  final String message;
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(AqSpace.base),
      decoration: BoxDecoration(
        color: AqColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AqRadius.card),
        border: Border.all(color: AqColors.danger.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(Icons.error_outline_rounded,
              size: 20, color: AqColors.danger),
          const SizedBox(width: AqSpace.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  message,
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: palette.primaryText,
                  ),
                ),
                const SizedBox(height: AqSpace.sm),
                TextButton(
                  onPressed: onOpenSettings,
                  child: const Text('Open phone settings'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.message, required this.accent});

  final String message;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    return Container(
      padding: const EdgeInsets.all(AqSpace.base),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AqRadius.card),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(Icons.wifi_rounded, size: 20, color: accent),
          const SizedBox(width: AqSpace.sm),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 13,
                height: 1.4,
                color: palette.primaryText,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NetworkList extends StatelessWidget {
  const _NetworkList({
    required this.buoys,
    required this.others,
    required this.connectedSsid,
    required this.connectingSsid,
    required this.onConnect,
  });

  final List<WifiAccessPoint> buoys;
  final List<WifiAccessPoint> others;
  final String? connectedSsid;
  final String? connectingSsid;
  final ValueChanged<WifiAccessPoint> onConnect;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final noneFound = buoys.isEmpty && others.isEmpty;

    if (noneFound) {
      return Container(
        padding: const EdgeInsets.all(AqSpace.lg),
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: BorderRadius.circular(AqRadius.card),
          border: Border.all(color: palette.border),
        ),
        child: Column(
          children: <Widget>[
            Icon(Icons.wifi_off_rounded, size: 32, color: palette.dimText),
            const SizedBox(height: AqSpace.md),
            Text(
              'No AqOne buoys nearby',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: palette.primaryText,
              ),
            ),
            const SizedBox(height: AqSpace.xs),
            Text(
              'Move closer to a buoy and tap "Look for buoy" again.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 13, height: 1.4, color: palette.secondaryText),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (buoys.isNotEmpty) ...<Widget>[
          Text(
            'AqOne buoys',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: palette.primaryText,
            ),
          ),
          const SizedBox(height: AqSpace.sm),
          for (final network in buoys)
            _NetworkTile(
              network: network,
              connected: connectedSsid != null &&
                  connectedSsid!.toUpperCase() == network.ssid.toUpperCase(),
              connecting: connectingSsid != null &&
                  connectingSsid!.toUpperCase() == network.ssid.toUpperCase(),
              onTap: () => onConnect(network),
            ),
          const SizedBox(height: AqSpace.lg),
        ],
        if (others.isNotEmpty) ...<Widget>[
          Text(
            'Other networks',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: palette.primaryText,
            ),
          ),
          const SizedBox(height: AqSpace.sm),
          for (final network in others)
            _NetworkTile(
              network: network,
              connected: connectedSsid != null &&
                  connectedSsid!.toUpperCase() == network.ssid.toUpperCase(),
              connecting: connectingSsid != null &&
                  connectingSsid!.toUpperCase() == network.ssid.toUpperCase(),
              onTap: () => onConnect(network),
            ),
        ],
      ],
    );
  }
}

class _NetworkTile extends StatelessWidget {
  const _NetworkTile({
    required this.network,
    required this.connected,
    required this.connecting,
    required this.onTap,
  });

  final WifiAccessPoint network;
  final bool connected;
  final bool connecting;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AqPalette.of(context);
    final isBuoy = WifiScanner.isBuoySsid(network.ssid);

    return Padding(
      padding: const EdgeInsets.only(bottom: AqSpace.sm),
      child: Material(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AqRadius.standard),
        child: InkWell(
          onTap: connecting ? null : onTap,
          borderRadius: BorderRadius.circular(AqRadius.standard),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: <Widget>[
                Icon(
                  isBuoy ? Icons.anchor_rounded : Icons.wifi_rounded,
                  size: 20,
                  color: connected ? AqColors.success : palette.secondaryText,
                ),
                const SizedBox(width: AqSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        isBuoy ? _buoyDisplayName(network.ssid) : network.ssid,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: palette.primaryText,
                        ),
                      ),
                      if (isBuoy) ...<Widget>[
                        const SizedBox(height: 2),
                        Text(
                          network.ssid,
                          style: TextStyle(
                            fontSize: 11.5,
                            color: palette.dimText,
                          ),
                        ),
                      ],
                      const SizedBox(height: 2),
                      Text(
                        '${network.signalLabel} · ${network.requiresPassword ? 'secured' : 'open'}',
                        style:
                            TextStyle(fontSize: 11.5, color: palette.dimText),
                      ),
                    ],
                  ),
                ),
                if (connecting)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else if (connected)
                  const Icon(Icons.check_circle_rounded,
                      size: 20, color: AqColors.success)
                else
                  Icon(Icons.chevron_right_rounded,
                      size: 20, color: palette.dimText),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _buoyDisplayName(String ssid) {
    final match =
        RegExp(r'^AQONE-(.+)$', caseSensitive: false).firstMatch(ssid);
    return match != null ? 'Buoy ${match.group(1)}' : ssid;
  }
}
