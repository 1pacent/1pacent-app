import 'package:flutter/material.dart';

/// A reusable widget that displays a trust score as a circular progress
/// indicator with a percentage label.
///
/// Used in quote lists, trust passport, and anywhere a tradie's trust
/// score needs to be visualised.
class TrustScoreWidget extends StatelessWidget {
  const TrustScoreWidget({
    required this.score,
    this.size = 48,
    this.showLabel = true,
    super.key,
  });

  /// Trust score between 0.0 and 1.0.
  final double score;

  /// Diameter of the circular indicator.
  final double size;

  /// Whether to show the percentage label inside the circle.
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final percentage = (score * 100).round();
    final Color progressColor = _colorForScore(score, colorScheme);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(
            value: score,
            strokeWidth: 4,
            backgroundColor: colorScheme.outlineVariant,
            valueColor: AlwaysStoppedAnimation<Color>(progressColor),
          ),
          if (showLabel)
            Text(
              '$percentage%',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    fontSize: size * 0.2,
                  ),
            ),
        ],
      ),
    );
  }

  Color _colorForScore(double score, ColorScheme colorScheme) {
    if (score >= 0.8) return const Color(0xFF2E7D32);
    if (score >= 0.6) return const Color(0xFFE65100);
    return colorScheme.error;
  }
}
