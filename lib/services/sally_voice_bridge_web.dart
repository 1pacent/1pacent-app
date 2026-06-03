import 'dart:convert';
import 'dart:js_interop';

import 'sally_voice_event.dart';
import 'sally_voice_session.dart';

@JS('sallyVoiceBridge')
external _SallyVoiceBridgeObject? get _browserBridge;

extension type _SallyVoiceBridgeObject(JSObject _) implements JSObject {
  external JSPromise<JSObject> start(
    JSString conversationToken,
    JSString dynamicVariablesJson,
  );
  external JSPromise<JSObject> end();
  external JSString drainEventsJson();
}

extension type _SallyVoiceResult(JSObject _) implements JSObject {
  external JSString? get status;
  external JSString? get conversationId;
}

class SallyVoiceBridge {
  Future<SallyVoiceSession> start(
    String conversationToken,
    Map<String, Object?> dynamicVariables,
  ) async {
    final bridge = _browserBridge;
    if (bridge == null) {
      throw StateError('Sally voice bridge did not load in the browser.');
    }

    final result = _SallyVoiceResult(await bridge
        .start(conversationToken.toJS, jsonEncode(dynamicVariables).toJS)
        .toDart);

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

  Future<List<SallyVoiceEvent>> drainEvents() async {
    final bridge = _browserBridge;
    if (bridge == null) return const [];

    final decoded = jsonDecode(bridge.drainEventsJson().toDart);
    if (decoded is! List) return const [];

    return decoded
        .whereType<Map<String, dynamic>>()
        .map(SallyVoiceEvent.fromJson)
        .toList(growable: false);
  }
}
