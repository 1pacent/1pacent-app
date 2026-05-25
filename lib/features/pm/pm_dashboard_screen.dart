import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../models/job.dart';
import '../../services/n8n_webhook_service.dart';

class PMDashboardScreen extends StatefulWidget {
  const PMDashboardScreen({super.key});

  @override
  State<PMDashboardScreen> createState() => _PMDashboardScreenState();
}

class _PMDashboardScreenState extends State<PMDashboardScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<List<Job>> _future;
  String _statusFilter = 'all';

  @override
  void initState() {
    super.initState();
    _future = _loadJobs();
  }

  Future<List<Job>> _loadJobs() async {
    final result = await _service.pmFetchJobs({});
    final jobsList = result['jobs'] as List<dynamic>? ?? [];
    return jobsList
        .map((j) => Job.fromJson(j as Map<String, dynamic>))
        .toList();
  }

  Future<void> _refresh() async {
    setState(() {
      _future = _loadJobs();
    });
  }

  List<Job> _applyFilter(List<Job> jobs) {
    if (_statusFilter == 'all') return jobs;
    return jobs.where((j) {
      switch (_statusFilter) {
        case 'pending':
          return j.status == JobStatus.requested;
        case 'approved':
          return j.landlordApprovalStatus == 'approved' ||
              j.status == JobStatus.quoteApproved;
        case 'rejected':
          return j.landlordApprovalStatus == 'rejected';
        case 'in_progress':
          return j.status == JobStatus.inProgress ||
              j.status == JobStatus.tradieOnTheWay ||
              j.status == JobStatus.scheduled;
        case 'completed':
          return j.status == JobStatus.completed ||
              j.status == JobStatus.invoiced ||
              j.status == JobStatus.paid;
        default:
          return true;
      }
    }).toList();
  }

  _KpiSummary _calculateKpis(List<Job> jobs) {
    int pending = 0;
    int approved = 0;
    int rejected = 0;
    int inProgress = 0;
    int completed = 0;

    for (final job in jobs) {
      switch (job.status) {
        case JobStatus.requested:
          pending++;
          break;
        case JobStatus.quoteApproved:
        case JobStatus.scheduled:
          approved++;
          break;
        case JobStatus.tradieOnTheWay:
        case JobStatus.inProgress:
          inProgress++;
          break;
        case JobStatus.completed:
        case JobStatus.invoiced:
        case JobStatus.paid:
          completed++;
          break;
        case JobStatus.quotePending:
          break;
      }
      if (job.landlordApprovalStatus == 'rejected') {
        rejected++;
      }
    }

    return _KpiSummary(
      total: jobs.length,
      pending: pending,
      approved: approved,
      rejected: rejected,
      inProgress: inProgress,
      completed: completed,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Property Manager'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refresh,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: FutureBuilder<List<Job>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return _PMErrorView(
              error: snapshot.error.toString(),
              onRetry: _refresh,
            );
          }

          final allJobs = snapshot.data ?? [];

          if (allJobs.isEmpty) {
            return _PMEmptyView(onRefresh: _refresh);
          }

          final kpis = _calculateKpis(allJobs);
          final filteredJobs = _applyFilter(allJobs);

          return Column(
            children: [
              _KpiRow(kpis: kpis),
              _StatusFilterChips(
                selected: _statusFilter,
                onChanged: (value) =>
                    setState(() => _statusFilter = value),
              ),
              const Divider(height: 1),
              Expanded(
                child: filteredJobs.isEmpty
                    ? const Center(
                        child: Text('No jobs match the selected filter.'))
                    : RefreshIndicator(
                        onRefresh: _refresh,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: filteredJobs.length,
                          itemBuilder: (context, index) => _PMJobCard(
                            job: filteredJobs[index],
                            onTap: () => context.go(
                                '/pm/job/${filteredJobs[index].id}'),
                          ),
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _KpiSummary {
  const _KpiSummary({
    required this.total,
    required this.pending,
    required this.approved,
    required this.rejected,
    required this.inProgress,
    required this.completed,
  });

  final int total;
  final int pending;
  final int approved;
  final int rejected;
  final int inProgress;
  final int completed;
}

class _KpiRow extends StatelessWidget {
  const _KpiRow({required this.kpis});

  final _KpiSummary kpis;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
              child: _KpiCard(
                  label: 'Total',
                  value: '${kpis.total}',
                  color: Colors.blue)),
          const SizedBox(width: 8),
          Expanded(
              child: _KpiCard(
                  label: 'Pending',
                  value: '${kpis.pending}',
                  color: Colors.orange)),
          const SizedBox(width: 8),
          Expanded(
              child: _KpiCard(
                  label: 'In progress',
                  value: '${kpis.inProgress}',
                  color: Colors.teal)),
          const SizedBox(width: 8),
          Expanded(
              child: _KpiCard(
                  label: 'Done',
                  value: '${kpis.completed}',
                  color: Colors.green)),
        ],
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Text(value,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: color, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(label,
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _StatusFilterChips extends StatelessWidget {
  const _StatusFilterChips({
    required this.selected,
    required this.onChanged,
  });

  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    const filters = [
      ('all', 'All'),
      ('pending', 'Pending'),
      ('approved', 'Approved'),
      ('rejected', 'Rejected'),
      ('in_progress', 'In progress'),
      ('completed', 'Completed'),
    ];

    return SizedBox(
      height: 56,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: filters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final (key, label) = filters[index];
          return FilterChip(
            label: Text(label),
            selected: selected == key,
            onSelected: (_) => onChanged(key),
          );
        },
      ),
    );
  }
}

class _PMJobCard extends StatelessWidget {
  const _PMJobCard({required this.job, required this.onTap});

  final Job job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(context, job.status);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        title: Text(job.description,
            maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text('ID: ${job.id}'),
            if (job.propertyAddress != null) ...[
              const SizedBox(height: 2),
              Text(job.propertyAddress!,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
            if (job.tradeType.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(job.tradeType),
            ],
          ],
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: statusColor.withValues(alpha: 0.3)),
              ),
              child: Text(
                jobStatusLabel(job.status),
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: statusColor),
              ),
            ),
            if (job.landlordApprovalStatus != null) ...[
              const SizedBox(height: 4),
              Text(
                job.landlordApprovalStatus!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: job.landlordApprovalStatus == 'approved'
                        ? Colors.green
                        : job.landlordApprovalStatus == 'rejected'
                            ? Colors.red
                            : Colors.orange),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color _statusColor(BuildContext context, JobStatus status) {
    switch (status) {
      case JobStatus.requested:
        return Colors.orange;
      case JobStatus.quotePending:
        return Colors.blue;
      case JobStatus.quoteApproved:
      case JobStatus.scheduled:
        return Colors.green;
      case JobStatus.tradieOnTheWay:
      case JobStatus.inProgress:
        return Colors.teal;
      case JobStatus.completed:
      case JobStatus.invoiced:
      case JobStatus.paid:
        return Colors.grey;
    }
  }
}

class _PMErrorView extends StatelessWidget {
  const _PMErrorView({required this.error, required this.onRetry});

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
            Text('Could not load dashboard',
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

class _PMEmptyView extends StatelessWidget {
  const _PMEmptyView({required this.onRefresh});

  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.dashboard_outlined,
                size: 48,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text('No jobs in queue',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            const Text('New job requests will appear here.',
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh'),
            ),
          ],
        ),
      ),
    );
  }
}
