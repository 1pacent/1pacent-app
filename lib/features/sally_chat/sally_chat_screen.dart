import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/app_session.dart';
import '../../models/conversation_message.dart';
import '../../services/elevenlabs_config.dart';
import '../../services/n8n_webhook_service.dart';
import '../../services/sally_voice_bridge.dart';

class SallyChatScreen extends StatefulWidget {
  const SallyChatScreen({super.key});

  @override
  State<SallyChatScreen> createState() => _SallyChatScreenState();
}

class _SallyChatScreenState extends State<SallyChatScreen> {
  final _service = N8nWebhookService();
  final _voiceBridge = createSallyVoiceBridge();
  final _messageController = TextEditingController();
  final _conversationId = 'sally-uat-${DateTime.now().millisecondsSinceEpoch}';

  final List<ConversationMessage> _messages = [
    ConversationMessage(
      id: 'welcome',
      conversationId: 'local',
      sender: 'sally',
      text:
          'Hi, I am Sally. Tell me what happened and I will triage the issue, check warranty, and prepare the right workflow.',
      createdAt: DateTime.now(),
    ),
  ];
  bool _sending = false;
  bool _preparingVoice = false;
  bool _voiceActive = false;
  Timer? _voiceEventPoller;
  String? _voiceConversationId;
  String? _error;

