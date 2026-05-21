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
      tenantAvailability: ['Monday morning', 'Thursday 2:00 pm to 4:00 pm'],
      consentToContact: true,
      consentToStore: true,
    );

    final json = request.toJson();

    expect(json['source'], 'customer_app');
    expect(json['trade_type'], 'electrical');
    expect(json['job_type'], 'power_point_install');
    expect(json['tenant_availability'], hasLength(2));
    expect(json['customer'], containsPair('email', 'aussiemacs@gmail.com'));
    expect(json['property'], containsPair('suburb', 'Richmond'));
  });
}
