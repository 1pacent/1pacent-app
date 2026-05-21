class Quote {
  const Quote({
    required this.id,
    required this.jobId,
    required this.amount,
    required this.status,
    this.assumptions = const [],
  });

  final String id;
  final String jobId;
  final double amount;
  final String status;
  final List<String> assumptions;
}
