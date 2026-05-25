import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  const AppConfig._();

  static String get appBaseUrl => _value('APP_BASE_URL', 'https://app.1pacent.com');
  static String get apiBaseUrl => _value('API_BASE_URL', 'https://api.1pacent.com');
  static String get n8nBaseUrl => _value('N8N_BASE_URL', 'https://api.1pacent.com');
  static String get n8nFallbackBaseUrl => _value('N8N_FALLBACK_BASE_URL', 'https://vmi3305336.contaboserver.net');
  static String get createJobWebhook => _value('N8N_CREATE_JOB_WEBHOOK', '/webhook/rental/work-orders/intake');
  static String get jobStatusWebhook => _value('N8N_JOB_STATUS_WEBHOOK', '/webhook/customer/job-status');
  static String get sallyChatWebhook => _value('N8N_SALLY_CHAT_WEBHOOK', '/webhook/agents/sally/chat');
  static String get quotesWebhook => _value('N8N_QUOTES_WEBHOOK', '/webhook/customer/quotes');
  static String get landlordApprovalWebhook => _value('N8N_LANDLORD_APPROVAL_WEBHOOK', '/webhook/landlord/approval');
  static String get warrantyReviewWebhook => _value('N8N_WARRANTY_REVIEW_WEBHOOK', '/webhook/rental/warranty/review-with-sparky');
  static String get trustPassportWebhook => _value('N8N_TRUST_PASSPORT_WEBHOOK', '/webhook/tradie/trust-passport');
  static String get acceptQuoteWebhook => _value('N8N_ACCEPT_QUOTE_WEBHOOK', '/webhook/accept-quote');
  static String get declineQuoteWebhook => _value('N8N_DECLINE_QUOTE_WEBHOOK', '/webhook/decline-quote');
  static String get initiatePaymentWebhook => _value('N8N_INITIATE_PAYMENT_WEBHOOK', '/webhook/initiate-payment');
  static String get submitReviewWebhook => _value('N8N_SUBMIT_REVIEW_WEBHOOK', '/webhook/submit-review');
  static String get updateAvailabilityWebhook => _value('N8N_UPDATE_AVAILABILITY_WEBHOOK', '/webhook/update-availability');
  static String get tradieJobsWebhook => _value('N8N_TRADIE_JOBS_WEBHOOK', '/webhook/tradie/jobs');
  static String get submitQuoteWebhook => _value('N8N_SUBMIT_QUOTE_WEBHOOK', '/webhook/submit-quote');
  static String get fetchNotificationsWebhook => _value('N8N_FETCH_NOTIFICATIONS_WEBHOOK', '/webhook/notifications');
  static String get markNotificationsReadWebhook => _value('N8N_MARK_NOTIFICATIONS_READ_WEBHOOK', '/webhook/notifications/read');
  static String get authLoginWebhook => _value('N8N_AUTH_LOGIN_WEBHOOK', '/webhook/auth/login');
  static String get authRegisterWebhook => _value('N8N_AUTH_REGISTER_WEBHOOK', '/webhook/auth/register');
  static String get authRefreshWebhook => _value('N8N_AUTH_REFRESH_WEBHOOK', '/webhook/auth/refresh');
  static String get uploadPhotoWebhook => _value('N8N_UPLOAD_PHOTO_WEBHOOK', '/webhook/upload-photo');
  static String get nominatimSearchUrl => _value('NOMINATIM_SEARCH_URL', 'https://nominatim.openstreetmap.org/search');
  static String get nominatimReverseUrl => _value('NOMINATIM_REVERSE_URL', 'https://nominatim.openstreetmap.org/reverse');
  static String get elevenLabsAgentId => _value('ELEVENLABS_AGENT_ID', 'agent_4601krtt5j3xf26ac865kpe19yvp');

  static String _value(String key, String fallback) {
    final value = dotenv.maybeGet(key);
    if (value == null || value.trim().isEmpty) return fallback;
    return value.trim();
  }
}
