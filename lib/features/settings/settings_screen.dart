import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _pushEnabled = true;
  bool _emailEnabled = true;
  bool _smsEnabled = false;
  bool _darkMode = false;

  void _signOut() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(context).pop();
              context.go('/login');
            },
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          const SizedBox(height: 8),
          // Profile section
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('Profile',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: Theme.of(context).colorScheme.primary)),
          ),
          const SizedBox(height: 8),
          const _ProfileCard(),
          const SizedBox(height: 24),
          // Notification preferences
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('Notifications',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: Theme.of(context).colorScheme.primary)),
          ),
          const SizedBox(height: 8),
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                SwitchListTile(
                  title: const Text('Push notifications'),
                  subtitle: const Text('Job updates and alerts'),
                  value: _pushEnabled,
                  onChanged: (v) => setState(() => _pushEnabled = v),
                  secondary: const Icon(Icons.notifications_outlined),
                ),
                const Divider(height: 1, indent: 56),
                SwitchListTile(
                  title: const Text('Email notifications'),
                  subtitle: const Text('Weekly summaries and quotes'),
                  value: _emailEnabled,
                  onChanged: (v) => setState(() => _emailEnabled = v),
                  secondary: const Icon(Icons.email_outlined),
                ),
                const Divider(height: 1, indent: 56),
                SwitchListTile(
                  title: const Text('SMS notifications'),
                  subtitle: const Text('Urgent job alerts only'),
                  value: _smsEnabled,
                  onChanged: (v) => setState(() => _smsEnabled = v),
                  secondary: const Icon(Icons.sms_outlined),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Appearance
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('Appearance',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: Theme.of(context).colorScheme.primary)),
          ),
          const SizedBox(height: 8),
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            child: SwitchListTile(
              title: const Text('Dark mode'),
              subtitle: const Text('Use dark theme'),
              value: _darkMode,
              onChanged: (v) => setState(() => _darkMode = v),
              secondary: const Icon(Icons.dark_mode_outlined),
            ),
          ),
          const SizedBox(height: 24),
          // About
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('About',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: Theme.of(context).colorScheme.primary)),
          ),
          const SizedBox(height: 8),
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.info_outline),
                  title: const Text('App version'),
                  subtitle: const Text('0.1.0+1'),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.description_outlined),
                  title: const Text('Terms of service'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {},
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.privacy_tip_outlined),
                  title: const Text('Privacy policy'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {},
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Sign out
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton.icon(
              onPressed: _signOut,
              icon: const Icon(Icons.logout),
              label: const Text('Sign out'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Theme.of(context).colorScheme.error,
                side: BorderSide(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: Theme.of(context).colorScheme.primaryContainer,
              child: Icon(Icons.person_outline,
                  size: 28,
                  color: Theme.of(context).colorScheme.primary),
            ),
            const SizedBox(width: 16),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Demo User',
                      style: TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 16)),
                  SizedBox(height: 2),
                  Text('demo@1pacent.com'),
                  SizedBox(height: 2),
                  Text('0400 000 000'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
