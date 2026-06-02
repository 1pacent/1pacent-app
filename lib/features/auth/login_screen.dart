import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/app_session.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('1pacent')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Sign in', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(
            'UAT persona selector. Real auth will map the signed-in account to one of these roles.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 16),
          for (final user in demoUsers) ...[
            Card(
              child: ListTile(
                leading: Icon(_personaIcon(user.persona)),
                title: Text(user.name),
                subtitle: Text('${user.personaLabel} - ${user.email}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  appSession.signIn(user);
                  context.go('/');
                },
              ),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }

  IconData _personaIcon(UserPersona persona) {
    switch (persona) {
      case UserPersona.tenant:
        return Icons.key_outlined;
      case UserPersona.ownerOccupier:
        return Icons.home_outlined;
      case UserPersona.landlord:
        return Icons.apartment_outlined;
      case UserPersona.propertyManager:
        return Icons.dashboard_outlined;
      case UserPersona.tradie:
        return Icons.handyman_outlined;
      case UserPersona.publicCustomer:
        return Icons.person_outline;
    }
  }
}
