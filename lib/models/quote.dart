class Quote {
  const Quote({
    required this.id,
    required this.jobId,
    required this.tradieId,
    required this.tradieName,
    required this.amount,
    required this.status,
    required this.availability,
    this.assumptions = const [],
    this.trustScore,
  });

  final String id;
  final String jobId;
  final String tradieId;
  final String tradieName;
  final double amount;
  final String status;
  final String availability;
  final List<String> assumptions;
  final double? trustScore;

  factory Quote.fromJson(Map<String, dynamic> json) {
    return Quote(
      id: json['id']?.toString() ?? json['quote_id']?.toString() ?? '',
      jobId: json['job_id']?.toString() ?? '',
      tradieId: json['tradie_id']?.toString() ?? '',
      tradieName: json['tradie_name']?.toString() ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      status: json['status']?.toString() ?? 'pending',
      availability: json['availability']?.toString() ?? '',
      assumptions: (json['assumptions'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      trustScore: (json['trust_score'] as num?)?.toDouble(),
    );
  }
}
