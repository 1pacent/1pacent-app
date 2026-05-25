import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../models/quote.dart';
import '../../services/n8n_webhook_service.dart';

/// Displays full quote details and allows the customer to accept or decline.
class QuoteAcceptanceScreen extends StatefulWidget {
  const QuoteAcceptanceScreen({
    required this.jobId,
    required this.quoteId,
    super.key,
  });

  final String jobId;
  final String quoteId;

  @override
  State<QuoteAcceptanceScreen> createState() => _QuoteAcceptanceScreenState();
}

class _QuoteAcceptanceScreenState extends State<QuoteAcceptanceScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<Quote> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetchQuote();
  }

  Future<Quote> _fetchQuote() async {
    final response = await _service.fetchQuotes(widget.jobId);
    final quotesData = response['quotes'] as List<dynamic>? ?? [];
    final quotes = quotesData
        .map((e) => Quote.fromJson(e as Map<String, dynamic>))
        .toList();
    return quotes.firstWhere(
      (q) => q.id == widget.quoteId,
      orElse: () => quotes.isNotEmpty
          ? quotes.first
          : throw Exception('Quote not found'),
    );
  }

  Future<void> _refresh() async {
    setState(() {
      _future = _fetchQuote();
    });
  }

  Future<void> _acceptQuote(BuildContext context, Quote quote) async {
    try {
      await _service.acceptQuote(quoteId: quote.id, jobId: widget.jobId);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Quote from ${quote.tradieName} accepted.'),
          backgroundColor: Colors.green,
        ),
      );
      context.go('/job/${widget.jobId}');
    } on N8nWebhookException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Acceptance failed: ${e.statusCode}'),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    }
  }

  Future<void> _declineQuote(BuildContext context, Quote quote) async {
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => _DeclineReasonDialog(),
    );
    if (reason == null || !context.mounted) return;

    try {
      await _service.declineQuote(
        quoteId: quote.id,
        jobId: widget.jobId,
        reason: reason,
      );
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Quote from ${quote.tradieName} declined.'),
          backgroundColor: Colors.orange,
        ),
      );
      context.go('/quotes/${widget.jobId}');
    } on N8nWebhookException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Decline failed: ${e.statusCode}'),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Quote details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refresh,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: FutureBuilder<Quote>(
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

          final quote = snapshot.data;
          if (quote == null) {
            return const Center(child: Text('Quote not found.'));
          }

          final colorScheme = Theme.of(context).colorScheme;

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
                        children: [
                          CircleAvatar(
                            backgroundColor: colorScheme.primaryContainer,
                            child: Icon(Icons.person_outline,
                                color: colorScheme.onPrimaryContainer),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(quote.tradieName,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleLarge),
                                const SizedBox(height: 2),
                                Text('Tradie',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(
                                            color:
                                                colorScheme.onSurfaceVariant)),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: _statusColor(quote.status, colorScheme)
                                  .withAlpha(25),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              quote.status.toUpperCase(),
                              style: Theme.of(context)
                                  .textTheme
                                  .labelSmall
                                  ?.copyWith(
                                    color:
                                        _statusColor(quote.status, colorScheme),
                                    fontWeight: FontWeight.w600,
                                  ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const Divider(),
                      const SizedBox(height: 12),
                      Text('Quoted amount',
                          style: Theme.of(context).textTheme.labelMedium),
                      const SizedBox(height: 4),
                      Text(
                        '\$${quote.amount.toStringAsFixed(2)}',
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(
                              color: colorScheme.primary,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      if (quote.availability.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Icon(Icons.schedule_outlined,
                                size: 18, color: colorScheme.onSurfaceVariant),
                            const SizedBox(width: 6),
                            Text(quote.availability,
                                style: Theme.of(context).textTheme.bodyMedium),
                          ],
                        ),
                      ],
                      if (quote.trustScore != null) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Icon(Icons.shield_outlined,
                                size: 18, color: colorScheme.onSurfaceVariant),
                            const SizedBox(width: 6),
                            Text(
                              'Trust score: ${(quote.trustScore! * 100).toStringAsFixed(0)}%',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              if (quote.assumptions.isNotEmpty) ...[
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Assumptions',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          children: quote.assumptions
                              .map((a) => Chip(
                                    label: Text(a,
                                        style: Theme.of(context)
                                            .textTheme
                                            .labelSmall),
                                    visualDensity: VisualDensity.compact,
                                  ))
                              .toList(),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
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
                      _LineItemRow(
                        item: 'Labour',
                        qty: 1,
                        rate: quote.amount * 0.6,
                        amount: quote.amount * 0.6,
                      ),
                      const SizedBox(height: 8),
                      _LineItemRow(
                        item: 'Materials',
                        qty: 1,
                        rate: quote.amount * 0.4,
                        amount: quote.amount * 0.4,
                      ),
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
                            '\$${quote.amount.toStringAsFixed(2)}',
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
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: quote.status == 'accepted'
                          ? null
                          : () => _declineQuote(context, quote),
                      icon: const Icon(Icons.close),
                      label: const Text('Decline'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: quote.status == 'accepted'
                          ? null
                          : () => _acceptQuote(context, quote),
                      icon: const Icon(Icons.check),
                      label: Text(
                          quote.status == 'accepted' ? 'Accepted' : 'Accept quote'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),
            ],
          );
        },
      ),
    );
  }

  Color _statusColor(String status, ColorScheme colorScheme) {
    switch (status) {
      case 'accepted':
        return Colors.green;
      case 'declined':
        return colorScheme.error;
      case 'pending':
      default:
        return colorScheme.primary;
    }
  }
}

class _LineItemRow extends StatelessWidget {
  const _LineItemRow({
    required this.item,
    required this.qty,
    required this.rate,
    required this.amount,
  });

  final String item;
  final int qty;
  final double rate;
  final double amount;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: Text(item, style: Theme.of(context).textTheme.bodyMedium),
        ),
        Expanded(
          child: Text('×$qty',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall),
        ),
        Expanded(
          child: Text('\$${rate.toStringAsFixed(0)}',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall),
        ),
        Expanded(
          child: Text('\$${amount.toStringAsFixed(2)}',
              textAlign: TextAlign.right,
              style: Theme.of(context).textTheme.bodyMedium),
        ),
      ],
    );
  }
}

class _DeclineReasonDialog extends StatefulWidget {
  @override
  State<_DeclineReasonDialog> createState() => _DeclineReasonDialogState();
}

class _DeclineReasonDialogState extends State<_DeclineReasonDialog> {
  String? _selectedReason;
  final _otherController = TextEditingController();

  final _reasons = [
    'Too expensive',
    'Scheduling conflict',
    'Found another tradie',
    'Issue resolved',
    'Other',
  ];

  @override
  void dispose() {
    _otherController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Decline quote'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Please select a reason:',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          for (final reason in _reasons)
            RadioListTile<String>(
              title: Text(reason),
              value: reason,
              groupValue: _selectedReason,
              onChanged: (v) => setState(() => _selectedReason = v),
              dense: true,
              contentPadding: EdgeInsets.zero,
            ),
          if (_selectedReason == 'Other') ...[
            const SizedBox(height: 8),
            TextField(
              controller: _otherController,
              decoration: const InputDecoration(
                hintText: 'Describe your reason...',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _selectedReason == null
              ? null
              : () {
                  final reason = _selectedReason == 'Other'
                      ? _otherController.text.trim()
                      : _selectedReason!;
                  if (reason.isEmpty) return;
                  Navigator.pop(context, reason);
                },
          child: const Text('Decline'),
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
            Text('Could not load quote',
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
