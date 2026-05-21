import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class TradieHomeScreen extends StatelessWidget {
  const TradieHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tradie jobs')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Tradies will see nearby jobs, route-friendly schedules, quote tasks, warranty flags, and evidence capture.'),
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
