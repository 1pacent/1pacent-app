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

  /// Accepts a quote for a job.
  ///
  /// [quoteId] The quote identifier.
  /// [jobId] The work order identifier.
  /// Returns confirmation with updated quote status.
  Future<Map<String, dynamic>> acceptQuote({
    required String quoteId,
    required String jobId,
  }) {
    return _post(AppConfig.acceptQuoteWebhook, {
      'quote_id': quoteId,
      'job_id': jobId,
    });
  }

  /// Declines a quote with a reason.
  ///
  /// [quoteId] The quote identifier.
  /// [jobId] The work order identifier.
  /// [reason] The reason for declining.
  /// Returns confirmation with updated quote status.
  Future<Map<String, dynamic>> declineQuote({
    required String quoteId,
    required String jobId,
    required String reason,
  }) {
    return _post(AppConfig.declineQuoteWebhook, {
      'quote_id': quoteId,
      'job_id': jobId,
      'reason': reason,
    });
  }

  /// Initiates payment for an invoice.
  ///
  /// [jobId] The work order identifier.
  /// [invoiceId] The invoice identifier.
  /// [amount] The payment amount.
  /// Returns payment session details.
  Future<Map<String, dynamic>> initiatePayment({
    required String jobId,
    required String invoiceId,
    required double amount,
  }) {
    return _post(AppConfig.initiatePaymentWebhook, {
      'job_id': jobId,
      'invoice_id': invoiceId,
      'amount': amount,
    });
  }

  /// Submits a review for a completed job.
  ///
  /// [jobId] The work order identifier.
  /// [tradieId] The tradie identifier.
  /// [rating] Star rating 1-5.
  /// [review] Text review content.
  /// [photoUrls] Optional attached photo URLs.
  /// Returns confirmation with review ID.
  Future<Map<String, dynamic>> submitReview({
    required String jobId,
    required String tradieId,
    required int rating,
    required String review,
    List<String>? photoUrls,
  }) {
    return _post(AppConfig.submitReviewWebhook, {
      'job_id': jobId,
      'tradie_id': tradieId,
      'rating': rating,
      'review': review,
      if (photoUrls != null) 'photo_urls': photoUrls,
    });
  }

  /// Updates the tenant's availability for a job.
  ///
  /// [jobId] The work order identifier.
  /// [slots] List of availability slots with date and period.
  /// Returns confirmation with saved slots count.
  Future<Map<String, dynamic>> updateAvailability({
    required String jobId,
    required List<Map<String, dynamic>> slots,
  }) {
    return _post(AppConfig.updateAvailabilityWebhook, {
      'job_id': jobId,
      'slots': slots,
    });
  }

  /// Fetches jobs available for a tradie to quote on.
  ///
  /// [params] Optional filters (distance, trade_type, etc.).
  /// Returns map with 'jobs' list.
  Future<Map<String, dynamic>> fetchTradieJobs(Map<String, dynamic> params) {
    return _post(AppConfig.tradieJobsWebhook, params);
  }

  /// Submits a quote for a job.
  ///
  /// [jobId] The work order identifier.
  /// [lineItems] List of line items with description, qty, rate, total.
  /// [total] The total quote amount.
  /// [availability] List of availability strings.
  /// [assumptions] Notes and assumptions.
  /// Returns quote confirmation with reference number.
  Future<Map<String, dynamic>> submitQuote({
    required String jobId,
    required List<Map<String, dynamic>> lineItems,
    required double total,
    required List<String> availability,
    String? assumptions,
  }) {
    return _post(AppConfig.submitQuoteWebhook, {
      'job_id': jobId,
      'line_items': lineItems,
      'total': total,
      'availability': availability,
      if (assumptions != null && assumptions.isNotEmpty)
        'assumptions': assumptions,
    });
  }

  /// Fetches notifications for the current user.
  ///
  /// [params] Optional filters (limit, offset, etc.).
  /// Returns map with 'notifications' list.
  Future<Map<String, dynamic>> fetchNotifications(Map<String, dynamic> params) {
    return _post(AppConfig.fetchNotificationsWebhook, params);
  }

  /// Marks all notifications as read.
  ///
  /// [params] Optional filters (notification IDs, etc.).
  /// Returns confirmation.
  Future<Map<String, dynamic>> markNotificationsRead(Map<String, dynamic> params) {
    return _post(AppConfig.markNotificationsReadWebhook, params);
  }

  /// Authenticates a user and returns tokens.
  Future<Map<String, dynamic>> authLogin({
    required String email,
    required String password,
  }) {
    return _post(AppConfig.authLoginWebhook, {
      'email': email,
      'password': password,
    });
  }

  /// Registers a new user account.
  Future<Map<String, dynamic>> authRegister({
    required String email,
    required String password,
    required String name,
  }) {
    return _post(AppConfig.authRegisterWebhook, {
      'email': email,
      'password': password,
      'name': name,
    });
  }

  /// Refreshes an expired access token.
  Future<Map<String, dynamic>> authRefresh({required String refreshToken}) {
    return _post(AppConfig.authRefreshWebhook, {
      'refresh_token': refreshToken,
    });
  }

  /// Uploads a photo and returns the stored URL.
  Future<Map<String, dynamic>> uploadPhoto({
    required String jobId,
    required List<int> imageBytes,
    required String fileName,
  }) {
    return _post(AppConfig.uploadPhotoWebhook, {
      'job_id': jobId,
      'image_base64': imageBytes,
      'file_name': fileName,
    });
  }

  /// Fetches jobs for a property manager's portfolio.
  Future<Map<String, dynamic>> pmFetchJobs(Map<String, dynamic> params) {
    return _post('/webhook/pm/jobs', params);
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
