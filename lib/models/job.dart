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

List<JobStatus> get jobStatusTimeline => [
      JobStatus.requested,
      JobStatus.quotePending,
      JobStatus.quoteApproved,
      JobStatus.tradieOnTheWay,
      JobStatus.completed,
      JobStatus.invoiced,
    ];

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

JobStatus parseJobStatus(String? value) {
  switch (value) {
    case 'requested':
    case 'triaged':
    case 'lead_captured':
      return JobStatus.requested;
    case 'quote_pending':
    case 'matched':
    case 'quote_options_ready':
      return JobStatus.quotePending;
    case 'quote_approved':
    case 'approved':
      return JobStatus.quoteApproved;
    case 'scheduled':
      return JobStatus.scheduled;
    case 'tradie_on_the_way':
    case 'on_the_way':
      return JobStatus.tradieOnTheWay;
    case 'in_progress':
    case 'started':
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
    this.nextAction,
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
  final String? nextAction;

  factory Job.fromJson(Map<String, dynamic> json) {
    return Job(
      id: json['id']?.toString() ??
          json['job_id']?.toString() ??
          json['work_order_id']?.toString() ??
          json['reference']?.toString() ??
          '',
      description: json['description']?.toString() ??
          json['job_description']?.toString() ??
          json['summary']?.toString() ??
          'Maintenance request',
      tradeType: json['trade_type']?.toString() ?? '',
      status: parseJobStatus(json['status_key']?.toString() ??
          json['status']?.toString() ??
          json['work_order_status']?.toString()),
      propertyAddress:
          json['property_address']?.toString() ?? json['address']?.toString(),
      scheduledWindow: json['scheduled_window']?.toString() ??
          json['scheduled_at']?.toString(),
      warrantyFlag: json['warranty_flag'] as bool? ??
          json['repeat_issue_flag'] as bool? ??
          json['safety_flag'] as bool?,
      warrantyMessage: json['warranty_message']?.toString() ??
          json['guardrail_message']?.toString(),
      landlordApprovalStatus: json['landlord_approval_status']?.toString() ??
          json['approval_status']?.toString(),
      nextAction: json['next_action']?.toString(),
    );
  }

  int get timelineIndex => jobStatusTimeline.indexOf(status);
}
