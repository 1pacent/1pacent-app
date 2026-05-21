enum JobStatus {
  requested,
  quotePending,
  quoteApproved,
  scheduled,
  tradieOnTheWay,
  inProgress,
  completed,
  invoiced,
  paid,
}

class Job {
  const Job({
    required this.id,
    required this.description,
    required this.tradeType,
    required this.status,
    this.propertyAddress,
    this.scheduledWindow,
  });

  final String id;
  final String description;
  final String tradeType;
  final JobStatus status;
  final String? propertyAddress;
  final String? scheduledWindow;

  factory Job.fromJson(Map<String, dynamic> json) {
    return Job(
      id: json['id']?.toString() ?? json['job_id']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      tradeType: json['trade_type']?.toString() ?? '',
      status: JobStatus.requested,
      propertyAddress: json['property_address']?.toString(),
      scheduledWindow: json['scheduled_window']?.toString(),
    );
  }
}
