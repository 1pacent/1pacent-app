import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class CustomerHomeScreen extends StatelessWidget {
  const CustomerHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('1pacent')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Maintenance, without the chasing',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          const Text(
              'Create a job, chat with Sally, track trusted tradies, approve quotes, and keep a clean audit trail.'),
          const SizedBox(height: 24),
          FilledButton(
              onPressed: () => context.go('/start-job'),
              child: const Text('Start a job')),
          const SizedBox(height: 12),
          OutlinedButton(
              onPressed: () => context.go('/sally'),
              child: const Text('Chat with Sally')),
          const SizedBox(height: 12),
          OutlinedButton(
              onPressed: () => context.go('/pm'),
              child: const Text('Property manager view')),
          const SizedBox(height: 12),
          OutlinedButton(
              onPressed: () => context.go('/tradie'),
              child: const Text('Tradie view')),
        ],
      ),
    );
  }
}
