let conversationModulePromise;
let activeConversation;
let eventSequence = 0;
const eventBuffer = [];

async function loadConversationModule() {
  if (!conversationModulePromise) {
    conversationModulePromise = import(
      'https://esm.sh/@elevenlabs/client@0.6.0'
    );
  }
  return conversationModulePromise;
}

function emitSallyVoiceEvent(detail) {
  const event = {
    id: `sally-voice-${Date.now()}-${++eventSequence}`,
    createdAt: new Date().toISOString(),
    ...detail,
  };
  eventBuffer.push(event);
  while (eventBuffer.length > 200) {
    eventBuffer.shift();
  }
  window.dispatchEvent(new CustomEvent('sally-voice-event', { detail: event }));
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function normalizeMessage(message) {
  if (typeof message === 'string') {
    return { role: 'sally', text: message };
  }

  const role = firstText(
    message?.role,
    message?.source,
    message?.speaker,
    message?.author
  ).toLowerCase();
  const text = firstText(
    message?.message,
    message?.text,
    message?.transcript,
    message?.content,
    message?.delta
  );

  return {
    role:
      role.includes('user') || role.includes('customer')
        ? 'user'
        : role.includes('agent') || role.includes('ai')
          ? 'sally'
          : role || 'sally',
    text: text || JSON.stringify(message),
  };
}

function parseDynamicVariables(dynamicVariablesJson) {
  try {
    const parsed =
      typeof dynamicVariablesJson === 'string'
        ? JSON.parse(dynamicVariablesJson)
        : dynamicVariablesJson;
    return Object.fromEntries(
      Object.entries(parsed || {}).filter(([, value]) =>
        ['string', 'number', 'boolean'].includes(typeof value)
      )
    );
  } catch {
    return {};
  }
}

window.sallyVoiceBridge = {
  async start(conversationToken, dynamicVariablesJson = '{}') {
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
    const dynamicVariables = parseDynamicVariables(dynamicVariablesJson);

    activeConversation = await Conversation.startSession({
      conversationToken,
      connectionType: 'webrtc',
      userId: dynamicVariables.user_id || undefined,
      dynamicVariables,
      onConnect: () => emitSallyVoiceEvent({ type: 'connect' }),
      onDisconnect: () => emitSallyVoiceEvent({ type: 'disconnect' }),
      onError: (error) =>
        emitSallyVoiceEvent({
          type: 'error',
          message: error?.message || String(error),
        }),
      onMessage: (message) => {
        const normalized = normalizeMessage(message);
        emitSallyVoiceEvent({
          type: 'transcript',
          role: normalized.role,
          text: normalized.text,
        });
      },
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

  drainEventsJson() {
    return JSON.stringify(eventBuffer.splice(0));
  },
};
