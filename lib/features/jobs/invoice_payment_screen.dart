import 'package:flutter/material.dart';

import '../../services/n8n_webhook_service.dart';

/// Displays invoice details and payment status for a job.
class InvoicePaymentScreen extends StatefulWidget {
  const InvoicePaymentScreen({
    required this.jobId,
    super.key,
  });

  final String jobId;

  @override
  State<InvoicePaymentScreen> createState() => _InvoicePaymentScreenState();
}

class _InvoicePaymentScreenState extends State<InvoicePaymentScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<Map<String, dynamic>> _future;
  bool _isPaying = false;

  @override
  void initState() {
    super.initState();
    _future = _fetchInvoice();
  }

  Future<Map<String, dynamic>> _fetchInvoice() async {
    final response = await _service.fetchJobStatus({'work_order_id': widget.jobId});
    // Build invoice data from job status response.
    // In production this would come from a dedicated invoice endpoint.
    final jobData = response['job'] as Map<String, dynamic>? ?? response;
    final quoteData = response['quote'] as Map<String, dynamic>? ?? {};
    final invoiceData = response['invoice'] as Map<String, dynamic>? ?? {};

    final amount = (quoteData['amount'] as num?)?.toDouble() ??
        (jobData['amount'] as num?)?.toDouble() ??
        0.0;
    final paymentStatus = invoiceData['payment_status']?.toString() ??
        jobData['payment_status']?.toString() ??
        'pending';
    final invoiceNumber = invoiceData['invoice_number']?.toString() ??
        'INV-${widget.jobId.replaceAll('-', '').substring(0, 8).toUpperCase()}';
    final issueDate = invoiceData['issue_date']?.toString() ??
        jobData['completed_date']?.toString() ??
        '';
    final dueDate = invoiceData['due_date']?.toString() ?? '';

    return {
      'invoice_number': invoiceNumber,
      'issue_date': issueDate,
      'due_date': dueDate,
      'amount': amount,
      'payment_status': paymentStatus,
      'line_items': (invoiceData['line_items'] as List<dynamic>?) ??
          _buildDefaultLineItems(amount),
      'payment_history': (invoiceData['payment_history'] as List<dynamic>?) ??
          _buildDefaultPaymentHistory(paymentStatus),
    };
  }

  List<Map<String, dynamic>> _buildDefaultLineItems(double amount) {
    return [
      {
        'item': 'Labour',
        'qty': 1,
        'rate': amount * 0.6,
        'amount': amount * 0.6,
      },
      {
        'item': 'Materials',
        'qty': 1,
        'rate': amount * 0.4,
        'amount': amount * 0.4,
      },
    ];
  }

  List<Map<String, dynamic>> _buildDefaultPaymentHistory(String status) {
    if (status == 'paid') {
      return [
        {
          'date': 'Payment received',
          'amount': 'Invoice total',
          'method': 'Online payment',
          'status': 'completed',
        },
      ];
    }
    return [];
  }

  Future<void> _refresh() async {
    setState(() {
      _future = _fetchInvoice();
    });
  }

  Future<void> _initiatePayment(BuildContext context, Map<String, dynamic> invoice) async {
    setState(() => _isPaying = true);
    try {
      final amount = (invoice['amount'] as num?)?.toDouble() ?? 0.0;
      final invoiceId = invoice['invoice_number']?.toString() ?? '';
      final result = await _service.initiatePayment(
        jobId: widget.jobId,
        invoiceId: invoiceId,
        amount: amount,
      );
      if (!context.mounted) return;
      final paymentUrl = result['payment_url']?.toString();
      final message = result['message']?.toString();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            paymentUrl != null
                ? 'Payment session created. Redirect: $paymentUrl'
                : (message ?? 'Payment initiated successfully.'),
          ),
          backgroundColor: Colors.green,
          duration: const Duration(seconds: 4),
        ),
      );
      _refresh();
    } on N8nWebhookException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Payment initiation failed: ${e.statusCode}'),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _isPaying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Invoice & payment'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refresh,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _ErrorView(
              error: snapshot.error.toString(),
              onRetry: _refresh,
            );
          }

          final invoice = snapshot.data;
          if (invoice == null) {
            return const Center(child: Text('No invoice available.'));
          }

          final colorScheme = Theme.of(context).colorScheme;
          final paymentStatus = invoice['payment_status']?.toString() ?? 'pending';
          final amount = (invoice['amount'] as num?)?.toDouble() ?? 0.0;
          final lineItems = (invoice['line_items'] as List<dynamic>?)
                  ?.map((e) => e as Map<String, dynamic>)
                  .toList() ??
              [];
          final paymentHistory = (invoice['payment_history'] as List<dynamic>?)
                  ?.map((e) => e as Map<String, dynamic>)
                  .toList() ??
              [];

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            invoice['invoice_number']?.toString() ?? 'Invoice',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          _PaymentStatusBadge(status: paymentStatus),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _InvoiceDetailRow(
                        label: 'Issue date',
                        value: invoice['issue_date']?.toString() ?? '—',
                      ),
                      _InvoiceDetailRow(
                        label: 'Due date',
                        value: invoice['due_date']?.toString() ?? '—',
                      ),
                      _InvoiceDetailRow(
                        label: 'Job ID',
                        value: widget.jobId,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Line items',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Expanded(
                              flex: 3,
                              child: Text('Item',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12))),
                          const Expanded(
                              child: Text('Qty',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12))),
                          const Expanded(
                              child: Text('Rate',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12))),
                          const Expanded(
                              child: Text('Amount',
                                  textAlign: TextAlign.right,
                                  style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12))),
                        ],
                      ),
                      const Divider(),
                      for (final item in lineItems) ...[
                        _InvoiceLineItem(item: item),
                        const SizedBox(height: 8),
                      ],
                      const Divider(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Total',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w600)),
                          Text(
                            '\$${amount.toStringAsFixed(2)}',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                  color: colorScheme.primary,
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              if (paymentHistory.isNotEmpty) ...[
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Payment history',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 12),
                        for (final entry in paymentHistory) ...[
                          _PaymentHistoryEntry(entry: entry),
                          if (entry != paymentHistory.last)
                            const SizedBox(height: 8),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              if (paymentStatus != 'paid')
                FilledButton.icon(
                  onPressed: _isPaying
                      ? null
                      : () => _initiatePayment(context, invoice),
                  icon: _isPaying
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.credit_card),
                  label: Text(_isPaying ? 'Processing...' : 'Pay now'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              if (paymentStatus == 'paid')
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.green.withAlpha(25),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.green.withAlpha(75)),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.green),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'This invoice has been paid in full. Thank you!',
                          style: TextStyle(
                            color: Colors.green,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 32),
            ],
          );
        },
      ),
    );
  }
}

