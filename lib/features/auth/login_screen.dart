import 'package:flutter/material.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      appBar: AppBar(title: Text('Sign in')),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Text('Authentication will support customers, tenants, landlords, property managers, and tradies.'),
      ),
    );
  }
}
