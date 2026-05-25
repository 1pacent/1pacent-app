import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    this.expiresIn,
  });

  final String accessToken;
  final String refreshToken;
  final int? expiresIn;

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: json['access_token']?.toString() ??
          json['accessToken']?.toString() ??
          '',
      refreshToken: json['refresh_token']?.toString() ??
          json['refreshToken']?.toString() ??
          '',
      expiresIn: (json['expires_in'] as num?)?.toInt() ??
          (json['expiresIn'] as num?)?.toInt(),
    );
  }
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.name,
    this.role,
  });

  final String id;
  final String email;
  final String name;
  final String? role;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id']?.toString() ?? json['user_id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      name: json['name']?.toString() ??
          json['display_name']?.toString() ??
          '',
      role: json['role']?.toString(),
    );
  }
}

class AuthService {
  AuthService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  AuthTokens? _tokens;
  AuthUser? _currentUser;

  AuthTokens? get tokens => _tokens;
  AuthUser? get currentUser => _currentUser;
  bool get isAuthenticated => _tokens != null && _tokens!.accessToken.isNotEmpty;

  Future<AuthUser> login({
    required String email,
    required String password,
  }) async {
    final uri = Uri.parse('${AppConfig.n8nBaseUrl}${AppConfig.authLoginWebhook}');
    final response = await _client.post(
      uri,
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );

    if (response.statusCode == 401) {
      throw AuthException('Invalid email or password');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw AuthException('Login failed (${response.statusCode}): ${response.body}');
    }

    final decoded = jsonDecode(response.body);
    final data = decoded is Map<String, dynamic> ? decoded : {'data': decoded};

    _tokens = AuthTokens.fromJson(data);
    final userData = data['user'] as Map<String, dynamic>?;
    if (userData != null) {
      _currentUser = AuthUser.fromJson(userData);
    }

    return _currentUser!;
  }

  Future<AuthUser> register({
    required String email,
    required String password,
    required String name,
  }) async {
    final uri = Uri.parse('${AppConfig.n8nBaseUrl}${AppConfig.authRegisterWebhook}');
    final response = await _client.post(
      uri,
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
        'name': name,
      }),
    );

    if (response.statusCode == 409) {
      throw AuthException('An account with this email already exists');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw AuthException('Registration failed (${response.statusCode}): ${response.body}');
    }

    final decoded = jsonDecode(response.body);
    final data = decoded is Map<String, dynamic> ? decoded : {'data': decoded};

    _tokens = AuthTokens.fromJson(data);
    final userData = data['user'] as Map<String, dynamic>?;
    if (userData != null) {
      _currentUser = AuthUser.fromJson(userData);
    }

    return _currentUser!;
  }

  Future<AuthTokens> refreshToken() async {
    if (_tokens == null || _tokens!.refreshToken.isEmpty) {
      throw AuthException('No refresh token available');
    }

    final uri = Uri.parse('${AppConfig.n8nBaseUrl}${AppConfig.authRefreshWebhook}');
    final response = await _client.post(
      uri,
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'refresh_token': _tokens!.refreshToken,
      }),
    );

    if (response.statusCode == 401) {
      logout();
      throw AuthException('Session expired. Please log in again.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw AuthException('Token refresh failed (${response.statusCode})');
    }

    final decoded = jsonDecode(response.body);
    final data = decoded is Map<String, dynamic> ? decoded : {'data': decoded};
    _tokens = AuthTokens.fromJson(data);
    return _tokens!;
  }

  void logout() {
    _tokens = null;
    _currentUser = null;
  }
}

class AuthException implements Exception {
  const AuthException(this.message);

  final String message;

  @override
  String toString() => 'AuthException: $message';
}
