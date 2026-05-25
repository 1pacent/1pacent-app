import 'package:flutter/material.dart';

import '../../services/n8n_webhook_service.dart';

/// Allows a tenant to submit a star rating and text review for a completed job.
class ReviewRequestScreen extends StatefulWidget {
  const ReviewRequestScreen({
    required this.jobId,
    required this.tradieId,
    required this.tradieName,
    super.key,
  });

  final String jobId;
  final String tradieId;
  final String tradieName;

  @override
  State<ReviewRequestScreen> createState() => _ReviewRequestScreenState();
}

class _ReviewRequestScreenState extends State<ReviewRequestScreen> {
  final N8nWebhookService _service = N8nWebhookService();
  final TextEditingController _reviewController = TextEditingController();
  int _rating = 0;
  bool _submitting = false;
  bool _submitted = false;
  String? _error;

  static const int _maxChars = 500;

  @override
  void dispose() {
    _reviewController.dispose();
    super.dispose();
  }

  Future<void> _submitReview() async {
    if (_rating == 0) {
      setState(() => _error = 'Please select a star rating');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await _service.submitReview(
        jobId: widget.jobId,
        tradieId: widget.tradieId,
        rating: _rating,
        review: _reviewController.text.trim(),
      );
      setState(() {
        _submitting = false;
        _submitted = true;
      });
    } catch (e) {
      setState(() {
        _submitting = false;
        _error = 'Failed to submit review. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_submitted) {
      return Scaffold(
        appBar: AppBar(title: const Text('Review Submitted')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.check_circle, color: Colors.green.shade600, size: 72),
                const SizedBox(height: 16),
                Text(
                  'Thank you!',
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  'Your review helps other tenants and keeps tradies accountable.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge,
                ),
                const SizedBox(height: 32),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Done'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Leave a Review')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'How was ${widget.tradieName}\'s work?',
              style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 24),
            // Star rating
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(5, (index) {
                  final star = index + 1;
                  return IconButton(
                    iconSize: 48,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    onPressed: () => setState(() => _rating = star),
                    icon: Icon(
                      star <= _rating ? Icons.star : Icons.star_border,
                      color: star <= _rating ? Colors.amber.shade700 : Colors.grey.shade400,
                    ),
                  );
                }),
              ),
            ),
            if (_rating > 0) ...[
              const SizedBox(height: 8),
              Center(
                child: Text(
                  _ratingLabel(_rating),
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 32),
            // Review text
            TextField(
              controller: _reviewController,
              maxLength: _maxChars,
              maxLines: 5,
              decoration: InputDecoration(
                labelText: 'Write your review',
                hintText: 'Share details about the quality of work, communication, timeliness...',
                border: const OutlineInputBorder(),
                counterText: '${_reviewController.text.length}/$_maxChars',
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 24),
            // Error
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              ),
            // Submit
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _submitting ? null : _submitReview,
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send),
                label: Text(_submitting ? 'Submitting...' : 'Submit Review'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _ratingLabel(int rating) {
    switch (rating) {
      case 1:
        return 'Poor';
      case 2:
        return 'Fair';
      case 3:
        return 'Good';
      case 4:
        return 'Very Good';
      case 5:
        return 'Excellent';
      default:
        return '';
    }
  }
}
