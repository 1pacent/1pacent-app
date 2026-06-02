import 'package:flutter/foundation.dart';

enum UserPersona {
  tenant,
  ownerOccupier,
  landlord,
  propertyManager,
  tradie,
  publicCustomer,
}

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.persona,
    this.propertyScenario,
    this.propertyId,
  });

  final String id;
  final String name;
  final String email;
  final UserPersona persona;
  final String? propertyScenario;
  final String? propertyId;

  String get personaLabel {
    switch (persona) {
      case UserPersona.tenant:
        return 'Tenant';
      case UserPersona.ownerOccupier:
        return 'Owner occupied';
      case UserPersona.landlord:
        return 'Landlord';
      case UserPersona.propertyManager:
        return 'Property manager';
      case UserPersona.tradie:
        return 'Tradie';
      case UserPersona.publicCustomer:
        return 'Public customer';
    }
  }

  bool get canRequestMaintenance =>
      persona == UserPersona.tenant ||
      persona == UserPersona.ownerOccupier ||
      persona == UserPersona.publicCustomer;

  bool get canApproveQuotes =>
      persona == UserPersona.ownerOccupier || persona == UserPersona.landlord;

  bool get canManagePortfolio => persona == UserPersona.propertyManager;

  bool get canSubmitTradieQuotes => persona == UserPersona.tradie;
}

class AppSession extends ChangeNotifier {
  AppUser? _user;

  AppUser? get user => _user;

  bool get isSignedIn => _user != null;

  void signIn(AppUser user) {
    _user = user;
    notifyListeners();
  }

  void signOut() {
    _user = null;
    notifyListeners();
  }
}

final appSession = AppSession();

const demoUsers = [
  AppUser(
    id: 'TEN-UAT-001',
    name: 'UAT Tenant',
    email: 'tenant.uat@1pacent.com',
    persona: UserPersona.tenant,
    propertyScenario: 'rental',
    propertyId: 'PROP-UAT-001',
  ),
  AppUser(
    id: 'OWNER-UAT-001',
    name: 'UAT Owner',
    email: 'owner.uat@1pacent.com',
    persona: UserPersona.ownerOccupier,
    propertyScenario: 'owner_occupied',
    propertyId: 'PROP-UAT-OWNER-001',
  ),
  AppUser(
    id: 'LL-UAT-001',
    name: 'UAT Landlord',
    email: 'landlord.uat@1pacent.com',
    persona: UserPersona.landlord,
    propertyScenario: 'rental',
    propertyId: 'PROP-UAT-001',
  ),
  AppUser(
    id: 'PM-UAT-001',
    name: 'UAT Property Manager',
    email: 'pm.uat@1pacent.com',
    persona: UserPersona.propertyManager,
  ),
  AppUser(
    id: 'TRD-PLUMBING-001',
    name: 'UAT Tradie',
    email: 'tradie.uat@1pacent.com',
    persona: UserPersona.tradie,
  ),
  AppUser(
    id: 'PUBLIC-UAT-001',
    name: 'Public Customer',
    email: 'public.uat@1pacent.com',
    persona: UserPersona.publicCustomer,
    propertyScenario: 'owner_occupied',
  ),
];
