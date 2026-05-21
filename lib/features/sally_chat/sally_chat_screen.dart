import 'package:flutter/material.dart';

class SallyChatScreen extends StatelessWidget {
  const SallyChatScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      appBar: AppBar(title: Text('Sally')),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Text('Sally will support app chat first, then in-app voice via ElevenLabs once the core work-order loop is stable.'),
      ),
    );
  }
}
