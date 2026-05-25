import 'package:go_router/go_router.dart';

import '../../features/auth/login_screen.dart';
import '../../features/auth/register_screen.dart';
import '../../features/availability/tenant_availability_screen.dart';
import '../../features/customer/customer_home_screen.dart';
import '../../features/jobs/invoice_payment_screen.dart';
import '../../features/jobs/job_evidence_screen.dart';
import '../../features/jobs/job_status_screen.dart';
import '../../features/jobs/start_job_screen.dart';
import '../../features/landlord/landlord_approval_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/pm/pm_dashboard_screen.dart';
import '../../features/pm/pm_job_detail_screen.dart';
import '../../features/quotes/quote_acceptance_screen.dart';
import '../../features/quotes/quote_list_screen.dart';
import '../../features/reviews/review_request_screen.dart';
import '../../features/sally_chat/sally_chat_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../../features/tradie/tradie_home_screen.dart';
import '../../features/tradie/tradie_job_board_screen.dart';
import '../../features/tradie/tradie_quote_submit_screen.dart';
import '../../features/trust_passport/tradie_trust_passport_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const CustomerHomeScreen()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(path: '/start-job', builder: (context, state) => const StartJobScreen()),
    GoRoute(path: '/sally', builder: (context, state) => const SallyChatScreen()),
    GoRoute(
      path: '/job/:jobId',
      builder: (context, state) => JobStatusScreen(jobId: state.pathParameters['jobId'] ?? ''),
    ),
    GoRoute(
      path: '/quotes/:jobId',
      builder: (context, state) => QuoteListScreen(jobId: state.pathParameters['jobId'] ?? ''),
    ),
    GoRoute(
      path: '/landlord/approval/:jobId',
      builder: (context, state) => LandlordApprovalScreen(jobId: state.pathParameters['jobId'] ?? ''),
    ),
    GoRoute(path: '/tradie', builder: (context, state) => const TradieHomeScreen()),
    GoRoute(
      path: '/tradie/:tradieId/trust',
      builder: (context, state) => TradieTrustPassportScreen(
        tradieId: state.pathParameters['tradieId'] ?? '',
      ),
    ),
    GoRoute(
      path: '/job/:jobId/accept-quote/:quoteId',
      builder: (context, state) => QuoteAcceptanceScreen(
        jobId: state.pathParameters['jobId'] ?? '',
        quoteId: state.pathParameters['quoteId'] ?? '',
      ),
    ),
    GoRoute(
      path: '/job/:jobId/invoice',
      builder: (context, state) => InvoicePaymentScreen(
        jobId: state.pathParameters['jobId'] ?? '',
      ),
    ),
    GoRoute(
      path: '/job/:jobId/evidence',
      builder: (context, state) => JobEvidenceScreen(
        jobId: state.pathParameters['jobId'] ?? '',
      ),
    ),
    GoRoute(
      path: '/job/:jobId/review/:tradieId',
      builder: (context, state) {
        final tradieName = state.uri.queryParameters['name'] ?? 'Tradie';
        return ReviewRequestScreen(
          jobId: state.pathParameters['jobId'] ?? '',
          tradieId: state.pathParameters['tradieId'] ?? '',
          tradieName: tradieName,
        );
      },
    ),
    GoRoute(
      path: '/job/:jobId/availability',
      builder: (context, state) => TenantAvailabilityScreen(
        jobId: state.pathParameters['jobId'] ?? '',
      ),
    ),
    GoRoute(
      path: '/tradie/jobs',
      builder: (context, state) => const TradieJobBoardScreen(),
    ),
    GoRoute(
      path: '/tradie/jobs/:jobId/quote',
      builder: (context, state) => TradieQuoteSubmitScreen(
        jobId: state.pathParameters['jobId'] ?? '',
      ),
    ),
    GoRoute(
      path: '/notifications',
      builder: (context, state) => const NotificationsScreen(),
    ),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsScreen(),
    ),
    GoRoute(
      path: '/register',
      builder: (context, state) => const RegisterScreen(),
    ),
    GoRoute(
      path: '/pm/dashboard',
      builder: (context, state) => const PMDashboardScreen(),
    ),
    GoRoute(
      path: '/pm/job/:jobId',
      builder: (context, state) => PMJobDetailScreen(
        jobId: state.pathParameters['jobId'] ?? '',
      ),
    ),
  ],
);
