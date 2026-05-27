import 'package:flutter/material.dart';

/// Factory to render UI dynamically based on n8n state
class ContextualJobView extends StatelessWidget {
  final Map<String, dynamic> n8nState;

  const ContextualJobView({super.key, required this.n8nState});

  @override
  Widget build(BuildContext context) {
    // 1. Identify property type
    final propertyType = n8nState['property_type'] ?? 'Unknown';
    // 2. Surface 'Bill-to' status
    final billToStatus = n8nState['bill_to_status'] ?? 'pending';

    return Column(
      children: [
        ListTile(
          title: Text("Property Type: $propertyType"),
          subtitle: Text("Payment Status: ${billToStatus.toUpperCase()}"),
        ),
        if (n8nState.containsKey('quote_variance'))
          _buildQuoteDeltaOverlay(n8nState['quote_variance']),
      ],
    );
  }

  Widget _buildQuoteDeltaOverlay(Map<String, dynamic> varianceData) {
    final original = varianceData['original_quote'] ?? 0.0;
    final actual = varianceData['actual_spend'] ?? 0.0;
    final delta = (actual - original).abs();

    return Card(
      color: actual > original ? Colors.red[50] : Colors.green[50],
      child: Padding(
        padding: const EdgeInsets.all(8.0),
        child: Column(
          children: [
            const Text("Quote-Delta Engine", style: TextStyle(fontWeight: FontWeight.bold)),
            Text("Variance: \$${delta.toStringAsFixed(2)}"),
          ],
        ),
      ),
    );
  }
}
