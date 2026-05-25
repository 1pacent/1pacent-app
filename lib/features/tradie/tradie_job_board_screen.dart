import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../models/job.dart';
import '../../services/n8n_webhook_service.dart';

class TradieJobBoardScreen extends StatefulWidget {
  const TradieJobBoardScreen({super.key});

  @override
  State<TradieJobBoardScreen> createState() => _TradieJobBoardScreenState();
}

class _TradieJobBoardScreenState extends State<TradieJobBoardScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<List<Job>> _future;
  String _filterDistance = 'all';
  String _filterType = 'all';
  String _filterUrgency = 'all';

  @override
  void initState() {
    super.initState();
    _future = _loadJobs();
  }

  Future<List<Job>> _loadJobs() async {
    final result = await _service.fetchTradieJobs({});
    final jobsList = result['jobs'] as List<dynamic>? ?? [];
    return jobsList.map((j) => Job.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<void> _refresh() async {
    setState(() {
      _future = _loadJobs();
    });
  }

  List<Job> _applyFilters(List<Job> jobs) {
    var filtered = jobs;
    if (_filterType != 'all') {
      filtered = filtered.where((j) => j.tradeType.toLowerCase() == _filterType.toLowerCase()).toList();
    }
    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Available jobs'),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterSheet,
            tooltip: 'Filter',
          ),
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
            return _ErrorView(error: snapshot.error.toString(), onRetry: _refresh);
          }
          final jobs = _applyFilters(snapshot.data ?? []);
          if (jobs.isEmpty) {
            return _EmptyView(onRefresh: _refresh);
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: jobs.length,
              itemBuilder: (context, index) => _JobCard(job: jobs[index]),
            ),
          );
        },
      ),
    );
  }

  void _showFilterSheet() {
    showModalBottomSheet(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Filter jobs', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 16),
                  Text('Distance', style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final opt in ['all', '5km', '10km', '25km'])
                        FilterChip(
                          label: Text(opt == 'all' ? 'Any distance' : opt),
                          selected: _filterDistance == opt,
                          onSelected: (_) {
                            setModalState(() => _filterDistance = opt);
                            setState(() {});
                          },
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text('Trade type', style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final opt in ['all', 'electrical', 'plumbing', 'carpentry', 'painting', 'general'])
                        FilterChip(
                          label: Text(opt[0].toUpperCase() + opt.substring(1)),
                          selected: _filterType == opt,
                          onSelected: (_) {
                            setModalState(() => _filterType = opt);
                            setState(() {});
                          },
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text('Urgency', style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final opt in ['all', 'urgent', 'normal', 'low'])
                        FilterChip(
                          label: Text(opt[0].toUpperCase() + opt.substring(1)),
                          selected: _filterUrgency == opt,
                          onSelected: (_) {
                            setModalState(() => _filterUrgency = opt);
                            setState(() {});
                          },
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton(
                      onPressed: () => context.pop(),
                      child: const Text('Done'),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job});

  final Job job;

  @override
  Widget build(BuildContext context) {
    final urgency = _urgencyOf(job);
    final urgencyColor = urgency == 'urgent'
        ? Colors.red
        : urgency == 'normal'
            ? Colors.orange
            : Colors.green;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => context.go('/job/${job.id}'),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(job.description,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: urgencyColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: urgencyColor.withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      urgency[0].toUpperCase() + urgency.substring(1),
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: urgencyColor),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (job.tradeType.isNotEmpty)
                Row(
                  children: [
                    Icon(Icons.build_outlined, size: 16,
                        color: Theme.of(context).colorScheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text(job.tradeType,
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              if (job.propertyAddress != null) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.location_on_outlined, size: 16,
                        color: Theme.of(context).colorScheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text(job.propertyAddress!,
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.access_time_outlined, size: 14,
                      color: Theme.of(context).colorScheme.onSurfaceVariant),
                  const SizedBox(width: 4),
                  Text('Posted ${DateFormat('d MMM').format(DateTime.now().subtract(const Duration(days: 1)))}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  const Spacer(),
                  FilledButton.tonal(
                    onPressed: () => context.go('/tradie/jobs/${job.id}/quote'),
                    child: const Text('Quote'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _urgencyOf(Job job) {
    final desc = job.description.toLowerCase();
    if (desc.contains('urgent') || desc.contains('emergency') || desc.contains('leak')) {
      return 'urgent';
    }
    if (desc.contains('whenever') || desc.contains('no rush')) return 'low';
    return 'normal';
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
            Text('Could not load jobs',
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

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.onRefresh});

  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.work_outline,
                size: 48,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text('No jobs available',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            const Text('Check back later for new job requests.',
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
