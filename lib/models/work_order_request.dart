class WorkOrderRequest {
  const WorkOrderRequest({
    required this.customerName,
    required this.phone,
    required this.email,
    required this.address,
    required this.suburb,
    required this.tradeType,
    required this.jobType,
    required this.description,
    required this.urgency,
    required this.tenantAvailability,
    required this.consentToContact,
    required this.consentToStore,
    this.source = 'customer_app',
    this.estimatedAmount,
  });

  final String source;
  final String customerName;
  final String phone;
  final String email;
  final String address;
  final String suburb;
  final String tradeType;
  final String jobType;
  final String description;
  final String urgency;
  final List<String> tenantAvailability;
  final bool consentToContact;
  final bool consentToStore;
  final double? estimatedAmount;

  Map<String, dynamic> toJson() {
    return {
      'source': source,
      'customer': {
        'name': customerName,
        'phone': phone,
        'email': email,
      },
      'property': {
        'address': address,
        'suburb': suburb,
      },
      'trade_type': tradeType,
      'job_type': jobType,
      'description': description,
      'urgency': urgency,
      'tenant_availability': tenantAvailability,
      'consent_to_contact': consentToContact,
      'consent_to_store': consentToStore,
      if (estimatedAmount != null) 'estimated_amount': estimatedAmount,
    };
  }
}
