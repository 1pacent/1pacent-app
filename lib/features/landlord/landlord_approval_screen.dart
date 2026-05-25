import 'package:flutter/material.dart';

import '../../services/n8n_webhook_service.dart';

/// Displays the landlord approval state for a job.
/// Shows pending, approved, or rejected states with relevant messaging.
class LandlordApprovalScreen extends StatefulWidget {
  const LandlordApprovalScreen({required this.jobId, super.key});

  final String jobId;

  @override
  State<LandlordApprovalScreen> createState() =>
      _LandlordApprovalScreenState();
}

class _LandlordApprovalScreenState extends State<LandlordApprovalScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _service.fetchLandlordApproval(widget.jobId);
  }

  Future<void> _refresh() async {
    setState(() {
      _future = _service.fetchLandlordApproval(widget.jobId);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Landlord approval'),
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

          final data = snapshot.data!;
          final status =
              data['status']?.toString() ?? 'pending';
          final message = data['message']?.toString();

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Job ${widget.jobId}',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              _ApprovalStatusCard(
                status: status,
                message: message,
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ApprovalStatusCard extends StatelessWidget {
  const _ApprovalStatusCard({required this.status, this.message});

  final String status;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    final _ApprovalVisual visual = _visualForStatus(status, colorScheme);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: visual.color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Icon(visual.icon, size: 32, color: visual.color),
            ),
            const SizedBox(height: 16),
            Text(visual.title,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    )),
            const SizedBox(height: 8),
            Text(
              message ?? visual.description,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  _ApprovalVisual _visualForStatus(
      String status, ColorScheme colorScheme) {
    switch (status) {
      case 'approved':
        return const _ApprovalVisual(
          icon: Icons.check_circle_outline,
          color: Color(0xFF2E7D32),
          title: 'Approved',
          description:
              'The landlord has approved this job. A tradie will be scheduled shortly.',
        );
      case 'rejected':
        return _ApprovalVisual(
          icon: Icons.cancel_outlined,
          color: colorScheme.error,
          title: 'Declined',
          description:
              'The landlord has declined this job. Contact the property manager for details.',
        );
      case 'pending':
      default:
        return const _ApprovalVisual(
          icon: Icons.hourglass_bottom,
          color: Color(0xFFE65100),
          title: 'Awaiting approval',
          description:
              'Waiting for the landlord to review and approve this job.',
        );
    }
  }
}

class _ApprovalVisual {
  const _ApprovalVisual({
    required this.icon,
    required this.color,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String description;
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
            Text('Could not load approval status',
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
