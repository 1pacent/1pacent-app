import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config/app_config.dart';
import '../models/tradie_quote_submission.dart';

class N8nWebhookService {
  N8nWebhookService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<Map<String, dynamic>> createWorkOrder(Map<String, dynamic> payload) {
    return _post(AppConfig.createJobWebhook, payload);
  }

  Future<Map<String, dynamic>> fetchJobStatus(
    String reference, {
    String referenceKey = 'work_order_id',
  }) {
    return _get(AppConfig.jobStatusWebhook, {referenceKey: reference});
  }

  Future<Map<String, dynamic>> sendSallyMessage(Map<String, dynamic> payload) {
    return _post(AppConfig.sallyChatWebhook, payload);
  }

  Future<Map<String, dynamic>> fetchSallyConversationToken(
      Map<String, dynamic> payload) {
    return _post(AppConfig.sallyConversationTokenWebhook, payload);
  }

  Future<Map<String, dynamic>> fetchOpsConsoleSummary({
    int limit = 10,
    String tenantId = 'TENANT-001',
  }) {
    return _get(AppConfig.opsConsoleSummaryWebhook, {
      'limit': '$limit',
      'tenant_id': tenantId,
    });
  }

  Future<Map<String, dynamic>> fetchQuoteOptions(String workOrderId) {
    return _post(
      AppConfig.rentalQuoteOptionsWebhook,
      {'work_order_id': workOrderId},
    );
  }

  Future<Map<String, dynamic>> approveQuoteOption({
    required String approvalId,
    required String optionId,
  }) {
    return _post(AppConfig.rentalQuoteOptionApproveWebhook, {
      'approval_id': approvalId,
      'option_id': optionId,
      'approved_by': 'app_user',
    });
  }

  Future<Map<String, dynamic>> submitTradieQuote(
      TradieQuoteSubmission submission) {
    return _post(AppConfig.rentalQuoteOptionsWebhook, submission.toJson());
  }

  Future<Map<String, dynamic>> _post(
      String path, Map<String, dynamic> payload) async {
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

  Future<Map<String, dynamic>> _get(
      String path, Map<String, String> queryParameters) async {
    final uri =
        Uri.parse('${AppConfig.n8nBaseUrl}$path').replace(queryParameters: {
      for (final entry in queryParameters.entries)
        if (entry.value.trim().isNotEmpty) entry.key: entry.value.trim(),
    });
    final response = await _client.get(
      uri,
      headers: const {'accept': 'application/json'},
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw N8nWebhookException(response.statusCode, response.body);
    }

    if (response.body.trim().isEmpty) {
      return {'success': true};
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
