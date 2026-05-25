class AvailabilitySlot {
  const AvailabilitySlot({
    required this.date,
    required this.period,
  });

  final DateTime date;
  final String period; // 'morning', 'afternoon', 'evening'

  String get label {
    final dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final dayName = dayNames[date.weekday - 1];
    final monthName = monthNames[date.month - 1];
    return '$dayName ${date.day} $monthName • ${period[0].toUpperCase()}${period.substring(1)}';
  }

  Map<String, dynamic> toJson() => {
        'date': date.toIso8601String().split('T').first,
        'period': period,
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AvailabilitySlot &&
          date.year == other.date.year &&
          date.month == other.date.month &&
          date.day == other.date.day &&
          period == other.period;

  @override
  int get hashCode =>
      date.year.hashCode ^ date.month.hashCode ^ date.day.hashCode ^ period.hashCode;
}
