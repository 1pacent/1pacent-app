import 'package:flutter/material.dart';

class StartJobScreen extends StatelessWidget {
  const StartJobScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Start job')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          Text('Job intake will collect property, tenant availability, trade type, photos, urgency, and approval threshold context.'),
          SizedBox(height: 16),
          Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('Next build: wire this form to the n8n rental work-order intake webhook.'),
            ),
          ),
        ],
      ),
    );
  }
}
