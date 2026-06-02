import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../models/job.dart';
import '../../services/n8n_webhook_service.dart';
import 'widgets/warranty_banner.dart';

class JobStatusScreen extends StatefulWidget {
  const JobStatusScreen({
    required this.jobId,
    this.referenceKey = 'work_order_id',
    super.key,
  });

  final String jobId;
  final String referenceKey;

  @override
  State<JobStatusScreen> createState() => _JobStatusScreenState();
}

class _JobStatusScreenState extends State<JobStatusScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _loadStatus();
  }

  Future<Map<String, dynamic>> _loadStatus() {
    return _service.fetchJobStatus(
      widget.jobId,
      referenceKey: widget.referenceKey,
    );
  }

  Future<void> _refresh() async {
    setState(() => _future = _loadStatus());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title:
            Text(widget.jobId.isEmpty ? 'Job status' : 'Job ${widget.jobId}'),
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
          if (widget.jobId.isEmpty) {
            return const _EmptyState(
              title: 'Missing job reference',
              body: 'Open this page from a 1pacent tracking link.',
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _ErrorView(
              error: snapshot.error.toString(),
              onRetry: _refresh,
            );
          }

          final data = snapshot.data ?? {};
          final job = _parseJob(data);

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (job.warrantyFlag == true) ...[
                  WarrantyBanner(
                    message: job.warrantyMessage ??
                        'Wally or Sparky has flagged this job for review.',
                  ),
                  const SizedBox(height: 12),
                ],
                Text(job.description,
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _InfoChip(label: jobStatusLabel(job.status)),
                    if (job.tradeType.isNotEmpty)
                      _InfoChip(label: job.tradeType),
                    if (job.landlordApprovalStatus != null)
                      _InfoChip(
                          label: 'Approval: ${job.landlordApprovalStatus}'),
                  ],
                ),
                if (job.propertyAddress != null) ...[
                  const SizedBox(height: 12),
                  _DetailCard(
                    icon: Icons.place_outlined,
                    title: 'Property',
                    body: job.propertyAddress!,
                  ),
                ],
                if (job.scheduledWindow != null) ...[
                  const SizedBox(height: 12),
                  _DetailCard(
                    icon: Icons.schedule_outlined,
                    title: 'Scheduled',
                    body: job.scheduledWindow!,
                  ),
                ],
                if (job.nextAction != null) ...[
                  const SizedBox(height: 12),
                  _DetailCard(
                    icon: Icons.next_plan_outlined,
                    title: 'Next action',
                    body: job.nextAction!,
                  ),
                ],
                const SizedBox(height: 20),
                Text('Timeline',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 12),
                _StatusTimeline(job: job),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: () => context.go('/job/${widget.jobId}/quotes'),
                  icon: const Icon(Icons.request_quote_outlined),
                  label: const Text('View quote options'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Job _parseJob(Map<String, dynamic> data) {
    final jobData = data['job'] as Map<String, dynamic>? ??
        data['work_order'] as Map<String, dynamic>? ??
        data;
    return Job.fromJson(jobData);
  }
}

class _StatusTimeline extends StatelessWidget {
  const _StatusTimeline({required this.job});

  final Job job;

  @override
  Widget build(BuildContext context) {
    final currentIndex = job.timelineIndex >= 0 ? job.timelineIndex : 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          children: [
            for (var i = 0; i < jobStatusTimeline.length; i++) ...[
              if (i > 0) _TimelineConnector(isActive: i <= currentIndex),
              _TimelineStep(
                label: jobStatusLabel(jobStatusTimeline[i]),
                isActive: i == currentIndex,
                isCompleted: i < currentIndex,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TimelineStep extends StatelessWidget {
  const _TimelineStep({
    required this.label,
    required this.isActive,
    required this.isCompleted,
  });

  final String label;
  final bool isActive;
  final bool isCompleted;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final dotColor = isActive || isCompleted
        ? colorScheme.primary
        : colorScheme.outlineVariant;
    final icon = isCompleted
        ? Icon(Icons.check, size: 14, color: colorScheme.onPrimary)
        : isActive
            ? Icon(Icons.circle, size: 10, color: colorScheme.onPrimary)
            : const SizedBox.shrink();

    return Row(
      children: [
        const SizedBox(width: 16),
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: icon,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                    color: isActive || isCompleted
                        ? colorScheme.onSurface
                        : colorScheme.onSurfaceVariant,
                  ),
            ),
          ),
        ),
      ],
    );
  }
}

class _TimelineConnector extends StatelessWidget {
  const _TimelineConnector({required this.isActive});

  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 29),
      width: 2,
      height: 20,
      color: isActive
          ? Theme.of(context).colorScheme.primary
          : Theme.of(context).colorScheme.outlineVariant,
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
    );
  }
}

class _DetailCard extends StatelessWidget {
  const _DetailCard({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(body),
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
    return _EmptyState(
      title: 'Could not load job status',
      body: error,
      action: FilledButton.icon(
        onPressed: onRetry,
        icon: const Icon(Icons.refresh),
        label: const Text('Retry'),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
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
            Icon(Icons.route_outlined,
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
