import 'package:flutter/material.dart';

class TradieTrustPassportScreen extends StatelessWidget {
  const TradieTrustPassportScreen({required this.tradieId, super.key});

  final String tradieId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Trust passport')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Tradie $tradieId',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                  'Licence, insurance, reviews, completed jobs, warranty terms, evidence quality, and tenant feedback score.'),
            ),
          ),
        ],
      ),
    );
  }
}
