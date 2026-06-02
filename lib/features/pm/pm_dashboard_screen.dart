import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../models/ops_summary.dart';
import '../../services/n8n_webhook_service.dart';

class PMDashboardScreen extends StatefulWidget {
  const PMDashboardScreen({super.key});

  @override
  State<PMDashboardScreen> createState() => _PMDashboardScreenState();
}

class _PMDashboardScreenState extends State<PMDashboardScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<OpsSummary> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetchSummary();
  }

  Future<OpsSummary> _fetchSummary() async {
    final response = await _service.fetchOpsConsoleSummary(limit: 10);
    return OpsSummary.fromJson(response);
  }

  Future<void> _refresh() async {
    setState(() => _future = _fetchSummary());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Property manager'),
        actions: [
          IconButton(
            onPressed: _refresh,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: FutureBuilder<OpsSummary>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _PMEmptyState(
              title: 'Could not load operations queue',
              body: snapshot.error.toString(),
              action: FilledButton.icon(
                onPressed: _refresh,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            );
          }

          final summary = snapshot.data;
          if (summary == null) {
            return _PMEmptyState(
              title: 'No operations data',
              body: 'n8n did not return an operations summary yet.',
              action: FilledButton.icon(
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
                Text(
                  'Live work queue',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 4),
                Text(
                  'Loaded from n8n and Postgres. The app displays the queue and triggers workflows; it does not own execution state.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
                if (summary.generatedAt.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Updated ${summary.generatedAt}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
                const SizedBox(height: 16),
                _PipelineGrid(summary: summary),
                const SizedBox(height: 16),
                _SectionHeader(
                  icon: Icons.assignment_outlined,
                  title: 'Recent leads',
                  count: summary.recentWork.leads.length,
                ),
                const SizedBox(height: 8),
                if (summary.recentWork.leads.isEmpty)
                  const _InlineEmpty(text: 'No recent leads returned.')
                else
                  for (final lead in summary.recentWork.leads) ...[
                    _LeadTile(lead: lead),
                    const SizedBox(height: 8),
                  ],
                const SizedBox(height: 12),
                _SectionHeader(
                  icon: Icons.build_circle_outlined,
                  title: 'Active jobs',
                  count: summary.recentWork.jobs.length,
                ),
                const SizedBox(height: 8),
                if (summary.recentWork.jobs.isEmpty)
                  const _InlineEmpty(text: 'No recent jobs returned.')
                else
                  for (final job in summary.recentWork.jobs) ...[
                    _JobTile(job: job),
                    const SizedBox(height: 8),
                  ],
                const SizedBox(height: 12),
                _SectionHeader(
                  icon: Icons.payments_outlined,
                  title: 'Payments',
                  count: summary.recentWork.payments.length,
                ),
                const SizedBox(height: 8),
                if (summary.recentWork.payments.isEmpty)
                  const _InlineEmpty(text: 'No recent payments returned.')
                else
                  for (final payment in summary.recentWork.payments) ...[
                    _PaymentTile(payment: payment),
                    const SizedBox(height: 8),
                  ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _PipelineGrid extends StatelessWidget {
  const _PipelineGrid({required this.summary});

  final OpsSummary summary;

  @override
  Widget build(BuildContext context) {
    final cards = [
      _MetricData(
        icon: Icons.inbox_outlined,
        label: 'Leads',
        value: summary.pipelineCount('leads_total').toString(),
      ),
      _MetricData(
        icon: Icons.handyman_outlined,
        label: 'Jobs',
        value: summary.pipelineCount('jobs_total').toString(),
      ),
      _MetricData(
        icon: Icons.request_quote_outlined,
        label: 'Quotes',
        value: summary.pipelineCount('quotes_total').toString(),
      ),
      _MetricData(
        icon: Icons.receipt_long_outlined,
        label: 'Invoices',
        value: summary.pipelineCount('invoices_total').toString(),
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 700 ? 4 : 2;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: cards.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: columns == 4 ? 2.3 : 1.75,
          ),
          itemBuilder: (context, index) => _MetricCard(data: cards[index]),
        );
      },
    );
  }
}

class _MetricData {
  const _MetricData({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.data});

  final _MetricData data;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(data.icon, color: colorScheme.primary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    data.value,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  Text(
                    data.label,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.title,
    required this.count,
  });

  final IconData icon;
  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20),
        const SizedBox(width: 8),
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleMedium),
        ),
        Chip(
          label: Text(count.toString()),
          visualDensity: VisualDensity.compact,
        ),
      ],
    );
  }
}

class _LeadTile extends StatelessWidget {
  const _LeadTile({required this.lead});

  final OpsLead lead;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.assignment_outlined),
        title:
            Text(lead.tradeType.isEmpty ? 'Lead ${lead.id}' : lead.tradeType),
        subtitle: Text([
          if (lead.address.isNotEmpty) lead.address,
          if (lead.urgency.isNotEmpty) 'Urgency: ${lead.urgency}',
          if (lead.preferredTime.isNotEmpty) lead.preferredTime,
        ].join('\n')),
        trailing: _StatusChip(label: lead.status),
        onTap: lead.id.isEmpty
            ? null
            : () => context
                .go('/job-status?lead_id=${Uri.encodeComponent(lead.id)}'),
      ),
    );
  }
}

class _JobTile extends StatelessWidget {
  const _JobTile({required this.job});

  final OpsJob job;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.build_circle_outlined),
        title: Text(job.id.isEmpty ? 'Job' : 'Job ${job.id}'),
        subtitle: Text([
          if (job.leadId.isNotEmpty) 'Lead: ${job.leadId}',
          if (job.quoteId.isNotEmpty) 'Quote: ${job.quoteId}',
          if (job.scheduledWindow.isNotEmpty) job.scheduledWindow,
        ].join('\n')),
        trailing: _StatusChip(label: job.status),
        onTap: job.id.isEmpty
            ? null
            : () =>
                context.go('/job-status?job_id=${Uri.encodeComponent(job.id)}'),
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.payment});

  final OpsPayment payment;

  @override
  Widget build(BuildContext context) {
    final amount = '${payment.currency} ${payment.amount.toStringAsFixed(2)}';

    return Card(
      child: ListTile(
        leading: const Icon(Icons.payments_outlined),
        title: Text(payment.invoiceId.isEmpty
            ? 'Payment ${payment.id}'
            : 'Invoice ${payment.invoiceId}'),
        subtitle: Text([
          amount,
          if (payment.jobId.isNotEmpty) 'Job: ${payment.jobId}',
          if (payment.dueAt.isNotEmpty) 'Due: ${payment.dueAt}',
        ].join('\n')),
        trailing: _StatusChip(label: payment.status),
        onTap: payment.jobId.isEmpty
            ? null
            : () => context
                .go('/job-status?job_id=${Uri.encodeComponent(payment.jobId)}'),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final text = label.isEmpty ? 'unknown' : label;
    return Chip(
      label: Text(text),
      visualDensity: VisualDensity.compact,
    );
  }
}

class _InlineEmpty extends StatelessWidget {
  const _InlineEmpty({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(
        text,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
      ),
    );
  }
}

class _PMEmptyState extends StatelessWidget {
  const _PMEmptyState({
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
            Icon(
              Icons.dashboard_outlined,
              size: 48,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
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
