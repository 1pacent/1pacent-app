class SallyVoiceEvent {
  const SallyVoiceEvent({
    required this.id,
    required this.type,
    required this.role,
    required this.text,
  });

  final String id;
  final String type;
  final String role;
  final String text;

  factory SallyVoiceEvent.fromJson(Map<String, dynamic> json) {
    return SallyVoiceEvent(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      text: json['text']?.toString() ?? json['message']?.toString() ?? '',
    );
  }
}
