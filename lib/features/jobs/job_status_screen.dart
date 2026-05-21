import 'package:flutter/material.dart';

class JobStatusScreen extends StatelessWidget {
  const JobStatusScreen({required this.jobId, super.key});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Job status')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Job $jobId', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('Requested -> Matched -> Quote approved -> On the way -> Completed -> Invoice sent'),
            ),
          ),
        ],
      ),
    );
  }
}
