import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../shared/contextual_job_view.dart';

class TradieHomeScreen extends StatelessWidget {
  const TradieHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Mock n8n state for now; in a real app this would be injected globally.
    final mockN8nState = {
      'property_type': 'Managed',
      'bill_to_status': 'paid',
      'quote_variance': {
        'original_quote': 500.0,
        'actual_spend': 550.0,
      },
    };

    return Scaffold(
      appBar: AppBar(title: const Text('Tradie Hub')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ContextualJobView(n8nState: mockN8nState),
          const SizedBox(height: 16),
          const Text('Tradie Actions'),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: () => context.go('/tradie/demo/trust'),
            child: const Text('View trust passport'),
          ),
        ],
      ),
    );
  }
}
