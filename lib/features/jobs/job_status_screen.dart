import 'package:flutter/material.dart';

import '../../models/job.dart';
import '../../services/n8n_webhook_service.dart';
import 'widgets/warranty_banner.dart';

class JobStatusScreen extends StatefulWidget {
  const JobStatusScreen({required this.jobId, super.key});

  final String jobId;

  @override
  State<JobStatusScreen> createState() => _JobStatusScreenState();
}

class _JobStatusScreenState extends State<JobStatusScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.fetchJobStatus({'work_order_id': widget.jobId});
  }

  Future<void> _refresh() async {
    setState(() {
      _future = _service.fetchJobStatus({'work_order_id': widget.jobId});
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Job ${widget.jobId}'),
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

          if (!snapshot.hasData) {
            return const Center(child: Text('No data available.'));
          }

          final data = snapshot.data!;
          final job = _parseJob(data);
          final timeline = jobStatusTimeline;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (job.warrantyFlag == true)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: WarrantyBanner(
                    message: job.warrantyMessage ??
                        'Warranty or repeat-issue flag raised for this job.',
                  ),
                ),
              Text(job.description,
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(job.tradeType,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant)),
              if (job.propertyAddress != null) ...[
                const SizedBox(height: 4),
                Text(job.propertyAddress!,
                    style: Theme.of(context).textTheme.bodyMedium),
              ],
              const SizedBox(height: 20),
              Text('Status', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              _StatusTimeline(job: job, timeline: timeline),
              if (job.scheduledWindow != null) ...[
                const SizedBox(height: 16),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.schedule_outlined),
                    title: const Text('Scheduled'),
                    subtitle: Text(job.scheduledWindow!),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Job _parseJob(Map<String, dynamic> data) {
    final jobData = data['job'] as Map<String, dynamic>? ?? data;
    return Job.fromJson(jobData);
  }
}

class _StatusTimeline extends StatelessWidget {
  const _StatusTimeline({required this.job, required this.timeline});

  final Job job;
  final List<JobStatus> timeline;

  @override
  Widget build(BuildContext context) {
    final currentIndex = job.timelineIndex >= 0 ? job.timelineIndex : 0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Column(
          children: [
            for (var i = 0; i < timeline.length; i++) ...[
              if (i > 0)
                _TimelineConnector(
                  isActive: i <= currentIndex,
                ),
              _TimelineStep(
                label: jobStatusLabel(timeline[i]),
                isActive: i == currentIndex,
                isCompleted: i < currentIndex,
                isLast: i == timeline.length - 1,
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
    this.isLast = false,
  });

  final String label;
  final bool isActive;
  final bool isCompleted;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final Color dotColor;
    final Widget icon;

    if (isCompleted) {
      dotColor = colorScheme.primary;
      icon = Icon(Icons.check, size: 14, color: colorScheme.onPrimary);
    } else if (isActive) {
      dotColor = colorScheme.primary;
      icon = Icon(Icons.circle, size: 10, color: colorScheme.onPrimary);
    } else {
      dotColor = colorScheme.outlineVariant;
      icon = const SizedBox.shrink();
    }

    return Row(
      children: [
        const SizedBox(width: 16),
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: dotColor,
            shape: BoxShape.circle,
          ),
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
                    fontWeight:
                        isActive ? FontWeight.w600 : FontWeight.normal,
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
                size: 48,
                color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 12),
            Text('Could not load job status',
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
