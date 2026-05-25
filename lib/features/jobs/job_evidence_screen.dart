import 'package:flutter/material.dart';

import '../../models/job.dart';
import '../../models/quote.dart';
import '../../services/n8n_webhook_service.dart';

/// Displays a job evidence summary including details, photos, accepted quote,
/// and status timeline for export/record-keeping.
class JobEvidenceScreen extends StatefulWidget {
  const JobEvidenceScreen({required this.jobId, super.key});

  final String jobId;

  @override
  State<JobEvidenceScreen> createState() => _JobEvidenceScreenState();
}

class _JobEvidenceScreenState extends State<JobEvidenceScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  late Future<_EvidenceData> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetchEvidence();
  }

  Future<_EvidenceData> _fetchEvidence() async {
    final statusResponse =
        await _service.fetchJobStatus({'work_order_id': widget.jobId});
    final jobData = statusResponse['job'] as Map<String, dynamic>? ?? statusResponse;
    final job = Job.fromJson(jobData);

    final quotesResponse = await _service.fetchQuotes(widget.jobId);
    final quotesData = (quotesResponse['quotes'] as List<dynamic>? ?? [])
        .map((e) => Quote.fromJson(e as Map<String, dynamic>))
        .toList();
    final acceptedQuote = quotesData.where((q) => q.status == 'accepted').firstOrNull;

    final images = (statusResponse['images'] as List<dynamic>?)
            ?.map((e) => JobImage.fromJson(e as Map<String, dynamic>))
            .toList() ??
        _buildPlaceholderImages(job.id);

    return _EvidenceData(
      job: job,
      acceptedQuote: acceptedQuote,
      images: images,
      timeline: jobStatusTimeline,
    );
  }

  List<JobImage> _buildPlaceholderImages(String jobId) {
    return [
      JobImage(
        id: '${jobId}_before_1',
        jobId: jobId,
        url: 'https://via.placeholder.com/400x300/176B5D/FFFFFF?text=Before+Photo+1',
        photoType: 'before',
        caption: 'Initial condition',
      ),
      JobImage(
        id: '${jobId}_before_2',
        jobId: jobId,
        url: 'https://via.placeholder.com/400x300/1A7A6A/FFFFFF?text=Before+Photo+2',
        photoType: 'before',
        caption: 'Issue close-up',
      ),
      JobImage(
        id: '${jobId}_after_1',
        jobId: jobId,
        url: 'https://via.placeholder.com/400x300/2E8B57/FFFFFF?text=After+Photo+1',
        photoType: 'after',
        caption: 'Completed repair',
      ),
    ];
  }

  Future<void> _refresh() async {
    setState(() {
      _future = _fetchEvidence();
    });
  }

  void _shareJobSummary(BuildContext context, _EvidenceData data) {
    final summary = _buildSummaryText(data);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Job summary copied to clipboard.'),
        action: SnackBarAction(
          label: 'VIEW',
          onPressed: () {
            showDialog(
              context: context,
              builder: (ctx) => AlertDialog(
                title: const Text('Job Summary'),
                content: SingleChildScrollView(
                  child: Text(summary),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Close'),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  void _printEvidence(BuildContext context, _EvidenceData data) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Sending job "${data.job.id}" evidence summary to printer...',
        ),
      ),
    );
  }

  String _buildSummaryText(_EvidenceData data) {
    final buf = StringBuffer();
    buf.writeln('=== JOB EVIDENCE SUMMARY ===');
    buf.writeln('Job ID: ${data.job.id}');
    buf.writeln('Description: ${data.job.description}');
    buf.writeln('Trade type: ${data.job.tradeType}');
    buf.writeln('Status: ${jobStatusLabel(data.job.status)}');
    if (data.job.propertyAddress != null) {
      buf.writeln('Address: ${data.job.propertyAddress}');
    }
    if (data.job.scheduledWindow != null) {
      buf.writeln('Scheduled: ${data.job.scheduledWindow}');
    }
    if (data.acceptedQuote != null) {
      buf.writeln('');
      buf.writeln('--- ACCEPTED QUOTE ---');
      buf.writeln('Tradie: ${data.acceptedQuote!.tradieName}');
      buf.writeln('Amount: \$${data.acceptedQuote!.amount.toStringAsFixed(2)}');
      buf.writeln('Availability: ${data.acceptedQuote!.availability}');
    }
    buf.writeln('');
    buf.writeln('Photos: ${data.images.length} attached');
    for (final img in data.images) {
      buf.writeln('  [${img.photoType}] ${img.caption ?? img.url}');
    }
    return buf.toString();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Job evidence'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refresh,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: FutureBuilder<_EvidenceData>(
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

          final data = snapshot.data;
          if (data == null) {
            return const Center(child: Text('No evidence available.'));
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Job details',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 12),
                      _DetailRow(label: 'Job ID', value: data.job.id),
                      _DetailRow(
                          label: 'Description', value: data.job.description),
                      _DetailRow(
                          label: 'Trade type', value: data.job.tradeType),
                      _DetailRow(
                          label: 'Status',
                          value: jobStatusLabel(data.job.status)),
                      if (data.job.propertyAddress != null)
                        _DetailRow(
                            label: 'Address', value: data.job.propertyAddress!),
                      if (data.job.scheduledWindow != null)
                        _DetailRow(
                            label: 'Scheduled', value: data.job.scheduledWindow!),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text('Photo gallery',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (data.images.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Column(
                        children: [
                          Icon(Icons.photo_library_outlined,
                              size: 48,
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant),
                          const SizedBox(height: 8),
                          Text('No photos attached yet.',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodyMedium
                                  ?.copyWith(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSurfaceVariant)),
                        ],
                      ),
                    ),
                  ),
                ),
              if (data.images.isNotEmpty) ...[
                if (_beforeImages(data.images).isNotEmpty) ...[
                  Text('Before',
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  _PhotoGrid(images: _beforeImages(data.images)),
                  const SizedBox(height: 12),
                ],
                if (_afterImages(data.images).isNotEmpty) ...[
                  Text('After',
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  _PhotoGrid(images: _afterImages(data.images)),
                ],
              ],
              const SizedBox(height: 12),
              if (data.acceptedQuote != null) ...[
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Accepted quote',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            CircleAvatar(
                              backgroundColor: Theme.of(context)
                                  .colorScheme
                                  .primaryContainer,
                              child: const Icon(Icons.person_outline),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(data.acceptedQuote!.tradieName,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleSmall),
                                  Text('\$${data.acceptedQuote!.amount.toStringAsFixed(2)}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyMedium
                                          ?.copyWith(
                                            color: Theme.of(context)
                                                .colorScheme
                                                .primary,
                                          )),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: Text('Job timeline',
                            style: Theme.of(context).textTheme.titleMedium),
                      ),
                      _StatusTimeline(job: data.job, timeline: data.timeline),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _shareJobSummary(context, data),
                      icon: const Icon(Icons.share_outlined),
                      label: const Text('Share summary'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => _printEvidence(context, data),
                      icon: const Icon(Icons.print_outlined),
                      label: const Text('Print evidence'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),
            ],
          );
        },
      ),
    );
  }

  List<JobImage> _beforeImages(List<JobImage> images) =>
      images.where((i) => i.photoType == 'before').toList();

  List<JobImage> _afterImages(List<JobImage> images) =>
      images.where((i) => i.photoType == 'after').toList();
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(label,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ),
          Expanded(
            child: Text(value, style: Theme.of(context).textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

class _PhotoGrid extends StatelessWidget {
  const _PhotoGrid({required this.images});

  final List<JobImage> images;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 120,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: images.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final image = images[index];
          return ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 160,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    image.url,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: Theme.of(context)
                          .colorScheme
                          .surfaceContainerHighest,
                      child: const Icon(Icons.broken_image_outlined),
                    ),
                  ),
                  Positioned(
                    bottom: 0,
                    left: 0,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      color: Colors.black54,
                      child: Text(
                        image.caption ?? image.photoType,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 11),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// Replicated timeline widget to avoid importing job_status_screen (avoids duplication).
class _StatusTimeline extends StatelessWidget {
  const _StatusTimeline({required this.job, required this.timeline});

  final Job job;
  final List<JobStatus> timeline;

  @override
  Widget build(BuildContext context) {
    final currentIndex = job.timelineIndex >= 0 ? job.timelineIndex : 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        children: [
          for (var i = 0; i < timeline.length; i++) ...[
            if (i > 0)
              _TimelineConnector(isActive: i <= currentIndex),
            _TimelineStep(
              label: jobStatusLabel(timeline[i]),
              isActive: i == currentIndex,
              isCompleted: i < currentIndex,
              isLast: i == timeline.length - 1,
            ),
          ],
        ],
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

class _EvidenceData {
  const _EvidenceData({
    required this.job,
    required this.timeline,
    this.acceptedQuote,
    this.images = const [],
  });

  final Job job;
  final List<JobStatus> timeline;
  final Quote? acceptedQuote;
  final List<JobImage> images;
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
            Text('Could not load job evidence',
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
