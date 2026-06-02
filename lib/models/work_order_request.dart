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
    required this.requesterAvailability,
    required this.consentToContact,
    required this.consentToStore,
    this.propertyScenario = 'rental',
    this.requesterRole = 'tenant',
    this.approvalRecipientRole = 'landlord',
    this.source = 'customer_app',
    this.estimatedAmount,
    this.agencyId,
    this.propertyManagerId,
    this.landlordId,
    this.tenantId,
    this.propertyId,
  });

  final String source;
  final String propertyScenario;
  final String requesterRole;
  final String approvalRecipientRole;
  final String customerName;
  final String phone;
  final String email;
  final String address;
  final String suburb;
  final String tradeType;
  final String jobType;
  final String description;
  final String urgency;
  final List<String> requesterAvailability;
  final bool consentToContact;
  final bool consentToStore;
  final double? estimatedAmount;
  final String? agencyId;
  final String? propertyManagerId;
  final String? landlordId;
  final String? tenantId;
  final String? propertyId;

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
      'property_scenario': propertyScenario,
      'requester_role': requesterRole,
      'approval_recipient_role': approvalRecipientRole,
      if (_hasValue(agencyId)) 'agency_id': agencyId,
      if (_hasValue(propertyManagerId))
        'property_manager_id': propertyManagerId,
      if (_hasValue(landlordId)) 'landlord_id': landlordId,
      if (_hasValue(tenantId)) 'tenant_id': tenantId,
      if (_hasValue(propertyId)) 'property_id': propertyId,
      'requester_availability': requesterAvailability,
      if (propertyScenario == 'rental')
        'tenant_availability': requesterAvailability,
      if (propertyScenario == 'owner_occupied')
        'owner_availability': requesterAvailability,
      'warranty_check_required': true,
      'quote_matching_requires_availability_overlap': true,
      'consent_to_contact': consentToContact,
      'consent_to_store': consentToStore,
      if (estimatedAmount != null) 'estimated_amount': estimatedAmount,
    };
  }

  bool _hasValue(String? value) => value != null && value.trim().isNotEmpty;
}
