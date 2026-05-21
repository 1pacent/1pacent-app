class ConversationMessage {
  const ConversationMessage({
    required this.id,
    required this.conversationId,
    required this.sender,
    required this.text,
    required this.createdAt,
  });

  final String id;
  final String conversationId;
  final String sender;
  final String text;
  final DateTime createdAt;
}
