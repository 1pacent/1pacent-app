import 'package:flutter_test/flutter_test.dart';
import 'package:onepacent_app/models/work_order_request.dart';

void main() {
  test('builds rental work order intake payload', () {
    const request = WorkOrderRequest(
      customerName: 'Mark',
      phone: '0400 000 000',
      email: 'aussiemacs@gmail.com',
      address: '1 Beach Street',
      suburb: 'Richmond',
      tradeType: 'electrical',
      jobType: 'power_point_install',
      description: 'Install two power points',
      urgency: 'normal',
      requesterAvailability: ['Monday morning', 'Thursday 2:00 pm to 4:00 pm'],
      consentToContact: true,
      consentToStore: true,
      agencyId: 'AGENCY-UAT-001',
      propertyManagerId: 'PM-UAT-001',
      landlordId: 'LL-UAT-001',
      tenantId: 'TEN-UAT-001',
      propertyId: 'PROP-UAT-001',
    );

    final json = request.toJson();

    expect(json['source'], 'customer_app');
    expect(json['trade_type'], 'electrical');
    expect(json['job_type'], 'power_point_install');
    expect(json['property_scenario'], 'rental');
    expect(json['requester_role'], 'tenant');
    expect(json['approval_recipient_role'], 'landlord');
    expect(json['warranty_check_required'], isTrue);
    expect(json['quote_matching_requires_availability_overlap'], isTrue);
    expect(json['tenant_availability'], hasLength(2));
    expect(json['requester_availability'], hasLength(2));
    expect(json['agency_id'], 'AGENCY-UAT-001');
    expect(json['property_manager_id'], 'PM-UAT-001');
    expect(json['landlord_id'], 'LL-UAT-001');
    expect(json['tenant_id'], 'TEN-UAT-001');
    expect(json['property_id'], 'PROP-UAT-001');
    expect(json['customer'], containsPair('email', 'aussiemacs@gmail.com'));
    expect(json['property'], containsPair('suburb', 'Richmond'));
  });

  test('builds owner occupied intake payload with owner availability', () {
    const request = WorkOrderRequest(
      customerName: 'Owner',
      phone: '0400 000 000',
      email: 'owner@example.com',
      address: '2 Home Street',
      suburb: 'Richmond',
      tradeType: 'plumbing',
      jobType: 'leak_repair',
      description: 'Fix leaking tap',
      urgency: 'normal',
      propertyScenario: 'owner_occupied',
      requesterRole: 'owner',
      approvalRecipientRole: 'owner',
      requesterAvailability: ['Friday morning'],
      consentToContact: true,
      consentToStore: true,
    );

    final json = request.toJson();

    expect(json['property_scenario'], 'owner_occupied');
    expect(json['requester_role'], 'owner');
    expect(json['approval_recipient_role'], 'owner');
    expect(json['owner_availability'], ['Friday morning']);
    expect(json.containsKey('tenant_availability'), isFalse);
  });
}
