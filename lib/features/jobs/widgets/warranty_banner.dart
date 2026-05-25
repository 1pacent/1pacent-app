import 'package:flutter/material.dart';

/// A banner that displays warranty/repeat-issue warnings flagged by
/// Wally or Sparky during n8n workflow processing.
class WarrantyBanner extends StatelessWidget {
  const WarrantyBanner({
    required this.message,
    this.onTap,
    super.key,
  });

  final String message;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      color: const Color(0xFFFFF3E0),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(Icons.warning_amber_rounded,
                  color: colorScheme.error),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Warranty / Repeat Issue',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              color: colorScheme.error,
                              fontWeight: FontWeight.w600,
                            )),
                    const SizedBox(height: 4),
                    Text(message,
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              if (onTap != null)
                const Icon(Icons.chevron_right, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
