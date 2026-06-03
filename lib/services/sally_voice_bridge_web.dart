import 'dart:js_interop';

import 'sally_voice_session.dart';

@JS('sallyVoiceBridge')
external _SallyVoiceBridgeObject? get _browserBridge;

extension type _SallyVoiceBridgeObject(JSObject _) implements JSObject {
  external JSPromise<JSObject> start(JSString conversationToken);
  external JSPromise<JSObject> end();
}

extension type _SallyVoiceResult(JSObject _) implements JSObject {
  external JSString? get status;
  external JSString? get conversationId;
}

class SallyVoiceBridge {
  Future<SallyVoiceSession> start(String conversationToken) async {
    final bridge = _browserBridge;
    if (bridge == null) {
      throw StateError('Sally voice bridge did not load in the browser.');
    }

    final result =
        _SallyVoiceResult(await bridge.start(conversationToken.toJS).toDart);

    return SallyVoiceSession(
      status: result.status?.toDart ?? '',
      conversationId: result.conversationId?.toDart ?? '',
    );
  }

  Future<void> end() async {
    final bridge = _browserBridge;
    if (bridge == null) return;

    await bridge.end().toDart;
  }
}
