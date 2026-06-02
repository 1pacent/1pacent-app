import 'package:flutter_test/flutter_test.dart';
import 'package:onepacent_app/models/job.dart';

void main() {
  test('parses n8n customer job status response fields', () {
    final job = Job.fromJson({
      'work_order_id': 'WO-2026-000001',
      'status_key': 'quote_pending',
      'description': 'Install two power points',
      'trade_type': 'electrical',
      'address': '1 Beach Street',
      'approval_status': 'pending_landlord',
      'next_action': 'wait_for_quote_options',
      'warranty_flag': true,
      'warranty_message': 'Repeat issue review required',
    });

    expect(job.id, 'WO-2026-000001');
    expect(job.status, JobStatus.quotePending);
    expect(job.timelineIndex, 1);
    expect(job.propertyAddress, '1 Beach Street');
    expect(job.landlordApprovalStatus, 'pending_landlord');
    expect(job.warrantyFlag, isTrue);
    expect(job.warrantyMessage, 'Repeat issue review required');
  });
}