  @override
  void dispose() {
    _voiceEventPoller?.cancel();
    _endVoiceBridge();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _sendMessage([String? preset]) async {
    final text = (preset ?? _messageController.text).trim();
    if (text.isEmpty) return;

    final user = appSession.user;
    final userMessage = ConversationMessage(
      id: 'user-${DateTime.now().microsecondsSinceEpoch}',
      conversationId: _conversationId,
      sender: 'user',
      text: text,
      createdAt: DateTime.now(),
    );

    setState(() {
      _messages.add(userMessage);
      _messageController.clear();
      _sending = true;
      _error = null;
    });

    try {
      final response = await _service.sendSallyMessage({
        'source': 'customer_app',
        'conversation_id': _conversationId,
        'message': text,
        'user': {
          'id': user?.id,
          'name': user?.name,
          'email': user?.email,
          'persona': user?.personaLabel,
          'property_id': user?.propertyId,
          'property_scenario': user?.propertyScenario,
        },
        'expected_actions': const [
          'triage_issue',
          'check_warranty_with_wally',
          'capture_requester_availability',
          'prepare_quote_matching',
        ],
      });
      if (!mounted) return;

      final reply = response['reply']?.toString() ??
          response['message']?.toString() ??
          response['next_action']?.toString() ??
          'I have passed that to the workflow and will update the job path next.';
      setState(() {
        _messages.add(ConversationMessage(
          id: 'sally-${DateTime.now().microsecondsSinceEpoch}',
          conversationId: _conversationId,
          sender: 'sally',
          text: reply,
          createdAt: DateTime.now(),
        ));
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _messages.add(ConversationMessage(
          id: 'fallback-${DateTime.now().microsecondsSinceEpoch}',
          conversationId: _conversationId,
          sender: 'sally',
          text:
              'I could not reach my workflow just now. You can still use guided intake to create the job.',
          createdAt: DateTime.now(),
        ));
      });
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _toggleVoiceSession() async {
    if (_voiceActive) {
      await _stopVoiceSession();
      return;
    }

    await _startVoiceSession();
  }

  Future<void> _startVoiceSession() async {
    final user = appSession.user;
    setState(() {
      _preparingVoice = true;
      _error = null;
    });

    try {
      final response = await _service.fetchSallyConversationToken({
        'source': 'customer_app',
        'conversation_id': _conversationId,
        'agent_id': ElevenLabsConfig.sallyAgentId,
        'participant_name': user?.name ?? '1pacent customer',
        'user': {
          'id': user?.id,
          'name': user?.name,
          'email': user?.email,
          'persona': user?.personaLabel,
          'property_id': user?.propertyId,
          'property_scenario': user?.propertyScenario,
        },
      });
      if (!mounted) return;

      final success = response['success'] == true;
      final token = response['token']?.toString() ??
          response['conversation_token']?.toString() ??
          '';
      if (!success || token.isEmpty) {
        final message = response['message']?.toString() ??
            'Sally voice token was not returned by the bridge.';
        setState(() {
          _messages.add(ConversationMessage(
            id: 'voice-${DateTime.now().microsecondsSinceEpoch}',
            conversationId: _conversationId,
            sender: 'sally',
            text: message,
            createdAt: DateTime.now(),
          ));
        });
        return;
      }

      final voiceSession = await _voiceBridge.start(token, {
        'source': 'customer_app',
        'app_conversation_id': _conversationId,
        'user_id': user?.id ?? '',
        'user_name': user?.name ?? '',
        'user_email': user?.email ?? '',
        'persona': user?.personaLabel ?? '',
        'property_id': user?.propertyId ?? '',
        'property_scenario': user?.propertyScenario ?? '',
      });
      _startVoiceEventPolling();

      setState(() {
        _voiceActive = true;
        _voiceConversationId = voiceSession.conversationId;
        _messages.add(ConversationMessage(
          id: 'voice-${DateTime.now().microsecondsSinceEpoch}',
          conversationId: _conversationId,
          sender: 'sally',
          text:
              'Sally voice is live. You can speak now, and I will use the same intake tools for price, availability, warranty and booking.',
          createdAt: DateTime.now(),
        ));
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _messages.add(ConversationMessage(
          id: 'voice-error-${DateTime.now().microsecondsSinceEpoch}',
          conversationId: _conversationId,
          sender: 'sally',
          text:
              'I could not prepare the voice session yet. Please check the n8n ElevenLabs token bridge and API key.',
          createdAt: DateTime.now(),
        ));
      });
    } finally {
      if (mounted) setState(() => _preparingVoice = false);
    }
  }

  Future<void> _stopVoiceSession() async {
    setState(() {
      _preparingVoice = true;
      _error = null;
    });

    try {
      _voiceEventPoller?.cancel();
      await _drainVoiceEvents();
      await _endVoiceBridge();
      if (!mounted) return;
      setState(() {
        _voiceActive = false;
        _voiceConversationId = null;
        _messages.add(ConversationMessage(
          id: 'voice-stop-${DateTime.now().microsecondsSinceEpoch}',
          conversationId: _conversationId,
          sender: 'sally',
          text: 'Sally voice has ended.',
          createdAt: DateTime.now(),
        ));
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _preparingVoice = false);
    }
  }

  Future<void> _endVoiceBridge() async {
    try {
      await _voiceBridge.end();
    } catch (_) {
      // Best effort only. Navigation/dispose should not block on the browser SDK.
    }
  }

  void _startVoiceEventPolling() {
    _voiceEventPoller?.cancel();
    _voiceEventPoller = Timer.periodic(
      const Duration(milliseconds: 500),
      (_) => _drainVoiceEvents(),
    );
  }

  Future<void> _drainVoiceEvents() async {
    final events = await _voiceBridge.drainEvents();
    if (!mounted || events.isEmpty) return;

    final transcriptEvents = events.where(
      (event) => event.type == 'transcript' && event.text.trim().isNotEmpty,
    );
    if (transcriptEvents.isEmpty) return;

    setState(() {
      for (final event in transcriptEvents) {
        final sender = event.role == 'user' ? 'user' : 'sally';
        _messages.add(ConversationMessage(
          id: event.id.isEmpty
              ? 'voice-event-${DateTime.now().microsecondsSinceEpoch}'
              : event.id,
          conversationId: _conversationId,
          sender: sender,
          text: event.text,
          createdAt: DateTime.now(),
        ));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = appSession.user;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sally'),
        actions: [
          IconButton(
            tooltip: 'Start guided intake',
            icon: const Icon(Icons.add_home_work_outlined),
            onPressed: () => context.go('/start-job'),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            _SallyHeader(user: user),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _messages.length + (_error == null ? 0 : 1),
                itemBuilder: (context, index) {
                  if (_error != null && index == _messages.length) {
                    return _InlineError(error: _error!);
                  }
                  return _MessageBubble(message: _messages[index]);
                },
              ),
            ),
            _PresetBar(onSelected: _sendMessage),
            _Composer(
              controller: _messageController,
              sending: _sending,
              onSend: _sendMessage,
              preparingVoice: _preparingVoice,
              voiceActive: _voiceActive,
              voiceConversationId: _voiceConversationId,
              onVoice: _toggleVoiceSession,
            ),
          ],
        ),
      ),
    );
  }
}

class _SallyHeader extends StatelessWidget {
  const _SallyHeader({required this.user});

  final AppUser? user;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      color: Theme.of(context).colorScheme.primaryContainer,
      child: Row(
        children: [
          const CircleAvatar(child: Icon(Icons.support_agent_outlined)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Maintenance triage',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 2),
                Text(
                  '${user?.personaLabel ?? 'Customer'} path. Voice agent: ${ElevenLabsConfig.sallyAgentId}',
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final ConversationMessage message;

  @override
  Widget build(BuildContext context) {
    final isUser = message.sender == 'user';
    final colorScheme = Theme.of(context).colorScheme;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 420),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isUser
              ? colorScheme.primary
              : colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          message.text,
          style: TextStyle(color: isUser ? colorScheme.onPrimary : null),
        ),
      ),
    );
  }
}

class _PresetBar extends StatelessWidget {
  const _PresetBar({required this.onSelected});

  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    const presets = [
      'The power is flickering after a previous repair.',
      'I have a leaking tap and I am available Monday morning.',
      'Can you check warranty before new quotes?',
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        children: [
          for (final preset in presets) ...[
            ActionChip(
              label: Text(preset),
              onPressed: () => onSelected(preset),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
    required this.preparingVoice,
    required this.voiceActive,
    required this.voiceConversationId,
    required this.onVoice,
  });

  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;
  final bool preparingVoice;
  final bool voiceActive;
  final String? voiceConversationId;
  final VoidCallback onVoice;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 8,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
        child: Row(
          children: [
            IconButton(
              tooltip: voiceActive ? 'End Sally voice' : 'Start Sally voice',
              onPressed: preparingVoice ? null : onVoice,
              icon: preparingVoice
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(voiceActive
                      ? Icons.call_end_outlined
                      : Icons.mic_none_outlined),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (voiceActive) ...[
                    Text(
                      'Voice live${voiceConversationId == null || voiceConversationId!.isEmpty ? '' : ' - $voiceConversationId'}',
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                            color: Theme.of(context).colorScheme.primary,
                          ),
                    ),
                    const SizedBox(height: 4),
                  ],
                  TextField(
                    controller: controller,
                    minLines: 1,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText: 'Message Sally',
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => sending ? null : onSend(),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: 'Send',
              onPressed: sending ? null : onSend,
              icon: sending
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_outlined),
            ),
          ],
        ),
      ),
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.error});

  final String error;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Theme.of(context).colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Text(error),
      ),
    );
  }
}
