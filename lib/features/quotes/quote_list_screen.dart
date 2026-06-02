import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../models/quote.dart';
import '../../services/n8n_webhook_service.dart';

class QuoteListScreen extends StatefulWidget {
  const QuoteListScreen({required this.jobId, super.key});

  final String jobId;

  @override
  State<QuoteListScreen> createState() => _QuoteListScreenState();
}

class _QuoteListScreenState extends State<QuoteListScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<_QuoteOptionsViewData> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetchQuoteOptions();
  }

  Future<_QuoteOptionsViewData> _fetchQuoteOptions() async {
    final response = await _service.fetchQuoteOptions(widget.jobId);
    final quoteData = response['options'] as List<dynamic>? ?? const [];
    final quotes = quoteData
        .whereType<Map<String, dynamic>>()
        .map(Quote.fromJson)
        .toList();

    return _QuoteOptionsViewData(
      approvalId: response['approval_id']?.toString(),
      nextAction: response['next_action']?.toString(),
      quotes: quotes,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _fetchQuoteOptions());
  }

  Future<void> _approveQuote(Quote quote, String? approvalId) async {
    if (approvalId == null || approvalId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Approval reference is missing.')),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Approve quote option'),
        content: Text(
          'Approve ${quote.displayName} for \$${quote.amount.toStringAsFixed(2)}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Approve'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    try {
      final result = await _service.approveQuoteOption(
        approvalId: approvalId,
        optionId: quote.id,
      );
      if (!mounted) return;
      final message = result['message']?.toString() ??
          result['next_action']?.toString() ??
          'Quote option approved.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), backgroundColor: Colors.green),
      );
      context.go('/job/${result['work_order_id'] ?? widget.jobId}');
    } on N8nWebhookException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Approval failed: ${error.statusCode}'),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Quote options'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refresh,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: FutureBuilder<_QuoteOptionsViewData>(
        future: _future,
        builder: (context, snapshot) {
          if (widget.jobId.isEmpty) {
            return const _QuoteEmptyState(
              title: 'Missing job reference',
              body: 'Open quote options from a job status page.',
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _QuoteErrorView(
              error: snapshot.error.toString(),
              onRetry: _refresh,
            );
          }

          final data = snapshot.data ??
              const _QuoteOptionsViewData(quotes: [], approvalId: null);
          if (data.quotes.isEmpty) {
            return _QuoteEmptyState(
              title: 'No quote options yet',
              body: data.nextAction ??
                  'n8n has not returned quote options for this work order yet.',
              action: OutlinedButton.icon(
                onPressed: _refresh,
                icon: const Icon(Icons.refresh),
                label: const Text('Refresh'),
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Matched quote options',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(
                  'These options come from n8n and Postgres. Approval triggers the rental quote-option workflow.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
                if (data.nextAction != null) ...[
                  const SizedBox(height: 12),
                  _NextActionBanner(text: data.nextAction!),
                ],
                const SizedBox(height: 16),
                for (final quote in data.quotes) ...[
                  _QuoteCard(
                    quote: quote,
                    onApprove: () => _approveQuote(quote, data.approvalId),
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _QuoteOptionsViewData {
  const _QuoteOptionsViewData({
    required this.quotes,
    required this.approvalId,
    this.nextAction,
  });

  final List<Quote> quotes;
  final String? approvalId;
  final String? nextAction;
}

class _QuoteCard extends StatelessWidget {
  const _QuoteCard({required this.quote, required this.onApprove});

  final Quote quote;
  final VoidCallback onApprove;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    quote.displayName,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Text(
                  '\$${quote.amount.toStringAsFixed(2)}',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (quote.rank != null)
                  _MetricChip(label: 'Rank ${quote.rank}'),
                if (quote.trustScore != null)
                  _MetricChip(label: 'Trust ${quote.trustScore!.round()}'),
                if (quote.costScore != null)
                  _MetricChip(label: 'Cost ${quote.costScore!.round()}'),
                if (quote.availabilityScore != null)
                  _MetricChip(
                      label:
                          'Availability ${quote.availabilityScore!.round()}'),
                if (quote.totalScore != null)
                  _MetricChip(label: 'Score ${quote.totalScore!.round()}'),
              ],
            ),
            if (quote.scheduledWindow.isNotEmpty) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.schedule_outlined, size: 18),
                  const SizedBox(width: 6),
                  Expanded(child: Text(quote.scheduledWindow)),
                ],
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                FilledButton.icon(
                  onPressed: onApprove,
                  icon: const Icon(Icons.check_outlined),
                  label: const Text('Approve'),
                ),
                const SizedBox(width: 8),
                if (quote.tradieId != null)
                  OutlinedButton.icon(
                    onPressed: () =>
                        context.go('/tradie/${quote.tradieId}/trust'),
                    icon: const Icon(Icons.shield_outlined),
                    label: const Text('Trust'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
    );
  }
}

class _NextActionBanner extends StatelessWidget {
  const _NextActionBanner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFFEAF6EF),
      child: ListTile(
        leading: const Icon(Icons.next_plan_outlined),
        title: const Text('Next action'),
        subtitle: Text(text),
      ),
    );
  }
}

class _QuoteErrorView extends StatelessWidget {
  const _QuoteErrorView({required this.error, required this.onRetry});

  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _QuoteEmptyState(
      title: 'Could not load quote options',
      body: error,
      action: FilledButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }
}

class _QuoteEmptyState extends StatelessWidget {
  const _QuoteEmptyState({
    required this.title,
    required this.body,
    this.action,
  });

  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.request_quote_outlined,
                size: 48,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(body, textAlign: TextAlign.center),
            if (action != null) ...[
              const SizedBox(height: 16),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
