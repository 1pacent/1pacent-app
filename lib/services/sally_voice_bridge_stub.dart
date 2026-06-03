import 'sally_voice_session.dart';

class SallyVoiceBridge {
  Future<SallyVoiceSession> start(String conversationToken) {
    throw UnsupportedError(
      'Sally voice is currently available in the web app only.',
    );
  }

  Future<void> end() async {}
}