class _PaymentStatusBadge extends StatelessWidget {
  const _PaymentStatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final (label, color, bgColor) = _statusStyle(status, colorScheme);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }

  (String, Color, Color) _statusStyle(String status, ColorScheme cs) {
    switch (status) {
      case 'paid':
        return ('PAID', Colors.green, Colors.green.withAlpha(25));
      case 'overdue':
        return ('OVERDUE', cs.error, cs.error.withAlpha(25));
      case 'pending':
      default:
        return ('PENDING', cs.primary, cs.primary.withAlpha(25));
    }
  }
}

class _InvoiceDetailRow extends StatelessWidget {
  const _InvoiceDetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
          Text(value, style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _InvoiceLineItem extends StatelessWidget {
  const _InvoiceLineItem({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final name = item['item']?.toString() ?? '';
    final qty = (item['qty'] as num?)?.toInt() ?? 1;
    final rate = (item['rate'] as num?)?.toDouble() ?? 0.0;
    final amount = (item['amount'] as num?)?.toDouble() ?? 0.0;

    return Row(
      children: [
        Expanded(
            flex: 3,
            child: Text(name, style: Theme.of(context).textTheme.bodyMedium)),
        Expanded(
            child: Text('×$qty',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall)),
        Expanded(
            child: Text('\$${rate.toStringAsFixed(0)}',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall)),
        Expanded(
            child: Text('\$${amount.toStringAsFixed(2)}',
                textAlign: TextAlign.right,
                style: Theme.of(context).textTheme.bodyMedium)),
      ],
    );
  }
}

class _PaymentHistoryEntry extends StatelessWidget {
  const _PaymentHistoryEntry({required this.entry});

  final Map<String, dynamic> entry;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final status = entry['status']?.toString() ?? 'completed';
    final isCompleted = status == 'completed';

    return Row(
      children: [
        Icon(
          isCompleted ? Icons.check_circle_outline : Icons.schedule_outlined,
          size: 20,
          color: isCompleted ? Colors.green : colorScheme.primary,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                entry['date']?.toString() ?? '',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              Text(
                '${entry['method']?.toString() ?? ''} — ${entry['amount']?.toString() ?? ''}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: isCompleted
                ? Colors.green.withAlpha(25)
                : colorScheme.primary.withAlpha(25),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            status.toUpperCase(),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: isCompleted ? Colors.green : colorScheme.primary,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});

  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline,
                size: 48, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 12),
            Text('Could not load invoice',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(error,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
