import 'package:flutter/foundation.dart';

import 'auth_service.dart';

class AuthProvider extends ChangeNotifier {
  AuthProvider({AuthService? service}) : _service = service ?? AuthService();

  final AuthService _service;

  bool _isLoading = false;
  String? _error;
  bool _isLoggingIn = false;
  bool _isRegistering = false;

  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isAuthenticated => _service.isAuthenticated;
  AuthUser? get currentUser => _service.currentUser;
  AuthTokens? get tokens => _service.tokens;
  bool get isLoggingIn => _isLoggingIn;
  bool get isRegistering => _isRegistering;

  void clearError() {
    _error = null;
    notifyListeners();
  }

  Future<bool> login({
    required String email,
    required String password,
  }) async {
    _isLoggingIn = true;
    _error = null;
    notifyListeners();

    try {
      await _service.login(email: email, password: password);
      _isLoggingIn = false;
      notifyListeners();
      return true;
    } on AuthException catch (e) {
      _error = e.message;
      _isLoggingIn = false;
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'An unexpected error occurred. Please try again.';
      _isLoggingIn = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> register({
    required String email,
    required String password,
    required String name,
  }) async {
    _isRegistering = true;
    _error = null;
    notifyListeners();

    try {
      await _service.register(email: email, password: password, name: name);
      _isRegistering = false;
      notifyListeners();
      return true;
    } on AuthException catch (e) {
      _error = e.message;
      _isRegistering = false;
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'An unexpected error occurred. Please try again.';
      _isRegistering = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> refreshSession() async {
    _isLoading = true;
    notifyListeners();

    try {
      await _service.refreshToken();
      _isLoading = false;
      notifyListeners();
      return true;
    } on AuthException {
      _isLoading = false;
      notifyListeners();
      return false;
    } catch (_) {
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  void logout() {
    _service.logout();
    _error = null;
    notifyListeners();
  }

  void handleUnauthorized() {
    _service.logout();
    _error = 'Session expired. Please log in again.';
    notifyListeners();
  }
}
