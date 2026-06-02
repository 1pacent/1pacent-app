class OpsSummary {
  const OpsSummary({
    required this.generatedAt,
    required this.tenantId,
    required this.pipeline,
    required this.payments,
    required this.scheduling,
    required this.quotes,
    required this.recentWork,
  });

  final String generatedAt;
  final String tenantId;
  final Map<String, dynamic> pipeline;
  final Map<String, dynamic> payments;
  final Map<String, dynamic> scheduling;
  final Map<String, dynamic> quotes;
  final OpsRecentWork recentWork;

  factory OpsSummary.fromJson(Map<String, dynamic> json) {
    final source = json['ops_console'] is Map<String, dynamic>
        ? json['ops_console'] as Map<String, dynamic>
        : json;

    return OpsSummary(
      generatedAt: source['generated_at']?.toString() ?? '',
      tenantId: source['tenant_id']?.toString() ?? '',
      pipeline: _map(source['pipeline']),
      payments: _map(source['payments']),
      scheduling: _map(source['scheduling']),
      quotes: _map(source['quotes']),
      recentWork: OpsRecentWork.fromJson(_map(source['recent_work'])),
    );
  }

  int pipelineCount(String key) => _int(pipeline[key]);

  String paymentMetric(String key) => _display(payments[key]);

  static Map<String, dynamic> _map(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((key, value) => MapEntry(key.toString(), value));
    }
    return const {};
  }

  static int _int(Object? value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  static String _display(Object? value) {
    if (value == null) return '-';
    if (value is num) {
      final asDouble = value.toDouble();
      if (asDouble == asDouble.roundToDouble()) {
        return asDouble.toInt().toString();
      }
      return asDouble.toStringAsFixed(2);
    }
    final text = value.toString();
    return text.isEmpty ? '-' : text;
  }
}

class OpsRecentWork {
  const OpsRecentWork({
    required this.leads,
    required this.jobs,
    required this.payments,
  });

  final List<OpsLead> leads;
  final List<OpsJob> jobs;
  final List<OpsPayment> payments;

  factory OpsRecentWork.fromJson(Map<String, dynamic> json) {
    return OpsRecentWork(
      leads: _list(json['leads']).map(OpsLead.fromJson).toList(),
      jobs: _list(json['jobs']).map(OpsJob.fromJson).toList(),
      payments: _list(json['payments']).map(OpsPayment.fromJson).toList(),
    );
  }

  static List<Map<String, dynamic>> _list(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map(
            (item) => item.map((key, value) => MapEntry(key.toString(), value)))
        .toList();
  }
}

class OpsLead {
  const OpsLead({
    required this.id,
    required this.status,
    required this.tradeType,
    required this.urgency,
    required this.address,
    required this.preferredTime,
    required this.updatedAt,
  });

  final String id;
  final String status;
  final String tradeType;
  final String urgency;
  final String address;
  final String preferredTime;
  final String updatedAt;

  factory OpsLead.fromJson(Map<String, dynamic> json) {
    return OpsLead(
      id: _text(json['id']),
      status: _text(json['status']),
      tradeType: _text(json['trade_type']),
      urgency: _text(json['urgency']),
      address: _text(json['address']),
      preferredTime: _text(json['preferred_time']),
      updatedAt: _text(json['updated_at'] ?? json['created_at']),
    );
  }
}

class OpsJob {
  const OpsJob({
    required this.id,
    required this.leadId,
    required this.quoteId,
    required this.status,
    required this.scheduledWindow,
    required this.updatedAt,
  });

  final String id;
  final String leadId;
  final String quoteId;
  final String status;
  final String scheduledWindow;
  final String updatedAt;

  factory OpsJob.fromJson(Map<String, dynamic> json) {
    return OpsJob(
      id: _text(json['id'] ?? json['job_id'] ?? json['work_order_id']),
      leadId: _text(json['lead_id']),
      quoteId: _text(json['quote_id']),
      status: _text(json['status']),
      scheduledWindow: _text(json['scheduled_window']),
      updatedAt: _text(json['updated_at'] ?? json['completed_at']),
    );
  }
}

class OpsPayment {
  const OpsPayment({
    required this.id,
    required this.invoiceId,
    required this.jobId,
    required this.status,
    required this.amount,
    required this.currency,
    required this.dueAt,
    required this.updatedAt,
  });

  final String id;
  final String invoiceId;
  final String jobId;
  final String status;
  final double amount;
  final String currency;
  final String dueAt;
  final String updatedAt;

  factory OpsPayment.fromJson(Map<String, dynamic> json) {
    return OpsPayment(
      id: _text(json['id']),
      invoiceId: _text(json['invoice_id']),
      jobId: _text(json['job_id']),
      status: _text(json['status']),
      amount: _double(json['amount']),
      currency: _text(json['currency'], 'AUD'),
      dueAt: _text(json['due_at']),
      updatedAt: _text(json['updated_at'] ?? json['paid_at']),
    );
  }
}

String _text(Object? value, [String fallback = '']) {
  final text = value?.toString().trim() ?? '';
  return text.isEmpty ? fallback : text;
}

double _double(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}
