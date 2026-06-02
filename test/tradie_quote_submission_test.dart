import 'package:flutter_test/flutter_test.dart';
import 'package:onepacent_app/models/tradie_quote_submission.dart';

void main() {
  test('builds n8n rental quote-options payload from tradie quote', () {
    const submission = TradieQuoteSubmission(
      workOrderId: 'WO-2026-000001',
      tradieId: 'TRADIE-DEMO-001',
      companyId: 'COMPANY-DEMO-001',
      tradieName: 'Demo Electrician',
      scheduledStart: '2026-06-02T09:00:00',
      scheduledEnd: '2026-06-02T11:00:00',
      lineItems: [
        TradieQuoteLineItem(description: 'Labour', quantity: 2, rate: 120),
        TradieQuoteLineItem(description: 'Parts', quantity: 1, rate: 80),
      ],
      assumptions: 'Access via front door',
    );

    final json = submission.toJson();
    final options = json['tradie_options'] as List<dynamic>;
    final option = options.single as Map<String, dynamic>;

    expect(json['work_order_id'], 'WO-2026-000001');
    expect(option['tradie_id'], 'TRADIE-DEMO-001');
    expect(option['amount'], 320);
    expect(option['source'], 'tradie_app_quote_submission');
    expect(option['line_items'], hasLength(2));
    expect(option['assumptions'], 'Access via front door');
  });
}
