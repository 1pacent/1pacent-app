import 'package:flutter_test/flutter_test.dart';
import 'package:onepacent_app/models/quote.dart';

void main() {
  test('parses n8n rental quote option response fields', () {
    final quote = Quote.fromJson({
      'option_id': 'RQO-2026-000001-1',
      'work_order_id': 'WO-2026-000001',
      'rank': 1,
      'tradie_id': 'TRADIE-001',
      'company_id': 'COMPANY-001',
      'quote_amount': 360,
      'scheduled_start': '2026-06-02T09:00:00+10:00',
      'scheduled_end': '2026-06-02T11:00:00+10:00',
      'trust_score': 92,
      'cost_score': 81,
      'availability_score': 88,
      'total_score': 87.35,
    });

    expect(quote.id, 'RQO-2026-000001-1');
    expect(quote.jobId, 'WO-2026-000001');
    expect(quote.rank, 1);
    expect(quote.amount, 360);
    expect(quote.tradieId, 'TRADIE-001');
    expect(quote.totalScore, 87.35);
    expect(quote.scheduledWindow, contains('2026-06-02T09:00:00+10:00'));
  });
}
