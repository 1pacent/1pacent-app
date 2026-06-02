import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/app_session.dart';

class CustomerHomeScreen extends StatelessWidget {
  const CustomerHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = appSession.user;
    if (user == null) {
      return const LoginScreenRedirect();
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('1pacent'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout_outlined),
            onPressed: () {
              appSession.signOut();
              context.go('/login');
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(_titleFor(user),
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(
            '${user.personaLabel} - ${user.email}',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 20),
          _PrimaryPanel(user: user),
          const SizedBox(height: 16),
          ..._actionsFor(context, user),
        ],
      ),
    );
  }

  String _titleFor(AppUser user) {
    switch (user.persona) {
      case UserPersona.tenant:
        return 'Your rental maintenance';
      case UserPersona.ownerOccupier:
        return 'Your home maintenance';
      case UserPersona.landlord:
        return 'Approvals waiting for you';
      case UserPersona.propertyManager:
        return 'Portfolio maintenance queue';
      case UserPersona.tradie:
        return 'Tradie workbench';
      case UserPersona.publicCustomer:
        return 'Request a trusted tradie';
    }
  }

  List<Widget> _actionsFor(BuildContext context, AppUser user) {
    final actions = <Widget>[];

    if (user.canRequestMaintenance) {
      actions.add(_ActionTile(
        icon: Icons.add_home_work_outlined,
        title: user.persona == UserPersona.tenant
            ? 'Report a rental issue'
            : 'Request a tradie',
        subtitle: user.persona == UserPersona.tenant
            ? 'Sally captures the issue, checks warranty, and coordinates approval.'
            : 'Sally captures your issue and matches quote options to your availability.',
        onTap: () => context.go('/start-job'),
      ));
      actions.add(_ActionTile(
        icon: Icons.chat_outlined,
        title: 'Chat with Sally',
        subtitle: 'Continue intake or ask for an update.',
        onTap: () => context.go('/sally'),
      ));
    }

    if (user.canApproveQuotes) {
      actions.add(_ActionTile(
        icon: Icons.fact_check_outlined,
        title: user.persona == UserPersona.landlord
            ? 'Review landlord approvals'
            : 'Review owner approvals',
        subtitle: 'Open a quote approval link from email or a job status page.',
        onTap: () =>
            context.go('/job-status?work_order_id=WO-UAT-RENTAL-2026060201'),
      ));
    }

    if (user.canManagePortfolio) {
      actions.add(_ActionTile(
        icon: Icons.dashboard_outlined,
        title: 'Open operations queue',
        subtitle: 'Review recent leads, jobs, payments, and exceptions.',
        onTap: () => context.go('/pm'),
      ));
    }

    if (user.canSubmitTradieQuotes) {
      actions.add(_ActionTile(
        icon: Icons.request_quote_outlined,
        title: 'Submit a quote',
        subtitle: 'Price a work order and offer a service window.',
        onTap: () => context.go('/tradie/jobs/WO-DEMO-001/quote'),
      ));
      actions.add(_ActionTile(
        icon: Icons.shield_outlined,
        title: 'Trust passport',
        subtitle: 'Review licence, insurance, warranty, and evidence profile.',
        onTap: () => context.go('/tradie/TRD-PLUMBING-001/trust'),
      ));
    }

    return actions
        .expand((widget) => [widget, const SizedBox(height: 8)])
        .toList();
  }
}

class _PrimaryPanel extends StatelessWidget {
  const _PrimaryPanel({required this.user});

  final AppUser user;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(_icon, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_heading,
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(_body),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData get _icon {
    switch (user.persona) {
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

  String get _heading {
    switch (user.persona) {
      case UserPersona.tenant:
        return 'Rental tenant mode';
      case UserPersona.ownerOccupier:
        return 'Owner occupied mode';
      case UserPersona.landlord:
        return 'Landlord approval mode';
      case UserPersona.propertyManager:
        return 'Property manager mode';
      case UserPersona.tradie:
        return 'Tradie mode';
      case UserPersona.publicCustomer:
        return 'Public customer mode';
    }
  }

  String get _body {
    switch (user.persona) {
      case UserPersona.tenant:
        return 'Issues are raised for a rental property. Quote choices go to the landlord after warranty and availability checks.';
      case UserPersona.ownerOccupier:
        return 'You are both requester and approver. Quote options are matched to your availability.';
      case UserPersona.landlord:
        return 'You approve quote options for rental maintenance before scheduling proceeds.';
      case UserPersona.propertyManager:
        return 'You monitor the operational queue and exceptions across managed properties.';
      case UserPersona.tradie:
        return 'You respond to work orders, provide quotes, and maintain trust evidence.';
      case UserPersona.publicCustomer:
        return 'Sally captures your request and creates an owner-style maintenance workflow.';
    }
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class LoginScreenRedirect extends StatelessWidget {
  const LoginScreenRedirect({super.key});

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) => context.go('/login'));
    return const Scaffold(body: SizedBox.shrink());
  }
}
