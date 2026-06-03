import 'sally_voice_session.dart';
import 'sally_voice_event.dart';

class SallyVoiceBridge {
  Future<SallyVoiceSession> start(
    String conversationToken,
    Map<String, Object?> dynamicVariables,
  ) {
    throw UnsupportedError(
      'Sally voice is currently available in the web app only.',
    );
  }

  Future<void> end() async {}

  Future<List<SallyVoiceEvent>> drainEvents() async => const [];
}
