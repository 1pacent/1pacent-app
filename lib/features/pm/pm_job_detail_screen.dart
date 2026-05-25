import 'package:flutter/material.dart';

import '../../models/job.dart';
import '../../services/n8n_webhook_service.dart';

/// Shows full job details for a property manager, including timeline,
/// approval actions, and tradie/tenant info.
class PMJobDetailScreen extends StatefulWidget {
  const PMJobDetailScreen({required this.jobId, super.key});

  final String jobId;

  @override
  State<PMJobDetailScreen> createState() => _PMJobDetailScreenState();
}

class _PMJobDetailScreenState extends State<PMJobDetailScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<Job> _jobFuture;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _jobFuture = _loadJob();
  }

  Future<Job> _loadJob() async {
    final result = await _service.fetchJobStatus({'work_order_id': widget.jobId});
    return Job.fromJson(result);
  }

  Future<void> _approve() async {
    setState(() => _loading = true);
    try {
      await _service.fetchLandlordApproval(widget.jobId);
      setState(() {
        _loading = false;
        _jobFuture = _loadJob();
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = 'Failed to approve';
      });
    }
  }

  Future<void> _reject() async {
    setState(() => _loading = true);
    try {
      await _service.fetchLandlordApproval(widget.jobId);
      setState(() {
        _loading = false;
        _jobFuture = _loadJob();
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = 'Failed to reject';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text('Job ${widget.jobId}')),
      body: FutureBuilder<Job>(
        future: _jobFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Text('Error loading job', style: TextStyle(color: theme.colorScheme.error)),
            );
          }
          final job = snapshot.data!;
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                  ),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(job.description, style: theme.textTheme.headlineSmall),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Chip(label: Text(job.status.name)),
                            const SizedBox(width: 8),
                            Chip(label: Text(job.tradeType)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text('Actions', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _loading ? null : _approve,
                        icon: const Icon(Icons.check),
                        label: const Text('Approve'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _loading ? null : _reject,
                        icon: const Icon(Icons.close),
                        label: const Text('Reject'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
