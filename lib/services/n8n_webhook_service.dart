import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config/app_config.dart';

class N8nWebhookService {
  N8nWebhookService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<Map<String, dynamic>> createWorkOrder(Map<String, dynamic> payload) {
    return _post(AppConfig.createJobWebhook, payload);
  }

  Future<Map<String, dynamic>> fetchJobStatus(Map<String, dynamic> payload) {
    return _post(AppConfig.jobStatusWebhook, payload);
  }

  Future<Map<String, dynamic>> sendSallyMessage(Map<String, dynamic> payload) {
    return _post(AppConfig.sallyChatWebhook, payload);
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> payload) async {
    final uri = Uri.parse('${AppConfig.n8nBaseUrl}$path');
    final response = await _client.post(
      uri,
      headers: const {'content-type': 'application/json'},
      body: jsonEncode(payload),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw N8nWebhookException(response.statusCode, response.body);
    }

    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) return decoded;
    return {'success': true, 'data': decoded};
  }
}

class N8nWebhookException implements Exception {
  const N8nWebhookException(this.statusCode, this.body);

  final int statusCode;
  final String body;

  @override
  String toString() => 'N8nWebhookException($statusCode): $body';
}
