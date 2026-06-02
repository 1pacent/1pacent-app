import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  const AppConfig._();

  static String get appBaseUrl =>
      _value('APP_BASE_URL', 'https://app.1pacent.com');
  static String get apiBaseUrl =>
      _value('API_BASE_URL', 'https://api.1pacent.com');
  static String get n8nBaseUrl =>
      _value('N8N_BASE_URL', 'https://api.1pacent.com');
  static String get n8nFallbackBaseUrl =>
      _value('N8N_FALLBACK_BASE_URL', 'https://vmi3305336.contaboserver.net');
  static String get createJobWebhook =>
      _value('N8N_CREATE_JOB_WEBHOOK', '/webhook/rental/work-orders/intake');
  static String get jobStatusWebhook =>
      _value('N8N_JOB_STATUS_WEBHOOK', '/webhook/customer/job-status');
  static String get sallyChatWebhook =>
      _value('N8N_SALLY_CHAT_WEBHOOK', '/webhook/agents/sally/chat');
  static String get opsConsoleSummaryWebhook => _value(
      'N8N_OPS_CONSOLE_SUMMARY_WEBHOOK', '/webhook/admin/ops-console/summary');
  static String get rentalQuoteOptionsWebhook => _value(
      'N8N_RENTAL_QUOTE_OPTIONS_WEBHOOK',
      '/webhook/rental/quote-options/generate');
  static String get rentalQuoteOptionApproveWebhook => _value(
      'N8N_RENTAL_QUOTE_OPTION_APPROVE_WEBHOOK',
      '/webhook/rental/quote-options/approve');
  static String get elevenLabsAgentId =>
      _value('ELEVENLABS_AGENT_ID', 'agent_4601krtt5j3xf26ac865kpe19yvp');

  static String _value(String key, String fallback) {
    final value = dotenv.maybeGet(key);
    if (value == null || value.trim().isEmpty) return fallback;
    return value.trim();
  }
}
