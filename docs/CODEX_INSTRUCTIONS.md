# Codex Instructions for 1Pacent

You are helping build 1Pacent, a property maintenance orchestration platform.

The product supports five personas:
- Tenant / Renter
- Landlord
- Property Manager / Agency
- Tradie
- Platform Admin

The app must use one shared Flutter codebase with role-based views.

Core principle:
The same maintenance request is viewed differently depending on the user role.

Do not build everything at once.
Work in small pull requests.
Each PR must be buildable, testable, and documented.

Initial MVP priorities:
1. Flutter web app foundation
2. Role-based dashboards
3. Mock data repositories
4. Maintenance request creation
5. Request detail screen
6. Approval workflow
7. Tradie job board
8. Compliance dashboard
9. Backend API later
10. Docker/VPS deployment later

Coding rules:
- Keep UI clean, modern, responsive.
- Prefer simple architecture over clever architecture.
- Use mock repositories first.
- Do not integrate payments, Xero, SMS, AI or n8n until foundation works.
- Add README updates for every major feature.
- Use clear model classes.
- Keep business logic out of widgets where possible.
