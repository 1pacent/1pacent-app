let conversationModulePromise;
let activeConversation;

async function loadConversationModule() {
  if (!conversationModulePromise) {
    conversationModulePromise = import(
      'https://esm.sh/@elevenlabs/client@0.6.0'
    );
  }
  return conversationModulePromise;
}

function emitSallyVoiceEvent(detail) {
  window.dispatchEvent(new CustomEvent('sally-voice-event', { detail }));
}

window.sallyVoiceBridge = {
  async start(conversationToken) {
    if (!conversationToken) {
      throw new Error('Missing ElevenLabs conversation token.');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not available in this browser.');
    }

    if (activeConversation) {
      await activeConversation.endSession();
      activeConversation = undefined;
    }

    const permissionProbe = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    permissionProbe.getTracks().forEach((track) => track.stop());

    const { Conversation } = await loadConversationModule();

    activeConversation = await Conversation.startSession({
      conversationToken,
      connectionType: 'webrtc',
      onConnect: () => emitSallyVoiceEvent({ type: 'connect' }),
      onDisconnect: () => emitSallyVoiceEvent({ type: 'disconnect' }),
      onError: (error) =>
        emitSallyVoiceEvent({
          type: 'error',
          message: error?.message || String(error),
        }),
      onMessage: (message) =>
        emitSallyVoiceEvent({
          type: 'message',
          message,
        }),
      onStatusChange: (status) =>
        emitSallyVoiceEvent({
          type: 'status',
          status,
        }),
      onModeChange: (mode) =>
        emitSallyVoiceEvent({
          type: 'mode',
          mode,
        }),
    });

    return {
      status: 'connected',
      conversationId:
        typeof activeConversation.getId === 'function'
          ? activeConversation.getId()
          : '',
    };
  },

  async end() {
    if (!activeConversation) {
      return { status: 'disconnected' };
    }

    await activeConversation.endSession();
    activeConversation = undefined;
    emitSallyVoiceEvent({ type: 'disconnect' });
    return { status: 'disconnected' };
  },
};
