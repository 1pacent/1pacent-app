import 'package:flutter_test/flutter_test.dart';
import 'package:onepacent_app/models/ops_summary.dart';

void main() {
  test('parses wrapped ops console summary with recent work', () {
    final summary = OpsSummary.fromJson({
      'ops_console': {
        'generated_at': '2026-06-01T08:00:00Z',
        'tenant_id': 'TENANT-001',
        'pipeline': {
          'leads_total': 4,
          'jobs_total': '2',
          'quotes_total': 3,
          'invoices_total': 1,
        },
        'payments': {'open_amount': 250.5},
        'scheduling': {},
        'quotes': {},
        'recent_work': {
          'leads': [
            {
              'id': 'LEAD-1',
              'status': 'new',
              'trade_type': 'Plumbing',
              'urgency': 'high',
              'address': '1 Test St',
              'preferred_time': 'Tomorrow',
              'updated_at': '2026-06-01T08:05:00Z',
            }
          ],
          'jobs': [
            {
              'id': 'JOB-1',
              'lead_id': 'LEAD-1',
              'quote_id': 'QUOTE-1',
              'status': 'scheduled',
              'scheduled_window': '2026-06-02 10:00-12:00',
            }
          ],
          'payments': [
            {
              'id': 'PAY-1',
              'invoice_id': 'INV-1',
              'job_id': 'JOB-1',
              'status': 'open',
              'amount': '199.95',
              'currency': 'AUD',
            }
          ],
        },
      }
    });

    expect(summary.generatedAt, '2026-06-01T08:00:00Z');
    expect(summary.pipelineCount('leads_total'), 4);
    expect(summary.pipelineCount('jobs_total'), 2);
    expect(summary.paymentMetric('open_amount'), '250.50');
    expect(summary.recentWork.leads.single.tradeType, 'Plumbing');
    expect(summary.recentWork.jobs.single.id, 'JOB-1');
    expect(summary.recentWork.payments.single.amount, 199.95);
  });
}
