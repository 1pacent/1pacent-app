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

/// Returns the ordered list of statuses for the job timeline.
List<JobStatus> get jobStatusTimeline => [
      JobStatus.requested,
      JobStatus.quotePending,
      JobStatus.quoteApproved,
      JobStatus.tradieOnTheWay,
      JobStatus.completed,
      JobStatus.invoiced,
    ];

/// Returns a human-readable label for a job status.
String jobStatusLabel(JobStatus status) {
  switch (status) {
    case JobStatus.requested:
      return 'Requested';
    case JobStatus.quotePending:
      return 'Matched';
    case JobStatus.quoteApproved:
      return 'Quote approved';
    case JobStatus.scheduled:
      return 'Scheduled';
    case JobStatus.tradieOnTheWay:
      return 'On the way';
    case JobStatus.inProgress:
      return 'In progress';
    case JobStatus.completed:
      return 'Completed';
    case JobStatus.invoiced:
      return 'Invoice sent';
    case JobStatus.paid:
      return 'Paid';
  }
}

/// Parses a job status from an API response string.
JobStatus parseJobStatus(String? value) {
  switch (value) {
    case 'requested':
      return JobStatus.requested;
    case 'quote_pending':
    case 'matched':
      return JobStatus.quotePending;
    case 'quote_approved':
      return JobStatus.quoteApproved;
    case 'scheduled':
      return JobStatus.scheduled;
    case 'tradie_on_the_way':
    case 'on_the_way':
      return JobStatus.tradieOnTheWay;
    case 'in_progress':
      return JobStatus.inProgress;
    case 'completed':
      return JobStatus.completed;
    case 'invoiced':
    case 'invoice_sent':
      return JobStatus.invoiced;
    case 'paid':
      return JobStatus.paid;
    default:
      return JobStatus.requested;
  }
}

class Job {
  const Job({
    required this.id,
    required this.description,
    required this.tradeType,
    required this.status,
    this.propertyAddress,
    this.scheduledWindow,
    this.warrantyFlag,
    this.warrantyMessage,
    this.landlordApprovalStatus,
  });

  final String id;
  final String description;
  final String tradeType;
  final JobStatus status;
  final String? propertyAddress;
  final String? scheduledWindow;
  final bool? warrantyFlag;
  final String? warrantyMessage;
  final String? landlordApprovalStatus;

  factory Job.fromJson(Map<String, dynamic> json) {
    return Job(
      id: json['id']?.toString() ?? json['job_id']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      tradeType: json['trade_type']?.toString() ?? '',
      status: parseJobStatus(json['status']?.toString()),
      propertyAddress: json['property_address']?.toString(),
      scheduledWindow: json['scheduled_window']?.toString(),
      warrantyFlag: json['warranty_flag'] as bool?,
      warrantyMessage: json['warranty_message']?.toString(),
      landlordApprovalStatus: json['landlord_approval_status']?.toString(),
    );
  }

  /// Returns the index of the current status in the timeline.
  int get timelineIndex => jobStatusTimeline.indexOf(status);
}
