import 'package:flutter/material.dart';

import '../../models/tradie.dart';
import '../../services/n8n_webhook_service.dart';

/// Displays the full Trust Passport for a tradie, including licence,
/// insurance, reviews, completed jobs, warranty terms, evidence quality,
/// and tenant feedback score.
class TradieTrustPassportScreen extends StatefulWidget {
  const TradieTrustPassportScreen({required this.tradieId, super.key});

  final String tradieId;

  @override
  State<TradieTrustPassportScreen> createState() =>
      _TradieTrustPassportScreenState();
}

class _TradieTrustPassportScreenState
    extends State<TradieTrustPassportScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<Tradie> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetchPassport();
  }

  Future<Tradie> _fetchPassport() async {
    final response = await _service.fetchTrustPassport(widget.tradieId);
    final tradieData = response['tradie'] as Map<String, dynamic>? ?? response;
    return Tradie.fromJson(tradieData);
  }

  Future<void> _refresh() async {
    setState(() {
      _future = _fetchPassport();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Trust passport'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refresh,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: FutureBuilder<Tradie>(
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

          final tradie = snapshot.data;
          if (tradie == null) {
            return const Center(child: Text('No tradie data available.'));
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _HeaderSection(tradie: tradie),
              const SizedBox(height: 16),
              _LicenceSection(tradie: tradie),
              const SizedBox(height: 12),
              _InsuranceSection(tradie: tradie),
              const SizedBox(height: 12),
              _StatsSection(tradie: tradie),
              const SizedBox(height: 12),
              _WarrantySection(tradie: tradie),
            ],
          );
        },
      ),
    );
  }
}

class _HeaderSection extends StatelessWidget {
  const _HeaderSection({required this.tradie});

  final Tradie tradie;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: Theme.of(context).colorScheme.primaryContainer,
              child: Text(
                tradie.displayName.isNotEmpty
                    ? tradie.displayName[0].toUpperCase()
                    : '?',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color:
                          Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tradie.displayName,
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: tradie.tradeTypes
                        .map((t) => Chip(
                              label: Text(t,
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
          ],
        ),
      ),
    );
  }
}

class _LicenceSection extends StatelessWidget {
  const _LicenceSection({required this.tradie});

  final Tradie tradie;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.badge_outlined, size: 20),
                const SizedBox(width: 8),
                Text('Licence',
                    style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              tradie.licenceNumber ?? 'Not provided',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _InsuranceSection extends StatelessWidget {
  const _InsuranceSection({required this.tradie});

  final Tradie tradie;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.shield_outlined, size: 20),
                const SizedBox(width: 8),
                Text('Insurance',
                    style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 8),
            if (tradie.insuranceProvider != null) ...[
              Text(tradie.insuranceProvider!,
                  style: Theme.of(context).textTheme.bodyMedium),
              if (tradie.insuranceExpiry != null)
                Text('Expires: ${tradie.insuranceExpiry}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ] else
              Text('Not provided',
                  style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}

class _StatsSection extends StatelessWidget {
  const _StatsSection({required this.tradie});

  final Tradie tradie;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Performance',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            if (tradie.completedJobs != null)
              _StatRow(
                icon: Icons.check_circle_outline,
                label: 'Completed jobs',
                value: '${tradie.completedJobs}',
              ),
            if (tradie.averageRating != null)
              _StatRow(
                icon: Icons.star_outline,
                label: 'Average rating',
                value: '${tradie.averageRating!.toStringAsFixed(1)} / 5',
              ),
            if (tradie.evidenceQualityScore != null)
              _StatRow(
                icon: Icons.photo_camera_back_outlined,
                label: 'Evidence quality',
                value:
                    '${(tradie.evidenceQualityScore! * 100).toStringAsFixed(0)}%',
              ),
            if (tradie.tenantFeedbackScore != null)
              _StatRow(
                icon: Icons.thumb_up_outlined,
                label: 'Tenant feedback',
                value:
                    '${(tradie.tenantFeedbackScore! * 100).toStringAsFixed(0)}%',
              ),
          ],
        ),
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label,
                style: Theme.of(context).textTheme.bodyMedium),
          ),
          Text(value,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  )),
        ],
      ),
    );
  }
}

class _WarrantySection extends StatelessWidget {
  const _WarrantySection({required this.tradie});

  final Tradie tradie;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.verified_outlined, size: 20),
                const SizedBox(width: 8),
                Text('Warranty terms',
                    style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              tradie.warrantyTerms ?? 'Standard warranty applies.',
              style: Theme.of(context).textTheme.bodyMedium,
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
            Text('Could not load trust passport',
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
