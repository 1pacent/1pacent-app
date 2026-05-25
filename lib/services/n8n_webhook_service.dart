import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config/app_config.dart';

class N8nWebhookService {
  N8nWebhookService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  /// Creates a new rental work order via n8n.
  Future<Map<String, dynamic>> createWorkOrder(Map<String, dynamic> payload) {
    return _post(AppConfig.createJobWebhook, payload);
  }

  /// Fetches the current status of a job from n8n.
  Future<Map<String, dynamic>> fetchJobStatus(Map<String, dynamic> payload) {
    return _post(AppConfig.jobStatusWebhook, payload);
  }

  /// Sends a message to Sally via n8n.
  Future<Map<String, dynamic>> sendSallyMessage(Map<String, dynamic> payload) {
    return _post(AppConfig.sallyChatWebhook, payload);
  }

  /// Fetches matched quotes for a job.
  ///
  /// [jobId] is the work order identifier.
  /// Returns a map with a 'quotes' list.
  Future<Map<String, dynamic>> fetchQuotes(String jobId) {
    return _post(AppConfig.quotesWebhook, {'job_id': jobId});
  }

  /// Fetches landlord approval state for a job.
  ///
  /// [jobId] is the work order identifier.
  /// Returns a map with 'status' (pending/approved/rejected) and optional 'message'.
  Future<Map<String, dynamic>> fetchLandlordApproval(String jobId) {
    return _post(AppConfig.landlordApprovalWebhook, {'job_id': jobId});
  }

  /// Submits a warranty review request to Sparky via n8n.
  ///
  /// [payload] should contain job_id and optional flag details.
  Future<Map<String, dynamic>> submitWarrantyReview(Map<String, dynamic> payload) {
    return _post(AppConfig.warrantyReviewWebhook, payload);
  }

  /// Fetches the trust passport data for a tradie.
  ///
  /// [tradieId] is the tradie identifier.
  /// Returns licence, insurance, reviews, completed jobs, warranty terms,
  /// evidence quality, and tenant feedback score.
  Future<Map<String, dynamic>> fetchTrustPassport(String tradieId) {
    return _post(AppConfig.trustPassportWebhook, {'tradie_id': tradieId});
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
