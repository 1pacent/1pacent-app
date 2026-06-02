class Quote {
  const Quote({
    required this.id,
    required this.jobId,
    required this.amount,
    required this.status,
    this.rank,
    this.tradieId,
    this.companyId,
    this.tradieName,
    this.scheduledStart,
    this.scheduledEnd,
    this.trustScore,
    this.costScore,
    this.availabilityScore,
    this.totalScore,
    this.assumptions = const [],
  });

  final String id;
  final String jobId;
  final double amount;
  final String status;
  final int? rank;
  final String? tradieId;
  final String? companyId;
  final String? tradieName;
  final String? scheduledStart;
  final String? scheduledEnd;
  final double? trustScore;
  final double? costScore;
  final double? availabilityScore;
  final double? totalScore;
  final List<String> assumptions;

  factory Quote.fromJson(Map<String, dynamic> json) {
    return Quote(
      id: json['option_id']?.toString() ??
          json['id']?.toString() ??
          json['quote_option_id']?.toString() ??
          json['quote_id']?.toString() ??
          '',
      jobId: json['work_order_id']?.toString() ??
          json['job_id']?.toString() ??
          json['lead_id']?.toString() ??
          '',
      amount: _number(json['quote_amount'] ?? json['amount']),
      status: json['status']?.toString() ?? 'proposed',
      rank: (json['rank'] as num?)?.toInt() ??
          (json['option_rank'] as num?)?.toInt(),
      tradieId: json['tradie_id']?.toString(),
      companyId: json['company_id']?.toString(),
      tradieName: json['tradie_name']?.toString() ??
          json['provider_name']?.toString() ??
          json['company_name']?.toString(),
      scheduledStart: json['scheduled_start']?.toString(),
      scheduledEnd: json['scheduled_end']?.toString(),
      trustScore: _nullableNumber(json['trust_score']),
      costScore: _nullableNumber(json['cost_score']),
      availabilityScore: _nullableNumber(json['availability_score']),
      totalScore: _nullableNumber(json['total_score']),
      assumptions: _stringList(json['assumptions']),
    );
  }

  String get displayName {
    if (tradieName != null && tradieName!.trim().isNotEmpty) {
      return tradieName!;
    }
    if (tradieId != null && tradieId!.trim().isNotEmpty) {
      return tradieId!;
    }
    return 'Tradie option';
  }

  String get scheduledWindow {
    if (scheduledStart == null && scheduledEnd == null) {
      return '';
    }
    if (scheduledEnd == null || scheduledEnd!.isEmpty) {
      return scheduledStart ?? '';
    }
    return '${scheduledStart ?? ''} - $scheduledEnd';
  }

  static double _number(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  static double? _nullableNumber(Object? value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }

  static List<String> _stringList(Object? value) {
    if (value is List) {
      return value.map((item) => item.toString()).toList();
    }
    if (value is String && value.trim().isNotEmpty) return [value.trim()];
    return const [];
  }
}
