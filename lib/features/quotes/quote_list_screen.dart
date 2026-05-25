import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../models/quote.dart';
import '../../services/n8n_webhook_service.dart';

/// Displays matched quote options for a job, including cost, availability,
/// and trust score for each tradie.
class QuoteListScreen extends StatefulWidget {
  const QuoteListScreen({required this.jobId, super.key});

  final String jobId;

  @override
  State<QuoteListScreen> createState() => _QuoteListScreenState();
}

class _QuoteListScreenState extends State<QuoteListScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<List<Quote>> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetchQuotes();
  }

  Future<List<Quote>> _fetchQuotes() async {
    final response = await _service.fetchQuotes(widget.jobId);
    final quotesData = response['quotes'] as List<dynamic>? ?? [];
    return quotesData
        .map((e) => Quote.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> _refresh() async {
    setState(() {
      _future = _fetchQuotes();
    });
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
      body: FutureBuilder<List<Quote>>(
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

          final quotes = snapshot.data ?? [];

          if (quotes.isEmpty) {
            return const Center(
              child: Text('No quotes available yet. Check back soon.'),
            );
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Matched quotes',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                'Compare cost, availability, and tradie trust score.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 16),
              for (final quote in quotes) ...[
                _QuoteCard(quote: quote),
                const SizedBox(height: 12),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _QuoteCard extends StatelessWidget {
  const _QuoteCard({required this.quote});

  final Quote quote;

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
                  child: Text(quote.tradieName,
                      style: Theme.of(context).textTheme.titleMedium),
                ),
                Text(
                  '\$${quote.amount.toStringAsFixed(2)}',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.schedule_outlined, size: 16),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    quote.availability,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ],
            ),
            if (quote.trustScore != null) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(Icons.shield_outlined, size: 16),
                  const SizedBox(width: 4),
                  Text(
                    'Trust score: ${(quote.trustScore! * 100).toStringAsFixed(0)}%',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ],
            if (quote.assumptions.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: quote.assumptions
                    .map((a) => Chip(
                          label: Text(a,
                              style: Theme.of(context).textTheme.labelSmall),
                          visualDensity: VisualDensity.compact,
                        ))
                    .toList(),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                FilledButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                            'Quote ${quote.id} selected — approval flow coming in Sprint 3.'),
                      ),
                    );
                  },
                  child: const Text('Select quote'),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () {
                    context.go('/tradie/${quote.tradieId}/trust');
                  },
                  child: const Text('View tradie'),
                ),
              ],
            ),
          ],
        ),
      ),
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
            Text('Could not load quotes',
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
