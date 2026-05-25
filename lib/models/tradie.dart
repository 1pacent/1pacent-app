class Tradie {
  const Tradie({
    required this.id,
    required this.displayName,
    required this.tradeTypes,
    this.trustScore,
    this.licenceNumber,
    this.insuranceProvider,
    this.insuranceExpiry,
    this.completedJobs,
    this.averageRating,
    this.evidenceQualityScore,
    this.tenantFeedbackScore,
    this.warrantyTerms,
  });

  final String id;
  final String displayName;
  final List<String> tradeTypes;
  final double? trustScore;
  final String? licenceNumber;
  final String? insuranceProvider;
  final String? insuranceExpiry;
  final int? completedJobs;
  final double? averageRating;
  final double? evidenceQualityScore;
  final double? tenantFeedbackScore;
  final String? warrantyTerms;

  factory Tradie.fromJson(Map<String, dynamic> json) {
    return Tradie(
      id: json['id']?.toString() ?? json['tradie_id']?.toString() ?? '',
      displayName: json['display_name']?.toString() ??
          json['name']?.toString() ??
          '',
      tradeTypes: (json['trade_types'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      trustScore: (json['trust_score'] as num?)?.toDouble(),
      licenceNumber: json['licence_number']?.toString(),
      insuranceProvider: json['insurance_provider']?.toString(),
      insuranceExpiry: json['insurance_expiry']?.toString(),
      completedJobs: (json['completed_jobs'] as num?)?.toInt(),
      averageRating: (json['average_rating'] as num?)?.toDouble(),
      evidenceQualityScore:
          (json['evidence_quality_score'] as num?)?.toDouble(),
      tenantFeedbackScore:
          (json['tenant_feedback_score'] as num?)?.toDouble(),
      warrantyTerms: json['warranty_terms']?.toString(),
    );
  }
}
