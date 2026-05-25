import 'package:intl/intl.dart';

enum NotificationType {
  jobUpdate,
  quoteReceived,
  approvalNeeded,
  paymentReminder,
  general,
}

class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.timestamp,
    this.isRead = false,
    this.route,
  });

  final String id;
  final String title;
  final String body;
  final NotificationType type;
  final DateTime timestamp;
  final bool isRead;
  final String? route;

  String get timeAgo {
    final now = DateTime.now();
    final diff = now.difference(timestamp);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('d MMM').format(timestamp);
  }

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    return NotificationItem(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      type: _parseType(json['type']?.toString()),
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'].toString()) ?? DateTime.now()
          : DateTime.now(),
      isRead: json['is_read'] as bool? ?? false,
      route: json['route']?.toString(),
    );
  }

  static NotificationType _parseType(String? value) {
    switch (value) {
      case 'job_update':
        return NotificationType.jobUpdate;
      case 'quote_received':
        return NotificationType.quoteReceived;
      case 'approval_needed':
        return NotificationType.approvalNeeded;
      case 'payment_reminder':
        return NotificationType.paymentReminder;
      default:
        return NotificationType.general;
    }
  }
}
